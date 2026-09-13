import React, { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Entity, EntityTypeDef, FieldDef } from '@core/domain/types';
import { ZodError } from 'zod';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card, Icon, Input, Screen, Text, IconButton, Chip } from '../components/primitives';
import { FieldInput, TagEditor } from '../components/fields';
import { useLive, useOS } from '../hooks';

/**
 * One form for every entity type. Fields come from the type definition plus
 * the user's custom fields; validation from the zod schema.
 */
export function EntityFormScreen({ type, id, initial, onSaved, linkTo }: { type: string; id?: string; initial?: Record<string, unknown>; onSaved?: (e: Entity) => void; linkTo?: { id: string; kind: string } }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const def: EntityTypeDef = os.registry.type(type);
  const accent = os.registry.colorFor(type) ?? t.colors.tint;
  const existing = useLive((o) => (id ? o.entities.get(id) : undefined), [id]);
  const customFields = useLive((o) => o.customFields.forType(type), [type]);
  const existingTags = useLive((o) => (id ? o.tags.forEntity(id).map((x) => x.name) : []), [id]);

  const [title, setTitle] = useState(existing?.title ?? (initial?.title as string) ?? '');
  const [status, setStatus] = useState<string | null>(existing?.status ?? def.statuses?.[0]?.value ?? null);
  const [data, setData] = useState<Record<string, unknown>>(() => {
    const base: Record<string, unknown> = {};
    for (const f of def.fields) if (f.defaultValue !== undefined) base[f.key] = typeof f.defaultValue === 'function' ? (f.defaultValue as () => unknown)() : f.defaultValue;
    return { ...base, ...(existing?.data ?? {}), ...(initial ?? {}) };
  });
  const [tags, setTags] = useState<string[]>(existingTags);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const hasTitleField = !def.computeTitle;
  const sections = useMemo(() => {
    const all: FieldDef[] = [...def.fields, ...customFields.map((c) => ({ key: `custom_${c.key}`, label: c.label, type: c.fieldType, options: c.options.options, section: 'Custom fields' }))];
    const map = new Map<string, FieldDef[]>();
    for (const f of all) {
      const s = f.section ?? '';
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(f);
    }
    return [...map.entries()];
  }, [def.fields, customFields]);

  const save = () => {
    setSaving(true);
    setErrors({});
    try {
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) if (v !== undefined && v !== '') clean[k] = v;
      let saved: Entity;
      if (id) saved = os.entities.update(id, { title: hasTitleField ? title : undefined, data: clean, status });
      else saved = os.entities.create({ type, title: hasTitleField ? title : undefined, data: clean, status });
      os.tags.set(saved.id, tags);
      if (linkTo && !id) os.relations.link(saved.id, linkTo.id, linkTo.kind);
      if (onSaved) onSaved(saved);
      else if (id) router.back();
      else router.replace(`/entity/${type}/${saved.id}`);
    } catch (e) {
      if (e instanceof ZodError) {
        const errs: Record<string, string> = {};
        for (const issue of e.issues) errs[String(issue.path[0] ?? '_')] = issue.message;
        setErrors(errs);
      } else {
        Alert.alert('Could not save', (e as Error).message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title={id ? `Edit ${def.label}` : `New ${def.label}`} right={<IconButton icon="xmark" bg onPress={() => router.back()} color={t.colors.textSecondary} />}>
      <View style={{ gap: 12 }}>
        {hasTitleField ? (
          <Card style={{ gap: 12 }}>
            <Input value={title} onChangeText={setTitle} placeholder={`${def.label} title`} autoFocus={!id} style={{ fontSize: 20, fontWeight: '600' }} error={errors.title} />
          </Card>
        ) : null}
        {def.statuses?.length ? (
          <Card>
            <Text variant="footnote" color="secondary" style={{ marginBottom: 6 }}>
              Status
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {def.statuses.map((s) => (
                <Chip key={s.value} label={s.label} selected={status === s.value} color={s.color ?? accent} onPress={() => setStatus(s.value)} />
              ))}
            </View>
          </Card>
        ) : null}
        {sections.map(([section, fields], si) => (
          <Card key={section || '_'} style={{ gap: 14 }}>
            {section ? (
              <Text variant="headline" color={accent}>
                {section}
              </Text>
            ) : null}
            {fields.map((f, i) => (
              <FieldInput key={f.key} field={f} value={data[f.key]} onChange={(v) => setData((d) => ({ ...d, [f.key]: v }))} error={errors[f.key]} accent={accent} autoFocus={!id && !hasTitleField && si === 0 && i === 0 && f.type !== 'date'} />
            ))}
          </Card>
        ))}
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="tag" size={14} color={accent} />
            <Text variant="headline" color={accent}>
              Tags
            </Text>
          </View>
          <TagEditor tags={tags} onChange={setTags} accent={accent} />
        </Card>
        {errors._ ? (
          <Text color={t.colors.danger} variant="footnote">
            {errors._}
          </Text>
        ) : null}
        <Button title={id ? 'Save changes' : `Add ${def.label}`} onPress={save} loading={saving} color={accent} />
      </View>
    </Screen>
  );
}
