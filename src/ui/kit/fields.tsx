import React, { useMemo, useState } from 'react';
import { Platform, Pressable, Switch, TextInput, View, type TextInputProps, type TextStyle } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import { Chip, FilterChip } from './Chip';
import { RowItem } from './RowItem';
import { Sheet } from './Sheet';
import { parseNumberInput } from './parse';
import { Text } from './Text';

/*
 * Presentational form fields: value in, onChange out, no knowledge of
 * entity types. FieldDef-driven forms compose these.
 */

/** Label · control · hint or error. */
export function Field({ label, required, hint, error, children }: { label?: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
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

function useInputBox(focused: boolean, error?: string) {
  const t = useTheme();
  return {
    minHeight: 52,
    borderRadius: t.radius.input,
    backgroundColor: t.c.bg.tileRaised,
    borderWidth: 1.5,
    borderColor: error ? t.c.alert.coral : focused ? t.c.fg.primary : t.c.line,
    paddingHorizontal: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  };
}

type BaseInput = Omit<TextInputProps, 'value' | 'onChange' | 'onChangeText' | 'style'> & { label?: string; required?: boolean; hint?: string; error?: string };

export function TextField({ label, required, hint, error, value, onChange, multiline, leading, ...rest }: BaseInput & { value: string; onChange: (v: string) => void; leading?: IconName }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Field label={label} required={required} hint={hint} error={error}>
      <View style={[useInputBox(focused, error), multiline && { alignItems: 'flex-start', paddingVertical: 12 }]}>
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
          style={[t.type.body as TextStyle, { flex: 1, color: t.c.fg.primary, paddingVertical: multiline ? 0 : 12, minHeight: multiline ? 96 : undefined, textAlignVertical: multiline ? 'top' : 'center' }]}
        />
      </View>
    </Field>
  );
}

export function NumberField({ label, required, hint, error, value, onChange, unit, ...rest }: BaseInput & { value: number | undefined; onChange: (v: number | undefined) => void; unit?: string }) {
  const t = useTheme();
  const [text, setText] = useState(value == null ? '' : String(value));
  const [focused, setFocused] = useState(false);
  React.useEffect(() => {
    if (parseNumberInput(text) !== value) setText(value == null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Field label={label} required={required} hint={hint} error={error}>
      <View style={useInputBox(focused, error)}>
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
        {unit ? (
          <Text variant="label" color="secondary">
            {unit}
          </Text>
        ) : null}
      </View>
    </Field>
  );
}

/** Amount with the currency symbol in front, in the stat face. */
export function MoneyField({ label, required, hint, error, value, onChange, symbol = '₹', ...rest }: BaseInput & { value: number | undefined; onChange: (v: number | undefined) => void; symbol?: string }) {
  const t = useTheme();
  const [text, setText] = useState(value == null ? '' : String(value));
  const [focused, setFocused] = useState(false);
  React.useEffect(() => {
    if (parseNumberInput(text) !== value) setText(value == null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Field label={label} required={required} hint={hint} error={error}>
      <View style={[useInputBox(focused, error), { minHeight: 64 }]}>
        <Text variant="stat" color="secondary">
          {symbol}
        </Text>
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
          style={[t.type.stat as TextStyle, { flex: 1, color: t.c.fg.primary, paddingVertical: 10 }]}
        />
      </View>
    </Field>
  );
}

function PressField({ label, required, hint, error, icon, text, placeholder, onPress, onClear }: { label?: string; required?: boolean; hint?: string; error?: string; icon?: IconName; text?: string | null; placeholder: string; onPress: () => void; onClear?: () => void }) {
  const t = useTheme();
  const box = useInputBox(false, error);
  return (
    <Field label={label} required={required} hint={hint} error={error}>
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
    </Field>
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
export function SelectField({ label, required, hint, error, options, value, onChange }: { label?: string; required?: boolean; hint?: string; error?: string; options: Option[]; value: string | undefined; onChange: (v: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  if (options.length <= 6) {
    return (
      <Field label={label} required={required} hint={hint} error={error}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {options.map((o) => (
            <FilterChip key={o.value} label={o.label} icon={o.icon} selected={value === o.value} onPress={() => onChange(value === o.value ? undefined : o.value)} />
          ))}
        </View>
      </Field>
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
export function PickerSheet({ visible, onClose, title, items, selected = [], onSelect, onSearch, header }: { visible: boolean; onClose: () => void; title?: string; items: PickerItem[]; selected?: string[]; onSelect: (id: string) => void; onSearch?: (q: string) => void; header?: React.ReactNode }) {
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
      <View style={{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.card, overflow: 'hidden' }}>
        {shown.length === 0 ? (
          <Text variant="body" color="secondary" style={{ padding: 16, textAlign: 'center' }}>
            Nothing found
          </Text>
        ) : null}
        {shown.map((item, i) => (
          <RowItem
            key={item.id}
            title={item.title}
            subtitle={item.subtitle}
            icon={item.icon}
            divider={i < shown.length - 1}
            chevron={false}
            onPress={() => onSelect(item.id)}
            trailing={selected.includes(item.id) ? <Icon name="check" size={20} color={t.c.fg.primary} /> : null}
          />
        ))}
      </View>
    </Sheet>
  );
}

/** Linked records as removable chips; "Choose" asks the caller to open a picker. */
export function RelationField({ label, required, hint, error, value, onOpen, onRemove, placeholder = 'Choose' }: { label?: string; required?: boolean; hint?: string; error?: string; value: Array<{ id: string; title: string }>; onOpen: () => void; onRemove: (id: string) => void; placeholder?: string }) {
  const t = useTheme();
  return (
    <Field label={label} required={required} hint={hint} error={error}>
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
    </Field>
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
    <Field label={label}>
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
    </Field>
  );
}

/** On/off row. */
export function SwitchField({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} onPress={() => onChange(!value)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text variant="body">{label}</Text>
        {hint ? (
          <Text variant="caption" color="secondary">
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: t.c.line, true: t.c.accent.mustard }} thumbColor={t.c.bg.tileRaised} ios_backgroundColor={t.c.line} {...({ activeThumbColor: t.c.bg.tileRaised } as object)} />
    </Pressable>
  );
}
