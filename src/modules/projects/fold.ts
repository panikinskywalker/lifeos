import type { LifeOSContext } from '@core/registry/context';
import type { ProjectData } from './types';

/**
 * Goal is dropped (docs/MODEL.md layer 2, *Retired*; decided 31 Oct): once,
 * on first open, every goal becomes a Project in place (same id, so its
 * links, tags, Facts and timeline stay). Target date → target date, why it
 * matters → Aim, its numbers → a Fact on it, active → active, achieved → done,
 * dropped → done and archived. Tasks toward it are in the Project when they
 * had none; when they had one, the old *goal* Link becomes *related*.
 */

interface GoalData {
  description?: string;
  targetDate?: string;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  area?: string;
}

const AREA: Record<string, ProjectData['area']> = { career: 'work', learning: 'learning' };
const STATUS: Record<string, string> = { active: 'active', achieved: 'done', dropped: 'done' };
const n = (x: number) => x.toLocaleString('en-IN');

export function foldGoals(os: LifeOSContext): number {
  const rows = os.db.all<{ id: string; data: string; status: string | null }>(`SELECT id, data, status FROM records WHERE object = 'goal' AND deleted_at IS NULL`);
  for (const r of rows) {
    let g: GoalData = {};
    try {
      g = JSON.parse(r.data) as GoalData;
    } catch {
      /* an unreadable goal keeps its title alone */
    }
    const data: ProjectData = {
      ...(g.description ? { description: g.description } : {}),
      ...(g.targetDate ? { dueDate: g.targetDate } : {}),
      area: AREA[g.area ?? ''] ?? 'personal',
    };
    os.db.transaction(() => {
      os.db.run(`UPDATE records SET object = 'project' WHERE id = ?`, [r.id]);
      // Through the repo, so search and the timeline see a Project; Goal's keys are dropped by Project's schema.
      os.records.update<ProjectData>(r.id, { data, status: STATUS[r.status ?? ''] ?? 'active', archived: r.status === 'dropped' ? true : undefined }, 'system');
      if (g.targetValue) os.facts.add({ subjectId: r.id, text: `Was a goal: ${n(g.currentValue ?? 0)} of ${n(g.targetValue)}${g.unit ? ` ${g.unit}` : ''}`, source: 'user' });
      const linked = os.links.forEntity(r.id, 'goal').filter((l) => l.other.object === 'task').map((l) => l.other.id);
      const byField = os.records.query('task', { filter: { and: [{ field: 'data.goalId', op: 'eq', value: r.id }] } }, { limit: 5000 }).map((t) => t.id);
      for (const id of new Set([...linked, ...byField])) {
        const task = os.records.get<{ projectId?: string }>(id);
        if (!task) continue;
        os.links.unlink(id, r.id, 'goal', 'system');
        // goalId leaves with Task's schema on this update.
        os.records.update(id, { data: task.data.projectId ? {} : { projectId: r.id } }, 'system');
        if (task.data.projectId) os.links.link(id, r.id, 'related', {}, 'system');
      }
    });
  }
  // The goal views go with the Object.
  os.db.run(`DELETE FROM saved_views WHERE object = 'goal'`);
  return rows.length;
}
