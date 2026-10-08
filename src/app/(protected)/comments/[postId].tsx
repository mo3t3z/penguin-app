import { useLocalSearchParams } from 'expo-router';
import { CommentsScreen } from '@/features/comments/comments-screen';

export default function PostCommentsRoute() {
  const params = useLocalSearchParams<{ postId?: string | string[] }>();
  const postId = Array.isArray(params.postId) ? params.postId[0] ?? '' : params.postId ?? '';
  return <CommentsScreen key={postId} postId={postId} />;
}
