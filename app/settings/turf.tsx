import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format, isToday, isYesterday } from 'date-fns';
import { runSource } from '@core/filing/sources';
import { sourceState } from '@core/sources/deviceData';
import { allPlayers, isTurfKey, turfBase, turfChanges, SETTING_LAST, SETTING_ME, SETTING_REV, SETTING_SQUAD, SETTING_UPI, TURF_DEFAULT_URL, TURF_KEY, TURF_URL, type SyncResult } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fontForWeight } from '@ui/theme/tokens';
import { Button, Icon, Screen, Text, useToast } from '@ui/kit';
import { SourceGlyph } from '@boards/turf/states';

const STEPS = [
  'On Turf web, signed in as organiser: Settings › Connected phones › Add a phone. Name it “LifeOS · S22”.',
  'Copy the key it shows (it starts with tw_ and is shown once).',
  'Paste it here with Turf web’s address, then tap Pull now. The first pull brings everything; after that only what changed.',
];

const when = (at: number) => `${isToday(at) ? 'Today' : isYesterday(at) ? 'Yesterday' : format(at, 'd MMM')}, ${format(at, 'H:mm')}`;
const hostOf = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');

/**
 * You › Data sources › Turf web (R9c; Turf · Noir TF-Settings): the
 * connection and the last pull, the address, this phone's key (kept in the
 * phone's secure store, never shown again), which player is you and the squad
 * (both set in Turf web, shown here), how sync works, setting it up, and
 * Disconnect.
 */
