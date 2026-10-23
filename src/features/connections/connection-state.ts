import type { Connection } from '@/lib/database.types';

// What the viewer can do with another student, from the pair's row (or none).
// 'none': no request, or the last one was declined, so either side may send one.
// 'outgoing': the viewer's request is waiting. 'incoming': the other student's
// request is waiting for the viewer. 'connected': both accepted.
export type ConnectionState = 'none' | 'outgoing' | 'incoming' | 'connected';

export function connectionStateFor(row: Pick<Connection, 'requester_id' | 'status'> | null, viewerId: string): ConnectionState {
  if (!row || row.status === 'declined') return 'none';
  if (row.status === 'accepted') return 'connected';
  return row.requester_id === viewerId ? 'outgoing' : 'incoming';
}

export function canonicalPair(first: string, second: string) {
  return first < second ? { low: first, high: second } : { low: second, high: first };
}

// The other student in a pair row.
export const otherInPair = (row: Pick<Connection, 'user_low' | 'user_high'>, viewerId: string) =>
  row.user_low === viewerId ? row.user_high : row.user_low;
