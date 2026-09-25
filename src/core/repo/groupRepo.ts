import type { DatabaseAdapter } from '../db/adapter';
import { newId } from '../domain/ids';
import { bus } from '../events/bus';
import type { ChangeLog } from '../sync/changeLog';

export interface GroupMember {
  memberId: string;
  /** Weight used by a "shares" split (default 1). */
  defaultShare: number;
}

/**
 * Members of a Group (the group itself is an entity of type 'group'). Stored
 * in `group_members` (migration v3) so balances can ask "which groups is
 * Priya in" without scanning JSON.
 */
export class GroupRepo {
  constructor(private db: DatabaseAdapter, private changes: ChangeLog) {}

  members(groupId: string): GroupMember[] {
    return this.db
      .all<{ member_id: string; default_share: number }>(`SELECT member_id, default_share FROM group_members WHERE group_id=? AND deleted_at IS NULL AND left_at IS NULL ORDER BY created_at, rowid`, [groupId])
      .map((r) => ({ memberId: r.member_id, defaultShare: r.default_share }));
  }

  groupsOf(memberId: string): string[] {
    return this.db.all<{ group_id: string }>(`SELECT group_id FROM group_members WHERE member_id=? AND deleted_at IS NULL AND left_at IS NULL`, [memberId]).map((r) => r.group_id);
  }

  /** Make the group's members exactly `memberIds` (shares kept for those who stay). */
  setMembers(groupId: string, memberIds: string[], shares: Record<string, number> = {}): void {
    const now = Date.now();
    const want = new Set(memberIds);
    this.db.transaction(() => {
      const rows = this.db.all<{ id: string; member_id: string; deleted_at: number | null; left_at: number | null }>(`SELECT id, member_id, deleted_at, left_at FROM group_members WHERE group_id=?`, [groupId]);
      const byMember = new Map(rows.map((r) => [r.member_id, r]));
      for (const r of rows) {
        const live = r.deleted_at == null && r.left_at == null;
        if (live && !want.has(r.member_id)) {
          this.db.run(`UPDATE group_members SET left_at=?, updated_at=?, version=version+1 WHERE id=?`, [now, now, r.id]);
          this.changes.record('group_members', r.id, 'update', 1);
        }
      }
      for (const m of memberIds) {
        const r = byMember.get(m);
        const share = shares[m];
        if (!r) {
          const id = newId(now);
          this.db.run(`INSERT INTO group_members(id,group_id,member_id,default_share,joined_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`, [id, groupId, m, share ?? 1, now, now, now]);
          this.changes.record('group_members', id, 'insert', 1);
        } else if (r.deleted_at != null || r.left_at != null || share != null) {
          this.db.run(`UPDATE group_members SET deleted_at=NULL, left_at=NULL, default_share=COALESCE(?, default_share), updated_at=?, version=version+1 WHERE id=?`, [share ?? null, now, r.id]);
          this.changes.record('group_members', r.id, 'update', 1);
        }
      }
    });
    bus.emit('data.changed', { table: 'group_members', id: groupId });
  }
}
