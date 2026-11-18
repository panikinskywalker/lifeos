import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchTurfInbox } from '@modules/games';
import { useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { IconButton, Text } from '@ui/kit';

/** One look a minute however many screens show the bell (they stay mounted under each other). */
let seen = { at: 0, count: 0 };
/** The bell screen's own fetch counts as a look. */
export const sawCount = (count: number) => void (seen = { at: Date.now(), count });
let asking: Promise<number> | null = null;
function countNow(os: ReturnType<typeof useOS>): Promise<number> {
  if (Date.now() - seen.at < 55_000) return Promise.resolve(seen.count);
  asking ??= fetchTurfInbox(os)
    .then((i) => (seen = { at: Date.now(), count: i.count }).count)
    .finally(() => (asking = null));
  return asking;
}

/** The bell in Turf's headers (as on every Turf web screen): a count of what waits for you. */
export function BellButton() {
  const os = useOS();
  const router = useRouter();
  const t = useTheme();
  const [count, setCount] = useState(seen.count);
  useEffect(() => {
    let live = true;
    const look = () => void countNow(os).then((n) => live && setCount(n), () => {});
    look();
    const timer = setInterval(look, 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [os]);
  return (
    <View>
      <IconButton icon="bell" filled accessibilityLabel={count ? `${count} to check` : 'Nothing to check'} onPress={() => router.push('/board/turf/bell' as never)} />
      {count ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: t.c.alert.coral, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="labelMicro" color="#F5F5F7" style={{ fontWeight: '800' }}>
            {String(count)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

