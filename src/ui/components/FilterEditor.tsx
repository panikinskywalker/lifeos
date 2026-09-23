import React, { useState } from 'react';
import { View } from 'react-native';
import type { EntityTypeDef, FieldDef, FilterClause, FilterGroup, FilterOp, ViewDefinition } from '@core/domain/types';
import { useTheme } from '../theme/ThemeProvider';
import { Button, ChipRow, FilterChip, IconButton, Text } from '../kit';
import { FieldInput } from './fields';
import { useLive, useOS } from '../hooks';

/**
 * Builds a ViewDefinition (filter AND-list + sort + group + layout) for a
 * type. Kept deliberately flat (AND of clauses) — the DSL supports nesting,
 * the UI exposes what a phone can handle.
 */
const OPS_FOR: Record<string, Array<{ op: FilterOp; label: string }>> = {
  text: [{ op: 'contains', label: 'contains' }, { op: 'eq', label: 'is' }, { op: 'isNull', label: 'is empty' }, { op: 'notNull', label: 'is set' }],
  number: [{ op: 'gt', label: '>' }, { op: 'gte', label: '≥' }, { op: 'lt', label: '<' }, { op: 'lte', label: '≤' }, { op: 'eq', label: '=' }],
  date: [{ op: 'gte', label: 'on/after' }, { op: 'lte', label: 'on/before' }, { op: 'isNull', label: 'is empty' }],
  select: [{ op: 'eq', label: 'is' }, { op: 'neq', label: 'is not' }, { op: 'isNull', label: 'is empty' }],
  boolean: [{ op: 'eq', label: 'is' }],
  relation: [{ op: 'eq', label: 'is' }, { op: 'isNull', label: 'is empty' }, { op: 'notNull', label: 'is set' }],
};
function opsFor(f: FieldDef) {
  const k = f.type === 'currency' ? 'number' : f.type === 'datetime' ? 'date' : f.type === 'longtext' ? 'text' : f.type === 'multiselect' ? 'select' : f.type;
  return OPS_FOR[k] ?? OPS_FOR.text;
}

export function filterableFields(def: EntityTypeDef): FieldDef[] {
  const envelope: FieldDef[] = [{ key: 'title', label: 'Title', type: 'text' }];
  if (def.statuses?.length) envelope.push({ key: 'status', label: 'Status', type: 'select', options: def.statuses });
  envelope.push({ key: 'starred', label: 'Starred', type: 'boolean' }, { key: 'createdAt', label: 'Created', type: 'datetime' }, { key: 'tag', label: 'Tag', type: 'text' });
  return [...envelope, ...def.fields.filter((f) => f.type !== 'json').map((f) => ({ ...f, key: `data.${f.key}` }))];
}

