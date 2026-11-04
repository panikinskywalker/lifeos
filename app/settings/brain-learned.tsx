import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { format, isToday } from 'date-fns';
import { brains, exportBrain, HOUSE_RULES, type Learned, type LearnedKind, type Skill } from '@core/brain';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, ChipRow, FilterChip, Icon, IconButton, Screen, Sheet, Surface, Text, TextField, useToast } from '@ui/kit';
import { CapsLabel, Dot, Hairline, lilacInk, moduleInk, moduleWord, MoreLink, Pill, SlabInput, softInk } from '../../src/screens/brainParts';

type Tab = 'all' | LearnedKind;

const SECTIONS: Array<{ kind: LearnedKind; caps: string; meta: string; more: string; shown: number; tab: string }> = [
  { kind: 'answer', caps: 'Answers', meta: 'by the question asked', more: 'answers', shown: 5, tab: 'Answers' },
  { kind: 'fact', caps: 'Facts', meta: 'so the code need not ask again', more: 'facts', shown: 4, tab: 'Facts' },
  { kind: 'not-this', caps: 'Not this', meta: 'never brought back', more: '', shown: 3, tab: 'Not this' },
];

const valueWords = (l: Learned) => (Array.isArray(l.value) ? (l.value as string[]).join(' · ') : typeof l.value === 'string' ? l.value : JSON.stringify(l.value));

/**
 * What it has learned (docs/MODEL.md layer 8; NR-Brain-Learned): answers, facts
 * and Not this, each forgettable, then the Skills it works by, and all of it as
 * one Markdown file.
 */
export default function BrainLearnedRoute() {
  const router = useRouter();
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ at?: string }>();
  const scroll = useRef<ScrollView>(null);
  const jumped = useRef(params.at !== 'skills');
  const learned = useLive((o) => o.brain.learned.all({ limit: 5000 }), []);
  const skills = useLive((o) => o.brain.skills.all(), []);
  const turnedDown = useLive((o) => {
    const now = Date.now();
    return brains(o).filter((b) => {
      const a = o.brain.nudges.answers(b.module, now);
      return a.no >= 3 && a.no > a.yes;
    }).map((b) => ({ module: b.module, no: o.brain.nudges.answers(b.module, now).no }));
  }, []);
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [rules, setRules] = useState(false);
  const [adding, setAdding] = useState(false);

  const found = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? learned.filter((l) => `${valueWords(l)} ${moduleWord(os, l.module)}`.toLowerCase().includes(needle)) : learned;
  }, [learned, q, os]);
  const count = (kind: LearnedKind) => learned.filter((l) => l.kind === kind).length;
  const copy = async () => {
    await Clipboard.setStringAsync(exportBrain(os));
    toast.show({ message: 'Copied as Markdown', icon: 'check' });
  };

  return (
    <Screen
      title="What it has learned"
      subtitle="You · Agent · Brain"
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings/brain' as never))}
      right={<IconButton icon="file" filled accessibilityLabel="Copy as Markdown" onPress={() => void copy()} />}
      contentStyle={{ gap: 14 }}
      {...({ ref: scroll } as object)}
    >
      <Text variant="label" color={softInk(t)} style={{ fontFamily: t.type.body.fontFamily, lineHeight: 20, paddingHorizontal: 4 }}>
        Kept on this phone and in your backups, never in Claude. Each answer is kept so the same question never costs a call twice. Forget any of them.
      </Text>

      {learned.length ? (
        <>
          <SlabInput label="Search what it learned" value={q} onChange={setQ} placeholder="Search what it learned" height={48} radius={16} leading="search" autoCorrect={false} />
          <ChipRow>
            <FilterChip label={`All ${learned.length}`} selected={tab === 'all'} onPress={() => setTab('all')} />
            {SECTIONS.map((s) => (
              <FilterChip key={s.kind} label={`${s.tab} ${count(s.kind)}`} selected={tab === s.kind} onPress={() => setTab(s.kind)} />
            ))}
          </ChipRow>
        </>
      ) : (
        <View style={{ padding: 16, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile }}>
          <Text variant="label" color={softInk(t)} style={{ fontFamily: t.type.body.fontFamily, lineHeight: 20 }}>
            Nothing yet. Answers are kept here so the same question never costs a call twice.
          </Text>
        </View>
      )}

      {SECTIONS.filter((s) => tab === 'all' || tab === s.kind).map((s) => {
        const rows = found.filter((l) => l.kind === s.kind);
        if (!rows.length) return null;
        const shown = open[s.kind] ? rows : rows.slice(0, s.shown);
        const left = rows.length - shown.length;
        return (
          <View key={s.kind} style={{ gap: 14 }}>
            <CapsLabel label={`${s.caps} · ${rows.length}`} meta={s.meta} />
            <View style={{ paddingVertical: 6, paddingLeft: 16, paddingRight: 6, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile }}>
              {shown.map((l, i) => (
                <View key={l.key}>
                  {i ? <Hairline end={10} /> : null}
                  <LearnedRow l={l} onForget={() => os.brain.learned.forget(l.key)} />
                </View>
              ))}
              {left > 0 ? <MoreLink label={`${left} more${s.more ? ` ${s.more}` : ''}`} end={10} onPress={() => setOpen({ ...open, [s.kind]: true })} /> : null}
            </View>
          </View>
        );
      })}

      {turnedDown.map((d) => (
        <View key={d.module} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.c.bg.tile }}>
          <Icon name="chart" size={16} color={moduleInk(t, d.module)} />
          <Text variant="caption" color={softInk(t)} style={{ flex: 1, lineHeight: 18 }}>
            {`${moduleWord(os, d.module)} brings one nudge a day, not two: ${d.no} Not this for it in 14 days. Act on its nudges and it goes back to two.`}
          </Text>
        </View>
      ))}

      <View
        onLayout={(e) => {
          if (jumped.current) return;
          jumped.current = true;
          scroll.current?.scrollTo({ y: e.nativeEvent.layout.y, animated: false });
        }}
      >
        <CapsLabel label={`Skills · ${skills.length}`} meta="the rules it works by" top={18} />
      </View>

      <Pressable accessibilityRole="button" accessibilityState={{ expanded: rules }} onPress={() => setRules(!rules)} style={{ padding: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.c.bg.tile, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="rowTitle">House rules</Text>
            <Text variant="caption" color="secondary">
              How every pass is judged and worded · built in
            </Text>
          </View>
          <Icon name={rules ? 'chevron-up' : 'chevron-down'} size={18} color={t.c.fg.secondary} />
        </View>
        {rules ? (
          <Text variant="caption" color={softInk(t)} style={{ lineHeight: 18 }}>
            {HOUSE_RULES}
          </Text>
        ) : null}
      </Pressable>

      {skills.map((x) => (
        <SkillCard key={x.id} x={x} onRemove={() => os.brain.skills.remove(x.id)} />
      ))}

      <Surface kind="tile">
        <Button title="Add your own rule" icon="plus" variant="secondary" block style={{ height: 48 }} onPress={() => setAdding(true)} />
      </Surface>

      <View style={{ gap: 8, paddingTop: 10 }}>
        <Button title="Copy as Markdown" icon="file" block onPress={() => void copy()} />
        <Text variant="labelMicro" color="secondary" style={{ fontFamily: t.type.caption.fontFamily, textAlign: 'center' }}>
          House rules, Skills and everything above, as one file
        </Text>
      </View>

      <AddRule visible={adding} onClose={() => setAdding(false)} />
    </Screen>
  );
}

