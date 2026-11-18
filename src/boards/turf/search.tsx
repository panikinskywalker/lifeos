import { TextInput, View } from 'react-native';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fonts } from '@ui/theme/tokens';
import { Icon } from '@ui/kit';

/** A list's search box (as the Games list has it); `found` matches a query against any of a row's words. */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 18, borderRadius: 16, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: t.c.line }}>
      <Icon name="search" size={18} color={t.c.fg.tertiary} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={t.c.fg.tertiary} style={{ flex: 1, height: 48, color: t.c.fg.primary, fontFamily: fonts[500], fontSize: 15 }} accessibilityLabel={placeholder} returnKeyType="search" />
    </View>
  );
}
export const found = (query: string, ...texts: Array<string | null | undefined>) => {
  const q = query.trim().toLowerCase();
  return !q || texts.some((x) => x?.toLowerCase().includes(q));
};
