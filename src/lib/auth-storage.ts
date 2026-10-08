import * as SecureStore from 'expo-secure-store';

// Session payloads can exceed a single Keychain item limit. Publish a manifest
// only after every new chunk is saved, keeping the previous session intact on failure.
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
type Manifest = { generation: string; count: number };
async function readManifest(key: string): Promise<Manifest | null> {
  const value = await SecureStore.getItemAsync(key, options);
  if (!value) return null;
  const manifest: unknown = JSON.parse(value);
  if (!manifest || typeof manifest !== 'object' || !('generation' in manifest) || !('count' in manifest)
    || typeof manifest.generation !== 'string' || !/^[a-z0-9-]+$/.test(manifest.generation)
    || typeof manifest.count !== 'number' || !Number.isInteger(manifest.count) || manifest.count < 1 || manifest.count > 2048) {
    throw new Error('Invalid session storage manifest');
  }
  return manifest as Manifest;
}
const chunkKey = (key: string, manifest: Manifest, index: number) => `${key}.${manifest.generation}.${index}`;
async function removeChunks(key: string, manifest: Manifest | null) {
  if (!manifest) return;
  await Promise.all(Array.from({ length: manifest.count }, (_, index) => SecureStore.deleteItemAsync(chunkKey(key, manifest, index), options)));
}

export const nativeAuthStorage = {
  async getItem(key: string) {
    const manifest = await readManifest(key);
    if (!manifest) return null;
    const chunks = await Promise.all(Array.from({ length: manifest.count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, manifest, index), options)));
    if (chunks.some(chunk => chunk === null)) throw new Error('Incomplete saved session');
    return chunks.join('');
  },
  async setItem(key: string, value: string) {
    const previous = await readManifest(key);
    // Preserve Unicode characters; 400 code points fit below 2KB per item.
    const characters = Array.from(value);
    const chunks: string[] = [];
    for (let index = 0; index < characters.length; index += 400) chunks.push(characters.slice(index, index + 400).join(''));
    if (!chunks.length) chunks.push('');
    if (chunks.length > 2048) throw new Error('Session exceeds storage limit');
    const manifest = { generation: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, count: chunks.length };
    try {
      for (let index = 0; index < chunks.length; index += 1) {
        await SecureStore.setItemAsync(chunkKey(key, manifest, index), chunks[index], options);
      }
      await SecureStore.setItemAsync(key, JSON.stringify(manifest), options);
    } catch (error) {
      await removeChunks(key, manifest).catch(() => {});
      throw error;
    }
    // Obsolete chunks cannot restore a session once the manifest is replaced.
    await removeChunks(key, previous).catch(() => {});
  },
  async removeItem(key: string) {
    const manifest = await readManifest(key);
    await SecureStore.deleteItemAsync(key, options);
    await removeChunks(key, manifest).catch(() => {});
  },
};