function LearnedRow({ l, onForget }: { l: Learned; onForget: () => void }) {
  const os = useOS();
  const v = valueWords(l);
  const day = isToday(l.updatedAt) ? 'today' : format(l.updatedAt, 'd MMM');
  const whose = l.kind === 'not-this' ? `Not this, ${day}` : l.source === 'claude' ? `from Claude, ${day}` : l.source === 'you' ? 'from your taps' : `from LifeOS, ${day}`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingVertical: 6 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text variant="tileTitle" style={{ lineHeight: 20 }} numberOfLines={4}>
          {v}
        </Text>
        <Text variant="labelMicro" color="secondary" numberOfLines={1} style={{ fontWeight: '400' }}>
          {`${moduleWord(os, l.module)} · ${whose}`}
        </Text>
      </View>
      <IconButton icon="x" accessibilityLabel={`Forget ${v}`} onPress={onForget} />
    </View>
  );
}

function SkillCard({ x, onRemove }: { x: Skill; onRemove: () => void }) {
  const os = useOS();
  const t = useTheme();
  const word = moduleWord(os, x.module);
  const title = x.source === 'code' || x.name === word ? x.name : `${word} · ${x.name}`;
  return (
    <View style={{ paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.c.bg.tile, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Dot color={moduleInk(t, x.module)} />
        <Text variant="tileTitle" style={{ flex: 1, lineHeight: 20 }} numberOfLines={1}>
          {title}
        </Text>
        {x.source === 'code' ? <Pill label="Built in" height={22} color={softInk(t)} fill={t.c.bg.dim} /> : x.source === 'claude' ? <Pill label="From Claude" icon="sparkle" height={22} color={lilacInk(t)} fill={`${lilacInk(t)}24`} /> : <Pill label="Yours" height={22} color={t.c.ok.sageText} fill={t.c.ok.sageFill} />}
        {x.source === 'you' ? <IconButton icon="x" accessibilityLabel={`Remove ${title}`} onPress={onRemove} style={{ marginVertical: -10, marginRight: -10 }} /> : null}
      </View>
      <Text variant="caption" color={softInk(t)} style={{ lineHeight: 18 }}>
        {x.body}
      </Text>
    </View>
  );
}

/** Your own rule: which module it is for, a short name, the rule. Claude reads it from the next pass. */
function AddRule({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const os = useOS();
  const toast = useToast();
  const all = useLive((o) => brains(o), []);
  const [module, setModule] = useState('upkeep');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const save = () => {
    os.brain.skills.put({ module, name: name.trim(), body: body.trim(), source: 'you' });
    setName('');
    setBody('');
    onClose();
    toast.show({ message: 'Rule kept: it counts from the next pass', icon: 'check' });
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Add your own rule" footer={<Button title="Keep this rule" block disabled={!name.trim() || !body.trim()} onPress={save} />}>
      <ChipRow>
        {all.map((b) => (
          <FilterChip key={b.module} label={moduleWord(os, b.module)} selected={module === b.module} onPress={() => setModule(b.module)} />
        ))}
      </ChipRow>
      <TextField label="Name" value={name} onChange={setName} placeholder="weekends" />
      <TextField label="The rule" value={body} onChange={setBody} placeholder="On Saturday and Sunday a dish can take an hour." multiline />
    </Sheet>
  );
}
