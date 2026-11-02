import { Directory } from 'expo-file-system';
import type { DeviceBridge } from '@core/registry/context';
import type { Device as DeviceModule } from '../../modules/lifeos-device';

/** Android's FLAG_GRANT_READ_URI_PERMISSION: the viewer may read the file we hold access to. */
const GRANT_READ = 1;
const MAX_FILES = 5000;

/**
 * Folders you picked on the phone (R7c), for Documents: Android's folder
 * picker (expo-file-system, which keeps the access across restarts), the
 * device module's one-query-per-folder listing, and the phone's own viewer.
 */
export function foldersBridge(device: NonNullable<typeof DeviceModule>): NonNullable<DeviceBridge['folders']> {
  return {
    pick: async () => {
      try {
        const dir = await Directory.pickDirectoryAsync();
        const uri = dir.uri.replace(/\/$/, '');
        return { uri, name: dir.name || decodeURIComponent(uri.split('%3A').pop() ?? 'Folder') };
      } catch {
        return null; // cancelled
      }
    },
    list: (uri) => device.listFolder(uri, MAX_FILES),
    open: async (uri, mime) => {
      const IntentLauncher = await import('expo-intent-launcher');
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: uri, type: mime || '*/*', flags: GRANT_READ });
    },
  };
}
