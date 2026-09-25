import React from 'react';
import { StyleSheet, Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { fontForWeight, type TypeVariant } from '../theme/tokens';

export type TextTone = 'primary' | 'secondary' | 'tertiary';

/**
 * Text in a DESIGN.md type style. `color` takes a tone or any colour string.
 * A `fontWeight` in `style` is turned into the matching Plus Jakarta Sans face, because
 * Android ignores fontWeight on custom font families.
 */
export function Text({ variant = 'body', color, style, children, ...rest }: TextProps & { variant?: TypeVariant; color?: TextTone | (string & {}) }) {
  const t = useTheme();
  const c = color === 'secondary' ? t.c.fg.secondary : color === 'tertiary' ? t.c.fg.tertiary : color && color !== 'primary' ? color : t.c.fg.primary;
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const face = flat?.fontWeight !== undefined && !flat.fontFamily ? { fontFamily: fontForWeight(flat.fontWeight), fontWeight: undefined } : null;
  return (
    <RNText maxFontSizeMultiplier={1.6} {...rest} style={[t.type[variant] as TextStyle, { color: c }, flat, face]}>
      {children}
    </RNText>
  );
}
