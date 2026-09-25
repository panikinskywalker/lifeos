import React from 'react';
import { Pressable, View } from 'react-native';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import type { TintKey } from '../theme/tokens';
import { Button } from './Button';
import { IconBox } from './IconBox';
import { Surface } from './Surface';
import { Text } from './Text';

type Head = { icon: IconName | (string & {}); tint?: TintKey };

/** A user message in the Talk thread: tile bubble on the right, 18/18/4/18 corners, 15/600. */
export function ChatBubble({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View style={{ alignSelf: 'flex-end', maxWidth: '78%', backgroundColor: t.c.bg.tile, borderRadius: 18, borderBottomRightRadius: 4, paddingVertical: 12, paddingHorizontal: 14 }}>
      <Text variant="body" selectable style={{ lineHeight: 21 }}>
        {text}
      </Text>
    </View>
  );
}

/**
 * The agent's reply card (tile, radius 16, padding 14, 28 in from the right):
 * record (filed, with Undo, the next due and where it was filed) · confirm
 * (money and people ask first) · number · list.
 */
export function AgentCard(
  props:
    | ({ kind: 'record'; title: string; detail?: string; next?: string; filedUnder?: string; onUndo?: () => void; onPress?: () => void } & Head)
    | ({ kind: 'confirm'; title: string; detail?: string; onConfirm: () => void; onEdit?: () => void; confirmLabel?: string } & Head)
    | ({ kind: 'number'; label: string; value: string; detail?: string } & Head)
    | { kind: 'list'; label: string; items: Array<{ id: string; title: string; subtitle?: string; value?: string } & Head> },
) {
  const t = useTheme();
  const shell = (children: React.ReactNode) => (
    <View style={{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.card, padding: 14, gap: 10, marginRight: 28 }}>
      <Surface kind="tile">{children}</Surface>
    </View>
  );
  if (props.kind === 'list') {
    return shell(
      <>
        <Text variant="label" color="secondary">
          {props.label}
        </Text>
        <View style={{ gap: 10 }}>
          {props.items.map((it) => (
            <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <IconBox icon={it.icon} tint={it.tint} size={28} />
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text variant="tileTitle">{it.title}</Text>
                {it.subtitle ? (
                  <Text variant="caption" color="secondary" style={{ fontSize: 12 }}>
                    {it.subtitle}
                  </Text>
                ) : null}
              </View>
              {it.value ? (
                <Text variant="tileTitle" style={{ fontVariant: ['tabular-nums'] }}>
                  {it.value}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      </>,
    );
  }
  if (props.kind === 'number') {
    return shell(
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconBox icon={props.icon} tint={props.tint} />
          <Text variant="label" color="secondary" style={{ flex: 1 }}>
            {props.label}
          </Text>
        </View>
        <Text variant="stat" style={{ fontSize: 32, lineHeight: 34 }}>
          {props.value}
        </Text>
        {props.detail ? (
          <Text variant="caption" color="secondary">
            {props.detail}
          </Text>
        ) : null}
      </>,
    );
  }
  if (props.kind === 'confirm') {
    return shell(
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconBox icon={props.icon} tint={props.tint} />
          <Text variant="rowTitle" style={{ flex: 1 }}>
            {props.title}
          </Text>
        </View>
        {props.detail ? (
          <Text variant="caption" color="secondary">
            {props.detail}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title={props.confirmLabel ?? 'Confirm'} icon="check" size="sm" onPress={props.onConfirm} />
          {props.onEdit ? <Button title="Edit" icon="edit" variant="secondary" size="sm" onPress={props.onEdit} /> : null}
        </View>
      </>,
    );
  }
  return shell(
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconBox icon={props.icon} tint={props.tint} />
        <Text variant="rowTitle" style={{ flex: 1 }} numberOfLines={2}>
          {props.title}
        </Text>
        {props.onUndo ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Undo" hitSlop={10} onPress={props.onUndo} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="undo" size={14} color={t.c.fg.secondary} />
            <Text variant="label" color="secondary">
              Undo
            </Text>
          </Pressable>
        ) : null}
      </View>
      {props.detail ? <Text variant="body">{props.detail}</Text> : null}
      {props.next ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.c.bg.tileRaised, borderRadius: t.radius.iconBox, paddingVertical: 8, paddingHorizontal: 10 }}>
          <Icon name="repeat" size={14} color={props.tint ? t.tints[props.tint].ink : t.c.fg.secondary} />
          <Text variant="label" color="secondary">
            {props.next}
          </Text>
        </View>
      ) : null}
      {props.filedUnder ? (
        <Pressable disabled={!props.onPress} onPress={props.onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="link" size={13} color={t.c.fg.tertiary} />
          <Text variant="caption" color="secondary" style={{ fontSize: 12 }}>
            Filed under {props.filedUnder}
          </Text>
        </Pressable>
      ) : null}
    </>,
  );
}
