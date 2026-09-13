import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import type { FieldDef, FieldOption } from '@core/domain/types';
import { useTheme } from '../theme/ThemeProvider';
import { Chip, Icon, Input, Row, Text } from './primitives';
import { Sheet } from './Sheet';
import { useLive, useOS, useSettings } from '../hooks';

/* ------------------------------------------------------------------ */
/* Field editors driven by FieldDef — the whole app's forms come from  */
/* these, so every module gets consistent inputs for free.             */
/* ------------------------------------------------------------------ */

export interface FieldInputProps {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
  accent?: string;
  autoFocus?: boolean;
}

export function FieldInput(props: FieldInputProps) {
  const { field } = props;
  switch (field.type) {
    case 'text':
      return <TextField {...props} />;
    case 'longtext':
      return <TextField {...props} multiline />;
    case 'number':
    case 'currency':
      return <NumberField {...props} />;
    case 'boolean':
      return <BooleanField {...props} />;
    case 'date':
    case 'datetime':
      return <DateField {...props} />;
    case 'select':
      return <SelectField {...props} />;
    case 'multiselect':
      return <SelectField {...props} multi />;
    case 'relation':
      return <RelationField {...props} />;
    case 'json':
      return <TextField {...props} multiline mono />;
    default:
      return <TextField {...props} />;
  }
}

function FieldLabel({ field }: { field: FieldDef }) {
  return (
    <Text variant="footnote" color="secondary" style={{ marginBottom: 6 }}>
      {field.label}
      {field.required ? ' *' : ''}
    </Text>
  );
}

function TextField({ field, value, onChange, error, multiline, mono, autoFocus }: FieldInputProps & { multiline?: boolean; mono?: boolean }) {
  const str = value == null ? '' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  return (
    <View>
      <FieldLabel field={field} />
      <Input
        value={str}
        onChangeText={(t) => onChange(field.type === 'json' ? t : t)}
        placeholder={field.placeholder ?? field.label}
        multiline={multiline}
        autoFocus={autoFocus}
        error={error}
        style={[multiline && { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }, mono && { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 14 }]}
      />
    </View>
  );
}

function NumberField({ field, value, onChange, error, autoFocus }: FieldInputProps) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const locale = useSettings((s) => s.locale);
  React.useEffect(() => {
    if (value == null && text !== '') return;
    if (value != null && Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <View>
      <FieldLabel field={field} />
      <Input
        value={text}
        keyboardType="decimal-pad"
        autoFocus={autoFocus}
        placeholder={field.placeholder ?? (field.type === 'currency' ? '0.00' : '0')}
        onChangeText={(t) => {
          const clean = t.replace(/[^0-9.\-]/g, '');
          setText(clean);
          const n = parseFloat(clean);
          onChange(clean === '' || Number.isNaN(n) ? undefined : n);
        }}
        error={error}
        right={field.type === 'currency' ? <Text color="secondary">{locale.currency}</Text> : undefined}
        style={field.type === 'currency' ? { fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] } : undefined}
      />
    </View>
  );
}

function BooleanField({ field, value, onChange }: FieldInputProps) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: t.colors.fillSecondary, borderRadius: t.radius.sm, paddingHorizontal: 12, minHeight: 44 }}>
      <Text>{field.label}</Text>
      <Switch value={!!value} onValueChange={onChange} />
    </View>
  );
}

