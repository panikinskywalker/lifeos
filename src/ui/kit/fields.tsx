import React, { useMemo, useState } from 'react';
import { Platform, Pressable, TextInput, View, type TextInputProps, type TextStyle } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import { Chip, FilterChip } from './Chip';
import type { IconBoxTone } from './IconBox';
import { RowItem, RowList } from './RowItem';
import { Surface, useControlFill } from './Surface';
import { Sheet } from './Sheet';
import { parseNumberInput } from './parse';
import { Text } from './Text';

/*
 * Presentational form fields: value in, onChange out, no knowledge of
 * entity types. Field-driven forms compose these.
 */

/** Label · control · hint or error. */
export function FormField({ label, required, hint, error, children }: { label?: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {label ? (
        <Text variant="label" color="secondary">
          {label}
          {required ? <Text variant="label" color={t.c.alert.coralText}> *</Text> : null}
        </Text>
      ) : null}
      {children}
      {error ? (
        <Text variant="caption" color={t.c.alert.coralText} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Canvas input: 52 high, radius 14, the control fill, no border; coral border only on error. */
function useInputBox(_focused: boolean, error?: string) {
  const t = useTheme();
  const fill = useControlFill();
  return {
    minHeight: 52,
    borderRadius: t.radius.input,
    backgroundColor: fill,
    borderWidth: 1.5,
    borderColor: error ? t.c.alert.coral : 'transparent',
    paddingHorizontal: 16,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  };
}

type BaseInput = Omit<TextInputProps, 'value' | 'onChange' | 'onChangeText' | 'style'> & { label?: string; required?: boolean; hint?: string; error?: string };

export function TextField({ label, required, hint, error, value, onChange, multiline, leading, compact, ...rest }: BaseInput & { value: string; onChange: (v: string) => void; leading?: IconName; /** Multiline that starts one line tall and grows (a note composer). */ compact?: boolean }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      <View style={[useInputBox(focused, error), multiline && { alignItems: compact ? 'center' : 'flex-start', paddingVertical: compact ? 14 : 12 }]}>
        {leading ? <Icon name={leading} size={18} color={t.c.fg.secondary} /> : null}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={t.c.fg.tertiary}
          selectionColor={t.c.accent.mustard}
          cursorColor={t.c.fg.primary}
          {...rest}
          multiline={multiline}
          value={value}
          onChangeText={onChange}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[t.type.body as TextStyle, { flex: 1, color: t.c.fg.primary, paddingVertical: multiline ? 0 : 12, minHeight: multiline ? (compact ? 22 : 96) : undefined, maxHeight: compact ? 140 : undefined, textAlignVertical: multiline ? 'top' : 'center' }]}
        />
      </View>
    </FormField>
  );
}

export function NumberField({ label, required, hint, error, value, onChange, unit, ...rest }: BaseInput & { value: number | undefined; onChange: (v: number | undefined) => void; unit?: string }) {
  const t = useTheme();
  const [text, setText] = useState(value == null ? '' : String(value));
  const [focused, setFocused] = useState(false);
  const box = useInputBox(focused, error);
  React.useEffect(() => {
    if (parseNumberInput(text) !== value) setText(value == null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[box, { flex: 1 }]}>
          <TextInput
            accessibilityLabel={label}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={t.c.fg.tertiary}
            selectionColor={t.c.accent.mustard}
            {...rest}
            value={text}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChangeText={(s) => {
              setText(s);
              onChange(parseNumberInput(s));
            }}
            style={[t.type.body as TextStyle, { flex: 1, color: t.c.fg.primary, paddingVertical: 12, fontVariant: ['tabular-nums'] }]}
          />
        </View>
        {unit ? (
          <Text variant="tileTitle" color="secondary">
            {unit}
          </Text>
        ) : null}
      </View>
    </FormField>
  );
}

/** Amount with the currency symbol after it, as the canvas's "Cost ₹". */
export function MoneyField({ symbol = '₹', ...props }: BaseInput & { value: number | undefined; onChange: (v: number | undefined) => void; symbol?: string }) {
  return <NumberField {...props} unit={symbol} />;
}

function PressField({ label, required, hint, error, icon, text, placeholder, onPress, onClear }: { label?: string; required?: boolean; hint?: string; error?: string; icon?: IconName; text?: string | null; placeholder: string; onPress: () => void; onClear?: () => void }) {
  const t = useTheme();
  const box = useInputBox(false, error);
  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      <View style={[box, { paddingHorizontal: 0, gap: 0 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={label ? `${label}: ${text || placeholder}` : text || placeholder} onPress={onPress} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', paddingLeft: 14 }}>
          {icon ? <Icon name={icon} size={18} color={t.c.fg.secondary} /> : null}
          <Text variant="body" color={text ? 'primary' : 'tertiary'} style={{ flex: 1 }} numberOfLines={1}>
            {text || placeholder}
          </Text>
          {!(text && onClear) ? <Icon name="chevron-down" size={18} color={t.c.fg.tertiary} style={{ marginRight: 14 }} /> : null}
        </Pressable>
        {text && onClear ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label ?? ''}`} onPress={onClear} style={{ width: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x-circle" size={18} color={t.c.fg.tertiary} />
          </Pressable>
        ) : null}
      </View>
    </FormField>
  );
}

/** ISO date (yyyy-MM-dd) or epoch ms when `withTime`. Quick chips for today / tomorrow / next week. */
export function DateField({ label, required, hint, error, value, onChange, withTime, quick = true }: { label?: string; required?: boolean; hint?: string; error?: string; value: string | number | undefined; onChange: (v: string | number | undefined) => void; withTime?: boolean; quick?: boolean }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const date = useMemo(() => {
    if (value == null || value === '') return null;
    // A bare yyyy-MM-dd is a local date, not UTC midnight.
    const d = typeof value === 'number' ? new Date(value) : new Date(value.length === 10 ? `${value}T00:00:00` : value);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [value]);
  const emit = (d: Date | null) => onChange(d ? (withTime ? d.getTime() : format(d, 'yyyy-MM-dd')) : undefined);
  const shift = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    emit(d);
  };
  return (
    <View style={{ gap: 8 }}>
      <PressField label={label} required={required} hint={hint} error={error} icon="calendar" text={date ? format(date, withTime ? 'EEE d MMM yyyy, HH:mm' : 'EEE d MMM yyyy') : null} placeholder="Not set" onPress={() => setOpen(true)} onClear={() => emit(null)} />
      {quick ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Chip label="Today" onPress={() => shift(0)} />
          <Chip label="Tomorrow" onPress={() => shift(1)} />
          <Chip label="Next week" onPress={() => shift(7)} />
        </View>
      ) : null}
      {open && Platform.OS === 'web' ? (
        <Sheet visible onClose={() => setOpen(false)} title={label}>
          <TextField value={date ? format(date, withTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd') : ''} placeholder={withTime ? 'YYYY-MM-DDTHH:mm' : 'YYYY-MM-DD'} onChange={(s) => {
            const d = new Date(s);
            if (!Number.isNaN(d.getTime())) emit(d);
          }} />
        </Sheet>
      ) : open ? (
        <DateTimePicker
          value={date ?? new Date()}
          mode="date"
          themeVariant={t.dark ? 'dark' : 'light'}
          accentColor={t.c.accent.mustard}
          onChange={(ev, d) => {
            setOpen(false);
            if (ev.type === 'set' && d) emit(d);
          }}
        />
      ) : null}
    </View>
  );
}

export interface Option {
  value: string;
  label: string;
  icon?: IconName;
}

/** Up to 6 options as chips inline; more open a searchable sheet. */
export function SelectField({ label, required, hint, error, options, value, onChange, onCreate }: { label?: string; required?: boolean; hint?: string; error?: string; options: Option[]; value: string | undefined; onChange: (v: string | undefined) => void; /** Offer "Add “…”" for what was typed; returns the new option's value. */ onCreate?: (label: string) => string | null }) {
  const [open, setOpen] = useState(false);
  if (options.length <= 6 && !onCreate) {
    return (
      <FormField label={label} required={required} hint={hint} error={error}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {options.map((o) => (
            <FilterChip key={o.value} label={o.label} icon={o.icon} selected={value === o.value} onPress={() => onChange(value === o.value ? undefined : o.value)} />
          ))}
        </View>
      </FormField>
    );
  }
  return (
    <>
      <PressField label={label} required={required} hint={hint} error={error} text={options.find((o) => o.value === value)?.label} placeholder="Choose" onPress={() => setOpen(true)} onClear={() => onChange(undefined)} />
      <PickerSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        items={options.map((o) => ({ id: o.value, title: o.label, icon: o.icon }))}
        selected={value ? [value] : []}
        onSelect={(id) => {
          onChange(id);
          setOpen(false);
        }}
        onCreate={
          onCreate
            ? (q) => {
                const v = onCreate(q);
                if (v) onChange(v);
                setOpen(false);
              }
            : undefined
        }
      />
    </>
  );
}

export interface PickerItem {
  id: string;
  title: string;
  subtitle?: string | null;
  icon?: IconName | (string & {});
}

/**
 * Searchable list in a sheet. Filters `items` locally unless `onSearch` is
 * given, in which case the caller supplies results for the query.
 */
export function PickerSheet({ visible, onClose, title, items, selected = [], onSelect, onSearch, header, onCreate }: { visible: boolean; onClose: () => void; title?: string; items: PickerItem[]; selected?: string[]; onSelect: (id: string) => void; onSearch?: (q: string) => void; header?: React.ReactNode; /** Show "Add “…”" for a typed name that isn't in the list. */ onCreate?: (q: string) => void }) {
  const t = useTheme();
  const [q, setQ] = useState('');
  const shown = onSearch || !q ? items : items.filter((i) => i.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <Sheet visible={visible} onClose={onClose} title={title} full>
      <TextField
        value={q}
        leading="search"
        placeholder="Search"
        autoFocus
        onChange={(s) => {
          setQ(s);
          onSearch?.(s);
        }}
      />
      {header}
      {onCreate && q.trim() && !items.some((i) => i.title.toLowerCase() === q.trim().toLowerCase()) ? (
        <RowItem icon="plus" title={`Add “${q.trim()}”`} subtitle="A new one — you can change its colour and icon later" chevron={false} onPress={() => {
          onCreate(q.trim());
          setQ('');
        }} />
      ) : onCreate && !q.trim() ? (
        <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>
          Not in the list? Type a name to add it.
        </Text>
      ) : null}
      <RowList>
        {shown.length === 0 && !onCreate ? (
          <Text variant="body" color="secondary" style={{ padding: 16, textAlign: 'center' }}>
            Nothing found
          </Text>
        ) : null}
        {shown.map((item) => (
          <RowItem
            key={item.id}
            title={item.title}
            subtitle={item.subtitle}
            icon={item.icon}
            chevron={false}
            onPress={() => onSelect(item.id)}
            trailing={selected.includes(item.id) ? <Icon name="check" size={20} color={t.c.fg.primary} /> : null}
          />
        ))}
      </RowList>
    </Sheet>
  );
}

/** Linked records as removable chips; "Choose" asks the caller to open a picker. */
export function RelationField({ label, required, hint, error, value, onOpen, onRemove, placeholder = 'Choose' }: { label?: string; required?: boolean; hint?: string; error?: string; value: Array<{ id: string; title: string }>; onOpen: () => void; onRemove: (id: string) => void; placeholder?: string }) {
  const t = useTheme();
  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      <View style={[useInputBox(false, error), { flexWrap: 'wrap', paddingVertical: 10, paddingRight: 6 }]}>
        <Icon name="link" size={18} color={t.c.fg.secondary} />
        {value.map((v) => (
          <Chip key={v.id} label={v.title} icon="x" onPress={() => onRemove(v.id)} />
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel={label ? `Choose ${label}` : placeholder} onPress={onOpen} style={{ flexGrow: 1, minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: value.length ? 'flex-end' : 'space-between', gap: 6 }}>
          {value.length ? null : (
            <Text variant="body" color="tertiary">
              {placeholder}
            </Text>
          )}
          <Icon name="plus" size={18} color={t.c.fg.secondary} style={{ marginRight: 8 }} />
        </Pressable>
      </View>
    </FormField>
  );
}

/** Tags as removable chips plus an input; `suggestions` appear as chips under it. */
export function TagsField({ label, value, onChange, suggestions = [] }: { label?: string; value: string[]; onChange: (tags: string[]) => void; suggestions?: string[] }) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const v = raw.trim().replace(/^#/, '');
    if (v && !value.includes(v)) onChange([...value, v]);
    setText('');
  };
  const pool = suggestions.filter((s) => !value.includes(s) && (!text || s.toLowerCase().includes(text.toLowerCase()))).slice(0, 8);
  return (
    <FormField label={label}>
      {value.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {value.map((tag) => (
            <Chip key={tag} label={`#${tag}`} icon="x" onPress={() => onChange(value.filter((x) => x !== tag))} />
          ))}
        </View>
      ) : null}
      <TextField value={text} onChange={setText} leading="tag" placeholder="Add a tag" returnKeyType="done" submitBehavior="submit" onSubmitEditing={() => add(text)} />
      {pool.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {pool.map((s) => (
            <Chip key={s} label={`#${s}`} icon="plus" onPress={() => add(s)} />
          ))}
        </View>
      ) : null}
    </FormField>
  );
}

