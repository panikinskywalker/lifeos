import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { FormScreen } from '@ui/screens/FormScreen';
import { useOS } from '@ui/hooks';
import { EmptyState, Screen } from '@ui/kit';

/** /entity/<type>/new?<field>=<value>&linkId=..&linkKind=.. — prefill + auto-link. */
export default function NewEntityRoute() {
  const os = useOS();
  const { type, linkId, linkKind, ...prefill } = useLocalSearchParams() as Record<string, string | undefined> & { type: string; linkId?: string; linkKind?: string };
  if (!type || !os.registry.hasObject(type)) return (
      <Screen title="Not found">
        <EmptyState icon="box" line={`There is no record type called “${type}”.`} />
      </Screen>
    );
  const def = os.registry.object(type);
  const initial: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(prefill)) {
    if (v == null || v === '') continue;
    const f = def.fields.find((x) => x.key === k);
    if (!f) continue;
    initial[k] = f.type === 'number' || f.type === 'money' ? Number(v) : f.type === 'boolean' ? v === 'true' : f.type === 'link' && Array.isArray(f.default) ? [v] : v;
  }
  return <FormScreen type={type} initial={initial} linkTo={linkId && linkKind ? { id: linkId, kind: linkKind } : undefined} />;
}
