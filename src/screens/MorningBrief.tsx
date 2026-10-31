import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { brief, type Brief } from '@core/brain';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { tintForModule } from '@ui/theme/moduleTint';
import { Icon, Text } from '@ui/kit';

/** "7:02 am", "7 pm". */
export const passTime = (at: number) => format(at, new Date(at).getMinutes() ? 'h:mm a' : 'h a').toLowerCase();

/** The header's meta: when the brief was written, "Updated 7 pm" after the evening pass. */
export function briefMeta(b: Brief): string | undefined {
  if (!b.pass) return undefined;
  return b.pass.pass === 'morning' ? passTime(b.pass.at) : `Updated ${passTime(b.pass.at)}`;
}

/**
 * The Morning brief on top of Today (docs/MODEL.md layer 8): today's nudges
 * in a few lines, urgent first, and Cook tonight; each line opens its record
 * or its To check card. A first pass from the kit until the NR-Brain-*
 * artboards (docs/design/BRAIN-BRIEF.md).
 */
export function MorningBrief() {
  const t = useTheme();
  const router = useRouter();
  const b = useLive((o) => brief(o), []);
  if (!b.pass && !b.lines.length) return null;
  const meta = briefMeta(b);
  return (
    <View style={{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.tile, padding: 16, gap: 10 }} accessibilityLabel="Morning brief">
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
        b.lines.map((l) => (
          <Pressable key={l.id} accessibilityRole="button" accessibilityHint={l.answered ? 'Opens it; already answered' : 'Opens it'} onPress={() => router.push(l.route as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: l.urgent ? t.c.alert.coral : t.tints[tintForModule(l.module)].ink }} />
            <Text variant="body" style={{ flex: 1, opacity: l.answered ? 0.6 : 1 }} numberOfLines={2}>
              {l.text}
            </Text>
            <Icon name="chevron-right" size={14} color={t.c.fg.tertiary} />
          </Pressable>
        ))
      ) : (
        <Text variant="body" color="secondary">
          Nothing needs you today.
        </Text>
      )}
    </View>
  );
}
