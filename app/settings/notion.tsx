import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format, isToday, isYesterday } from 'date-fns';
import { runSource } from '@core/filing/sources';
import { sourceState } from '@core/sources/deviceData';
import { COPY, isNotionToken, isOriginal, NOTION_CURSOR, NOTION_SOURCE, NOTION_TOKEN, notionLast, notionTarget, notionTargetName, ORIGINAL_REFUSAL, resolveNotionLink, setNotionTarget, normId } from '@modules/crm';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fontForWeight } from '@ui/theme/tokens';
import { Button, Icon, Screen, Text, useToast } from '@ui/kit';

const STEPS = [
  'On notion.so/profile/integrations, make an internal integration named “LifeOS” for your workspace, and copy its token (it starts with ntn_).',
  'Open 📇 Personal CRM (1) in Notion › ••• › Connections › add LifeOS. Share only the copy — never your original Contacts.',
  'Paste the token here and tap Sync now. The first sync adds LifeOS’s columns to the copy, brings every page in, then gives everyone in People a page.',
];

const when = (at: number) => `${isToday(at) ? 'Today' : isYesterday(at) ? 'Yesterday' : format(at, 'd MMM')}, ${format(at, 'H:mm')}`;

/**
 * You › Data sources › Notion (R2b; docs/MODEL.md layer 4): your People CRM
 * kept in step with People, both ways. The connection and the last sync,
 * the integration token (kept in the phone's secure store, never shown again),
 * the copy LifeOS writes to (📇 Personal CRM (1) unless you paste another
 * copy's link; never the original), changes waiting to send, how it works.
 * Laid out like You › Data sources › Turf web.
 */
