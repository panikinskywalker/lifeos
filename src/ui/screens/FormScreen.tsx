import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord, ObjectDef, Field } from '@core/domain/types';
import { ZodError } from 'zod';
import { useTheme } from '../theme/ThemeProvider';
import { Button, FormField, FilterChip, Screen, Section, Text, TextField } from '../kit';
import { FieldInput, TagEditor } from '../components/fields';
import { useLive, useOS } from '../hooks';

type FormProps = { type: string; id?: string; initial?: Record<string, unknown>; onSaved?: (e: ObjectRecord) => void; linkTo?: { id: string; kind: string } };

/**
 * One form for every Object. Fields come from the Object plus the user's
 * custom fields; validation from the zod schema. An Object whose board has
 * its own form (`overrides[].form`: Person) gets that one instead.
 */
export function FormScreen(props: FormProps) {
  const os = useOS();
  const Override = os.registry.forms.get(props.type);
  if (Override) return <Override id={props.id} initial={props.initial} onSaved={props.onSaved} linkTo={props.linkTo} />;
  return <GenericForm {...props} />;
}

function GenericForm({ type, id, initial, onSaved, linkTo }: FormProps) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const def: ObjectDef = os.registry.object(type);
  const existing = useLive((o) => (id ? o.records.get(id) : undefined), [id]);
  const customFields = useLive((o) => o.customFields.forType(type), [type]);
  const existingTags = useLive((o) => (id ? o.tags.forEntity(id).map((x) => x.name) : []), [id]);

  const [title, setTitle] = useState(existing?.title ?? (initial?.title as string) ?? '');
  const [status, setStatus] = useState<string | null>(existing?.status ?? def.statuses?.[0]?.value ?? null);
  const [data, setData] = useState<Record<string, unknown>>(() => {
    const base: Record<string, unknown> = {};
    for (const f of def.fields) if (f.default !== undefined) base[f.key] = typeof f.default === 'function' ? (f.default as () => unknown)() : f.default;
    return { ...base, ...(existing?.data ?? {}), ...(initial ?? {}) };
  });
  const [tags, setTags] = useState<string[]>(existingTags);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const hasTitleField = !def.computeTitle;
  const sections = useMemo(() => {
    const all: Field[] = [...def.fields, ...customFields.map((c) => ({ key: `custom_${c.key}`, label: c.label, type: c.fieldType, options: c.options.options, section: 'Custom fields' }))];
    const map = new Map<string, Field[]>();
    for (const f of all) {
      const s = f.section ?? '';
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(f);
    }
    return [...map.entries()];
  }, [def.fields, customFields]);

  const close = () => (router.canGoBack() ? router.back() : router.replace(`/entity/${type}`));

  const save = () => {
    setSaving(true);
    setErrors({});
    try {
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) if (v !== undefined && v !== '') clean[k] = v;
      const saved = id ? os.records.update(id, { title: hasTitleField ? title : undefined, data: clean, status }) : os.records.create({ object: type, title: hasTitleField ? title : undefined, data: clean, status });
      os.tags.set(saved.id, tags);
      if (linkTo && !id) os.links.link(saved.id, linkTo.id, linkTo.kind);
      if (onSaved) onSaved(saved);
      else if (id) close();
      else router.replace(`/entity/${type}/${saved.id}`);
    } catch (e) {
      if (e instanceof ZodError) {
        const errs: Record<string, string> = {};
        for (const issue of e.issues) errs[String(issue.path[0] ?? '_')] = issue.message;
        setErrors(errs);
      } else {
        setErrors({ _: (e as Error).message });
      }
    } finally {
      setSaving(false);
    }
  };

  const errorCount = Object.keys(errors).length;
  return (
    <Screen title={id ? `Edit ${def.label.toLowerCase()}` : `New ${def.label.toLowerCase()}`} subtitle={id ? existing?.title : os.registry.modules.get(def.module)?.description ?? os.registry.modules.get(def.module)?.name} onBack={close}>
      {hasTitleField ? <TextField label="Name" required value={title} onChange={setTitle} placeholder={`${def.label} name`} autoFocus={!id} error={errors.title} /> : null}
      {def.statuses?.length ? (
        <FormField label="Status">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {def.statuses.map((s) => (
              <FilterChip key={s.value} label={s.label} selected={status === s.value} onPress={() => setStatus(s.value)} />
            ))}
          </View>
        </FormField>
      ) : null}
      {sections.map(([section, fields], si) =>
        section ? (
          <Section key={section} title={section}>
            <View style={{ gap: 16 }}>
              {fields.map((f) => (
                <FieldInput key={f.key} field={f} value={data[f.key]} onChange={(v) => setData((d) => ({ ...d, [f.key]: v }))} error={errors[f.key]} />
              ))}
            </View>
          </Section>
        ) : (
          <View key="_" style={{ gap: 16 }}>
            {fields.map((f, i) => (
              <FieldInput key={f.key} field={f} value={data[f.key]} onChange={(v) => setData((d) => ({ ...d, [f.key]: v }))} error={errors[f.key]} autoFocus={!id && !hasTitleField && si === 0 && i === 0 && f.type !== 'date'} />
            ))}
          </View>
        ),
      )}
      <TagEditor label="Tags" tags={tags} onChange={setTags} />
      {errorCount ? (
        <Text variant="caption" color={t.c.alert.coralText} accessibilityLiveRegion="polite">
          {errors._ ?? `Check ${errorCount === 1 ? 'the highlighted field' : `${errorCount} highlighted fields`}.`}
        </Text>
      ) : null}
      <Button title={id ? 'Save changes' : `Save ${def.label.toLowerCase()}`} icon="check" size="lg" block onPress={save} loading={saving} style={{ marginTop: 4 }} />
    </Screen>
  );
}
