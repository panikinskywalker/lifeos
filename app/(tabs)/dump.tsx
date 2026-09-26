import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { OneBox, type Shared } from '../../src/screens/OneBox';

/**
 * The centre tab (docs/GRAPH.md §5): one box for everything you say.
 * Tapping the raised brain while here starts listening.
 */
export default function DumpTab() {
  const params = useLocalSearchParams<{ share?: string; file?: string; fileName?: string; mime?: string }>();
  const [share, setShare] = useState<Shared | null>(null);
  const centerPress = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!params.share && !params.file) return;
    setShare({
      text: params.share ? String(params.share) : undefined,
      file: params.file ? { uri: String(params.file), name: String(params.fileName ?? 'shared file'), mime: String(params.mime ?? '') } : undefined,
    });
  }, [params.share, params.file]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigation = useNavigation();
  useEffect(
    () =>
      navigation.addListener('tabPress' as never, () => {
        if (navigation.isFocused()) centerPress.current?.();
      }),
    [navigation],
  );

  return <OneBox share={share} centerPress={centerPress} />;
}
