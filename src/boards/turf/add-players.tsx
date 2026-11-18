import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { allPlayers, editMatch, matchInputOf, splitShare, turfPlayerId, type GameData } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Icon, Sheet, Text, useToast } from '@ui/kit';
import { Face } from './teams';
import { SearchBox, found } from './search';

/**
 * Add players to a booked match, from the match screen (Turf web's
 * add-players): who said In (or is on the waiting list) and Maybe first, then
 * whoever is free, then the rest, A to Z, with a search. Tick any number, then
 * Add; it is saved like an edit, so the shares are split again.
 */
export function AddPlayersSheet({ gameId, onClose, onChanged }: { gameId: string | null; onClose: () => void; onChanged: () => void }) {
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const d = useLive((o) => {
    const g = gameId ? o.records.get<GameData>(gameId) : null;
    const input = gameId ? matchInputOf(o, gameId) : null;
    return g && input ? { g, input, squad: allPlayers(o) } : null;
  }, [gameId]);
  const groups = useMemo(() => {
    if (!d) return [];
    const rest = d.squad.filter((p) => !d.input.playerIds.includes(p.id) && found(q, p.data.name, p.data.position)).sort((a, b) => a.data.name.localeCompare(b.data.name));
    const said = (p: (typeof rest)[number]) => d.g.data.rsvps?.[turfPlayerId(p.data) ?? ''];
    const isIn = (p: (typeof rest)[number]) => said(p) === 'going' || said(p) === 'waitlisted';
    const free = (p: (typeof rest)[number]) => p.data.availability === 'AVL' && said(p) !== 'not_going';
    return [
      { key: 'in', label: 'Said in', list: rest.filter(isIn) },
      { key: 'maybe', label: 'Said maybe', list: rest.filter((p) => said(p) === 'maybe') },
      { key: 'free', label: 'Free', list: rest.filter((p) => !isIn(p) && said(p) !== 'maybe' && free(p)) },
      { key: 'rest', label: 'Everyone else', list: rest.filter((p) => !isIn(p) && said(p) !== 'maybe' && !free(p)) },
    ].filter((g) => g.list.length);
  }, [d, q]);
  if (!d) return null;
  const count = d.input.playerIds.length + picked.length;
  const close = () => {
    setPicked([]);
    setQ('');
    onClose();
  };
  const add = () => {
    try {
      editMatch(os, gameId!, { ...d.input, playerIds: [...d.input.playerIds, ...picked] });
      const one = picked.length === 1 ? d.squad.find((p) => p.id === picked[0])?.data.name.split(/\s+/)[0] : null;
      toast.show({ message: `Added ${one ?? `${picked.length} players`} · ${count} in · sending`, icon: 'check' });
      onChanged();
      close();
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };
  return (
    <Sheet
      visible={!!gameId}
      onClose={close}
      title="Add players"
      full
      footer={<Button title={picked.length ? `Add ${picked.length} · ${os.format.currency(splitShare(d.g.data.totalCost, count))} each` : 'Tick who to add'} icon="plus" block disabled={!picked.length} onPress={add} />}
    >
      <Text variant="caption" color="secondary">{`${d.input.playerIds.length} in of ${d.g.data.expectedPlayers ?? d.input.playerIds.length}`}</Text>
      <SearchBox value={q} onChange={setQ} placeholder="Find a player" />
      {groups.map((g) => (
        <View key={g.key} style={{ gap: 6 }}>
          <Text variant="labelCaps" color="tertiary" style={{ textTransform: 'uppercase' }}>{`${g.label} · ${g.list.length}`}</Text>
          {g.list.map((p) => {
            const on = picked.includes(p.id);
            return (
              <Pressable key={p.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={p.data.name} onPress={() => setPicked((x) => (on ? x.filter((y) => y !== p.id) : [...x, p.id]))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, backgroundColor: on ? 'rgba(215,245,92,0.14)' : t.c.bg.tile }}>
                <Face id={p.data.personId} name={p.data.name} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="rowTitle" numberOfLines={1}>{p.data.name}</Text>
                  <Text variant="caption" color="secondary" numberOfLines={1}>{p.data.position || 'no position set'}</Text>
                </View>
                <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.c.accent.mustard : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: t.c.fg.tertiary }}>
                  {on ? <Icon name="check" size={16} color={t.c.accent.mustardInk} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </Sheet>
  );
}