export function DateField({ field, value, onChange, error }: FieldInputProps) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const withTime = field.type === 'datetime';
  const date = useMemo(() => {
    if (value == null || value === '') return null;
    const d = typeof value === 'number' ? new Date(value) : new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d;
  }, [value]);
  const emit = (d: Date | null) => {
    if (!d) return onChange(undefined);
    onChange(withTime ? d.getTime() : format(d, 'yyyy-MM-dd'));
  };
  const label = date ? (withTime ? format(date, 'd MMM yyyy, h:mm a') : format(date, 'EEE, d MMM yyyy')) : 'Not set';
  const quick = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    if (!withTime) d.setHours(0, 0, 0, 0);
    emit(d);
  };
  return (
    <View>
      <FieldLabel field={field} />
      <Pressable onPress={() => setOpen(true)} style={{ backgroundColor: t.colors.fillSecondary, borderRadius: t.radius.sm, paddingHorizontal: 12, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="calendar" size={18} color={t.colors.tint} />
        <Text style={{ flex: 1 }} color={date ? undefined : 'tertiary'}>
          {label}
        </Text>
        {date ? (
          <Pressable onPress={() => emit(null)} hitSlop={8}>
            <Icon name="xmark.circle.fill" size={18} color={t.colors.textTertiary} />
          </Pressable>
        ) : null}
      </Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 8 }}>
        <Chip label="Today" onPress={() => quick(0)} />
        <Chip label="Tomorrow" onPress={() => quick(1)} />
        <Chip label="Next week" onPress={() => quick(7)} />
        <Chip label="Next month" onPress={() => quick(30)} />
      </ScrollView>
      {error ? (
        <Text variant="caption" color={t.colors.danger}>
          {error}
        </Text>
      ) : null}
      {Platform.OS === 'web' ? (
        <Sheet visible={open} onClose={() => setOpen(false)} title={field.label}>
          <View style={{ padding: 16 }}>
            <Input value={date ? format(date, withTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd') : ''} placeholder={withTime ? 'YYYY-MM-DDTHH:mm' : 'YYYY-MM-DD'} onChangeText={(s) => {
              const d = new Date(s);
              if (!Number.isNaN(d.getTime())) emit(d);
            }} />
          </View>
        </Sheet>
      ) : open ? (
        Platform.OS === 'ios' ? (
          <Sheet visible={open} onClose={() => setOpen(false)} title={field.label}>
            <View style={{ alignItems: 'center', paddingBottom: 16 }}>
              <DateTimePicker value={date ?? new Date()} mode={withTime ? 'datetime' : 'date'} display="inline" onChange={(_, d) => d && emit(d)} themeVariant={t.dark ? 'dark' : 'light'} />
            </View>
          </Sheet>
        ) : (
          <DateTimePicker
            value={date ?? new Date()}
            mode="date"
            onChange={(ev, d) => {
              setOpen(false);
              if (ev.type === 'set' && d) emit(d);
            }}
          />
        )
      ) : null}
    </View>
  );
}

export function SelectField({ field, value, onChange, multi, error }: FieldInputProps & { multi?: boolean }) {
  const t = useTheme();
  const options: FieldOption[] = field.options ?? [];
  const selected = multi ? ((value as string[]) ?? []) : value != null ? [String(value)] : [];
  const toggle = (v: string) => {
    if (multi) {
      onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    } else onChange(selected[0] === v ? undefined : v);
  };
  if (options.length <= 8) {
    return (
      <View>
        <FieldLabel field={field} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {options.map((o) => (
            <Chip key={o.value} label={o.label} selected={selected.includes(o.value)} onPress={() => toggle(o.value)} color={o.color} />
          ))}
        </View>
        {error ? (
          <Text variant="caption" color={t.colors.danger}>
            {error}
          </Text>
        ) : null}
      </View>
    );
  }
  return <PickerField field={field} options={options} selected={selected} onToggle={toggle} multi={multi} />;
}

function PickerField({ field, options, selected, onToggle, multi }: { field: FieldDef; options: FieldOption[]; selected: string[]; onToggle: (v: string) => void; multi?: boolean }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const label = selected.map((s) => options.find((o) => o.value === s)?.label ?? s).join(', ') || 'Choose…';
  const filtered = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <View>
      <FieldLabel field={field} />
      <Pressable onPress={() => setOpen(true)} style={{ backgroundColor: t.colors.fillSecondary, borderRadius: t.radius.sm, paddingHorizontal: 12, minHeight: 44, flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1 }} color={selected.length ? undefined : 'tertiary'} numberOfLines={1}>
          {label}
        </Text>
        <Icon name="chevron.down" size={16} color={t.colors.textTertiary} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={field.label}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Input value={q} onChangeText={setQ} placeholder="Search" autoFocus />
        </View>
        <View style={{ marginHorizontal: 16, backgroundColor: t.colors.card, borderRadius: t.radius.md, overflow: 'hidden' }}>
          {filtered.map((o, i) => (
            <Row
              key={o.value}
              title={o.label}
              last={i === filtered.length - 1}
              chevron={false}
              onPress={() => {
                onToggle(o.value);
                if (!multi) setOpen(false);
              }}
              right={selected.includes(o.value) ? <Icon name="checkmark" size={18} color={t.colors.tint} /> : null}
            />
          ))}
        </View>
      </Sheet>
    </View>
  );
}

