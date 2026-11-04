import React, { useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { decryptBackup, encryptBackup, isEncryptedBackup, type EncryptedBackup } from '@core/backup/crypto';
import { useLive, useOS } from '@ui/hooks';
import { Button, ChipRow, FilterChip, Screen, Section, SwitchField, Text, TextField, useToast } from '@ui/kit';
import { exportAll, importAll } from '../../src/platform/exportImport';
import { lockAvailability, lockPrefs, setLockPrefs, unlock } from '../../src/platform/lock';
import { databaseState, encryptOnNextStart, tryEncryptedCopy } from '../../src/platform/openDatabase';
import { retentionLog } from '@core/sources/retention';
import type { CopyReport } from '@core/db/encryption';

const AFTER = [
  { value: 0, label: 'Right away' },
  { value: 1, label: 'After 1 min' },
  { value: 5, label: 'After 5 min' },
  { value: 15, label: 'After 15 min' },
];

/**
 * You › Lock & backup (M5): lock the app with fingerprint / face (or the
 * phone's PIN); export everything as a password-encrypted file; restore
 * from one. API keys and Gmail passwords are never in a backup.
 * R15 (docs/MODEL.md layer 6): the database's encryption and the daily clean-up.
 */
export default function DataSettingsRoute() {
  const os = useOS();
  const router = useRouter();
  const toast = useToast();
  const lock = useLive((o) => lockPrefs(o), []);
  const [avail, setAvail] = useState<'ok' | 'needs-build' | 'no-lock-set' | null>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ name: string; enc: EncryptedBackup | null; plain: unknown } | null>(null);
  const [restorePw, setRestorePw] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => void lockAvailability().then(setAvail), []);
  const [dbState, setDbState] = useState(databaseState);
  const [copy, setCopy] = useState<{ report?: CopyReport; error?: string } | null>(null);
  const lastClean = useLive((o) => retentionLog(o)[0] ?? null, []);

  const tryCopy = (encrypt: boolean) => {
    setCopy(null);
    try {
      const report = encrypt ? encryptOnNextStart(os.db) : tryEncryptedCopy(os.db);
      setCopy({ report });
      setDbState(databaseState());
    } catch (e) {
      setCopy({ error: (e as Error).message });
    }
  };
  const restart = () => {
    const fallback = () => toast.show({ message: 'Close LifeOS fully and open it again', icon: 'lock' });
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('expo-updates') as typeof import('expo-updates')).reloadAsync().catch(fallback);
    } catch {
      fallback();
    }
  };

  const toggleLock = async (on: boolean) => {
    // Prove it works before relying on it.
    if (on && !(await unlock('Confirm to turn on the lock'))) return;
    setLockPrefs(os, { on });
    toast.show({ message: on ? 'LifeOS will lock' : 'Lock off', icon: 'lock' });
  };

  const share = async (name: string, text: string) => {
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(text);
      toast.show({ message: `Copied ${Math.round(text.length / 1024)} KB to the clipboard`, icon: 'check' });
      return;
    }
    const f = new File(Paths.cache, name);
    f.write(text);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType: 'application/json', dialogTitle: 'Save your LifeOS backup' });
  };

  const exportEncrypted = async () => {
    setError(null);
    if (pw.length < 8) return setError('Use a password of at least 8 characters');
    if (pw !== pw2) return setError('The two passwords don’t match');
    setBusy('Encrypting — a few seconds…');
    try {
      const enc = await encryptBackup(JSON.stringify(exportAll(os)), pw, (n) => Crypto.getRandomBytes(n));
      await share(`lifeos-backup-${new Date().toISOString().slice(0, 10)}.lifeos.json`, JSON.stringify(enc));
      setPw('');
      setPw2('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const pick = async () => {
    setError(null);
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    try {
      const text = await new File(r.assets[0].uri).text();
      const parsed = JSON.parse(text) as unknown;
      if (isEncryptedBackup(parsed)) setPicked({ name: r.assets[0].name, enc: parsed, plain: null });
      else if ((parsed as { app?: string }).app === 'lifeos' && (parsed as { tables?: unknown }).tables) setPicked({ name: r.assets[0].name, enc: null, plain: parsed });
      else setError('That file isn’t a LifeOS backup');
    } catch {
      setError('Couldn’t read that file');
    }
  };

  const restore = async () => {
    if (!picked) return;
    setError(null);
    setBusy('Opening the backup…');
    try {
      const data = picked.enc ? (JSON.parse(await decryptBackup(picked.enc, restorePw)) as { tables: Record<string, Record<string, unknown>[]> }) : (picked.plain as { tables: Record<string, Record<string, unknown>[]> });
      const go = () => {
        importAll(os, data);
        setPicked(null);
        setRestorePw('');
        toast.show({ message: 'Backup restored', icon: 'check' });
      };
      if (Platform.OS === 'web') go();
      else Alert.alert('Restore this backup?', 'Records in it are added or updated here; nothing here is deleted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Restore', onPress: go }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title="Lock & backup" onBack={() => router.back()}>
      <Section title="App lock">
        {avail === 'needs-build' ? (
          <Text variant="caption" color="secondary">The lock needs the new app build (it uses the phone’s fingerprint / face unlock).</Text>
        ) : avail === 'no-lock-set' && !lock.on ? (
          <Text variant="caption" color="secondary">Set a screen lock (fingerprint, face or PIN) in the phone’s settings first.</Text>
        ) : (
          <>
            <SwitchField label="Lock LifeOS" hint="Fingerprint or face to open it; the phone’s PIN works too." value={lock.on} onChange={(v) => void toggleLock(v)} />
            {lock.on ? (
              <ChipRow>
                {AFTER.map((a) => (
                  <FilterChip key={a.value} label={a.label} selected={lock.afterMin === a.value} onPress={() => setLockPrefs(os, { afterMin: a.value })} />
                ))}
              </ChipRow>
            ) : null}
          </>
        )}
      </Section>

      <Section title="Database">
        {dbState.encrypted ? (
          <Text variant="caption" color="secondary">Encrypted (SQLCipher, AES-256). The key is in this phone’s secure store and is in no backup: to move to a new phone, use a backup file below.{dbState.moved ? ` Moved this start: ${dbState.moved.tables} tables, ${dbState.moved.rows.toLocaleString()} rows, all matched.` : ''}</Text>
        ) : !dbState.cipher ? (
          <Text variant="caption" color="secondary">Not encrypted. {Platform.OS === 'web' ? 'The web build stays plain.' : 'Encryption needs the new app build.'}</Text>
        ) : dbState.keySaved ? (
          <>
            <Text variant="caption" color="secondary">{dbState.moveError ? `Not encrypted: the last move didn’t match and was thrown away (${dbState.moveError}). Your data is as it was; it tries again on the next start.` : 'Ready: the next start makes an encrypted copy, checks it, and switches to it.'}</Text>
            <Button title="Restart now" icon="refresh" size="sm" onPress={restart} />
          </>
        ) : (
          <>
            <Text variant="caption" color="secondary">Not encrypted yet. Export a backup first. “Try on a copy” makes an encrypted copy, checks every table, and deletes it; nothing changes. “Encrypt” does the same, then the next start moves the database for real.</Text>
            <Button title="Try on a copy" variant="secondary" size="sm" icon="check" onPress={() => tryCopy(false)} />
            <Button title="Encrypt the database" icon="lock" size="sm" onPress={() => tryCopy(true)} />
          </>
        )}
        {copy?.report ? <Text variant="caption" color="secondary">The encrypted copy matched: {copy.report.tables} tables, {copy.report.rows.toLocaleString()} rows.</Text> : null}
        {copy?.error ? <Text variant="caption" color="alert">{copy.error}</Text> : null}
        {dbState.setAside ? <Text variant="caption" color="alert">An encrypted database whose key was missing was kept aside as {dbState.setAside}; restore a backup file to bring your data back.</Text> : null}
        {lastClean ? (
          <Text variant="caption" color="secondary">
            Clean-up, {os.format.date(lastClean.at, 'relative')}: {lastClean.toCheckApproved} To check ticked, {lastClean.dumpsDeleted} old dumps deleted, {lastClean.rawTexts} texts’ wording and {lastClean.ignoredMessages} ignored messages removed.
          </Text>
        ) : null}
      </Section>

      <Section title="Back up everything">
        <Text variant="caption" color="secondary">Records, links, timelines, dumps, facts, rules and settings in one file, sealed with a password (AES-256). Keep the password safe — without it the file can’t be opened. API keys and Gmail passwords are never included.</Text>
        <TextField label="Password" value={pw} onChange={setPw} secureTextEntry autoCapitalize="none" placeholder="At least 8 characters" />
        <TextField label="Password again" value={pw2} onChange={setPw2} secureTextEntry autoCapitalize="none" error={error && !picked ? error : undefined} />
        <Button title={busy && !picked ? busy : 'Export encrypted backup'} icon="lock" disabled={!!busy || !pw || !pw2} onPress={() => void exportEncrypted()} />
        <Button title="Export without a password" variant="ghost" size="sm" icon="share" onPress={() => void share(`lifeos-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportAll(os)))} />
      </Section>

      <Section title="Restore">
        {picked ? (
          <View style={{ gap: 10 }}>
            <Text variant="label">{picked.name}</Text>
            {picked.enc ? <TextField label="Its password" value={restorePw} onChange={setRestorePw} secureTextEntry autoCapitalize="none" error={error ?? undefined} /> : <Text variant="caption" color="secondary">Not encrypted.</Text>}
            <Button title={busy ?? 'Restore'} icon="download" disabled={!!busy || (!!picked.enc && !restorePw)} onPress={() => void restore()} />
            <Button title="Choose another file" variant="ghost" size="sm" onPress={() => setPicked(null)} />
          </View>
        ) : (
          <>
            <Text variant="caption" color="secondary">Adds or updates what’s in the backup; nothing on this phone is deleted.</Text>
            <Button title="Choose a backup file" variant="secondary" icon="download" onPress={() => void pick()} />
            {error && !busy ? <Text variant="caption" color="alert">{error}</Text> : null}
          </>
        )}
      </Section>
    </Screen>
  );
}
