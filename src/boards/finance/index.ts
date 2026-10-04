import type { BoardManifest } from '@core/registry/types';
import { financeOverview } from './overview';
import { AccountSection, FinanceHome } from './screens';
import { GroupBalanceSection, PersonBalanceSection, SplitSection } from './splitScreens';
import { ReportsScreen } from './reportsScreen';
import { SubscriptionHero } from './subscriptionHero';

/** Companion board of the finance module: Overview, the Finance home and Reports screens, quick actions, record sections (also on Person and Group). */
export const financeBoard: BoardManifest = {
  id: 'finance',
  module: 'finance',
  name: 'Finance',
  icon: 'banknote',
  color: 'green',
  placement: 'module',
  overview: financeOverview,
  screens: [{ key: 'index', title: 'Finance', component: FinanceHome }, { key: 'reports', title: 'Reports', component: ReportsScreen }],
  quickActions: [
    { id: 'finance.addTransaction', label: 'Transaction', icon: 'arrow.up.arrow.down', route: '/entity/transaction/new', global: true },
    { id: 'finance.addAccount', label: 'Account', icon: 'creditcard', route: '/entity/account/new' },
    { id: 'finance.addSubscription', label: 'Subscription', icon: 'repeat', route: '/entity/subscription/new' },
  ],
  overrides: [
    { object: 'account', record: [{ entityType: 'account', key: 'finance.account', title: 'Balance', component: AccountSection, order: 10 }] },
    { object: 'subscription', record: [{ entityType: 'subscription', key: 'finance.subscription', title: 'Billing', component: SubscriptionHero, order: 10, placement: 'top' }] },
    { object: 'transaction', record: [{ entityType: 'transaction', key: 'finance.split', title: 'Split', component: SplitSection, order: 20 }] },
    { object: 'person', record: [{ entityType: 'person', key: 'finance.balance', title: 'Money', component: PersonBalanceSection, order: 20 }] },
    { object: 'group', record: [{ entityType: 'group', key: 'finance.group', title: 'Balances', component: GroupBalanceSection, order: 10 }] },
  ],
};
