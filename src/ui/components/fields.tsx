import React, { useState } from 'react';
import { View } from 'react-native';
import type { FieldDef, FieldOption } from '@core/domain/types';
import { tintForModule } from '../theme/moduleTint';
import { Chip, DateField as KitDateField, Field, FilterChip, MoneyField, NumberField, PickerSheet, RelationField as KitRelationField, SelectField as KitSelectField, SwitchField, TagsField, TextField } from '../kit';
import { useLive, useOS, useSettings } from '../hooks';

/*
 * FieldDef-driven inputs: every entity form is built from these, and each
 * one is a kit field underneath, so forms follow docs/DESIGN.md.
 */

export interface FieldInputProps {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
  /** @deprecated forms are tinted by module now; kept for callers. */
  accent?: string;
  autoFocus?: boolean;
}

export function FieldInput(props: FieldInputProps) {
  const { field, value, onChange, error, autoFocus } = props;
  const common = { label: field.label, required: field.required, error };
  switch (field.type) {
    case 'number':
      return <NumberField {...common} value={value as number | undefined} onChange={onChange} autoFocus={autoFocus} placeholder={field.placeholder} />;
    case 'currency':
      return <CurrencyField {...props} />;
    case 'boolean':
      return <SwitchField label={field.label} value={!!value} onChange={onChange} />;
    case 'date':
    case 'datetime':
      return <DateField {...props} />;
    case 'select':
      return <KitSelectField {...common} options={toOptions(field.options)} value={value == null ? undefined : String(value)} onChange={onChange} onCreate={field.onCreateOption ? (label) => field.onCreateOption!(label)?.value ?? null : undefined} />;
    case 'multiselect':
      return <MultiSelectField {...props} />;
    case 'relation':
      return <RelationField {...props} />;
    case 'longtext':
    case 'json':
      return <TextField {...common} multiline value={value == null ? '' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)} onChange={onChange} placeholder={field.placeholder} autoFocus={autoFocus} />;
    default:
      return <TextField {...common} value={value == null ? '' : String(value)} onChange={onChange} placeholder={field.placeholder} autoFocus={autoFocus} />;
  }
}

const toOptions = (options: FieldOption[] | undefined) => (options ?? []).map((o) => ({ value: o.value, label: o.label }));

/** Symbol for a currency code in the user's locale (₹ for INR), or the code itself. */
export function currencySymbol(code: string, locale = 'en-IN'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}

function CurrencyField({ field, value, onChange, error, autoFocus }: FieldInputProps) {
  const locale = useSettings((s) => s.locale);
  return <MoneyField label={field.label} required={field.required} error={error} value={value as number | undefined} onChange={onChange} autoFocus={autoFocus} symbol={currencySymbol(locale.currency, locale.locale)} />;
}

/** Legacy signature ({ field, value, onChange }) kept for Reminders and filters. */
export function DateField({ field, value, onChange, error }: FieldInputProps) {
  return <KitDateField label={field.label} required={field.required} error={error} withTime={field.type === 'datetime'} value={value as string | number | undefined} onChange={onChange} />;
}

function MultiSelectField({ field, value, onChange, error }: FieldInputProps) {
  const [open, setOpen] = useState(false);
  const options = field.options ?? [];
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  if (options.length <= 8) {
    return (
      <Field label={field.label} required={field.required} error={error}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {options.map((o) => (
            <FilterChip key={o.value} label={o.label} selected={selected.includes(o.value)} onPress={() => toggle(o.value)} />
          ))}
        </View>
      </Field>
    );
  }
  return (
    <>
      <KitRelationField label={field.label} required={field.required} error={error} value={selected.map((v) => ({ id: v, title: options.find((o) => o.value === v)?.label ?? v }))} onOpen={() => setOpen(true)} onRemove={toggle} />
      <PickerSheet visible={open} onClose={() => setOpen(false)} title={field.label} items={options.map((o) => ({ id: o.value, title: o.label }))} selected={selected} onSelect={toggle} />
    </>
  );
}

