import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { daysUntil, inDays } from '@core/dashboard/overview';
import type { TileDef } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { Icon, Text } from '@ui/kit';
import { useTheme } from '@ui/theme/ThemeProvider';
import { documentsState } from './overview';
import { Disc, kindColor, kindIcon, plural, Tag } from './parts';

/**
 * Documents on Today (NR-Documents-Tile): the small 2 × 2 and the wide 4 × 2.
 * The number turns coral while something has expired; the next to expire
 * underneath, and on the wide one what is new and the two most urgent. Opens
 * Documents.
 */
export function DocumentsTile({ wide }: { wide?: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const s = useLive((os) => (os.registry.objects.has('document') ? documentsState(os) : null), []);
  if (!s) return null;
  const now = Date.now();
  const next = s.soon[0];
  const alert = s.expired.length > 0;
  const headline = alert ? `${s.expired.length} expired` : s.soon.length ? `${s.soon.length} expiring` : s.docs.length ? plural(s.docs.length, 'document') : 'None yet';
  const quiet = s.fresh.length ? `${s.fresh.length} new in your folders` : s.docs.length ? 'Nothing expires soon' : 'Pick your folders';
  const when = (iso: string) => inDays(daysUntil(iso, now));
  const urgent = [...s.expired, ...s.soon].slice(0, 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Documents, ${headline}${next ? `, ${next.title} ${when(next.data.expiresOn!)}` : ''}`}
      onPress={() => router.push('/module/documents' as never)}
      style={({ pressed }) => [{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, justifyContent: 'space-between', gap: 10, opacity: pressed ? 0.9 : 1 }, wide ? { minHeight: 167 } : { flex: 1, aspectRatio: 1 }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text color="secondary" style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9 }}>DOCUMENTS</Text>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.tints.documents.ink }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} color={alert ? t.c.alert.coralText : 'primary'} style={{ flexShrink: 1, fontSize: 30, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>{headline}</Text>
        {wide && s.fresh.length ? <Tag label={`${s.fresh.length} new`} icon="folder" bg="rgba(246,226,127,0.16)" fg={t.tints.documents.ink} /> : null}
      </View>
      {wide ? (
        urgent.length ? (
          <View style={{ gap: 6 }}>
            {urgent.map((d) => {
              const days = daysUntil(d.data.expiresOn!, now);
              const color = days < 0 ? t.c.alert.coralText : days <= 30 ? t.c.accent.gold : t.c.fg.secondary;
              return (
                <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{d.title}</Text>
                  <Text color={color} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{when(d.data.expiresOn!)}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Text color="secondary" style={{ fontSize: 12, lineHeight: 15, fontWeight: '600' }}>{quiet}</Text>
        )
      ) : next ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Disc icon={kindIcon(next.data.kind)} color={kindColor(next.data.kind, t)} size={28} />
          <Text numberOfLines={2} color={alert ? 'secondary' : t.c.accent.gold} style={{ flex: 1, fontSize: 12, lineHeight: 15, fontWeight: '600' }}>{`${next.title} ${when(next.data.expiresOn!)}`}</Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="folder" size={14} color={t.c.fg.secondary} />
          <Text numberOfLines={2} color="secondary" style={{ flex: 1, fontSize: 12, lineHeight: 15, fontWeight: '600' }}>{quiet}</Text>
        </View>
      )}
    </Pressable>
  );
}

export const documentsTiles: TileDef[] = [{ type: 'documents', board: 'documents', name: 'Documents', description: 'What has expired, what expires next, what is new', icon: 'folder', sizes: ['small', 'medium'], defaultSize: 'small', component: ({ size }) => <DocumentsTile wide={size !== 'small'} /> }];
