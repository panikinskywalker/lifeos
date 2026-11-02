import type { BoardManifest } from '@core/registry/types';
import { AutomationsHome } from './home';
import { RulePage } from './rule';
import { EditRule } from './edit';
import { RunPage } from './run';

/**
 * Automations (docs/MODEL.md layer 3, R10): the doing half of the top tier.
 * The engine, triggers, actions and templates live in core and the modules;
 * this board is where you see and run them: the home (Run by hand, rules,
 * templates, recent runs), a rule, the editor, and one run's step log with
 * Undo. A first pass from the kit until the NR-Automations-* artboards
 * (docs/design/AUTOMATIONS-BRIEF.md).
 */
export const automationBoard: BoardManifest = {
  id: 'automation',
  name: 'Automations',
  icon: 'bolt',
  color: 'purple',
  placement: 'browse',
  screens: [
    { key: 'index', title: 'Automations', component: AutomationsHome },
    { key: 'rule', title: 'Automation', component: RulePage },
    { key: 'edit', title: 'Edit automation', component: EditRule },
    { key: 'run', title: 'Run', component: RunPage },
  ],
  quickActions: [{ id: 'automation.addRule', label: 'Automation', icon: 'bolt', route: '/board/automation/edit' }],
};
