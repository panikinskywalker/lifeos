import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLive, useOS } from '@ui/hooks';
import { EmptyState, Screen, Text } from '@ui/kit';
import { DumpCard } from '../../src/screens/DumpPane';

/** One dump, word for word, with everything extracted from it and Undo per item. */
export default function DumpScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const os = useOS();
  const router = useRouter();
  const dump = useLive((o) => o.dumps.get(String(id)), [id]);
  return (
    <Screen title="Dump" onBack={() => router.back()}>
      {dump ? (
        <View style={{ gap: 12 }}>
          <DumpCard dump={dump} os={os} full />
          <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>
            Dumps are kept exactly as written and can’t be edited or deleted. Undo removes what was filed from them, not the dump.
          </Text>
        </View>
      ) : (
        <EmptyState icon="brain" line="This dump isn’t here." />
      )}
    </Screen>
  );
}
