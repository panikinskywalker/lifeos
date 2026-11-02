import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { FolderFile, LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { runSource } from '@core/filing/sources';
import { crmModule } from '../crm';
import { travelModule } from '../travel';
import { assetsModule } from '../assets';
import { addFolder, documentsModule, folders, guessKind, removeFolder, rescan, TEXT_PER_SCAN, titleFromName, type DocumentData } from '.';

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, travelModule, assetsModule, documentsModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const TREE = 'content://com.android.externalstorage.documents/tree/primary%3ADocuments';
const file = (name: string, extra: Partial<FolderFile> = {}): FolderFile => ({ uri: `${TREE}/document/primary%3ADocuments%2F${encodeURIComponent(name)}`, name, mime: name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg', size: name.length * 1000, modified: 1_700_000_000_000, path: '', ...extra });

/** A phone with one folder whose files the test sets; PDFs' text by name. */
function phone(files: FolderFile[], texts: Record<string, string> = {}) {
  const state = { files, texts, opened: [] as string[], lost: false, read: 0 };
  os.device = {
    folders: {
      pick: async () => ({ uri: TREE, name: 'Documents' }),
      list: async () => {
        if (state.lost) throw new Error('no access');
        return state.files;
      },
      open: async (uri) => void state.opened.push(uri),
    },
    pdfText: async (uri) => {
      state.read++;
      const f = state.files.find((x) => x.uri === uri);
      return f ? state.texts[f.name] ?? null : null;
    },
  };
  return state;
}
const docs = () => os.records.query<DocumentData>('document', {}, { limit: 1000 });
const byName = (name: string) => docs().find((d) => d.data.file?.name === name)!;

describe('your folders: indexed, never copied', () => {
  it('a picked folder makes a new Document per file, pointing at it, titled and kind guessed from the name', async () => {
    phone([file('Car_insurance-2026.pdf'), file('aadhaar front.jpg', { path: 'IDs' }), file('notes.pdf')]);
    const f = await addFolder(os);
    expect(f).toMatchObject({ name: 'Documents', files: 3, error: null });
    expect(docs()).toHaveLength(3);
    const car = byName('Car_insurance-2026.pdf');
    expect(car).toMatchObject({ title: 'Car insurance 2026', status: 'new', data: { kind: 'insurance', file: { folder: TREE, mime: 'application/pdf' } } });
    expect(byName('aadhaar front.jpg')).toMatchObject({ data: { kind: 'id', file: { path: 'IDs' } } });
    // The same folder twice is one folder.
    expect(await addFolder(os)).toBeNull();
    expect(folders(os)).toHaveLength(1);
  });

  it('reads PDFs’ text on the phone for search and a better kind; a scan has none; a few per rescan', async () => {
    const many = Array.from({ length: TEXT_PER_SCAN + 3 }, (_, i) => file(`scan ${i}.pdf`, { modified: 1_700_000_000_000 + i }));
    const s = phone([file('doc 1.pdf'), ...many], { 'doc 1.pdf': 'HDFC ERGO Policy Schedule. Policy No 2311 2026 0001. Premium ₹14,200' });
    await addFolder(os);
    expect(s.read).toBe(TEXT_PER_SCAN);
    await rescan(os);
    expect(s.read).toBe(TEXT_PER_SCAN + 4);
    const d = byName('doc 1.pdf');
    expect(d.data).toMatchObject({ kind: 'insurance', textRead: true });
    expect(d.data.text).toContain('Policy No 2311');
    expect(os.records.search.search('2311').some((h) => h.id === d.id)).toBe(true);
    expect(byName('scan 0.pdf').data).toMatchObject({ textRead: true, kind: 'other' });
    expect(byName('scan 0.pdf').data.text).toBeUndefined();
  });

  it('a rescan adds new files, follows a renamed or moved one (what you added stays), marks a deleted one missing', async () => {
    const s = phone([file('passport.pdf'), file('lease.pdf'), file('old bill.pdf')]);
    await addFolder(os);
    const passport = byName('passport.pdf');
    os.records.update<DocumentData>(passport.id, { data: { expiresOn: '2030-01-01', number: 'Z1234567' }, status: 'filed' });
    const lease = byName('lease.pdf');

    // Renamed (same size, same date), moved into a subfolder, one deleted, one new.
    s.files = [
      { ...file('passport.pdf'), uri: `${TREE}/document/x1`, name: 'Passport Rutvij.pdf' },
      { ...file('lease.pdf'), uri: `${TREE}/document/x2`, path: 'Flat' },
      file('ticket goa.pdf'),
    ];
    const r = await rescan(os);
    expect(r).toMatchObject({ added: 1, found: 2, missing: 1 });
    expect(os.records.get<DocumentData>(passport.id)).toMatchObject({ status: 'filed', data: { number: 'Z1234567', expiresOn: '2030-01-01', file: { name: 'Passport Rutvij.pdf' } } });
    expect(os.records.get<DocumentData>(lease.id)!.data.file!.path).toBe('Flat');
    expect(byName('old bill.pdf').status).toBe('missing');
    expect(byName('ticket goa.pdf')).toMatchObject({ status: 'new', data: { kind: 'ticket' } });

    // It comes back: no longer missing.
    s.files = [...s.files, file('old bill.pdf')];
    await rescan(os);
    expect(byName('old bill.pdf').status).toBe('filed');
  });

  it('a folder whose access is gone says so and leaves its Documents as they are', async () => {
    const s = phone([file('a.pdf')]);
    await addFolder(os);
    s.lost = true;
    expect(await rescan(os)).toMatchObject({ added: 0, missing: 0 });
    expect(folders(os)[0]!.error).toMatch(/lost access/);
    expect(byName('a.pdf').status).toBe('new');
  });

  it('removing a folder: its new Documents go, the filed ones stay as missing, the files are untouched', async () => {
    phone([file('a.pdf'), file('b.pdf')]);
    await addFolder(os);
    os.records.setStatus(byName('b.pdf').id, 'filed');
    removeFolder(os, TREE);
    expect(folders(os)).toEqual([]);
    expect(docs().map((d) => [d.data.file!.name, d.status])).toEqual([['b.pdf', 'missing']]);
  });

  it('is the folders source: each sync is a rescan; unusable without a folder or on the web', async () => {
    const src = os.registry.sources.get('folders')!;
    expect(src.modules).toEqual(['documents']);
    expect(await src.available!(os)).toBe(false);
    const s = phone([file('a.pdf')]);
    expect(await src.available!(os)).toBe(false);
    await addFolder(os);
    s.files = [...s.files, file('b.pdf')];
    expect(await runSource(os, src)).toBe(1);
    expect(docs()).toHaveLength(2);
  });

  it('names and kinds', () => {
    expect(titleFromName('IMG_2041.JPG')).toBe('IMG 2041');
    expect(titleFromName('Form16_FY25-26.pdf')).toBe('Form16 FY25 26');
    expect(guessKind('Form16_FY25-26.pdf')).toBe('tax');
    expect(guessKind('GST tax invoice 4417.pdf')).toBe('receipt');
    expect(guessKind('scan.pdf', 'This Rental Agreement is made on')).toBe('contract');
    expect(guessKind('holiday.jpg')).toBe('other');
  });
});
