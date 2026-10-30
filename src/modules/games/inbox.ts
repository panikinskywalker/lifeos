import type { LifeOSContext } from '@core/registry/context';
import type { PlayerProfileData } from './types';

/**
 * What friends send in and what Turf web logged, as the sync brings them
 * (docs/MODEL.md layer 4, *Answers from friends*; R9c.5–6):
 * - a profile submitted through an invite link or their page waits in **To
 *   check** (a filing of kind `turf-submission`), reviewed on the board's
 *   Submission screen; it leaves To check once Turf web marks it approved or
 *   rejected (here or on the iPhone);
 * - Turf web's audit log (`change_log`): the newest 300 entries, for the
 *   board's Audit screen.
 */

export const SETTING_SUBMISSIONS = 'turf.submissions';
export const SETTING_AUDIT = 'turf.audit';
const AUDIT_MAX = 300;

export interface TurfSubmission {
  id: string;
  /** Turf web's player id and the profile record here. */
  playerId: string;
  profileId?: string;
  name: string;
  payload: Record<string, unknown>;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  fromPage: boolean;
  filingId?: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  kind: 'dues' | 'teams' | 'stats' | 'match';
  summary: string;
  actor: string | null;
  device: string | null;
  gameId: string | null;
  playerId: string | null;
  undone: boolean;
  undoOf: string | null;
}

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => (typeof r[k] === 'string' && (r[k] as string).trim() ? (r[k] as string) : null);
const parse = (v: unknown): Record<string, unknown> => {
  if (typeof v !== 'string') return (v as Record<string, unknown>) ?? {};
  try {
    return JSON.parse(v) as Record<string, unknown>;
  } catch {
    return {};
  }
};

/** Profile fields a submission can change, in the profile's words, with what's there now. */
export const SUBMISSION_FIELDS: Array<{ key: string; label: string; profile?: keyof PlayerProfileData }> = [
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'paymentId', label: 'UPI' },
  { key: 'position', label: 'Position', profile: 'position' },
  { key: 'secondaryPosition', label: 'Second position', profile: 'secondaryPosition' },
  { key: 'preferredFoot', label: 'Foot', profile: 'preferredFoot' },
  { key: 'playingStyle', label: 'Playing style', profile: 'playingStyle' },
  { key: 'speciality', label: 'Speciality', profile: 'speciality' },
  { key: 'jerseyNumber', label: 'Shirt number', profile: 'jersey' },
  { key: 'shoes', label: 'Boots', profile: 'boots' },
  { key: 'favouritePlayer', label: 'Favourite player', profile: 'favouritePlayer' },
  { key: 'supportedClubs', label: 'Clubs', profile: 'clubs' },
  { key: 'supportedCountries', label: 'Countries', profile: 'countries' },
  { key: 'kitColors', label: 'Kit colours', profile: 'kitColors' },
  { key: 'photoKey', label: 'Photo' },
];

/** What a submission would change: field, now, submitted. */
export function submissionChanges(s: TurfSubmission, profile?: PlayerProfileData, person?: { phone?: string; email?: string; upi?: string }) {
  const now = (key: string, field?: keyof PlayerProfileData) => {
    if (field && profile) return profile[field] as string | undefined;
    if (key === 'phone') return person?.phone;
    if (key === 'email') return person?.email;
    if (key === 'paymentId') return person?.upi;
    if (key === 'photoKey') return profile?.photoPath;
    return undefined;
  };
  return SUBMISSION_FIELDS.flatMap((f) => {
    const next = s.payload[f.key];
    if (next === undefined || next === null || next === '') return [];
    const was = now(f.key, f.profile);
    const text = Array.isArray(next) ? next.join(', ') : String(next);
    if (String(was ?? '') === text) return [];
    return [{ key: f.key, label: f.label, was: was ?? null, next: f.key === 'photoKey' ? 'new photo' : text }];
  });
}

/** Apply what a sync page brought: submissions into To check, the audit log. */
export function applyInbox(os: LifeOSContext, page: { tables: Partial<Record<string, Row[]>>; deleted: Array<{ table: string; key: string }> }, profileOf: (turfPlayerId: string) => { id: string; data: PlayerProfileData } | undefined) {
  const subs = os.settings.get<Record<string, TurfSubmission>>(SETTING_SUBMISSIONS, {});
  for (const r of page.tables.profile_submissions ?? []) {
    const id = String(r.id);
    const playerId = String(r.player_id);
    const profile = profileOf(playerId);
    const prev = subs[id];
    const status = (['pending', 'approved', 'rejected'].includes(String(r.status)) ? r.status : 'pending') as TurfSubmission['status'];
    const s: TurfSubmission = { id, playerId, profileId: profile?.id, name: profile?.data.name ?? prev?.name ?? 'A player', payload: parse(r.payload), submittedAt: str(r, 'submitted_at') ?? new Date().toISOString(), status, fromPage: String(r.invite_id ?? '').startsWith('self-'), filingId: prev?.filingId };
    if (status === 'pending' && !s.filingId) {
      const n = submissionChanges(s, profile?.data).length;
      s.filingId = os.filings.add({ source: 'turf', sourceRef: id, kind: 'turf-submission', action: 'logged', entityId: profile?.id ?? null, label: `${s.name} submitted their profile`, flag: `${n} change${n === 1 ? '' : 's'}${s.payload.photoKey ? ' · new photo' : ''} · ${s.fromPage ? 'from their page' : 'through your invite link'}` }).id;
    }
    if (status !== 'pending' && s.filingId) os.filings.setChecked(s.filingId);
    subs[id] = s;
  }
  for (const d of page.deleted) {
    if (d.table !== 'profile_submissions' || !subs[d.key]) continue;
    if (subs[d.key]!.filingId) os.filings.setChecked(subs[d.key]!.filingId!);
    delete subs[d.key];
  }
  os.settings.set(SETTING_SUBMISSIONS, subs);

  const audit = os.settings.get<AuditEntry[]>(SETTING_AUDIT, []);
  const byId = new Map(audit.map((a) => [a.id, a]));
  for (const r of page.tables.change_log ?? []) {
    const id = String(r.id);
    byId.set(id, { id, at: str(r, 'created_at') ?? '', kind: (str(r, 'kind') ?? 'match') as AuditEntry['kind'], summary: str(r, 'summary') ?? '', actor: str(r, 'actor'), device: str(r, 'device'), gameId: str(r, 'game_id'), playerId: str(r, 'player_id'), undone: !!r.undone_at, undoOf: str(r, 'undo_of') });
  }
  for (const d of page.deleted) if (d.table === 'change_log') byId.delete(d.key);
  os.settings.set(SETTING_AUDIT, [...byId.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, AUDIT_MAX));
}

/** Submissions still waiting. */
export const pendingSubmissions = (os: LifeOSContext) => Object.values(os.settings.get<Record<string, TurfSubmission>>(SETTING_SUBMISSIONS, {})).filter((s) => s.status === 'pending').sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

/** The audit log, newest first, optionally one kind. */
export const auditLog = (os: LifeOSContext, kind?: AuditEntry['kind']) => os.settings.get<AuditEntry[]>(SETTING_AUDIT, []).filter((a) => !kind || a.kind === kind);
