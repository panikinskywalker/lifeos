# Money basics: how good expense apps do them, and where ours falls short

15 Nov 2026. Research for "get the basic functionality right first". Sources:
commercial apps (Copilot, Monarch, YNAB, Cashew, Money Manager, Fold, Jupiter,
CRED Money, Axio), open-source code read on GitHub without running or copying
anything (PennyWise, an on-device Indian SMS tracker; Actual Budget; Sure, the
successor of Maybe; Firefly III; Cashew; transaction-sms-parser), and an audit
of our own Money module. Nothing here is decided: the order to fix things is
Rutvij's call, and each decision goes into `docs/MODEL.md`.

## What users complain about most (across apps)

1. Spending inflated by own transfers, card bill payments and payments to friends.
2. Duplicates: SMS plus notification, typed plus SMS, a rescan.
3. Payments missed: capture stops quietly, a bank's format is not read.
4. Balances that do not match the bank.
5. Non-payments saved as spends: bill-due reminders, mandate setups, failed or reversed payments, promos.
6. Wrong categories, and corrections that do not stick.
7. Slow manual add.
8. No way to say "I got money back" or "only my share counts".
9. Home numbers that mislead (early-month percentages, no clear main number).
10. No place where the app asks when unsure, with undo.

## Basic by basic

| Basic | What good apps do | What ours does | Gap |
|---|---|---|---|
| Duplicates | Key on content, not time: the 12-digit UPI reference within 24 h; SMS against notification only across the two channels, same account and merchant, within about 2 min; never merge on amount alone (PennyWise). Merge into the existing row, keeping the user's edits (Actual). | Key is direction plus amount, twins within 10 min (`filing/transactions.ts:29`); typed match on amount and day; mail match on amount ±1 day. Seven separate duplicate mechanisms. | Merges real payments (three friends' ₹147 shares, two ₹30 autos), misses an SMS more than 10 min late, foreign spends never match. |
| Transfers and card bills | Every row has a kind; a card bill payment is its own kind, never spending, because the card swipes already counted (Sure). Transfer pairs are suggested on opposite amounts within 2 to 4 days and confirmed; a rejected pair is remembered. | Transfers spotted by wording ("card payment", "self"…); halves joined within ±1 day. | A card bill paid by BBPS, BillDesk or NEFT without card words stays an expense: spending counted twice. First-name-only "that's me" turns a friend into transfers. |
| Refunds | A refund is money in, in an expense category, netted against that category, floored at 0 (Sure). | Bank refunds flagged and taken off spending. | A UPI app's "received from Amazon" counts as income. |
| Balances | The balance the bank states in a text is the anchor, stored per account with its time; show the gap; Reconcile sets it, with a named adjustment (PennyWise, Actual, YNAB). | Opening balance or last bank-stated balance, plus payments after that day (`lib.ts:37`). | Balance-only texts thrown away; debit-card alerts filed as credit cards (`accounts.ts:18`); a fund redemption lowers the bank balance; same-day payments missed; no Set balance. |
| Rejecting non-payments | Reject list first (OTP, offer, request, "will be debited", due, ASBA), mask the card limit before reading the amount, then require 2 of amount, account, balance (PennyWise, transaction-sms-parser). Unread texts kept for review. | A long reject list in `bankSms.ts`. | No "2 of 3" gate, which is what let CRED's ₹20 lakh ad through. |
| Income | Its own section; refunds, repayments and redemptions are not income. | Came in counts every non-refund money in; salary by keyword or ₹20k+ from a company-like name. | Came in inflated by friends paying back and UPI refunds. |
| Manual add | Amount first; payee remembers its category and account; duplicate or repeat in one tap (YNAB, Cashew, Money Manager). | Custom form, amount focused, six category chips, payee fills the account. | No category guessed from the payee; no refund; a foreign currency is saved as rupees; default date is UTC (yesterday before 5:30 am). |
| Categories | Learn per payee from habits, not the last edit; rename rules run before category rules; raw text kept untouched beside the clean name (Actual, YNAB, Fold). | Rules, taught payees, brands, keywords; edits teach. | Deleting a category teaches every merchant in it to be Other (`categories.ts:147`); every edit is learned, no "just this once"; payees merge on a 4-letter prefix; no merge by hand. |
| Home | One main number, then what needs you, then upcoming; month switch moves everything (Copilot). | About 14 sections; Recent last; the month arrows move only the month card. | Too much, and the month picker is half-wired. |
| Recurring and bills | Suggest, never assume: monthly needs 3 payments ±3 days, amounts within 5%; read UPI AutoPay mandates as subscriptions (PennyWise, Actual, Monarch). | Heads-ups, bill-due texts, "3 a month apart" suggestions, auto-post placeholders. | A typed subscription auto-posts and can double count; paying a bill can delete your typed expense without asking (`bills.ts:97`). |
| Export | CSV by account and date range (Cashew). | None. | Missing. |
| Trust | A To review inbox kept at zero; answers can become rules; every answer can be undone (Copilot, Monarch). | To check with one-tap answers and Undo; raw text on each payment. | Fixing from a list row needs two screens. |

## Simpler, too

The audit found the same job done several ways: seven duplicate checks, three
or four ways to total spending (`spendInRange`, `spendQuery`, `ask.runQuery`,
`monthReport`), month helpers written three times, payee kept as both a field
and a link. Getting the basics right means fewer of these, not more.
