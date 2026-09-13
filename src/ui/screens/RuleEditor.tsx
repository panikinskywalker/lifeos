import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { FilterClause, FieldDef } from '@core/domain/types';
import type { RuleAction, RuleTrigger } from '@core/automation/engine';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { palette } from '@ui/theme/tokens';
import { Button, Card, Chip, IconButton, Input, Screen, Text } from '@ui/components/primitives';
import { FieldInput } from '@ui/components/fields';

/**
 * When <trigger> · if <conditions> · then <actions>.
 * Triggers/actions come from the registry; their configFields render with the
 * same FieldInput the rest of the app uses.
 */
export function RuleEditor({ id }: { id?: string }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const existing = useLive((o) => (id ? o.automation.rules.get(id) : undefined), [id]);
  const [name, setName] = useState(existing?.name ?? '');
  const [trigger, setTrigger] = useState<RuleTrigger>(existing?.trigger ?? { id: 'core.entity.created', config: {} });
  const [conditions, setConditions] = useState<FilterClause[]>(existing?.conditions ?? []);
  const [actions, setActions] = useState<RuleAction[]>(existing?.actions ?? []);
  const accent = palette.purple;
  const triggers = [...os.registry.triggers.values()];
  const actionDefs = [...os.registry.actions.values()];
  const trigDef = os.registry.triggers.get(trigger.id);
  const entityTypeOptions = [...os.registry.entityTypes.values()].filter((x) => !x.hidden).map((x) => ({ value: x.type, label: x.label }));
  const withTypeOptions = (f: FieldDef): FieldDef => (f.key === 'entityType' ? { ...f, options: entityTypeOptions } : f);

  const save = () => {
    if (!name.trim() || !actions.length) return;
    os.automation.rules.save({ id, name: name.trim(), enabled: existing?.enabled ?? true, trigger, conditions, actions });
    router.back();
  };

  return (
    <Screen title={id ? 'Edit rule' : 'New rule'} right={<IconButton icon="xmark" bg onPress={() => router.back()} />}>
      <View style={{ gap: 14 }}>
        <Card>
          <Input value={name} onChangeText={setName} placeholder="Rule name" style={{ fontSize: 20, fontWeight: '600' }} />
        </Card>

        <Card style={{ gap: 10 }}>
          <Text variant="headline" color={accent}>When</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {triggers.map((tr) => (
              <Chip key={tr.id} label={tr.label} selected={trigger.id === tr.id} color={accent} onPress={() => setTrigger({ id: tr.id, config: {} })} />
            ))}
          </ScrollView>
          {trigDef?.configFields?.map((f) => (
            <FieldInput key={f.key} field={withTypeOptions(f)} value={trigger.config[f.key]} onChange={(v) => setTrigger({ ...trigger, config: { ...trigger.config, [f.key]: v } })} accent={accent} />
          ))}
        </Card>

        <Card style={{ gap: 10 }}>
          <Text variant="headline" color={accent}>If (all must be true)</Text>
          {conditions.map((c, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Input value={c.field} onChangeText={(v) => setConditions(conditions.map((x, j) => (j === i ? { ...x, field: v } : x)))} placeholder="data.amount" style={{ flex: 1 }} autoCapitalize="none" />
              <Input value={c.op} onChangeText={(v) => setConditions(conditions.map((x, j) => (j === i ? { ...x, op: v as FilterClause['op'] } : x)))} placeholder="gt" style={{ width: 70 }} autoCapitalize="none" />
              <Input value={c.value == null ? '' : String(c.value)} onChangeText={(v) => setConditions(conditions.map((x, j) => (j === i ? { ...x, value: Number.isNaN(Number(v)) || v === '' ? v : Number(v) } : x)))} placeholder="5000" style={{ width: 90 }} />
              <IconButton icon="trash" color={t.colors.danger} onPress={() => setConditions(conditions.filter((_, j) => j !== i))} />
            </View>
          ))}
          <Text variant="caption" color="tertiary">Fields: title, status, data.&lt;key&gt;, vars.&lt;name&gt;. Ops: eq neq gt gte lt lte contains isNull notNull.</Text>
          <Button title="Add condition" small variant="secondary" color={accent} onPress={() => setConditions([...conditions, { field: 'data.amount', op: 'gt', value: 0 }])} style={{ alignSelf: 'flex-start' }} />
        </Card>

        <Card style={{ gap: 10 }}>
          <Text variant="headline" color={accent}>Then</Text>
          {actions.map((a, i) => {
            const def = os.registry.actions.get(a.id);
            return (
              <View key={i} style={{ gap: 8, padding: 12, backgroundColor: t.colors.cardSecondary, borderRadius: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text variant="subhead" style={{ flex: 1, fontWeight: '600' }}>{i + 1}. {def?.label ?? a.id}</Text>
                  <IconButton icon="trash" color={t.colors.danger} onPress={() => setActions(actions.filter((_, j) => j !== i))} />
                </View>
                {def?.configFields?.map((f) => (
                  <FieldInput key={f.key} field={withTypeOptions(f)} value={a.config[f.key]} onChange={(v) => setActions(actions.map((x, j) => (j === i ? { ...x, config: { ...x.config, [f.key]: v } } : x)))} accent={accent} />
                ))}
              </View>
            );
          })}
          <Text variant="footnote" color="secondary">Add action</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {actionDefs.map((ad) => (
              <Chip key={ad.id} label={ad.label} color={accent} onPress={() => setActions([...actions, { id: ad.id, config: Object.fromEntries((ad.configFields ?? []).filter((f) => f.defaultValue !== undefined).map((f) => [f.key, f.defaultValue])) }])} />
            ))}
          </View>
          <Text variant="caption" color="tertiary">Text fields support templates like {'{{title}}'} and {'{{data.amount}}'}.</Text>
        </Card>

        <Button title={id ? 'Save rule' : 'Create rule'} onPress={save} color={accent} disabled={!name.trim() || !actions.length} />
        {id ? <Button title="Delete rule" variant="plain" color={t.colors.danger} onPress={() => { os.automation.rules.remove(id); router.back(); }} /> : null}
      </View>
    </Screen>
  );
}