export default function TurfSettings() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [url, setUrl] = useState(os.settings.get<string>(TURF_URL, '') || TURF_DEFAULT_URL);
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);
  const me = useLive((o) => {
    const id = o.settings.get<string | null>(SETTING_ME, null);
    const p = id && o.registry.objects.has('player') ? allPlayers(o).find((x) => x.data.sourceKey === `turf:players:${id}`) : null;
    return p ? { id: p.id, name: p.data.name, position: p.data.position ?? null } : null;
  }, []);
  const state = useLive(
    (o) => ({
      src: sourceState(o, 'turf'),
      last: o.settings.get<(SyncResult & { at: number }) | null>(SETTING_LAST, null),
      base: turfBase(o),
      waiting: turfChanges(o).sending.length,
      squad: o.settings.get<string | null>(SETTING_SQUAD, null),
      upi: o.settings.get<string | null>(SETTING_UPI, null),
    }),
    [],
  );

  useEffect(() => {
    void os.device?.secrets?.get(TURF_KEY).then((k) => setHasKey(!!k));
  }, [os]);

  const saveUrl = () => {
    const next = url.trim();
    if (next === os.settings.get<string>(TURF_URL, '')) return;
    os.settings.set(TURF_URL, next);
    toast.show({ message: 'Address saved', icon: 'check' });
  };
  const saveKey = async () => {
    saveUrl();
    if (!isTurfKey(key)) return toast.show({ message: 'That isn’t a Turf web key — it starts with tw_', icon: 'info' });
    await os.device?.secrets?.set(TURF_KEY, key.trim());
    setKey('');
    setHasKey(true);
    setReplacing(false);
    toast.show({ message: 'Key saved on this phone', icon: 'check' });
  };
  const forget = async () => {
    await os.device?.secrets?.set(TURF_KEY, null);
    setHasKey(false);
    setReplacing(false);
    toast.show({ message: 'Key removed from this phone', icon: 'trash' });
  };
  const disconnect = async () => {
    await os.device?.secrets?.set(TURF_KEY, null);
    os.settings.set(TURF_URL, '');
    setUrl(TURF_DEFAULT_URL);
    setHasKey(false);
    setReplacing(false);
    toast.show({ message: 'Disconnected · what was pulled stays here', icon: 'check' });
  };
  const sync = async (fromStart = false) => {
    saveUrl();
    const src = os.registry.sources.get('turf');
    if (!src) return;
    setBusy(true);
    try {
      if (fromStart) os.settings.set(SETTING_REV, 0);
      await runSource(os, src);
      const r = os.settings.get<SyncResult | null>(SETTING_LAST, null);
      toast.show({ message: r ? `Synced: ${r.created} new, ${r.updated} changed` : 'Synced', icon: 'check' });
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    } finally {
      setBusy(false);
    }
  };

  const connected = !!state.base && hasKey;
  const pill = !connected ? { label: 'Not connected', fg: t.c.alert.coralText, bg: t.c.alert.coralFill, icon: 'x' } : state.src.error ? { label: 'Not synced', fg: t.c.alert.coralText, bg: t.c.alert.coralFill, icon: 'alert' } : { label: 'Connected', fg: t.c.accent.mustard, bg: 'rgba(215,245,92,0.16)', icon: 'check' };
  const line = state.base ? `${hostOf(state.base)} · ${!hasKey ? 'no key on this phone' : state.src.error ? 'last pull failed' : state.last ? 'connected' : 'not pulled yet'}` : 'No address yet';

  return (
    <Screen title="Turf web" subtitle="You › Data sources" onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings/sources' as never))} contentStyle={{ gap: 14 }}>
      {/* The connection and the last pull */}
      <View style={{ padding: 14, gap: 12, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
            <SourceGlyph size={18} color="#A9C4FF" />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Text variant="rowTitle" style={{ fontWeight: '700' }}>
              Turf web
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
              Last pull
            </Text>
            <Text variant="label" numberOfLines={2}>
              {state.last ? `${when(state.last.at)} · ${state.last.created} new, ${state.last.updated} changed` : 'Not pulled yet'}
            </Text>
          </View>
          <Button title={busy ? 'Pulling…' : 'Pull now'} icon="refresh" variant="secondary" size="sm" style={{ height: 40 }} disabled={busy || !url.trim() || !hasKey} onPress={() => void sync()} />
        </View>
        {state.src.error ? (
          <Text variant="caption" color={t.c.alert.coralText}>
            {state.src.error}
          </Text>
        ) : null}
        {state.last ? (
          <Text variant="caption" color="tertiary">
            {`Change ${state.last.rev}: ${state.last.archived} archived, ${state.last.payments} payment entries · ${state.last.peopleMatched} players matched to People, ${state.last.peopleCreated} added`}
            {state.waiting ? ` · ${state.waiting} change${state.waiting === 1 ? '' : 's'} waiting to send` : ''}
          </Text>
        ) : null}
        {state.last ? (
          <Pressable accessibilityRole="button" disabled={busy || !hasKey} onPress={() => void sync(true)} hitSlop={6} style={{ alignSelf: 'flex-start', opacity: busy || !hasKey ? 0.4 : 1 }}>
            <Text variant="caption" color={t.c.accent.mustard} style={{ fontWeight: '700' }}>
              Sync everything again
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Address */}
      <Field label="Address">
        <Box>
          <Icon name="link" size={18} color={t.c.fg.tertiary} />
          <Input value={url} onChange={setUrl} onDone={saveUrl} placeholder={TURF_DEFAULT_URL} label="Address" keyboardType="url" />
        </Box>
      </Field>

      {/* Access key */}
      <Field label="Access key">
        {hasKey && !replacing ? (
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
              <Input value={key} onChange={setKey} onDone={() => key.trim() && void saveKey()} placeholder="tw_… from Turf web › Settings › Connected phones" label="Access key" secure />
            </Box>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Button title="Save key" icon="check" size="sm" style={{ height: 36 }} disabled={!key.trim()} onPress={() => void saveKey()} />
              {replacing ? <Button title="Keep the saved one" variant="ghost" size="sm" style={{ height: 36 }} onPress={() => {
                    setReplacing(false);
                    setKey('');
                  }} /> : null}
            </View>
          </>
        )}
        <Text variant="caption" color="tertiary">
          Acts as you, the owner. Kept in the phone’s secure store, never in backups, and never shown again once saved. Don’t paste it into chats.
        </Text>
      </Field>

      {/* Which player is you */}
      <Field label="Which player is you">
        <Pressable accessibilityRole={me ? 'button' : undefined} disabled={!me} onPress={() => me && router.push(`/board/turf/player?player=${me.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: me ? t.c.accent.mustard : t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
            {me ? (
              <Text variant="label" color={t.c.accent.mustardInk} style={{ fontWeight: '700' }}>
                {me.name.trim().slice(0, 1).toUpperCase()}
              </Text>
            ) : (
              <Icon name="user" size={18} color={t.c.fg.tertiary} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="rowTitle" numberOfLines={1}>
              {me?.name ?? 'Not set'}
            </Text>
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {me ? [me.position, 'marked (you) in every list'].filter(Boolean).join(' · ') : 'Set in Turf web › Settings › Who you are'}
            </Text>
          </View>
          {me ? <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} /> : null}
        </Pressable>
        <Text variant="caption" color="tertiary">
          Set in Turf web, so both phones agree. It decides who owes whom: on a game you fronted, open shares are owed to you; on someone else’s, your open share is owed by you.
        </Text>
      </Field>

      {/* The squad, as Turf web has it */}
      {state.squad || state.upi ? (
        <View style={{ padding: 14, gap: 12, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
          <Readout label="Squad" value={state.squad} />
          <View style={{ height: 1, backgroundColor: t.c.line }} />
          <Readout label="Your UPI" value={state.upi} hint="On every dues text" />
          <Text variant="caption" color="tertiary">
            Set on Turf web › Settings.
          </Text>
        </View>
      ) : null}

      {/* How sync works */}
      <View style={{ padding: 14, gap: 8, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
        <Text variant="tileTitle" style={{ lineHeight: 20 }}>
          Sync
        </Text>
        <Text variant="caption" color="tertiary">
          Pulls when Turf opens, every minute while it stays open, and on pull-to-refresh. Changes you make here are sent back in order; while Turf web can’t be reached they wait on this phone.
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
        <Text variant="caption" color="tertiary">
          LifeOS pulls matches, players, venues, RSVPs and every payment entry, and sends back what you change here. Nothing is imported as a Transaction, because your bank texts already file those.
        </Text>
      </View>

      {hasKey || state.base ? (
        <Pressable accessibilityRole="button" onPress={() => void disconnect()} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 6 }}>
          <Text variant="caption" color={t.c.alert.coralText}>
            Disconnect
          </Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces (TF-Settings: 15/600 labels, 56 boxes with a hairline)       */
/* ------------------------------------------------------------------ */

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

function Readout({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="caption" color="tertiary">
        {hint ? `${label} · ${hint}` : label}
      </Text>
      <Text variant="label" color={value ? 'primary' : 'tertiary'} selectable>
        {value ?? 'Not set'}
      </Text>
    </View>
  );
}
