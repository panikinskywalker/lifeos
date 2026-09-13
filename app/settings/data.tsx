import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useOS } from '@ui/hooks';
import { Button, Card, IconButton, Screen, Text } from '@ui/components/primitives';
import { exportAll } from '../../src/platform/exportImport';

export default function DataSettingsRoute() {
  const os = useOS();
  const router = useRouter();
  const [status, setStatus] = useState('');
  const doExport = async () => {
    const json = JSON.stringify(exportAll(os));
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(json);
      setStatus(`Copied ${Math.round(json.length / 1024)} KB of JSON to clipboard.`);
      return;
    }
    const f = new File(Paths.cache, `lifeos-backup-${new Date().toISOString().slice(0, 10)}.json`);
    f.write(json);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType: 'application/json' });
    setStatus(`Exported ${Math.round(json.length / 1024)} KB.`);
  };
  return (
    <Screen title="Data" right={<IconButton icon="xmark" bg onPress={() => router.back()} />}>
      <View style={{ gap: 14 }}>
        <Card style={{ gap: 10 }}>
          <Text variant="headline">Backup</Text>
          <Text variant="footnote" color="secondary">Everything — records, relations, timeline, tags, reminders, views, dashboards, rules — as one JSON file. Attachments are referenced by path, not embedded.</Text>
          <Button title="Export JSON" icon="square.and.arrow.up" onPress={() => void doExport()} />
          {status ? <Text variant="footnote" color="secondary">{status}</Text> : null}
        </Card>
        <Card style={{ gap: 6 }}>
          <Text variant="headline">Sync</Text>
          <Text variant="footnote" color="secondary">Not connected. The schema already records every change with versions and tombstones, so a sync backend (self-hosted or cloud) can be added later without migrating data.</Text>
        </Card>
      </View>
    </Screen>
  );
}
