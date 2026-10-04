import { useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import type { ObjectRecord } from '@core/domain/types';
import type { DumpSource } from '@core/repo/dumpRepo';
import { useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { IconButton, useToast } from '@ui/kit';
import { saveDump } from '../platform/filing';
import { listen } from '../platform/voice';

/**
 * "Tell me about Kendal…" on every record page (docs/GRAPH.md §5): what you
 * say here is kept word for word and filed into this record — fields where
 * they fit, tidy Notes lines otherwise, links to whatever else you mention.
 */
export function SayCard({ entity }: { entity: ObjectRecord }) {
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const [text, setText] = useState('');
  const [source, setSource] = useState<DumpSource>('typed');
  const send = (body = text, from = source) => {
    if (!body.trim()) return;
    saveDump(os, body, from, entity.id);
    setText('');
    setSource('typed');
    toast.show({ message: `Filing into ${entity.title}…`, icon: 'brain' });
  };
  const speak = async () => {
    const heard = await listen();
    if (!heard) return toast.show({ message: Platform.OS === 'web' ? 'Voice isn’t available in this browser' : 'Didn’t catch that', icon: 'mic' });
    if (text.trim()) setText((x) => `${x.trimEnd()} ${heard}`);
    else send(heard, 'voice');
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: t.c.bg.container, borderRadius: 24, padding: 8, paddingLeft: 14 }}>
      <TextInput
        accessibilityLabel={`Tell me about ${entity.title}`}
        value={text}
        onChangeText={setText}
        placeholder={`Tell me about ${entity.title}…`}
        placeholderTextColor={t.c.fg.tertiary}
        multiline
        style={{ flex: 1, minHeight: 40, maxHeight: 160, color: t.c.fg.primary, fontSize: 15, lineHeight: 21, fontFamily: t.type.body.fontFamily, paddingVertical: 9 }}
      />
      <IconButton icon="mic" accessibilityLabel={`Speak about ${entity.title}`} filled onPress={() => void speak()} />
      {text.trim() ? <IconButton icon="arrow-up" accessibilityLabel="File it" filled={t.c.accent.mustard} color={t.c.accent.mustardInk} onPress={() => send()} /> : null}
    </View>
  );
}
