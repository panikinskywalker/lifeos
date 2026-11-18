import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, Pattern, Rect } from 'react-native-svg';

/**
 * The trip template's look, as drawn on the *Trip template · Noir (Japan)*
 * canvas (`JP-*` artboards): fonts, gradients, the seigaiha wave and the
 * motion classes the artboards use (rise in, the stamp pressing in, bars
 * growing, the pulse, the blink).
 */

/** Japanese sans (Noto Sans JP in the design): the phone's own CJK sans. */
export const JP_SANS = Platform.select({ web: "'Noto Sans JP', 'Hiragino Sans', sans-serif", ios: 'Hiragino Sans', default: undefined }) as string | undefined;
/** Japanese mincho (Shippori Mincho B1 in the design): the phone's serif, which carries CJK mincho. */
export const JP_SERIF = Platform.select({ web: "'Shippori Mincho B1', 'Hiragino Mincho ProN', serif", ios: 'Hiragino Mincho ProN', default: 'serif' }) as string;

export const MONO = 'JetBrainsMono_700Bold';
export const MONO_MED = 'JetBrainsMono_500Medium';

/** A CSS gradient as a style (RN's background image on the phone, CSS on the web). */
export function bgImage(css: string): ViewStyle {
  return (Platform.OS === 'web' ? { backgroundImage: css } : { experimental_backgroundImage: css }) as ViewStyle;
}

/** The seigaiha wave band (the artboards' `jwave` background), absolutely filling its parent. */
export function Wave({ color = '#F5F5F7', opacity = 0.12 }: { color?: string; opacity?: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="seigaiha" width={48} height={24} patternUnits="userSpaceOnUse">
            <G stroke={color} strokeOpacity={opacity} strokeWidth={1.1} fill="none">
              {[[24, 12], [0, 24], [48, 24]].map(([cx, cy]) => (
                <G key={cx}>
                  {[22, 16, 10, 4].map((r) => <Circle key={r} cx={cx} cy={cy} r={r} />)}
                </G>
              ))}
            </G>
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#seigaiha)" />
      </Svg>
    </View>
  );
}

/**
 * When the trip bar switches section, the new screen crossfades in; its
 * entrance motion is skipped so the header and the bar stay still and only
 * the content changes. `markTabSwitch` is called by the bar just before.
 */
let tabSwitchAt = 0;
export function markTabSwitch() {
  tabSwitchAt = Date.now();
}
const ENTRANCES = new Set(['jr', 'jstamp', 'jbar', 'jflip', 'jroll', 'jrise']);

type AnimKind = 'jr' | 'jstamp' | 'jbar' | 'jshine' | 'jflip' | 'jblink' | 'jroll' | 'jrise' | 'jbreathe' | 'jnudge' | 'jspin' | 'jpulse' | 'jpulse2' | 'jwave' | 'jflow';
const native = Platform.OS !== 'web';
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

/** A View that moves the way the artboard's class says (`jr` rises in, `jstamp` presses in, `jbar` grows from the left, ...). */
export function Anim({ k, delay = 0, style, children, ...rest }: { k: AnimKind | string; delay?: number; style?: StyleProp<ViewStyle>; children?: React.ReactNode } & React.ComponentProps<typeof View>) {
  // On a section switch the entrance shows at once (the screen itself crossfades).
  const still = useRef(ENTRANCES.has(k) && Date.now() - tabSwitchAt < 1200).current;
  const v = useRef(new Animated.Value(still ? 1 : 0)).current;
  useEffect(() => {
    if (still) return;
    const loop = ['jblink', 'jbreathe', 'jnudge', 'jspin', 'jpulse', 'jpulse2'].includes(k);
    const dur = k === 'jstamp' ? 500 : k === 'jbar' || k === 'jrise' ? 900 : k === 'jflip' ? 450 : k === 'jroll' ? 600 : k === 'jblink' ? 1100 : k === 'jspin' ? 1600 : k === 'jbreathe' ? 3000 : 2200;
    const start = k === 'jstamp' ? 700 : k === 'jbar' ? 250 : k === 'jrise' ? 200 : 0;
    const a = Animated.timing(v, { toValue: 1, duration: k === 'jr' ? 500 : dur, delay: delay + start, easing: k === 'jspin' ? Easing.linear : ease, useNativeDriver: native });
    if (loop) {
      const l = Animated.loop(Animated.timing(v, { toValue: 1, duration: dur, easing: k === 'jspin' ? Easing.linear : k === 'jblink' ? Easing.step0 : ease, useNativeDriver: native }));
      const t = setTimeout(() => l.start(), delay + (k === 'jnudge' ? 1000 : 0));
      return () => {
        clearTimeout(t);
        l.stop();
      };
    }
    a.start();
    return () => a.stop();
  }, [k, delay, v, still]);
  const flat = StyleSheet.flatten(style) ?? {};
  const base = (flat.transform as unknown[] | undefined) ?? [];
  let extra: Record<string, unknown> = {};
  let tr: unknown[] = [];
  switch (k) {
    case 'jr':
      extra = { opacity: v };
      tr = [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }];
      break;
    case 'jstamp':
      extra = { opacity: v.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }) };
      tr = [{ scale: v.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1.7, 0.94, 1] }) }, { rotate: v.interpolate({ inputRange: [0, 0.6, 1], outputRange: ['-16deg', '-1deg', '0deg'] }) }];
      break;
    case 'jbar':
      extra = { transformOrigin: 'left center' };
      tr = [{ scaleX: v }];
      break;
    case 'jrise':
      extra = { transformOrigin: 'bottom center' };
      tr = [{ scaleY: v }];
      break;
    case 'jflip':
      extra = { opacity: v, transformOrigin: 'top center' };
      tr = [{ perspective: 400 }, { rotateX: v.interpolate({ inputRange: [0, 1], outputRange: ['-80deg', '0deg'] }) }];
      break;
    case 'jroll':
      extra = { opacity: v };
      tr = [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }];
      break;
    case 'jblink':
      extra = { opacity: v.interpolate({ inputRange: [0, 0.5, 0.51, 1], outputRange: [1, 1, 0, 0] }) };
      break;
    case 'jpulse':
    case 'jpulse2':
      extra = { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }) };
      tr = [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }];
      break;
    case 'jbreathe':
      tr = [{ scale: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.06, 1] }) }];
      break;
    case 'jnudge':
      tr = [{ translateX: v.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: [0, 14, 0, 0] }) }];
      break;
    case 'jspin':
      tr = [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }];
      break;
    default:
      break;
  }
  return (
    <Animated.View {...rest} style={[flat, extra, { transform: [...base, ...tr] as never }]}>
      {children}
    </Animated.View>
  );
}
