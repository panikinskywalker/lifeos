import React from 'react';
import { useRouter } from 'expo-router';
import { onThisDay } from '@core/almanac/almanac';
import type { TileDef } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { RowItem, RowList, Tile } from '@ui/kit';
import { ON_THIS_DAY_ICON } from './screen';

/** What happened on this date a month, six months and years ago; only when there's something. Opens that day on Time. */
function OnThisDayTile() {
  const router = useRouter();
  const days = useLive((o) => onThisDay(o), []);
  if (!days.length) return null;
  const open = (i: (typeof days)[number]['items'][number]) => router.push((i.kind === 'dump' ? `/dump/${i.id}` : `/entity/${i.type}/${i.id}`) as never);
  return (
    <Tile size="2x1" tint="memory" icon="history" label="On this day" onPress={() => router.push({ pathname: '/time', params: { span: 'day', day: days[0]!.day } } as never)}>
      <RowList>
        {days.slice(0, 3).flatMap((d) =>
          d.items.slice(0, 2).map((i) => (
            <RowItem key={`${d.day}-${i.kind}-${i.id}`} icon={ON_THIS_DAY_ICON[i.kind]} tint="memory" title={i.title} value={d.ago} valueTone="secondary" onPress={() => open(i)} />
          )),
        )}
      </RowList>
    </Tile>
  );
}

export const timeTiles: TileDef[] = [{ type: 'onthisday', board: 'time', name: 'On this day', description: 'A month, six months, years ago', icon: 'history', sizes: ['medium'], defaultSize: 'medium', component: OnThisDayTile }];