/** Pick one or many records of the allowed type(s). */
export function RelationField({ field, value, onChange, error }: FieldInputProps) {
  const multi = Array.isArray(value) || Array.isArray(field.defaultValue);
  const ids: string[] = Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [];
  const refs = useLive((o) => o.records.getMany(ids), [ids.join(',')]);
  const os = useOS();
  const [open, setOpen] = useState(false);
  const types = Array.isArray(field.relationTo) ? field.relationTo : field.relationTo ? [field.relationTo] : [];
  const placeholder = `Choose ${types.map((x) => os.registry.objects.get(x)?.label.toLowerCase() ?? x).join(' / ') || 'record'}`;
  return (
    <>
      <KitRelationField
        label={field.label}
        required={field.required}
        error={error}
        placeholder={placeholder}
        value={refs.map((r) => ({ id: r.id, title: r.title }))}
        onOpen={() => setOpen(true)}
        onRemove={(id) => onChange(multi ? ids.filter((x) => x !== id) : undefined)}
      />
      <EntityPicker
        visible={open}
        onClose={() => setOpen(false)}
        types={types}
        selected={ids}
        title={field.label}
        onSelect={(id) => {
          if (multi) onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
          else {
            onChange(id);
            setOpen(false);
          }
        }}
      />
    </>
  );
}

/** Search records of the given types (all types when empty), with type chips. */
export function EntityPicker({ visible, onClose, types, selected = [], onSelect, title, exclude }: { visible: boolean; onClose: () => void; types: string[]; selected?: string[]; onSelect: (id: string, type: string) => void; multi?: boolean; title?: string; exclude?: string[] }) {
  const os = useOS();
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(types.length === 1 ? types[0]! : null);
  const allTypes = types.length ? types : [...os.registry.objects.values()].filter((d) => !d.hidden).map((d) => d.type);
  const results = useLive(
    (o) => {
      if (!visible) return [];
      const tys = typeFilter ? [typeFilter] : allTypes;
      if (q.trim()) return o.records.search.search(q, { types: tys, limit: 40 }).map((h) => ({ id: h.id, type: h.object, title: h.title, subtitle: h.subtitle }));
      return o.records.query(tys, { sort: [{ field: 'updatedAt', dir: 'desc' }] }, { limit: 40 }).map((e) => ({ id: e.id, type: e.object, title: e.title, subtitle: e.subtitle }));
    },
    [visible, q, typeFilter, allTypes.join(',')],
  ).filter((r) => !exclude?.includes(r.id));
  const typeOf = new Map(results.map((r) => [r.id, r.type]));
  return (
    <PickerSheet
      visible={visible}
      onClose={onClose}
      title={title ?? 'Link record'}
      onSearch={setQ}
      selected={selected}
      onSelect={(id) => onSelect(id, typeOf.get(id)!)}
      items={results.map((r) => {
        const d = os.registry.objects.get(r.type);
        return { id: r.id, title: r.title, subtitle: [d?.label, r.subtitle].filter(Boolean).join(' · '), icon: d?.icon };
      })}
      header={
        allTypes.length > 1 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <FilterChip label="All" selected={!typeFilter} onPress={() => setTypeFilter(null)} />
            {allTypes.map((ty) => {
              const d = os.registry.objects.get(ty);
              return d ? <FilterChip key={ty} label={d.labelPlural} selected={typeFilter === ty} onPress={() => setTypeFilter(ty)} /> : null;
            })}
          </View>
        ) : null
      }
    />
  );
}

/** Tag editor with suggestions from tags already in use. */
export function TagEditor({ tags, onChange, label }: { tags: string[]; onChange: (tags: string[]) => void; label?: string; accent?: string }) {
  const all = useLive((o) => o.tags.counts(), []);
  return <TagsField label={label} value={tags} onChange={onChange} suggestions={all.map((x) => x.name)} />;
}

/** Read-only tag chips in a module tint. */
export function TagChips({ tags, module, onPress }: { tags: string[]; module?: string; onPress?: (tag: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {tags.map((tag) => (
        <Chip key={tag} label={`#${tag}`} tint={module ? tintForModule(module) : undefined} onPress={onPress ? () => onPress(tag) : undefined} />
      ))}
    </View>
  );
}
