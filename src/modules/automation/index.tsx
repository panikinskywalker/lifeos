import type { ModuleManifest } from '@core/registry/types';
import { palette } from '@ui/theme/tokens';

/**
 * The Automation module is UI-only: the engine, triggers and actions live in
 * core and in each module. This manifest just gives it a place in Browse and
 * a quick action; screens are under app/automation.
 */
export const automationModule: ModuleManifest = {
  id: 'automation',
  name: 'Automation',
  version: '1.0.0',
  description: 'Rules that run when things happen: when X, if Y, do Z. Plus scheduled jobs and reminders.',
  icon: 'bolt',
  color: palette.purple,
  quickActions: [{ id: 'automation.addRule', label: 'Automation rule', icon: 'bolt', route: '/automation/new' }],
};
