# Handover: R15 Build and ship (branch `claude/r15-ship`)

Built 2 Nov 2026 from `m1-design-system` at 0c3a9b3 (v0.0.17). MODEL.md layer 6,
R15. No version bump, no CHANGELOG edit, no PR. **One migration, v17** (dumps;
see Retention). `npm run typecheck`, `npm test` (61 files, 502 tests) and
`npx expo export --platform web` pass. Nothing has been run on the phone.

## What was built

**Standalone build and OTA**: already true since v0.0.15 to v0.0.17 (EAS
preview APK, the `preview` channel, the fingerprint leaving out app.json's
version). Marked done in MODEL.md; removed from `docs/ADHOC.md`.

**Database encryption** (`src/core/db/encryption.ts`, `src/platform/openDatabase.ts`):
- `app.json`: expo-sqlite's own `useSQLCipher: true` (SQLCipher 4 with
  OpenSSL, vendored in expo-sqlite 57.0.3; no new package).
- The encrypted file is `lifeos-secure.db`; the key is 32 random bytes
  (`expo-crypto`) as hex in the secure store (`lifeos.db.key`), used raw
  (`PRAGMA key = "x'…'"`). Saved, then read back before anything is
  encrypted with it.
- Core decides which file opens (`openDatabaseFiles`), through a small
  `DbStore` the platform fills (exists, remove, rename, open with a key, and
  `sqlcipher_export` through `ATTACH … KEY`):
  - encrypted file and key: open it; a plain file left from a finished move
    is deleted now.
  - encrypted file, key missing: the file is renamed
    `lifeos-secure-unreadable-<time>.db` (kept, never deleted); a plain file
    still there is opened, else a new database starts.
  - wrong key: the start fails and no file is touched.
  - plain file, no key: opened as today. **The move is your choice.**
  - plain file and a key: the move. Checkpoint the WAL, copy into
    `lifeos-moving.db` encrypted, open the copy with the key, `PRAGMA
    quick_check` must say ok and every table's row count (FTS included) must
    match, then rename it to `lifeos-secure.db` and open that. A copy that
    fails is deleted and the plain database stays in use (the error shows in
    You › Lock & backup; it tries again next start). The plain file is
    deleted on the start after a good one.
  - nothing yet (new install): a new key, encrypted from the start.
  - a build without SQLCipher (`PRAGMA cipher_version` answers nothing):
    stays plain; an encrypted file there fails the start instead of opening
    a new empty database.
- You › Lock & backup › **Database**: *Try on a copy* (an encrypted copy of
  the open database with a throwaway key, checked, deleted; changes nothing),
  *Encrypt the database* (the same with the real key; only if it matches is
  the key saved), then *Restart now* (`expo-updates` reload) and the next
  start does the move. After it: "Encrypted … Moved this start: N tables, M
  rows, all matched."
- The web build stays plain (`openDatabase.web.ts` stubs).
- Tests: `src/core/db/encryption.test.ts` (12) runs the whole flow on real
  SQLite files; better-sqlite3 has no SQLCipher, so a key file beside each
  database refuses a wrong or missing key the way SQLCipher does, and the
  export is `VACUUM INTO`. Covered: new install, no-cipher build, plain kept
  without a key, the move with every row kept and the plain file deleted the
  start after, a spoilt copy thrown away with the plain database whole, a
  half-made copy started again, key missing (set aside, plain opened or a new
  database), wrong key, encrypted file on a no-cipher build, try on a copy.

**Retention** (`src/core/sources/retention.ts`, `DumpRepo.recent / deleteOld`):
- `runRetention` runs the three jobs, counts each, and logs the run in
  settings `retention.log` (last 30, newest first); `pruneIfDue` runs it once
  a day from the filing run (app open, return to the app, the background
  task). The To check auto-approve moved from every filing run into it.
- *To check*: unticked, not undone, older than 15 days → ticked.
- *Dumps* (revised 4 Nov, your call): filed or skipped, older than 15 days
  → **deleted**, unless it holds Second Brain: a Fact or a Note filed from it
  and not undone (a filing with a fact, kind `fact` or `note`, or an active
  Fact whose source is the dump). What it filed stays; its filings keep their
  label with `dump_id` set to null (the foreign key needs it); its search
  entry goes; a `delete` goes in the change log. Pending or failed dumps are
  never deleted. The Dump list (OneBox) shows the last 15 days plus any dump
  not yet filed (`dumps.recent`). The dump page says why a dump is gone.
- **Migration v17** `dumps-retention`: drops the `dumps_never_deleted` trigger
  (v6) and adds `dumps_kept_until_filed`, which refuses deleting a dump not
  filed yet or younger than 15 days, so a bug still can't lose words early.
  Its hash is added to the migrations test. If another branch also adds a
  v17, renumber one at the merge (and its hash).
- *Raw texts 60 days*: the existing M4.2c clean-up, unchanged.
- The last run shows in You › Lock & backup.
- Tests: `src/core/retention.test.ts` (4). **One existing test line changed**:
  `src/core/dumps.test.ts` expected a delete to fail with "forever"; a fresh
  dump is still refused, with the new message, so only the regex changed
  (the requirement changed, not to get green).

**App lock**, checked end to end (`LockGate`, `platform/lock.ts`,
`settings/data.tsx`). Fixed:
- A phone whose screen lock was removed after the app lock was on would
  have been locked out for good (`authenticateAsync` fails with nothing
  enrolled): `unlock` now opens when no screen lock is set.
- Back on Android while locked moved the screens underneath; now it does
  nothing.
