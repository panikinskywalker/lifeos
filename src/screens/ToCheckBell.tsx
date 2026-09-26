import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { IconButton, Text } from '@ui/kit';

/** The bell (docs/GRAPH.md §5): how many filed things you haven't looked at; opens To check. */
export function ToCheckBell() {
  const t = useTheme();
  const router = useRouter();
  const n = useLive((o) => o.dumps.toCheckCount(), []);
  return (
    <View>
      <IconButton icon="bell" accessibilityLabel={n ? `To check, ${n} item${n === 1 ? '' : 's'}` : 'To check'} filled onPress={() => router.push('/check' as never)} />
      {n ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="labelMicro" color={t.c.accent.mustardInk}>{n > 99 ? '99+' : n}</Text>
        </View>
      ) : null}
    </View>
  );
}
