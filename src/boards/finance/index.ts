import type { BoardManifest } from '@core/registry/types';
import { financeOverview } from './overview';
import { AccountSection, FinanceHome } from './screens';
import { GroupBalanceSection, PersonBalanceSection } from './splitScreens';
import { ReportsScreen } from './reportsScreen';
import { SubscriptionPage } from './subscriptionPage';
import { TransactionPage } from './transactionPage';
import { TransactionForm } from './transactionForm';
import { InvestmentHero } from './investmentHero';
import { SpendScreen } from './spendScreen';
import { financeTiles } from './tile';

/** Companion board of the finance module (Money on screen): Overview, the Money home, Spend and Reports screens, the Transaction and Subscription pages, the Transaction form, quick actions, record sections (also on Person and Group). */
export const financeBoard: BoardManifest = {
  id: 'finance',
  module: 'finance',
  name: 'Money',
  icon: 'banknote',
  color: 'green',
  placement: 'module',
  overview: financeOverview,
  tiles: financeTiles,
  screens: [{ key: 'index', title: 'Money', component: FinanceHome }, { key: 'reports', title: 'Reports', component: ReportsScreen }, { key: 'spend', title: 'Spend', component: SpendScreen }],
  quickActions: [
    { id: 'finance.addTransaction', label: 'Transaction', icon: 'arrow.up.arrow.down', route: '/entity/transaction/new', global: true },
    { id: 'finance.addAccount', label: 'Account', icon: 'creditcard', route: '/entity/account/new' },
    { id: 'finance.addSubscription', label: 'Subscription', icon: 'repeat', route: '/entity/subscription/new' },
    { id: 'finance.addInvestment', label: 'Investment', icon: 'chart.line', route: '/entity/investment/new' },
  ],
  overrides: [
    { object: 'account', record: [{ entityType: 'account', key: 'finance.account', title: 'Balance', component: AccountSection, order: 10 }] },
    { object: 'subscription', record: [{ entityType: 'subscription', key: 'finance.subscription', title: 'Subscription', component: SubscriptionPage, order: 0, placement: 'page' }] },
    { object: 'investment', record: [{ entityType: 'investment', key: 'finance.investment', title: 'Holding', component: InvestmentHero, order: 10, placement: 'top' }] },
    { object: 'transaction', form: TransactionForm, record: [{ entityType: 'transaction', key: 'finance.transaction', title: 'Transaction', component: TransactionPage, order: 0, placement: 'page', ownLinks: true }] },
    { object: 'person', record: [{ entityType: 'person', key: 'finance.balance', title: 'Money', component: PersonBalanceSection, order: 20 }] },
    { object: 'group', record: [{ entityType: 'group', key: 'finance.group', title: 'Balances', component: GroupBalanceSection, order: 10 }] },
  ],
};
