import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

/** Copy a picked file into the app's persistent attachments folder. */
export async function persistAttachment(sourceUri: string, name: string): Promise<string> {
  if (Platform.OS === 'web') return sourceUri;
  try {
    const dir = new Directory(Paths.document, 'attachments');
    if (!dir.exists) dir.create({ intermediates: true });
    const safe = `${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const dest = new File(dir, safe);
    const src = new File(sourceUri);
    src.copy(dest);
    return dest.uri;
  } catch (e) {
    console.warn('persistAttachment failed, keeping original uri', e);
    return sourceUri;
  }
}

export function attachmentsDirectory(): Directory | null {
  if (Platform.OS === 'web') return null;
  return new Directory(Paths.document, 'attachments');
}
