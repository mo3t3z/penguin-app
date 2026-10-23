import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import { updateCurrentProfile } from './service';

export type ProfilePhotoKind = 'avatar' | 'cover';

// Square 512px portraits; 1500x500 covers, both JPEG.
const shapes = {
  avatar: { aspect: [1, 1] as [number, number], width: 512 },
  cover: { aspect: [3, 1] as [number, number], width: 1500 },
};
const BUCKET = 'profile-photos';

// Asks for one image, crops it to the photo's shape and uploads it under the
// student's own folder, then points the profile at it. Returns false when the
// student cancels the picker.
export async function pickAndUploadProfilePhoto(userId: string, kind: ProfilePhotoKind) {
  if (!supabase) throw new Error('Profile photos are not configured.');
  const shape = shapes[kind];
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsEditing: true, aspect: shape.aspect, quality: 1,
  });
  if (picked.canceled || !picked.assets[0]) return false;
  const context = ImageManipulator.manipulate(picked.assets[0].uri);
  context.resize({ width: shape.width });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
  const body = await (await fetch(saved.uri)).arrayBuffer();
  const path = `${userId}/${kind}-${Crypto.randomUUID()}.jpg`;
  const upload = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (upload.error) throw upload.error;
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  await updateCurrentProfile(kind === 'avatar' ? { avatar_url: url } : { cover_url: url });
  return true;
}
