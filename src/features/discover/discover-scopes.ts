export const discoverScopes = [
  { key: 'students', label: 'Students' },
  { key: 'posts', label: 'Posts' },
] as const;
export type DiscoverScope = typeof discoverScopes[number]['key'];

// What the Posts pane shows. `key` is the search as typed; `postsKey` is the search
// the mounted post list belongs to, which only follows `key` (after the debounce)
// while Posts is the active scope.
//  - mounted: a post list exists and keeps its results and scroll position.
//  - shown: that list is on screen and may load pages and images.
//  - pending: Posts is active and waiting for the debounce to reach `key`.
export function postsPaneState(scope: DiscoverScope, key: string, postsKey: string) {
  const active = scope === 'posts';
  const current = key.length > 0 && key === postsKey;
  return {
    mounted: postsKey.length > 0,
    current,
    shown: active && current,
    pending: active && key.length > 0 && !current,
  };
}