- With the lock on and no screen lock, the switch was hidden (you couldn't
  turn it off); now it shows while the lock is on.
Fine as it was: locked on open (the cover is up from the first frame), locks
on return after the chosen time, covers at once when set to Right away (the
app switcher shows nothing), the PIN fallback, the prompt's own trip to the
background is ignored, notification taps and Share open behind the cover.
`expo-local-authentication` needs no config plugin on Android (its manifest
brings USE_BIOMETRIC).

## Decisions (simplest, where MODEL.md did not say; please confirm)

1. **Encrypting your existing database is a button, not automatic.** A new
   install is encrypted from the start; your phone's database moves only when
   you tap *Encrypt the database*, after *Try on a copy* if you like.
2. **Old dumps are deleted** (your call, 4 Nov) unless a Fact or a Note came
   from them. Side effects: On this day on Time no longer shows dumps older
   than 15 days, "Dumps that mention it" on a record lists only kept ones,
   and a record's timeline keeps the first 160 characters of the sentence.
   The first daily run on the new build deletes all the old ones at once:
   the backup in phone check 1 holds them.
3. **The key is not behind the fingerprint**, so filing and syncs in the
   background can open the database. The lock guards the screen; the key
   guards the file.
4. **The key is in no backup.** expo-secure-store keeps it out of Android's
   backup on purpose. A phone-to-phone restore (Google backup) would bring the
   encrypted file without its key: LifeOS sets it aside and starts empty, and
   your LifeOS backup file is how to bring data across. Before this, Google
   backup may have carried the plain database silently.
5. Restoring an old backup brings its old dumps back; the next daily run
   deletes them again under the same rule.
6. The retention log lives in settings (no table, no migration).

## What needs the new APK

Encryption is native: `useSQLCipher` changes the build and its fingerprint
(checked: the Android fingerprint changes from b44a0a34… to 28466352…). So:
- this version will **not** arrive as an update on the installed APK; build
  a new preview APK (`eas build --profile preview --platform android`) and
  install it over the current one (same signing key, data kept);
- every later version needs this APK too (they share its fingerprint).
On an older APK the lock and retention parts would work, but this JS can't
reach it anyway.

## Phone checks (S22), in this order

1. **Before installing**: in the current app, You › Lock & backup › *Export
   encrypted backup*, save the file off the phone (Drive or the Mac).
2. Install the new APK over the current one. Open LifeOS: everything is as
   before (Today, Money, People), and You › Lock & backup › Database says
   *Not encrypted yet* (the move hasn't run; the plain file is untouched).
3. **The move on a copy first**: tap *Try on a copy*. Expect "The encrypted
   copy matched: N tables, M rows". Nothing changes. If it says it doesn't
   match, stop and send me the message.
4. Tap *Encrypt the database*: it makes the copy again with the real key and
   checks it; then *Restart now* (or close LifeOS fully and open it).
5. After the restart: Database says *Encrypted … Moved this start: N tables,
   M rows, all matched* (same N and M as step 3, give or take what synced in
   between). Check Today, a person, a transaction with its Original text,
   search for a word from a recent dump, To check.
6. Close LifeOS fully, open it again: still everything there (this start
   deletes the old plain file).
7. Lock: You › Lock & backup › Lock LifeOS on, *Right away*. Leave and come
   back: covered, fingerprint opens it; press Back while covered (nothing
   happens); cancel the prompt (stays covered, Unlock asks again); the PIN
   works from the prompt. Set *After 1 min*: back within a minute stays open.
8. Clean-up: the next day (or after any open 24 h after the last), You › Lock
   & backup shows *Clean-up, …* with its counts (the first run: every old
   dump without a fact or note). Dumps older than 15 days are gone; ones that
   gave a Fact or a Note are still found by search; what any of them filed is
   still on the records.

## Shared core edits (for the merge)

- `src/core/repo/dumpRepo.ts`: `DUMP_DAYS`, `recent()`, `deleteOld()`.
- `src/core/db/migrations.ts`: **v17** `dumps-retention` (+ its hash in
  `migrations.test.ts`); `src/core/dumps.test.ts` regex (see above).
- `app/dump/[id].tsx`: the caption and the "isn't here" line.
- `src/core/sources/retention.ts`: `runRetention`, `retentionLog`,
  `RetentionRun`; `pruneIfDue` now runs all three and returns the run.
- New `src/core/db/encryption.ts`.
- `src/platform/filing.ts`: the per-run `autoApprove(15)` removed (now daily).
- `src/screens/OneBox.tsx`: the Dump list uses `dumps.recent({ limit: 30 })`.
- `app.json`: expo-sqlite plugin with `useSQLCipher`.
- `docs/ADHOC.md`: Standalone app and Database encryption moved out.
- `docs/MODEL.md`: only R15 in layer 6.

## Patch notes for the merge

**Build and ship** (R15). Needs the new APK: install it over the current one.
- **Your database can be encrypted** (SQLCipher, AES-256). You › Lock &
  backup › Database: *Try on a copy* checks it without changing anything;
  *Encrypt the database* moves it on the next start, checked table by table
  before it switches. The key stays in the phone's secure store and in no
  backup: keep making backup files to move to a new phone. New installs start
  encrypted.
- **The daily clean-up**: To check items you haven't touched in 15 days are
  ticked; dumps filed more than 15 days ago are deleted, unless a fact or a
  note came from them (what they filed stays); texts' wording goes after 60
  days as before. The
  last run is shown in You › Lock & backup.
- **App lock fixes**: removing the phone's screen lock no longer locks you out
  of LifeOS; Back does nothing while locked; the lock can be turned off even
  when the phone has no screen lock.
