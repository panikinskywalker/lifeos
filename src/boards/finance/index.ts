import type { BoardManifest } from '@core/registry/types';
import { financeOverview } from './overview';
import { FinanceHome } from './screens';
import { WalletScreen } from './wallet';
import { AccountPage } from './accountPage';
import { DebtPage } from './debtPage';
import { DebtsScreen, SubscriptionsScreen } from './lists';
import { SplitwiseScreen } from './splitwiseScreen';
import { BillSplitScreen } from './billSplitScreen';
import { FilesScreen } from './filesScreen';
import { AskScreen, ProofScreen } from './ask';
import { GroupBalanceSection, PersonBalanceSection } from './splitScreens';
import { ReportsScreen } from './reportsScreen';
import { SubscriptionPage } from './subscriptionPage';
import { TransactionPage } from './transactionPage';
import { TransactionForm } from './transactionForm';
import { InvestmentHero } from './investmentHero';
import { SpendScreen } from './spendScreen';
import { financeTiles } from './tile';
import { financeCheckCards } from './checkCards';

/** Companion board of the finance module (Money on screen): Overview, the Money home, Spend, Reports, Subscriptions and Who owes whom screens, the Account, Debt, Transaction and Subscription pages, the Transaction form, quick actions, record sections (also on Person and Group). */
export const financeBoard: BoardManifest = {
  id: 'finance',
  module: 'finance',
  name: 'Money',
  icon: 'banknote',
  color: 'green',
  placement: 'module',
  overview: financeOverview,
  tiles: financeTiles,
  // Money's own bar (docs/MODEL.md, The bar inside a board): its sections, and Ask Money in the raised button.
  bar: {
    tabs: [
      { screen: 'index', label: 'Money home', icon: 'home', also: ['reports', 'files', 'debts'] },
      { screen: 'spend', label: 'Spend', icon: 'pie' },
      { screen: 'wallet', label: 'Accounts and cards', icon: 'card' },
      { screen: 'subscriptions', label: 'Subscriptions', icon: 'repeat' },
    ],
    action: { label: 'Ask Money', icon: 'sparkle', screen: 'ask' },
  },
  screens: [{ key: 'index', title: 'Money', component: FinanceHome }, { key: 'wallet', title: 'Accounts and cards', component: WalletScreen },{ key: 'reports', title: 'Reports', component: ReportsScreen }, { key: 'spend', title: 'Spend', component: SpendScreen }, { key: 'subscriptions', title: 'Subscriptions', component: SubscriptionsScreen }, { key: 'debts', title: 'Who owes whom', component: DebtsScreen }, { key: 'ask', title: 'Ask Money', component: AskScreen, noBar: true }, { key: 'proof', title: 'The payments behind it', component: ProofScreen }, { key: 'files', title: 'Import & export', component: FilesScreen }, { key: 'splitwise', title: 'Splitwise', component: SplitwiseScreen }, { key: 'billsplit', title: 'Split the bill', component: BillSplitScreen }],
  quickActions: [
    { id: 'finance.addTransaction', label: 'Transaction', icon: 'arrow.up.arrow.down', route: '/entity/transaction/new', global: true },
    { id: 'finance.addAccount', label: 'Account', icon: 'creditcard', route: '/entity/account/new' },
    { id: 'finance.addSubscription', label: 'Subscription', icon: 'repeat', route: '/entity/subscription/new' },
    { id: 'finance.addInvestment', label: 'Investment', icon: 'chart.line', route: '/entity/investment/new' },
  ],
  checkCards: financeCheckCards,
  overrides: [
    { object: 'account', record: [{ entityType: 'account', key: 'finance.account', title: 'Account', component: AccountPage, order: 0, placement: 'page' }] },
    { object: 'subscription', record: [{ entityType: 'subscription', key: 'finance.subscription', title: 'Subscription', component: SubscriptionPage, order: 0, placement: 'page' }] },
    { object: 'investment', record: [{ entityType: 'investment', key: 'finance.investment', title: 'Holding', component: InvestmentHero, order: 10, placement: 'top' }] },
    { object: 'transaction', form: TransactionForm, record: [{ entityType: 'transaction', key: 'finance.transaction', title: 'Transaction', component: TransactionPage, order: 0, placement: 'page', ownLinks: true }] },
    { object: 'debt', record: [{ entityType: 'debt', key: 'finance.debt', title: 'Debt', component: DebtPage, order: 0, placement: 'page' }] },
    { object: 'person', record: [{ entityType: 'person', key: 'finance.balance', title: 'Money', component: PersonBalanceSection, order: 20 }] },
    { object: 'group', record: [{ entityType: 'group', key: 'finance.group', title: 'Balances', component: GroupBalanceSection, order: 10 }] },
  ],
};