/** Canvas toggle: 50×30 pill, mustard with an ink thumb when on; track with a white thumb when off. */
export function Toggle({ value, onChange, accessibilityLabel }: { value: boolean; onChange: (v: boolean) => void; accessibilityLabel: string }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked: value }} aria-checked={value} hitSlop={9} onPress={() => onChange(!value)} style={{ width: 50, height: 30, borderRadius: 15, padding: 3, backgroundColor: value ? t.c.accent.mustard : t.c.line, alignItems: value ? 'flex-end' : 'flex-start', justifyContent: 'center' }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: value ? t.c.accent.mustardInk : t.c.bg.pill }} />
    </Pressable>
  );
}

/** A setting as a row card: icon-box · label / hint · toggle (canvas "Remind me", "Quiet hours"). */
export function SwitchField({ label, hint, value, onChange, icon, iconTone = 'plain' }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; icon?: IconName; iconTone?: IconBoxTone }) {
  return <RowItem title={label} subtitle={hint} icon={icon} iconTone={icon ? iconTone : undefined} chevron={false} onPress={() => onChange(!value)} trailing={<Toggle value={value} onChange={onChange} accessibilityLabel={label} />} />;
}

/** Canvas stepper: − value + in the control fill, 40px nested buttons, 24/800 value, unit beside. */
export function Stepper({ label, value, onChange, min = 1, max = 999, step = 1, unit }: { label?: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string }) {
  const t = useTheme();
  const fill = useControlFill();
  const btn = (icon: 'minus' | 'plus', next: number, a11y: string, disabled: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} disabled={disabled} hitSlop={4} onPress={() => onChange(next)} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: t.radius.iconBox, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={20} color={t.c.fg.primary} />
    </Pressable>
  );
  return (
    <FormField label={label}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: t.radius.input, backgroundColor: fill }}>
          <Surface kind="tile">
            {btn('minus', Math.max(min, value - step), 'Fewer', value <= min)}
            <Text variant="stat" accessibilityLiveRegion="polite" style={{ width: 56, textAlign: 'center', fontSize: 24, lineHeight: 28 }}>
              {value}
            </Text>
            {btn('plus', Math.min(max, value + step), 'More', value >= max)}
          </Surface>
        </View>
        {unit ? (
          <Text variant="tileTitle" color="secondary">
            {unit}
          </Text>
        ) : null}
      </View>
    </FormField>
  );
}

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

/** Canvas day chips: seven 40-high pills, one selected in mustard. Value is 0 (Mon) … 6 (Sun), or null. */
export function DayChips({ label, value, onChange }: { label?: string; value: number | null; onChange: (v: number | null) => void }) {
  const t = useTheme();
  const fill = useControlFill();
  return (
    <FormField label={label}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {DAYS.map((d, i) => {
          const sel = value === i;
          return (
            <Pressable key={d} accessibilityRole="button" accessibilityLabel={d} accessibilityState={{ selected: sel }} aria-selected={sel} onPress={() => onChange(sel ? null : i)} style={{ flex: 1, height: 40, borderRadius: t.radius.chip, backgroundColor: sel ? t.c.accent.mustard : fill, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="label" color={sel ? t.c.accent.mustardInk : undefined}>
                {d}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </FormField>
  );
}

