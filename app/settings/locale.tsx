import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSettings } from '@ui/hooks';
import { Card, Chip, IconButton, Screen, Text } from '@ui/components/primitives';

export default function LocaleSettingsRoute() {
  const router = useRouter();
  const s = useSettings();
  const set = (patch: Partial<typeof s.locale>) => s.set('locale', { ...s.locale, ...patch });
  return (
    <Screen title="Locale" right={<IconButton icon="xmark" bg onPress={() => router.back()} />}>
      <View style={{ gap: 14 }}>
        <Card style={{ gap: 8 }}>
          <Text variant="headline">Default currency</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AED', 'SGD', 'AUD', 'CAD'].map((c) => <Chip key={c} label={c} selected={s.locale.currency === c} onPress={() => set({ currency: c })} />)}
          </View>
        </Card>
        <Card style={{ gap: 8 }}>
          <Text variant="headline">Number & currency locale</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {['en-IN', 'en-US', 'en-GB', 'de-DE', 'ja-JP'].map((c) => <Chip key={c} label={c} selected={s.locale.locale === c} onPress={() => set({ locale: c })} />)}
          </View>
        </Card>
        <Card style={{ gap: 8 }}>
          <Text variant="headline">Date format</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'd MMM yyyy'].map((c) => <Chip key={c} label={c} selected={s.locale.dateFormat === c} onPress={() => set({ dateFormat: c })} />)}
          </View>
        </Card>
        <Card style={{ gap: 8 }}>
          <Text variant="headline">Time format</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[['h:mm a', '12-hour'], ['HH:mm', '24-hour']].map(([v, l]) => <Chip key={v} label={l} selected={s.locale.timeFormat === v} onPress={() => set({ timeFormat: v })} />)}
          </View>
        </Card>
      </View>
    </Screen>
  );
}
