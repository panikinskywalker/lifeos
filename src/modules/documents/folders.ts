import type { FolderFile, LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import type { DocFile, DocumentData } from './types';

/**
 * Your folders (docs/MODEL.md layer 2, *Document*; R7c). LifeOS keeps no copy
 * of your papers: you pick folders on the phone once and every file in them is
 * a Document pointing at it. A rescan finds new files (status new), finds a
 * renamed or moved one again by its size and name or date (the record and what
 * you added stay), and marks a deleted one missing, never silently gone. A few
 * PDFs' text is read per rescan, on the phone, for search.
 */

export interface Folder {
  uri: string;
  name: string;
  addedAt: number;
  files?: number;
  scannedAt?: number;
  /** Set when the folder's access is gone (moved, deleted, revoked). */
  error?: string | null;
}

export const FOLDERS = 'documents.folders';
/** PDFs whose text is read per rescan, so a first scan of many files stays quick. */
export const TEXT_PER_SCAN = 15;
export const TEXT_MAX = 20_000;
const LOST = 'LifeOS lost access to this folder. Remove it and add it again.';

export const folders = (os: LifeOSContext): Folder[] => os.settings.get<Folder[]>(FOLDERS, []);
const saveFolders = (os: LifeOSContext, xs: Folder[]) => os.settings.set(FOLDERS, xs);

/** "car_insurance-2026.pdf" → "car insurance 2026". */
export function titleFromName(name: string): string {
  return name.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || name;
}

const KINDS: Array<[string, RegExp]> = [
  ['id', /\b(aadhaa?r|e-?pan|pan card|passport|driving licen[cs]e|voter id)\b/i],
  ['insurance', /\b(insurance|policy schedule|policy no|premium)\b/i],
  ['ticket', /\b((e-?)?ticket|boarding pass|pnr|itinerary|booking confirmation)\b/i],
  ['receipt', /\b(invoice|receipt|bill)\b/i],
  ['tax', /\b(itr|form ?16|26as|income tax)\b/i],
  ['medical', /\b(prescription|lab report|diagnosis|discharge summary|hospital)\b/i],
  ['contract', /\b(agreement|contract|lease|offer letter|nda)\b/i],
  ['certificate', /\b(certificate|marksheet|degree|diploma)\b/i],
];

/** The kind a file's name, then its text, suggests; 'other' when nothing does. */
export function guessKind(name: string, text?: string): string {
  for (const src of [name.replace(/[_-]+/g, ' '), (text ?? '').slice(0, 3000)]) for (const [kind, re] of KINDS) if (re.test(src)) return kind;
  return 'other';
}

const pointer = (f: FolderFile, folder: string): DocFile => ({ uri: f.uri, name: f.name, mime: f.mime, size: f.size, modified: f.modified, folder, path: f.path });

/** Add a folder with Android's picker, then index it. Null when cancelled or already there. */
export async function addFolder(os: LifeOSContext): Promise<Folder | null> {
  const picked = await os.device?.folders?.pick();
  if (!picked || folders(os).some((f) => f.uri === picked.uri)) return null;
  const folder: Folder = { uri: picked.uri, name: picked.name, addedAt: Date.now() };
  saveFolders(os, [...folders(os), folder]);
  await rescan(os);
  return folders(os).find((f) => f.uri === folder.uri) ?? folder;
}

/**
 * Stop indexing a folder. Its new Documents go; the ones you filed stay, as
 * missing, so their kind, expiry, tags and links are not lost. The files are
 * not touched.
 */
export function removeFolder(os: LifeOSContext, uri: string): void {
  saveFolders(os, folders(os).filter((f) => f.uri !== uri));
  for (const d of indexed(os)) {
    if (d.data.file!.folder !== uri) continue;
    if (d.status === 'new') os.records.delete(d.id, 'system');
    else if (d.status !== 'missing') os.records.setStatus(d.id, 'missing', 'system');
  }
}

const indexed = (os: LifeOSContext) => os.records.query<DocumentData>('document', {}, { limit: 100_000 }).filter((d) => d.data.file);

export interface ScanResult { added: number; found: number; missing: number; read: number }

let queue: Promise<unknown> = Promise.resolve();

/**
 * Look through every folder: new files in, moved ones followed, deleted ones
 * missing; then read a few PDFs' text. One rescan at a time (a sync and Rescan
 * now never add the same file twice).
 */
export function rescan(os: LifeOSContext, now = Date.now()): Promise<ScanResult> {
  const p = queue.then(() => scanOnce(os, now));
  queue = p.catch(() => undefined);
  return p;
}

async function scanOnce(os: LifeOSContext, now: number): Promise<ScanResult> {
  const out: ScanResult = { added: 0, found: 0, missing: 0, read: 0 };
  const dev = os.device?.folders;
  const list = folders(os);
  if (!dev || !list.length) return out;
  const docs = indexed(os);
  const byUri = new Map(docs.map((d) => [d.data.file!.uri, d]));
  const seen = new Set<string>();
  const scanned = new Set<string>();
  const fresh: Array<{ file: FolderFile; folder: string }> = [];
  const next: Folder[] = [];
  for (const folder of list) {
    let files: FolderFile[];
    try {
      files = await dev.list(folder.uri);
    } catch {
      next.push({ ...folder, error: LOST });
      continue;
    }
    scanned.add(folder.uri);
    next.push({ ...folder, files: files.length, scannedAt: now, error: null });
    for (const f of files) {
      seen.add(f.uri);
      const d = byUri.get(f.uri);
      if (!d) fresh.push({ file: f, folder: folder.uri });
      else if (d.status === 'missing' || d.data.file!.size !== f.size || d.data.file!.modified !== f.modified || d.data.file!.name !== f.name) {
        // Back, or changed: keep the pointer true; a changed PDF is read again.
        const changed = d.data.file!.size !== f.size || d.data.file!.modified !== f.modified;
        os.records.update<DocumentData>(d.id, { data: { file: pointer(f, folder.uri), ...(changed ? { textRead: false } : {}) }, ...(d.status === 'missing' ? { status: 'filed' } : {}) }, 'system');
      }
    }
  }
  saveFolders(os, next);

  // Gone from a folder that was read: moved or renamed (same size, and the same name or date), else missing.
  for (const d of docs) {
    const was = d.data.file!;
    if (!scanned.has(was.folder) || seen.has(was.uri) || d.status === 'missing') continue;
    const i = fresh.findIndex((x) => x.file.size === was.size && (x.file.name === was.name || x.file.modified === was.modified));
    if (i >= 0) {
      const [{ file, folder }] = fresh.splice(i, 1);
      os.records.update<DocumentData>(d.id, { data: { file: pointer(file, folder) } }, 'system');
      out.found++;
    } else {
      os.records.setStatus(d.id, 'missing', 'system');
      out.missing++;
    }
  }

  os.db.transaction(() => {
    for (const { file, folder } of fresh) {
      os.records.create<DocumentData>({ object: 'document', title: titleFromName(file.name), status: 'new', data: { kind: guessKind(file.name), file: pointer(file, folder) } }, 'system');
      out.added++;
    }
  });

  out.read = await readSomeText(os);
  return out;
}

/** Read the text of a few PDFs not read yet (newest first), for search and a better guess at the kind. */
async function readSomeText(os: LifeOSContext): Promise<number> {
  const pdfText = os.device?.pdfText;
  if (!pdfText) return 0;
  const todo = indexed(os)
    .filter((d) => d.status !== 'missing' && !d.data.textRead && /pdf/i.test(d.data.file!.mime))
    .sort((a, b) => b.data.file!.modified - a.data.file!.modified)
    .slice(0, TEXT_PER_SCAN);
  for (const d of todo) {
    let text: string | null = null;
    try {
      text = await pdfText(d.data.file!.uri);
    } catch {
      /* locked or broken: nothing to read */
    }
    const patch: Partial<DocumentData> = { textRead: true, text: text ? text.slice(0, TEXT_MAX) : undefined };
    if (d.status === 'new' && d.data.kind === 'other' && text) patch.kind = guessKind(d.data.file!.name, text);
    os.records.update<DocumentData>(d.id, { data: patch }, 'system');
  }
  return todo.length;
}

/** Open the file in the phone's own viewer. */
export async function openFile(os: LifeOSContext, doc: ObjectRecord<DocumentData>): Promise<boolean> {
  const f = doc.data.file;
  if (!f || !os.device?.folders) return false;
  await os.device.folders.open(f.uri, f.mime);
  return true;
}

/** A new one you have looked at: filed. */
export const markFiled = (os: LifeOSContext, id: string) => os.records.setStatus(id, 'filed');