export function FilterEditor({ type, value, onChange }: { type: string; value: ViewDefinition; onChange: (v: ViewDefinition) => void; accent?: string }) {
  const os = useOS();
  const t = useTheme();
  const def = os.registry.type(type);
  const fields = filterableFields(def);
  const clauses = (value.filter?.and ?? []).filter((c): c is FilterClause => !('and' in c || 'or' in c));
  const [adding, setAdding] = useState(false);
  const setClauses = (cs: FilterClause[]) => onChange({ ...value, filter: cs.length ? { and: cs } : undefined });
  const sortFields = fields.filter((f) => f.key !== 'tag' && f.type !== 'boolean');
  const groupFields: Array<{ key: string; label: string }> = [{ key: '', label: 'None' }, ...(def.statuses?.length ? [{ key: 'status', label: 'Status' }] : []), { key: 'month', label: 'Month' }, { key: 'day', label: 'Day' }, ...def.fields.filter((f) => f.type === 'select' || f.type === 'relation').map((f) => ({ key: `data.${f.key}`, label: f.label }))];
  const tags = useLive((o) => o.tags.counts(), []);
  const card = { backgroundColor: t.c.bg.tile, borderRadius: t.radius.card, padding: 12, gap: 10 };

  return (
    <View style={{ gap: 24 }}>
      <View style={{ gap: 10 }}>
        <Text variant="label" color="secondary">
          Conditions
        </Text>
        {clauses.map((c, i) => {
          const f = fields.find((x) => x.key === c.field) ?? (c.op === 'hasTag' ? fields.find((x) => x.key === 'tag') : undefined);
          if (!f) return null;
          const ops = f.key === 'tag' ? [{ op: 'hasTag' as FilterOp, label: 'has' }] : opsFor(f);
          const needsValue = !['isNull', 'notNull'].includes(c.op);
          return (
            <View key={i} style={card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="body" style={{ flex: 1 }}>
                  {f.label}
                </Text>
                <IconButton icon="trash" accessibilityLabel={`Remove ${f.label} condition`} color={t.c.alert.coralText} onPress={() => setClauses(clauses.filter((_, j) => j !== i))} />
              </View>
              <ChipRow style={{ marginHorizontal: -12 }}>
                {ops.map((o) => (
                  <FilterChip key={o.op} label={o.label} selected={c.op === o.op} onPress={() => setClauses(clauses.map((x, j) => (j === i ? { ...x, op: o.op } : x)))} />
                ))}
              </ChipRow>
              {needsValue ? (
                f.key === 'tag' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {tags.map((tag) => (
                      <FilterChip key={tag.id} label={`#${tag.name}`} selected={c.value === tag.name} onPress={() => setClauses(clauses.map((x, j) => (j === i ? { ...x, value: tag.name } : x)))} />
                    ))}
                  </View>
                ) : (
                  <FieldInput field={{ ...f, label: 'Value', type: f.type === 'multiselect' ? 'select' : f.type }} value={c.value} onChange={(v) => setClauses(clauses.map((x, j) => (j === i ? { ...x, value: normalise(f, v) } : x)))} />
                )
              ) : null}
            </View>
          );
        })}
        {adding ? (
          <View style={card}>
            <Text variant="caption" color="secondary">
              Add a condition on…
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {fields.map((f) => (
                <FilterChip
                  key={f.key}
                  label={f.label}
                  onPress={() => {
                    const op: FilterOp = f.key === 'tag' ? 'hasTag' : opsFor(f)[0]!.op;
                    setClauses([...clauses, { field: f.key, op, value: f.type === 'boolean' ? true : undefined }]);
                    setAdding(false);
                  }}
                />
              ))}
            </View>
          </View>
        ) : (
          <Button title="Add condition" icon="plus" variant="secondary" small onPress={() => setAdding(true)} />
        )}
      </View>

      <View style={{ gap: 10 }}>
        <Text variant="label" color="secondary">
          Sort by
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {sortFields.map((f) => {
            const cur = value.sort?.[0];
            const sel = cur?.field === f.key;
            return <FilterChip key={f.key} label={f.label} icon={sel ? (cur!.dir === 'asc' ? 'chevron-up' : 'chevron-down') : undefined} selected={sel} onPress={() => onChange({ ...value, sort: [{ field: f.key, dir: sel && cur!.dir === 'desc' ? 'asc' : 'desc' }] })} />;
          })}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <Text variant="label" color="secondary">
          Group by
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {groupFields.map((g) => (
            <FilterChip key={g.key} label={g.label} selected={(value.groupBy ?? '') === g.key} onPress={() => onChange({ ...value, groupBy: g.key || undefined })} />
          ))}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <Text variant="label" color="secondary">
          Layout
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <FilterChip label="List" icon="list" selected={(value.layout ?? 'list') === 'list'} onPress={() => onChange({ ...value, layout: 'list' })} />
          {def.statuses?.length ? <FilterChip label="Board" icon="grid" selected={value.layout === 'board'} onPress={() => onChange({ ...value, layout: 'board' })} /> : null}
          <FilterChip label="Show archived" icon="archive" selected={!!value.includeArchived} onPress={() => onChange({ ...value, includeArchived: !value.includeArchived })} />
        </View>
      </View>
    </View>
  );
}

function normalise(f: FieldDef, v: unknown): unknown {
  if (f.type === 'date' && typeof v === 'string') return v;
  if (f.type === 'datetime' && typeof v === 'number') return v;
  return v;
}

export function describeFilter(g: FilterGroup | undefined, def: EntityTypeDef): string {
  if (!g) return '';
  const fields = filterableFields(def);
  const parts = (g.and ?? []).map((c) => {
    if ('and' in c || 'or' in c) return '(…)';
    const cl = c as FilterClause;
    const f = fields.find((x) => x.key === cl.field);
    const label = f?.label ?? cl.field;
    if (cl.op === 'hasTag') return `#${cl.value}`;
    if (cl.op === 'isNull') return `${label} empty`;
    if (cl.op === 'notNull') return `${label} set`;
    let v = String(cl.value ?? '');
    if (f?.type === 'select') v = f.options?.find((o) => o.value === cl.value)?.label ?? v;
    if (f?.type === 'datetime' && typeof cl.value === 'number') v = new Date(cl.value).toLocaleDateString();
    const opLabel = { eq: 'is', neq: 'is not', gt: '>', gte: '≥', lt: '<', lte: '≤', contains: 'contains', startsWith: 'starts with', in: 'in', notIn: 'not in', between: 'between', relatedTo: 'related to' }[cl.op as string] ?? cl.op;
    return `${label} ${opLabel} ${v}`;
  });
  return parts.join(' · ');
}
