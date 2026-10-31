import type { BoardManifest } from '@core/registry/types';
import { projectsOverview } from './overview';
import { GoalSection } from './screens';
import { ProjectsHome } from './home';
import { EventPage, ProjectPage, TaskPage } from './pages';

/**
 * Projects (the projects module's companion board; R4): the Projects home
 * (today, overdue, projects with progress, coming up), and the Task, Project
 * and Event pages drawn whole. A first pass from the kit; the NR-Projects-*
 * artboards (docs/design/PROJECTS-BRIEF.md) replace it. Goal keeps its old
 * section until it is decided.
 */
export const projectsBoard: BoardManifest = {
  id: 'projects',
  module: 'projects',
  name: 'Projects',
  icon: 'check-circle',
  color: 'blue',
  placement: 'module',
  overview: projectsOverview,
  screens: [{ key: 'index', title: 'Projects', component: ProjectsHome }],
  quickActions: [
    { id: 'projects.addTask', label: 'Task', icon: 'check-circle', route: '/entity/task/new', global: true },
    { id: 'projects.addEvent', label: 'Event', icon: 'calendar', route: '/entity/event/new', global: true },
    { id: 'projects.addProject', label: 'Project', icon: 'folder', route: '/entity/project/new' },
  ],
  overrides: [
    { object: 'task', record: [{ entityType: 'task', key: 'projects.task', title: 'Task', component: TaskPage, order: 0, placement: 'page' }] },
    { object: 'project', record: [{ entityType: 'project', key: 'projects.project', title: 'Project', component: ProjectPage, order: 0, placement: 'page' }] },
    { object: 'event', record: [{ entityType: 'event', key: 'projects.event', title: 'Event', component: EventPage, order: 0, placement: 'page' }] },
    { object: 'goal', record: [{ entityType: 'goal', key: 'projects.goal', title: 'Progress', component: GoalSection, order: 10 }] },
  ],
};
