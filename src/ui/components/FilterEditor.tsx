import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { EntityTypeDef, FieldDef, FilterClause, FilterGroup, FilterOp, ViewDefinition } from '@core/domain/types';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card, Chip, Icon, IconButton, Input, Text } from './primitives';
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

export function FilterEditor({ type, value, onChange, accent }: { type: string; value: ViewDefinition; onChange: (v: ViewDefinition) => void; accent?: string }) {
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

  return (
    <View style={{ paddingHorizontal: 16, gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Text variant="headline">Conditions</Text>
        {clauses.map((c, i) => {
          const f = fields.find((x) => x.key === c.field) ?? (c.op === 'hasTag' ? fields.find((x) => x.key === 'tag') : undefined);
          if (!f) return null;
          const ops = f.key === 'tag' ? [{ op: 'hasTag' as FilterOp, label: 'has' }] : opsFor(f);
          const needsValue = !['isNull', 'notNull'].includes(c.op);
          return (
            <Card key={i} style={{ gap: 8, padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="subhead" style={{ fontWeight: '600', flex: 1 }}>
                  {f.label}
                </Text>
                <IconButton icon="trash" color={t.colors.danger} onPress={() => setClauses(clauses.filter((_, j) => j !== i))} />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {ops.map((o) => (
                  <Chip key={o.op} label={o.label} selected={c.op === o.op} color={accent} onPress={() => setClauses(clauses.map((x, j) => (j === i ? { ...x, op: o.op } : x)))} />
                ))}
              </ScrollView>
              {needsValue ? (
                f.key === 'tag' ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {tags.map((tag) => (
                      <Chip key={tag.id} label={`#${tag.name}`} selected={c.value === tag.name} color={accent} onPress={() => setClauses(clauses.map((x, j) => (j === i ? { ...x, value: tag.name } : x)))} />
                    ))}
                  </ScrollView>
                ) : (
                  <FieldInput field={{ ...f, label: 'Value', type: f.type === 'datetime' ? 'datetime' : f.type === 'multiselect' ? 'select' : f.type }} value={c.field === 'createdAt' && typeof c.value === 'number' ? c.value : c.value} onChange={(v) => setClauses(clauses.map((x, j) => (j === i ? { ...x, value: normalise(f, v) } : x)))} accent={accent} />
                )
              ) : null}
            </Card>
          );
        })}
        {adding ? (
          <Card style={{ padding: 12, gap: 8 }}>
            <Text variant="footnote" color="secondary">
              Add condition on…
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {fields.map((f) => (
                <Chip key={f.key} label={f.label} color={accent} onPress={() => {
                  const op: FilterOp = f.key === 'tag' ? 'hasTag' : opsFor(f)[0].op;
                  setClauses([...clauses, { field: f.key, op, value: f.type === 'boolean' ? true : undefined }]);
                  setAdding(false);
                }} />
              ))}
            </View>
          </Card>
        ) : (
          <Button title="Add condition" icon="plus" variant="secondary" small color={accent} onPress={() => setAdding(true)} style={{ alignSelf: 'flex-start' }} />
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text variant="headline">Sort by</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {sortFields.map((f) => {
            const cur = value.sort?.[0];
            const sel = cur?.field === f.key;
            return <Chip key={f.key} label={`${f.label}${sel ? (cur!.dir === 'asc' ? ' ↑' : ' ↓') : ''}`} selected={sel} color={accent} onPress={() => onChange({ ...value, sort: [{ field: f.key, dir: sel && cur!.dir === 'desc' ? 'asc' : 'desc' }] })} />;
          })}
        </ScrollView>
      </View>

      <View style={{ gap: 8 }}>
        <Text variant="headline">Group by</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {groupFields.map((g) => (
            <Chip key={g.key} label={g.label} selected={(value.groupBy ?? '') === g.key} color={accent} onPress={() => onChange({ ...value, groupBy: g.key || undefined })} />
          ))}
        </ScrollView>
      </View>

      <View style={{ gap: 8 }}>
        <Text variant="headline">Layout</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Chip label="List" icon="list.bullet" selected={(value.layout ?? 'list') === 'list'} color={accent} onPress={() => onChange({ ...value, layout: 'list' })} />
          {def.statuses?.length ? <Chip label="Board" icon="square.grid.2x2" selected={value.layout === 'board'} color={accent} onPress={() => onChange({ ...value, layout: 'board' })} /> : null}
          <Chip label={value.includeArchived ? 'Archived shown' : 'Archived hidden'} icon="archivebox" selected={!!value.includeArchived} color={accent} onPress={() => onChange({ ...value, includeArchived: !value.includeArchived })} />
        </View>
      </View>
      <View style={{ height: 0 }}>
        <Icon name="circle" size={0} />
      </View>
      <Input style={{ display: 'none' }} />
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