/** Pick one or many entities of the allowed type(s). */
export function RelationField({ field, value, onChange, accent }: FieldInputProps) {
  const t = useTheme();
  const os = useOS();
  const multi = field.relationTo && Array.isArray(value);
  const ids: string[] = Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [];
  const refs = useLive((o) => o.entities.getMany(ids), [ids.join(',')]);
  const [open, setOpen] = useState(false);
  const types = Array.isArray(field.relationTo) ? field.relationTo : field.relationTo ? [field.relationTo] : [];
  return (
    <View>
      <FieldLabel field={field} />
      <Pressable onPress={() => setOpen(true)} style={{ backgroundColor: t.colors.fillSecondary, borderRadius: t.radius.sm, paddingHorizontal: 12, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="link" size={16} color={accent ?? t.colors.tint} />
        <Text style={{ flex: 1 }} color={refs.length ? undefined : 'tertiary'} numberOfLines={1}>
          {refs.length ? refs.map((r) => r.title).join(', ') : `Choose ${types.map((x) => os.registry.entityTypes.get(x)?.label.toLowerCase() ?? x).join(' / ')}`}
        </Text>
        {ids.length ? (
          <Pressable onPress={() => onChange(multi ? [] : undefined)} hitSlop={8}>
            <Icon name="xmark.circle.fill" size={18} color={t.colors.textTertiary} />
          </Pressable>
        ) : (
          <Icon name="chevron.down" size={16} color={t.colors.textTertiary} />
        )}
      </Pressable>
      <EntityPicker
        visible={open}
        onClose={() => setOpen(false)}
        types={types}
        selected={ids}
        multi={!!multi}
        onSelect={(id) => {
          if (multi) onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
          else {
            onChange(id);
            setOpen(false);
          }
        }}
      />
    </View>
  );
}

export function EntityPicker({ visible, onClose, types, selected = [], onSelect, multi, title, exclude }: { visible: boolean; onClose: () => void; types: string[]; selected?: string[]; onSelect: (id: string, type: string) => void; multi?: boolean; title?: string; exclude?: string[] }) {
  const t = useTheme();
  const os = useOS();
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(types.length === 1 ? types[0] : null);
  const allTypes = types.length ? types : [...os.registry.entityTypes.keys()];
  const results = useLive(
    (o) => {
      const tys = typeFilter ? [typeFilter] : allTypes;
      if (q.trim()) return o.entities.search.search(q, { types: tys, limit: 40 }).map((h) => ({ id: h.id, type: h.type, title: h.title, subtitle: h.subtitle }));
      return o.entities.query(tys, { sort: [{ field: 'updatedAt', dir: 'desc' }] }, { limit: 40 }).map((e) => ({ id: e.id, type: e.type, title: e.title, subtitle: e.subtitle }));
    },
    [q, typeFilter, allTypes.join(',')],
  ).filter((r) => !exclude?.includes(r.id));
  return (
    <Sheet visible={visible} onClose={onClose} title={title ?? 'Link record'} full>
      <View style={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }}>
        <Input value={q} onChangeText={setQ} placeholder="Search records" autoFocus />
        {allTypes.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <Chip label="All" selected={!typeFilter} onPress={() => setTypeFilter(null)} />
            {allTypes.map((ty) => {
              const d = os.registry.entityTypes.get(ty);
              return d ? <Chip key={ty} label={d.labelPlural} selected={typeFilter === ty} onPress={() => setTypeFilter(ty)} color={os.registry.colorFor(ty)} /> : null;
            })}
          </ScrollView>
        ) : null}
      </View>
      <View style={{ marginHorizontal: 16, backgroundColor: t.colors.card, borderRadius: t.radius.md, overflow: 'hidden' }}>
        {results.length === 0 ? (
          <Text color="secondary" style={{ padding: 16, textAlign: 'center' }}>
            Nothing found
          </Text>
        ) : null}
        {results.map((r, i) => {
          const d = os.registry.entityTypes.get(r.type);
          return (
            <Row
              key={r.id}
              title={r.title}
              subtitle={r.subtitle ?? d?.label}
              icon={d?.icon}
              iconColor={os.registry.colorFor(r.type)}
              last={i === results.length - 1}
              chevron={false}
              onPress={() => onSelect(r.id, r.type)}
              right={selected.includes(r.id) ? <Icon name="checkmark" size={18} color={t.colors.tint} /> : null}
            />
          );
        })}
      </View>
    </Sheet>
  );
}

/** Tag editor: chips + add. */
export function TagEditor({ tags, onChange, accent }: { tags: string[]; onChange: (tags: string[]) => void; accent?: string }) {
  const t = useTheme();
  const [text, setText] = useState('');
  const all = useLive((o) => o.tags.counts(), []);
  const suggestions = all.filter((x) => !tags.includes(x.name) && (!text || x.name.toLowerCase().includes(text.toLowerCase()))).slice(0, 8);
  const add = (n: string) => {
    const v = n.trim().replace(/^#/, '');
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setText('');
  };
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {tags.map((tag) => (
          <Chip key={tag} label={`#${tag}`} selected color={accent} onPress={() => onChange(tags.filter((x) => x !== tag))} />
        ))}
      </View>
      <Input value={text} onChangeText={setText} placeholder="Add tag" onSubmitEditing={() => add(text)} blurOnSubmit={false} returnKeyType="done" right={text ? <Pressable onPress={() => add(text)}><Icon name="plus.circle.fill" size={22} color={t.colors.tint} /></Pressable> : undefined} />
      {suggestions.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {suggestions.map((s) => (
            <Chip key={s.id} label={`#${s.name}`} onPress={() => add(s.name)} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
