// Lets the publish screen tell a mounted feed that the signed-in user has a new
// post, so the feed can refresh without refetching on every focus.
export type PostPublishedEvent = { userId: string };
type PostPublishedListener = (event: PostPublishedEvent) => void;

const listeners = new Set<PostPublishedListener>();

export const postPublishedEvents = {
  publish(event: PostPublishedEvent) {
    listeners.forEach((listener) => listener(event));
  },
  subscribe(listener: PostPublishedListener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
