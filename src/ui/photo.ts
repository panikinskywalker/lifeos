import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Claude refuses an image with a side over 8,000 pixels (API 400), which a
 * long receipt or a 50 MP photo goes over. A photo with a side over this is
 * shrunk on the phone before it is sent, as a JPEG; smaller ones go as they are.
 */
export const PHOTO_MAX_SIDE = 4000;

export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
  base64?: string | null;
  mimeType?: string | null;
}

export async function photoForClaude(a: PickedPhoto): Promise<{ base64: string; mimeType: string } | null> {
  const long = Math.max(a.width, a.height);
  if (long <= PHOTO_MAX_SIDE && a.base64) return { base64: a.base64, mimeType: a.mimeType ?? 'image/jpeg' };
  const size = a.width >= a.height ? { width: Math.min(a.width, PHOTO_MAX_SIDE) } : { height: Math.min(a.height, PHOTO_MAX_SIDE) };
  const image = await ImageManipulator.manipulate(a.uri).resize(size).renderAsync();
  const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.6, base64: true });
  return out.base64 ? { base64: out.base64, mimeType: 'image/jpeg' } : null;
}
