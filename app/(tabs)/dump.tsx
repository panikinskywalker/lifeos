import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ScreenHeader, Segmented } from '@ui/kit';
import { DumpPane } from '../../src/screens/DumpPane';
import { TalkPane, type TalkShare } from '../../src/screens/TalkPane';

type Mode = 'dump' | 'talk';

/**
 * The centre tab (PRODUCT v4 §4): Dump by default — the box — with Talk (ask
 * the agent) as a toggle at the top. Tapping the raised brain while here
 * starts listening in whichever half is showing.
 */
export default function DumpTab() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: Mode; share?: string; file?: string; fileName?: string; mime?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'talk' ? 'talk' : 'dump');
  const [talkShare, setTalkShare] = useState<TalkShare | null>(null);
  const [dumpShare, setDumpShare] = useState<string | null>(null);
  const centerPress = useRef<(() => void) | null>(null);

  // Shared text becomes a dump; a shared file goes to Talk so it can be attached to a record.
  useEffect(() => {
    if (params.file) {
      setMode('talk');
      setTalkShare({ text: params.share ? String(params.share) : undefined, file: { uri: String(params.file), name: String(params.fileName ?? 'shared file'), mime: String(params.mime ?? '') } });
    } else if (params.share) {
      setMode('dump');
      setDumpShare(String(params.share));
    } else if (params.mode) setMode(params.mode === 'talk' ? 'talk' : 'dump');
  }, [params.share, params.file, params.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigation = useNavigation();
  useEffect(
    () =>
      navigation.addListener('tabPress' as never, () => {
        if (navigation.isFocused()) centerPress.current?.();
      }),
    [navigation],
  );

  const header = ({ subtitle, right }: { subtitle: string; right?: React.ReactNode }) => (
    <View style={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: 8, gap: 12 }}>
      <ScreenHeader title={mode === 'dump' ? 'Dump' : 'Talk'} subtitle={subtitle} right={right} />
      <Segmented<Mode> options={[{ value: 'dump', label: 'Dump' }, { value: 'talk', label: 'Talk' }]} value={mode} onChange={setMode} />
    </View>
  );

  return mode === 'dump' ? <DumpPane header={header} share={dumpShare} centerPress={centerPress} /> : <TalkPane header={header} share={talkShare} centerPress={centerPress} />;
}
