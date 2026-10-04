import type { BoardManifest } from '@core/registry/types';

/**
 * Automations (docs/MODEL.md §3): the doing half of the top tier. The engine,
 * triggers and actions live in core and in each module; this board gives the
 * rules, templates and run log a place in Browse › Boards. Screens are under
 * app/automation until R10 moves them here.
 */
export const automationBoard: BoardManifest = {
  id: 'automation',
  name: 'Automations',
  icon: 'bolt',
  color: 'purple',
  placement: 'browse',
  quickActions: [{ id: 'automation.addRule', label: 'Automation rule', icon: 'bolt', route: '/automation/new' }],
};
