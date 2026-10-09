// Keeps like state consistent between feed lists that show the same post (Home,
// the Profile tab, a student profile). Each list publishes its own like changes
// and applies the changes published by the others.
export type PostLikeEvent = {
  userId: string;
  postId: string;
  count: number;
  likedByMe: boolean;
  // Identifies the publishing list so it can ignore its own events.
  source: object;
};
type PostLikeListener = (event: PostLikeEvent) => void;

const listeners = new Set<PostLikeListener>();

export const postLikeEvents = {
  publish(event: PostLikeEvent) {
    listeners.forEach((listener) => listener(event));
  },
  subscribe(listener: PostLikeListener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
