import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { brainModelId, brains, brainSettings, lastPassToday, setBrainSettings, setModelForToday, STRONG_MODEL, type SentEntry } from '@core/brain';
import { BRAIN_MODELS } from '@core/ai/brainModel';
import { PROVIDER_PRESETS } from '@core/ai/providers';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, FilterChip, Icon, IconButton, ProgressBar, Screen, Segmented, Sheet, Surface, Text, Toggle, useToast, type IconName } from '@ui/kit';
import { getProviderKey, setProviderKey } from '../../src/platform/keys';
import { runBrainPass } from '../../src/platform/brain';
import { CapsLabel, Disc, Dot, Hairline, lilacInk, moduleInk, MoreLink, passTime, Pill, SlabInput, softInk } from '../../src/screens/brainParts';

/** 940, 1.6k, 40k. */
const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(n)));
const NOTES: Record<string, string> = { 'nothing new': 'Nothing new since the last pass, so Claude was not asked', 'no key': 'no Claude key, in LifeOS’s own words', 'over budget': 'over today’s budget, in LifeOS’s own words', error: 'Claude didn’t answer, in LifeOS’s own words', off: 'The brain is off' };
const BUDGET_STEP = 10_000;
const SHOWN_SENDS = 4;
const nudgeWord = (n: number) => `${n} nudge${n === 1 ? '' : 's'} in To check`;
const hhmmWords = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return format(new Date(2000, 0, 1, h, m), 'h:mm a').toLowerCase();
};
/** Half hours through `from`..`to` o'clock, as "07:30". */
const halfHours = (from: number, to: number) => Array.from({ length: (to - from) * 2 + 1 }, (_, i) => `${String(from + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

function Card({ children, gap = 14 }: { children: React.ReactNode; gap?: number }) {
  const t = useTheme();
  return (
    <Surface kind="tile">
      <View style={{ padding: 16, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, gap }}>{children}</View>
    </Surface>
  );
}

/**
 * You › Agent › Brain (docs/MODEL.md layer 8; NR-Brain-Agent, NR-Brain-States):
 * what it does, the passes, the Claude key and model, the daily budget, the
 * Sent to Claude log, and the way into what it has learned.
 */
export default function BrainSettingsRoute() {
  const router = useRouter();
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const s = useLive((o) => brainSettings(o), []);
  const today = useLive((o) => brainModelId(o), []);
  const label = (id: string) => BRAIN_MODELS.find((m) => m.id === id)?.label ?? id;
  const used = useLive((o) => o.brain.sent.tokensToday(Date.now()), []);
  const sent = useLive((o) => o.brain.sent.recent(1000), []);
  const counts = useLive((o) => {
    const learned = o.brain.learned.all({ limit: 5000 });
    const skills = o.brain.skills.all();
    const n = (kind: string) => learned.filter((l) => l.kind === kind).length;
    const by = (source: string) => skills.filter((x) => x.source === source).length;
    return { learned: learned.length, answers: n('answer'), facts: n('fact'), notThis: n('not-this'), skills: skills.length, code: by('code'), claude: by('claude'), you: by('you') };
  }, []);
  const lastRun = useLive((o) => {
    const p = lastPassToday(o);
    return p?.pass === 'manual' ? { at: p.at, filed: o.brain.nudges.since(p.at).filter((n) => n.createdAt === p.at).length } : null;
  }, []);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [key, setKey] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [running, setRunning] = useState(false);
  const [allSends, setAllSends] = useState(false);
  const [picking, setPicking] = useState<'morning' | 'evening' | null>(null);
  useEffect(() => {
    void getProviderKey('claude').then((v) => setHasKey(!!v));
  }, []);

  const saveKey = async () => {
    const v = key.trim() || null;
    await setProviderKey('claude', v);
    setHasKey(!!v);
    setKey('');
    setReplacing(false);
    toast.show({ message: v ? 'Claude key saved on this phone' : 'Claude key removed', icon: 'check' });
  };
  const runNow = async () => {
    setRunning(true);
    try {
      const r = await runBrainPass(os, 'manual', 'you pressed Run a pass now');
      const note = r.note ? NOTES[r.note] : undefined;
      const message = r.filed.length ? `${nudgeWord(r.filed.length)}${note ? ` · ${note}` : ''}` : r.note ? note! : 'Nothing new';
      toast.show({ message, icon: r.note === 'over budget' || r.note === 'error' ? 'warning' : r.filed.length ? 'check' : 'minus' });
    } finally {
      setRunning(false);
    }
  };
  const over = used >= s.budget;
  const onToday = today !== s.model;
  const editing = hasKey === false || replacing;
  const models = [...BRAIN_MODELS].reverse();
  const shown = allSends ? sent : sent.slice(0, SHOWN_SENDS);

  return (
    <Screen title="Brain" subtitle="You · Agent" onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings/ai' as never))} contentStyle={{ gap: 14 }}>
      <Surface kind="tile">
        <View style={{ padding: 18, borderRadius: t.radius.tile, backgroundColor: t.c.bg.tile, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Disc icon="brain" color={lilacInk(t)} size={44} iconSize={20} />
            <Text variant="heading" style={{ flex: 1 }}>
              LifeOS comes to you first
            </Text>
          </View>
          <Text variant="label" color={softInk(t)} style={{ fontFamily: t.type.body.fontFamily, lineHeight: 20 }}>
            Twice a day LifeOS looks through Home, Upkeep, People and Turf for what needs you, sends Claude the short list and files what it says in To check and the Morning brief. It never sends, pays or orders on its own.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.c.bg.tileRaised }}>
            <Icon name="shield" size={17} color={t.c.accent.mustard} />
            <Text variant="caption" color={softInk(t)} style={{ flex: 1, lineHeight: 18 }}>
              Only records leave the phone, never a phone number, a message, a mail or a photo. What it learns is kept here, on this phone.
            </Text>
          </View>
        </View>
      </Surface>

      <CapsLabel label="Passes" />
      <Surface kind="tile">
        <View style={{ paddingTop: 8, paddingBottom: 16, paddingHorizontal: 16, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="rowTitle">Morning and evening passes</Text>
              <Text variant="caption" color="secondary">
                {s.on ? 'On' : 'The brain is off'}
              </Text>
            </View>
            <Toggle value={s.on} onChange={(on) => setBrainSettings(os, { on })} accessibilityLabel="Morning and evening passes" />
          </View>
          <Hairline />
          <PassRow icon="sun" color={t.c.accent.mustard} title="Morning pass" sub="Writes the brief" time={s.morning} onPick={() => setPicking('morning')} />
          <Hairline />
          <PassRow icon="moon" color={lilacInk(t)} title="Evening pass" sub="Updates the brief" time={s.evening} onPick={() => setPicking('evening')} />
          <Text variant="labelMicro" color="secondary" style={{ fontFamily: t.type.caption.fontFamily, paddingLeft: 48, paddingBottom: 10 }}>
            Each runs from its time, when Android lets the app run, and when you open LifeOS.
          </Text>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: running, busy: running }} disabled={running} onPress={() => void runNow()} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
            {running ? <ActivityIndicator size="small" color={t.c.accent.mustard} /> : <Icon name="refresh" size={17} color={t.c.accent.mustard} />}
            <Text variant="body" color={running ? softInk(t) : 'primary'} style={{ fontWeight: '700' }}>
              {running ? 'Running a pass' : 'Run a pass now'}
            </Text>
          </Pressable>
          {lastRun && !running ? (
            <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, paddingHorizontal: 4 }}>
              <Icon name="check" size={15} color={t.c.accent.mustard} />
              <Text variant="caption" color={softInk(t)} style={{ flex: 1 }}>
                {`Ran by hand ${passTime(lastRun.at)} · ${nudgeWord(lastRun.filed)}`}
              </Text>
            </View>
          ) : null}
        </View>
      </Surface>

      <CapsLabel label="Claude" />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Disc icon="key" color={lilacInk(t)} />
          <Text variant="rowTitle" style={{ flex: 1 }}>
            API key
          </Text>
          {hasKey === null ? null : hasKey ? <Pill label="Saved on this phone" icon="check" height={28} color={t.c.ok.sageText} fill={t.c.ok.sageFill} /> : <Pill label="No key" height={28} color={softInk(t)} fill={t.c.bg.dim} />}
        </View>
        <View style={{ gap: 6 }}>
          <Text variant="caption" color={softInk(t)} style={{ fontWeight: '600' }}>
            Claude key
          </Text>
          {editing ? (
            <SlabInput label="Claude key" value={key} onChange={setKey} placeholder="Paste your Claude key" autoCapitalize="none" autoCorrect={false} secureTextEntry />
          ) : (
            <View accessibilityLabel="A key is saved" style={{ justifyContent: 'center', height: 56, paddingHorizontal: 18, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, borderWidth: 1, borderColor: t.c.line }}>
              <Text variant="rowTitle" style={{ fontWeight: '500', letterSpacing: 2 }} numberOfLines={1}>
                ••••••••••••••••••••••
              </Text>
            </View>
          )}
          <Text variant="labelMicro" color="secondary" style={{ fontFamily: t.type.caption.fontFamily }}>
            {hasKey ? 'Kept in the phone’s secure store. The same key as Claude under Providers.' : 'Without a key nudges still come, in LifeOS’s own words.'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {editing ? <Button title={!key.trim() && hasKey ? 'Remove key' : 'Save key'} size="sm" disabled={!key.trim() && !hasKey} style={{ flex: 1, paddingHorizontal: 8 }} onPress={() => void saveKey()} /> : <Button title="Replace key" size="sm" variant="secondary" style={{ flex: 1, paddingHorizontal: 8 }} onPress={() => setReplacing(true)} />}
          <Button title="Get a key" size="sm" variant="secondary" icon="link" style={{ flex: 1, paddingHorizontal: 8 }} onPress={() => void Linking.openURL(PROVIDER_PRESETS.claude.keyUrl!)} />
        </View>
        <Hairline />
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text variant="rowTitle" style={{ flex: 1 }}>
              Model
            </Text>
            <Text variant="labelMicro" color="secondary" style={{ fontFamily: t.type.caption.fontFamily }}>
              for every pass
            </Text>
          </View>
          <Segmented options={models.map((m) => ({ value: m.id as string, label: m.label }))} value={s.model} onChange={(model) => setBrainSettings(os, { model })} />
        </View>
        {s.model !== STRONG_MODEL ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="rowTitle">{`${label(STRONG_MODEL)} for today`}</Text>
              <Text variant="caption" color="secondary">
                {`A stronger model until midnight, then ${label(s.model)} again`}
              </Text>
            </View>
            <Toggle value={today === STRONG_MODEL} onChange={(on) => setModelForToday(os, on ? STRONG_MODEL : null)} accessibilityLabel={`${label(STRONG_MODEL)} for today`} />
          </View>
        ) : null}
        {onToday ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: `${lilacInk(t)}1F` }}>
            <Icon name="sparkle" size={16} color={lilacInk(t)} />
            <Text variant="label" style={{ flex: 1, lineHeight: 19 }}>
              {`Today: ${label(today)}, then back to ${label(s.model)}`}
            </Text>
          </View>
        ) : null}
        <Text variant="labelMicro" color="secondary" style={{ fontFamily: t.type.caption.fontFamily }}>
          {`The first day the brain runs starts on ${label(STRONG_MODEL)}.`}
        </Text>
      </Card>

      <CapsLabel label={over ? 'Over budget' : 'Daily budget'} />
      <Card gap={over ? 12 : 14}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text variant="stat" color={over ? t.c.alert.coralText : 'primary'} style={{ fontSize: 30, lineHeight: 34, letterSpacing: -0.5 }}>
            {k(used)}
          </Text>
          <Text variant="label" color="secondary" style={{ flexShrink: 1, fontFamily: t.type.body.fontFamily, lineHeight: 19 }}>
            {`of ${k(s.budget)} tokens today`}
          </Text>
          {!over ? (
            <Text variant="caption" color={t.c.accent.gold} style={{ marginLeft: 'auto', fontWeight: '600' }}>
              {`${Math.round((used / Math.max(1, s.budget)) * 100)}%`}
            </Text>
          ) : null}
        </View>
        <ProgressBar value={used / Math.max(1, s.budget)} track={t.c.bg.tileRaised} color={over ? t.c.alert.coral : t.c.accent.mustard} accessibilityLabel={`${k(used)} of ${k(s.budget)} tokens used today`} />
        {over ? (
          <>
            <Text variant="caption" color={softInk(t)} style={{ lineHeight: 18 }}>
              Over today’s budget: passes file in LifeOS’s own words. It resets at midnight.
            </Text>
            <Button title="Raise the budget" size="sm" variant="secondary" block onPress={() => setBrainSettings(os, { budget: s.budget + BUDGET_STEP })} />
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
                <IconButton icon="minus" size={40} filled={t.c.bg.dim} disabled={s.budget <= BUDGET_STEP} accessibilityLabel="Lower the budget" onPress={() => setBrainSettings(os, { budget: s.budget - BUDGET_STEP })} />
                <Text variant="metric" style={{ minWidth: 64, textAlign: 'center', lineHeight: 29, letterSpacing: 0 }}>
                  {k(s.budget)}
                </Text>
                <IconButton icon="plus" size={40} filled={t.c.bg.dim} accessibilityLabel="Raise the budget" onPress={() => setBrainSettings(os, { budget: s.budget + BUDGET_STEP })} />
              </View>
              <Text variant="label" color="secondary" style={{ fontWeight: '500' }}>
                tokens a day
              </Text>
            </View>
            <Text variant="labelMicro" color="secondary" style={{ fontFamily: t.type.caption.fontFamily }}>
              Checked before each pass. Over it, nudges come in LifeOS’s own words. Tokens from cache count a tenth.
            </Text>
          </>
        )}
      </Card>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 18, paddingHorizontal: 4 }}>
        <View style={{ flex: 1 }}>
          <Text variant="heading" accessibilityRole="header">
            Sent to Claude
          </Text>
          <Text variant="caption" color="secondary">
            What left this phone, when and why
          </Text>
        </View>
        {sent.length ? (
          <Text variant="caption" color="secondary" style={{ fontWeight: '600' }}>
            {`${sent.length} send${sent.length === 1 ? '' : 's'}`}
          </Text>
        ) : null}
      </View>
      {sent.length ? (
        shown.map((e) => <SentRow key={e.id} e={e} model={label(e.model)} />)
      ) : (
        <View style={{ padding: 18, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, alignItems: 'center', gap: 10 }}>
          <Disc icon="shield" color={t.c.accent.mustard} size={56} iconSize={24} />
          <Text variant="heading">Nothing has left the phone yet</Text>
          <Text variant="caption" color="secondary" style={{ lineHeight: 18, maxWidth: 270, textAlign: 'center' }}>
            Every send is listed here, line by line: when, why and what went.
          </Text>
        </View>
      )}
      {sent.length > SHOWN_SENDS && !allSends ? <MoreLink label={`All ${sent.length} sends`} icon="chevron-right" onPress={() => setAllSends(true)} /> : null}

      <CapsLabel label="What it has learned" />
      <View style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile }}>
        {counts.learned ? (
          <LearnedLink icon="book" title={`${counts.learned} kept on this phone`} sub={`${counts.answers} answer${counts.answers === 1 ? '' : 's'} · ${counts.facts} fact${counts.facts === 1 ? '' : 's'} · ${counts.notThis} Not this`} onPress={() => router.push('/settings/brain-learned' as never)} />
        ) : (
          <Text variant="label" color={softInk(t)} style={{ fontFamily: t.type.body.fontFamily, lineHeight: 20, paddingVertical: 8 }}>
            Nothing yet. Answers are kept here so the same question never costs a call twice.
          </Text>
        )}
        <Hairline />
        <LearnedLink icon="list" title="Skills" sub={counts.skills ? `${counts.skills} rule${counts.skills === 1 ? '' : 's'} · ${counts.code} built in, ${counts.claude} from Claude, ${counts.you} yours` : 'The rules it works by'} onPress={() => router.push('/settings/brain-learned?at=skills' as never)} />
      </View>

      <Sheet visible={!!picking} onClose={() => setPicking(null)} title={picking === 'morning' ? 'Morning pass' : 'Evening pass'}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 16 }}>
          {picking
            ? (picking === 'morning' ? halfHours(5, 11) : halfHours(17, 23)).map((v) => (
                <FilterChip
                  key={v}
                  label={hhmmWords(v)}
                  selected={s[picking] === v}
                  onPress={() => {
                    setBrainSettings(os, { [picking]: v });
                    setPicking(null);
                  }}
                />
              ))
            : null}
        </View>
      </Sheet>
    </Screen>
  );
}

function PassRow({ icon, color, title, sub, time, onPick }: { icon: IconName; color: string; title: string; sub: string; time: string; onPick: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 }}>
      <Disc icon={icon} color={color} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="rowTitle">{title}</Text>
        <Text variant="caption" color="secondary">
          {sub}
        </Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title} time, ${hhmmWords(time)}`} hitSlop={6} onPress={onPick} style={({ pressed }) => ({ height: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
        <Text variant="label">{hhmmWords(time)}</Text>
      </Pressable>
    </View>
  );
}

function LearnedLink({ icon, title, sub, onPress }: { icon: IconName; title: string; sub: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, opacity: pressed ? 0.7 : 1 })}>
      <Disc icon={icon} color={lilacInk(t)} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="rowTitle">{title}</Text>
        <Text variant="caption" color="secondary" numberOfLines={2}>
          {sub}
        </Text>
      </View>
      <Icon name="chevron-right" size={18} color={t.c.fg.secondary} />
    </Pressable>
  );
}

