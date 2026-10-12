import { useCallback, useMemo, useState } from 'react';

type Toggle = 'liked' | 'saved' | 'joined';
type State = Record<Toggle, ReadonlySet<string>> & { votes: Readonly<Record<string, string>> };

const initial: State = { liked: new Set(), saved: new Set(), joined: new Set(), votes: {} };

// Likes, bookmarks, poll votes and event joins on sample posts. Held in memory
// for the life of the Home screen only: nothing is sent to Supabase.
export function useSampleInteractions() {
  const [state, setState] = useState(initial);
  const toggle = useCallback((key: Toggle, postId: string) => setState((current) => {
    const next = new Set(current[key]);
    if (!next.delete(postId)) next.add(postId);
    return { ...current, [key]: next };
  }), []);
  const vote = useCallback((postId: string, optionId: string) => setState((current) => (
    { ...current, votes: { ...current.votes, [postId]: optionId } }
  )), []);
  return useMemo(() => ({ ...state, toggle, vote }), [state, toggle, vote]);
}

export type SampleInteractions = ReturnType<typeof useSampleInteractions>;
