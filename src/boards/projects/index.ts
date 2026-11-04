import type { BoardManifest } from '@core/registry/types';
import { projectsOverview } from './overview';
import { OverdueScreen, ProjectsHome } from './home';
import { EventPage, ProjectPage, TaskPage } from './pages';
import { ProjectForm, TaskForm } from './form';
import { projectsTiles } from './tile';

/**
 * Projects (the projects module's companion board; the NR-Projects-* artboards):
 * the Projects home (today, overdue, projects with progress, coming up), all
 * overdue, the Task, Project and Event pages drawn whole, the task and project
 * forms, and the Today tile.
 */
export const projectsBoard: BoardManifest = {
  id: 'projects',
  module: 'projects',
  name: 'Projects',
  icon: 'check-circle',
  color: 'blue',
  placement: 'module',
  overview: projectsOverview,
  tiles: projectsTiles,
  screens: [
    { key: 'index', title: 'Projects', component: ProjectsHome },
    { key: 'overdue', title: 'Overdue', component: OverdueScreen },
  ],
  quickActions: [
    { id: 'projects.addTask', label: 'Task', icon: 'check-circle', route: '/entity/task/new', global: true },
    { id: 'projects.addEvent', label: 'Event', icon: 'calendar', route: '/entity/event/new', global: true },
    { id: 'projects.addProject', label: 'Project', icon: 'folder', route: '/entity/project/new' },
  ],
  overrides: [
    { object: 'task', form: TaskForm, record: [{ entityType: 'task', key: 'projects.task', title: 'Task', component: TaskPage, order: 0, placement: 'page' }] },
    { object: 'project', form: ProjectForm, record: [{ entityType: 'project', key: 'projects.project', title: 'Project', component: ProjectPage, order: 0, placement: 'page' }] },
    { object: 'event', record: [{ entityType: 'event', key: 'projects.event', title: 'Event', component: EventPage, order: 0, placement: 'page' }] },
  ],
};