export default function NotionSettings() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const state = useLive(
    (o) => ({
      src: sourceState(o, NOTION_SOURCE),
      last: notionLast(o),
      target: notionTarget(o),
      name: notionTargetName(o),
      waiting: o.outbox.waiting(NOTION_SOURCE).length,
      refused: o.outbox.refused(NOTION_SOURCE).slice(0, 5),
    }),
    [],
  );

  useEffect(() => {
    void os.device?.secrets?.get(NOTION_TOKEN).then((k) => setHasToken(!!k));
  }, [os]);

  const saveToken = async () => {
    if (!isNotionToken(token)) return toast.show({ message: 'That isn’t a Notion token — it starts with ntn_', icon: 'info' });
    await os.device?.secrets?.set(NOTION_TOKEN, token.trim());
    setToken('');
    setHasToken(true);
    setReplacing(false);
    toast.show({ message: 'Token saved on this phone', icon: 'check' });
  };
  const forget = async () => {
    await os.device?.secrets?.set(NOTION_TOKEN, null);
    setHasToken(false);
    setReplacing(false);
    toast.show({ message: 'Token removed · People stays as it is', icon: 'check' });
  };
  const applyLink = async () => {
    const text = link.trim();
    if (!text) return;
    // The original is refused before anything is asked of Notion.
    if (text.match(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi)?.some(isOriginal)) return toast.show({ message: ORIGINAL_REFUSAL, icon: 'info' });
    setBusy(true);
    try {
      const r = await resolveNotionLink(os, text);
      if (isOriginal(r.dataSource)) throw new Error(ORIGINAL_REFUSAL);
      setNotionTarget(os, r.dataSource, r.name);
      setLink('');
      toast.show({ message: `Writing to ${r.name} from the next sync`, icon: 'check' });
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    } finally {
      setBusy(false);
    }
  };
  const backToCopy = () => {
    setNotionTarget(os, COPY.dataSource, COPY.name);
    toast.show({ message: `Writing to ${COPY.name} again`, icon: 'check' });
  };
  const sync = async (fromStart = false) => {
    const src = os.registry.sources.get(NOTION_SOURCE);
    if (!src) return;
    setBusy(true);
    try {
      if (fromStart) os.settings.set(NOTION_CURSOR, null);
      await runSource(os, src);
      const r = notionLast(os);
      toast.show({ message: r ? `Synced: ${r.pulled} pages read, ${r.created} new, ${r.queued} to send` : 'Synced', icon: 'check' });
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    } finally {
      setBusy(false);
    }
  };

  const isCopy = normId(state.target) === normId(COPY.dataSource);
  const pill = !hasToken ? { label: 'Not connected', fg: t.c.alert.coralText, bg: t.c.alert.coralFill, icon: 'x' } : state.src.error ? { label: 'Not synced', fg: t.c.alert.coralText, bg: t.c.alert.coralFill, icon: 'alert' } : { label: 'Connected', fg: t.c.accent.mustard, bg: 'rgba(215,245,92,0.16)', icon: 'check' };
  const line = !hasToken ? 'No token on this phone' : state.src.error ? 'Last sync failed' : state.last ? `Writing to ${state.name}` : 'Not synced yet';

  return (
    <Screen title="Notion" subtitle="You › Data sources" onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings/sources' as never))} contentStyle={{ gap: 14 }}>
      {/* The connection and the last sync */}
      <View style={{ padding: 14, gap: 12, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="notebook" size={18} color={t.c.fg.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Text variant="rowTitle" style={{ fontWeight: '700' }}>
              Notion
            </Text>
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {line}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: pill.bg }}>
            <Icon name={pill.icon} size={13} color={pill.fg} />
            <Text variant="labelMicro" color={pill.fg}>
              {pill.label}
            </Text>
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: t.c.line }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="caption" color="tertiary">
              Last sync
            </Text>
            <Text variant="label" numberOfLines={2}>
              {state.last ? `${when(state.last.at)} · ${state.last.pulled} pages read, ${state.last.created} new` : 'Not synced yet'}
            </Text>
          </View>
          <Button title={busy ? 'Syncing…' : 'Sync now'} icon="refresh" variant="secondary" size="sm" style={{ height: 40 }} disabled={busy || !hasToken} onPress={() => void sync()} />
        </View>
        {state.src.error ? (
          <Text variant="caption" color={t.c.alert.coralText}>
            {state.src.error}
          </Text>
        ) : null}
        {state.last ? (
          <Text variant="caption" color="tertiary">
            {`${state.last.matched} matched to People, ${state.last.updated} brought up to date, ${state.last.facts} Facts read, ${state.last.conflicts} changed on both sides, ${state.last.asked} asked in To check`}
            {state.waiting ? ` · ${state.waiting} change${state.waiting === 1 ? '' : 's'} waiting to send` : ''}
          </Text>
        ) : null}
        {state.last ? (
          <Pressable accessibilityRole="button" disabled={busy || !hasToken} onPress={() => void sync(true)} hitSlop={6} style={{ alignSelf: 'flex-start', opacity: busy || !hasToken ? 0.4 : 1 }}>
            <Text variant="caption" color={t.c.accent.mustard} style={{ fontWeight: '700' }}>
              Read every page again
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* The copy it writes to */}
      <Field label="Writes to">
        <Box>
          <Icon name="shield" size={18} color={t.c.fg.tertiary} />
          <Text variant="body" style={{ flex: 1 }} numberOfLines={2}>
            {`Writing to ${state.name} — your original Contacts stays untouched`}
          </Text>
        </Box>
        <Box>
          <Icon name="link" size={18} color={t.c.fg.tertiary} />
          <Input value={link} onChange={setLink} placeholder="Another copy’s link, to write there instead" label="Another copy’s link" keyboardType="url" />
        </Box>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Button title="Use this copy" icon="check" size="sm" style={{ height: 36 }} disabled={!link.trim() || busy || !hasToken} onPress={() => void applyLink()} />
          {!isCopy ? <Button title={`Back to ${COPY.name}`} variant="ghost" size="sm" style={{ height: 36 }} onPress={backToCopy} /> : null}
        </View>
        <Text variant="caption" color="tertiary">
          LifeOS only ever reads your original People CRM and never writes to it or its pages. A link to the original is refused.
        </Text>
      </Field>

      {/* Token */}
      <Field label="Integration token">
        {hasToken && !replacing ? (
          <>
            <Box>
              <Icon name="key" size={18} color={t.c.fg.tertiary} />
              <Text variant="body" style={{ flex: 1, fontFamily: fontForWeight(500), letterSpacing: 3 }}>
                ••••••••••••
              </Text>
              <Text variant="labelMicro" color={t.c.accent.mustard}>
                Saved on this phone
              </Text>
            </Box>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Button title="Replace" variant="secondary" size="sm" style={{ height: 36 }} onPress={() => setReplacing(true)} />
              <Button title="Remove" variant="ghost" size="sm" style={{ height: 36 }} onPress={() => void forget()} />
            </View>
          </>
        ) : (
          <>
            <Box>
              <Icon name="key" size={18} color={t.c.fg.tertiary} />
              <Input value={token} onChange={setToken} onDone={() => token.trim() && void saveToken()} placeholder="ntn_… from notion.so/profile/integrations" label="Integration token" secure />
            </Box>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Button title="Save token" icon="check" size="sm" style={{ height: 36 }} disabled={!token.trim()} onPress={() => void saveToken()} />
              {replacing ? (
                <Button
                  title="Keep the saved one"
                  variant="ghost"
                  size="sm"
                  style={{ height: 36 }}
                  onPress={() => {
                    setReplacing(false);
                    setToken('');
                  }}
                />
              ) : null}
            </View>
          </>
        )}
        <Text variant="caption" color="tertiary">
          Kept in the phone’s secure store, never in backups, and never shown again once saved. It can read and change only what you share with the integration.
        </Text>
      </Field>

      {/* Changes Notion said no to */}
      {state.refused.length ? (
        <View style={{ padding: 14, gap: 10, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
          <Text variant="tileTitle" style={{ lineHeight: 20 }}>
            Not sent
          </Text>
          {state.refused.map((r) => (
            <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="label" numberOfLines={1}>
                  {r.label}
                </Text>
                <Text variant="caption" color={t.c.alert.coralText} numberOfLines={2}>
                  {r.error}
                </Text>
              </View>
              <Button title="Dismiss" variant="ghost" size="sm" style={{ height: 32 }} onPress={() => os.outbox.dismiss(r.id)} />
            </View>
          ))}
        </View>
      ) : null}

      {/* How sync works */}
      <View style={{ padding: 14, gap: 8, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
        <Text variant="tileTitle" style={{ lineHeight: 20 }}>
          Sync
        </Text>
        <Text variant="caption" color="tertiary">
          Runs with the other sources and on Sync now. A change in either place reaches the other: Fields, tags as Associations, Likes as the Likes bullets, Facts said here under Life Updates, and calls, meetings and payments in a LifeOS log at the end of each page. When both changed the same Field, the later edit is kept and the other is shown once in To check. While Notion can’t be reached, changes wait on this phone.
        </Text>
      </View>

      {/* Setting it up */}
      <View style={{ gap: 10 }}>
        <Text variant="tileTitle" style={{ lineHeight: 20 }}>
          Setting it up
        </Text>
        {STEPS.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
            <Text variant="label" color="secondary">
              {i + 1}.
            </Text>
            <Text variant="caption" color="secondary" style={{ flex: 1 }}>
              {s}
            </Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

/* Pieces, as on You › Data sources › Turf web */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="tileTitle" style={{ lineHeight: 20 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 18, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: t.c.line }}>{children}</View>;
}

function Input({ value, onChange, onDone, placeholder, label, keyboardType, secure }: { value: string; onChange: (v: string) => void; onDone?: () => void; placeholder?: string; label: string; keyboardType?: 'url'; secure?: boolean }) {
  const t = useTheme();
  return (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChange}
      onEndEditing={onDone}
      onSubmitEditing={onDone}
      placeholder={placeholder}
      placeholderTextColor={t.c.fg.tertiary}
      selectionColor={t.c.accent.mustard}
      cursorColor={t.c.fg.primary}
      keyboardType={keyboardType}
      autoCapitalize="none"
      autoCorrect={false}
      secureTextEntry={secure}
      style={{ flex: 1, minWidth: 0, color: t.c.fg.primary, fontFamily: fontForWeight(500), fontSize: 15, lineHeight: 20, paddingVertical: 14 }}
    />
  );
}
