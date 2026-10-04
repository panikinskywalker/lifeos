import type { BoardManifest } from '@core/registry/types';
import { projectsOverview } from './overview';
import { GoalSection, ProjectSection, ProjectsHome } from './screens';

/** Companion board of the projects module: Overview, the Projects home screen, quick actions, Project and Goal sections. */
export const projectsBoard: BoardManifest = {
  id: 'projects',
  module: 'projects',
  name: 'Projects & Tasks',
  icon: 'checkmark.circle',
  color: 'blue',
  placement: 'module',
  overview: projectsOverview,
  screens: [{ key: 'index', title: 'Projects', component: ProjectsHome }],
  quickActions: [
    { id: 'projects.addTask', label: 'Task', icon: 'checkmark.circle', route: '/entity/task/new', global: true },
    { id: 'projects.addEvent', label: 'Event', icon: 'calendar', route: '/entity/event/new', global: true },
    { id: 'projects.addProject', label: 'Project', icon: 'folder', route: '/entity/project/new' },
    { id: 'projects.addGoal', label: 'Goal', icon: 'target', route: '/entity/goal/new' },
  ],
  overrides: [
    { object: 'project', record: [{ entityType: 'project', key: 'projects.project', title: 'Tasks', component: ProjectSection, order: 10 }] },
    { object: 'goal', record: [{ entityType: 'goal', key: 'projects.goal', title: 'Progress', component: GoalSection, order: 10 }] },
  ],
};
