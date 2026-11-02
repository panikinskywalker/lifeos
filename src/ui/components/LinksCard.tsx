import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import { egoGraph, linkGroups, type LinkItem } from '@core/graph/read';
import { ActionSheet, Button, FilterChip, FormField, RowItem, RowList, Section, Sheet, Text, TextField, useToast } from '../kit';
import { useLive, useOS } from '../hooks';
import { tintForModule } from '../theme/moduleTint';
import { EntityPicker } from './fields';
import { LinksView } from './LinksView';

const PER_GROUP = 4;

/**
 * The Links card (MODEL.md layer 5, *Links*): every Link of a record, grouped
 * by link word as read from it, each row tinted by the other record's module.
 * Tap opens; long-press offers Open · Show in Links · Remove link (Undo);
 * Link adds one. `full` (the Links screen) shows every row and no map.
 */
export function LinksCard({ entity, full = false }: { entity: ObjectRecord; full?: boolean }) {
  const os = useOS();
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [held, setHeld] = useState<LinkItem | null>(null);
  const groups = useLive((o) => linkGroups(o, entity.id), [entity.id]);
  const map = useLive((o) => (full ? null : egoGraph(o, entity.id, { hops: 1, limit: 14 })), [entity.id, full]);
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  const open = (i: LinkItem) => router.push(`/entity/${i.type}/${i.id}` as never);
  const openLinks = (id = entity.id) => router.push(`/links/${id}` as never);
  const remove = (i: LinkItem) => {
    os.links.remove(i.linkId);
    toast.show({ message: `Removed the link to ${i.title}`, icon: 'link', undo: () => void os.links.link(i.fromId, i.toId, i.kind) });
  };
  const money = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${os.format.currency(Math.abs(n))}`;
  return (
    <Section title="Links" meta={count ? String(count) : undefined} action="Link" onAction={() => setAdding(true)}>
      {count === 0 ? (
        <Text variant="caption" color="secondary">
          Nothing linked to {entity.title} yet. Link it to a person, a place, a payment, or say who was there.
        </Text>
      ) : (
        <View style={{ gap: 14 }}>
          {map && map.nodes.length >= 3 ? <LinksView nodes={map.nodes} edges={map.edges} height={200} labels={false} onSelect={() => openLinks()} onOpen={(n) => router.push(`/entity/${n.type}/${n.id}` as never)} /> : null}
          {groups.map((g) => {
            const amounts = g.items.filter((i) => i.amount != null);
            const total = amounts.length > 1 && amounts.length === g.items.length ? amounts.reduce((s, i) => s + i.amount!, 0) : null;
            const shown = full ? g.items : g.items.slice(0, PER_GROUP);
            return (
              <View key={g.word} style={{ gap: 6 }}>
                <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase', paddingHorizontal: 4 }}>
                  {g.word} · {g.items.length}
                  {total != null ? ` · ${money(total)}` : ''}
                </Text>
                <RowList>
                  {shown.map((i) => {
                    const def = os.registry.objects.get(i.type);
                    return (
                      <RowItem
                        key={i.linkId}
                        icon={def?.icon ?? 'link'}
                        tint={tintForModule(i.module ?? undefined)}
                        title={i.title}
                        subtitle={[def?.label, i.at ? os.format.date(i.at) : null].filter(Boolean).join(' · ')}
                        value={i.amount != null ? money(i.amount) : undefined}
                        onPress={() => open(i)}
                        onLongPress={() => setHeld(i)}
                      />
                    );
                  })}
                </RowList>
                {shown.length < g.items.length ? (
                  <Text variant="label" color="secondary" style={{ paddingHorizontal: 4 }} onPress={() => openLinks()}>
                    {g.items.length - shown.length} more
                  </Text>
                ) : null}
              </View>
            );
          })}
          <Text variant="caption" color="tertiary" style={{ paddingHorizontal: 4 }}>
            Hold a link to remove it.
          </Text>
          {full ? null : <Button title="Open Links" icon="link" variant="secondary" size="sm" onPress={() => openLinks()} />}
        </View>
      )}
      <ActionSheet
        visible={!!held}
        onClose={() => setHeld(null)}
        title={held?.title}
        actions={
          held
            ? [
                { label: 'Open', icon: 'arrow-right', onPress: () => open(held) },
                { label: 'Show in Links', icon: 'link', onPress: () => openLinks(held.id) },
                { label: 'Remove link', icon: 'trash', destructive: true, onPress: () => remove(held) },
              ]
            : []
        }
      />
      <LinkSheet visible={adding} onClose={() => setAdding(false)} entity={entity} />
    </Section>
  );
}

/** Add a Link by hand: the word (this Object's own words, related, or your own), then the record. */
export function LinkSheet({ visible, onClose, entity }: { visible: boolean; onClose: () => void; entity: ObjectRecord }) {
  const os = useOS();
  const toast = useToast();
  const [kind, setKind] = useState('related');
  const [picking, setPicking] = useState(false);
  const def = os.registry.object(entity.object);
  const kinds = [...new Set(['related', ...(def.links?.map((r) => r.kind) ?? [])])];
  const kindLabel = (k: string) => def.links?.find((r) => r.kind === k)?.label ?? k.charAt(0).toUpperCase() + k.slice(1);
  return (
    <>
      <Sheet visible={visible && !picking} onClose={onClose} title="Link to…" footer={<Button title="Choose record" icon="search" block onPress={() => setPicking(true)} />}>
        <FormField label="Link as">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {kinds.map((k) => (
              <FilterChip key={k} label={kindLabel(k)} selected={kind === k} onPress={() => setKind(k)} />
            ))}
          </View>
        </FormField>
        <TextField label="Or your own word" value={kinds.includes(kind) ? '' : kind} onChange={(v) => setKind(v || 'related')} placeholder="vendor, gift for" />
      </Sheet>
      <EntityPicker
        visible={visible && picking}
        onClose={() => setPicking(false)}
        types={[]}
        exclude={[entity.id]}
        onSelect={(otherId) => {
          const word = kind.trim() || 'related';
          const l = os.links.link(entity.id, otherId, word);
          setPicking(false);
          onClose();
          toast.show({ message: `Linked as ${kindLabel(word).toLowerCase()}`, icon: 'link', undo: () => os.links.remove(l.id) });
        }}
      />
    </>
  );
}
