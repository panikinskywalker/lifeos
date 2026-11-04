import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { brief, type Brief } from '@core/brain';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { shortNameForModule, tintForModule } from '@ui/theme/moduleTint';
import type { TintKey } from '@ui/theme/tokens';
import { Icon, Text } from '@ui/kit';

/** "7:02 am", "7 pm". */
export const passTime = (at: number) => format(at, new Date(at).getMinutes() ? 'h:mm a' : 'h a').toLowerCase();

/** The header's meta: when the brief was written, "Updated 7 pm" after the evening pass. */
export function briefMeta(b: Brief): string | undefined {
  if (!b.pass) return undefined;
  return b.pass.pass === 'morning' ? passTime(b.pass.at) : `Updated ${passTime(b.pass.at)}`;
}

/** Lines the shared module tints would draw alike. */
const BRIEF_TINT: Record<string, TintKey> = { deliveries: 'documents', upkeep: 'health' };

/**
 * The Morning brief on top of Today (docs/MODEL.md layer 8): today's nudges,
 * urgent first, and Cook tonight; each line says its category and, when
 * urgent, when (the NR-Brief-A-Labels artboard), and opens its record or its
 * To check card.
 */
export function MorningBrief() {
  const t = useTheme();
  const os = useOS();
  const router = useRouter();
  const b = useLive((o) => brief(o), []);
  if (!b.pass && !b.lines.length) return null;
  const meta = briefMeta(b);
  return (
    <View style={{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.tile, padding: 16, gap: 4 }} accessibilityLabel="Morning brief">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="sun" size={18} color={t.c.accent.mustard} />
        <Text variant="tileTitle" style={{ flex: 1 }} accessibilityRole="header">
          Morning brief
        </Text>
        {meta ? (
          <Text variant="caption" color="secondary">
            {meta}
          </Text>
        ) : null}
      </View>
      {b.lines.length ? (
        b.lines.map((l, i) => {
          const ink = t.tints[BRIEF_TINT[l.module] ?? tintForModule(l.module)].ink;
          const category = l.module === 'upkeep' ? 'Upkeep' : shortNameForModule(l.module, os.registry.modules.get(l.module)?.name ?? l.module);
          return (
            <Pressable
              key={l.id}
              accessibilityRole="button"
              accessibilityLabel={[category, l.when, l.text].filter(Boolean).join(': ')}
              accessibilityHint={l.answered ? 'Opens it; already answered' : 'Opens it'}
              onPress={() => router.push(l.route as never)}
              style={{ gap: 3, minHeight: 44, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: t.c.line, opacity: l.answered ? 0.6 : 1 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ink }} />
                <Text variant="label" style={{ flex: 1, color: ink, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, textTransform: 'uppercase' }}>
                  {category}
                </Text>
                {l.when ? (
                  <Text variant="label" style={{ color: t.c.alert.coral, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, textTransform: 'uppercase' }}>
                    {l.when}
                  </Text>
                ) : null}
              </View>
              <Text variant="body" numberOfLines={2}>
                {l.text}
              </Text>
            </Pressable>
          );
        })
      ) : (
        <Text variant="body" color="secondary">
          Nothing needs you today.
        </Text>
      )}
    </View>
  );
}
