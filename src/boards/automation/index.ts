import type { BoardManifest } from '@core/registry/types';
import { AutomationsHome } from './home';
import { AllAutomations } from './all';
import { RulePage } from './rule';
import { EditRule } from './edit';
import { RunPage } from './run';
import { automationTiles } from './tile';

/**
 * Automations (docs/MODEL.md layer 3, R10): the doing half of the top tier.
 * The engine, triggers, actions and templates live in core and the modules;
 * this board is where you see and run them, drawn from the NR-Automations-*
 * artboards: the home (empty state in it), all of them, one automation, the
 * builder with its trigger picker, one run's log, and the Today tiles.
 */
export const automationBoard: BoardManifest = {
  id: 'automation',
  name: 'Automations',
  icon: 'bolt',
  color: 'purple',
  placement: 'browse',
  tiles: automationTiles,
  screens: [
    { key: 'index', title: 'Automations', component: AutomationsHome },
    { key: 'all', title: 'All automations', component: AllAutomations },
    { key: 'rule', title: 'Automation', component: RulePage },
    { key: 'edit', title: 'Edit automation', component: EditRule },
    { key: 'run', title: 'Run', component: RunPage },
  ],
  quickActions: [{ id: 'automation.addRule', label: 'Automation', icon: 'bolt', route: '/board/automation/edit' }],
};