/** "Claude API 529: ..." in a word. */
const failure = (error: string | null) => (/\b(429|529|overloaded|busy)\b/i.test(error ?? '') ? ' (busy)' : /network/i.test(error ?? '') ? ' (no network)' : '');

function SentRow({ e, model }: { e: SentEntry; model: string }) {
  const os = useOS();
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const failed = e.outcome !== 'ok';
  const why = e.pass === 'manual' ? 'ran by hand' : e.why;
  const when = format(e.at, 'EEE d MMM, h:mm a').replace(/ (AM|PM)$/, (m) => m.toLowerCase());
  const tokens = `${k(e.input)} in · ${k(e.output)} out · ${k(e.cacheRead)} from cache`;
  const inkOf = (name: string) => moduleInk(t, brains(os).find((b) => b.name === name)?.module ?? '');
  return (
    <View style={{ paddingTop: 14, paddingBottom: open ? 16 : 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.c.bg.tile, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text variant="tileTitle" style={{ lineHeight: 20 }}>
            {when}
            <Text variant="caption" color="secondary">{`  · ${why}`}</Text>
          </Text>
          {failed && !open ? (
            <Text variant="caption" color={t.c.alert.coralText}>
              Failed · Claude didn’t answer, filed in LifeOS’s own words
            </Text>
          ) : (
            <Text variant="caption" color="secondary">
              {`${model} · ${e.records} record${e.records === 1 ? '' : 's'} · ${failed && !e.input && !e.output ? '0 tokens charged' : tokens}`}
            </Text>
          )}
        </View>
        {failed && open ? <Pill label="Failed" height={28} color={t.c.alert.coralText} fill={t.c.alert.coralFill} /> : null}
        <IconButton icon={open ? 'chevron-up' : 'chevron-down'} size={44} filled={t.c.bg.tileRaised} color={t.c.fg.primary} accessibilityLabel={`${open ? 'Hide' : 'Show'} what left at ${format(e.at, 'h:mm a')}`} onPress={() => setOpen(!open)} />
      </View>
      {open ? (
        <>
          {failed ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.c.alert.coralFill }}>
              <Icon name="alert" size={15} color={t.c.alert.coralText} />
              <Text variant="caption" color={t.c.alert.coralText} style={{ flex: 1, lineHeight: 18 }}>
                {`Claude didn’t answer${failure(e.error)}. The nudges were filed in LifeOS’s own words.`}
              </Text>
            </View>
          ) : null}
          <Text variant="labelCaps" color="secondary" style={{ textTransform: 'uppercase' }}>
            {`What left · ${e.lines.length} line${e.lines.length === 1 ? '' : 's'}`}
          </Text>
          <View style={{ paddingVertical: 4, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.c.bg.tileRaised }}>
            {e.lines.map((line, i) => {
              const parts = line.split(' · ');
              const [name = '', kind] = parts;
              const asks = parts.find((p) => p.startsWith('asks: '));
              const body = parts.slice(2).filter((p) => !p.startsWith('asks: ')).join(' · ').replace(/\b([a-z_]+)=/g, (_, f: string) => (f === 'name' ? '' : `${f.replace(/_/g, ' ')} `));
              return (
                <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: t.c.line }}>
                  <View style={{ marginTop: 6 }}>
                    <Dot color={inkOf(name)} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text variant="labelMicro" color="secondary">
                      {[name, kind, asks?.replace('asks: ', 'asks ')].filter(Boolean).join(' · ')}
                    </Text>
                    {body ? (
                      <Text variant="label" style={{ fontFamily: t.type.body.fontFamily, lineHeight: 19 }}>
                        {body}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Icon name="shield" size={14} color={t.c.accent.mustard} />
            <Text variant="labelMicro" color={softInk(t)} style={{ flex: 1, fontFamily: t.type.caption.fontFamily }}>
              Not sent: phone numbers, messages, mails, photos
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}
