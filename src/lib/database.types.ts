// Hand-maintained contract for Sprint 2A and 3A migrations; not generated from a live DB.
export type StudyLevel = 'secondary' | 'vocational' | 'undergraduate' | 'postgraduate' | 'doctoral' | 'other';

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  institution_id: string | null;
  field_id: string | null;
  study_level: StudyLevel | null;
  bio: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};
export type Institution = {
  id: string; name: string; slug: string; country: string; city: string | null; created_at: string;
};
export type Field = { id: string; name: string; slug: string; created_at: string };
export type ProfileUpdate = Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>;

export type Post = {
  id: string; author_id: string; client_request_id: string; content: string; created_at: string; updated_at: string;
};
// Includes server-only columns for the Edge Function contract. SQL column grants,
// not TypeScript, enforce which fields the authenticated mobile role can access.
export type PostMediaRecord = {
  id: string; post_id: string; storage_provider: string; storage_key: string;
  storage_version: string | null; upload_key: string; upload_expires_at: string;
  status: 'pending' | 'finalizing' | 'ready'; mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
  size_bytes: number; width: number | null; height: number | null; position: number;
  created_at: string; updated_at: string;
};
export type PostLike = {
  post_id: string;
  user_id: string;
  created_at: string;
};
export type PostLikeSummary = {
  post_id: string;
  like_count: number;
  liked_by_me: boolean;
};
export type PostComment = {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};
export type PostCommentCreateResult = PostComment & { idempotent_replay: boolean };
export type PostCommentCount = { post_id: string; comment_count: number };

export type Database = {
  public: {
    Tables: {
      posts: {
        Row: Post;
        Insert: Pick<Post, 'content'> & Partial<Post>;
        Update: Partial<Post>;
        Relationships: [
          { foreignKeyName: 'posts_author_id_fkey'; columns: ['author_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      post_media: {
        Row: PostMediaRecord;
        Insert: Pick<PostMediaRecord, 'post_id' | 'storage_provider' | 'storage_key' | 'upload_key' | 'upload_expires_at' | 'mime_type' | 'size_bytes' | 'position'> & Partial<PostMediaRecord>;
        Update: Partial<PostMediaRecord>;
        Relationships: [
          { foreignKeyName: 'post_media_post_id_fkey'; columns: ['post_id']; isOneToOne: false; referencedRelation: 'posts'; referencedColumns: ['id'] },
        ];
      };
      post_likes: {
        Row: PostLike;
        Insert: Pick<PostLike, 'post_id'> & Partial<Pick<PostLike, 'user_id' | 'created_at'>>;
        Update: never;
        Relationships: [
          { foreignKeyName: 'post_likes_post_id_fkey'; columns: ['post_id']; isOneToOne: false; referencedRelation: 'posts'; referencedColumns: ['id'] },
          { foreignKeyName: 'post_likes_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      post_comments: {
        Row: PostComment;
        Insert: Pick<PostComment, 'post_id' | 'content'> & Partial<Pick<PostComment, 'id' | 'author_id' | 'created_at' | 'updated_at'>>;
        Update: never;
        Relationships: [
          { foreignKeyName: 'post_comments_post_id_fkey'; columns: ['post_id']; isOneToOne: false; referencedRelation: 'posts'; referencedColumns: ['id'] },
          { foreignKeyName: 'post_comments_author_id_fkey'; columns: ['author_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };

      profiles: {
        Row: Profile;
        Insert: Pick<Profile, 'id'> & Partial<Omit<Profile, 'id'>>;
        Update: ProfileUpdate;
        Relationships: [
          { foreignKeyName: 'profiles_institution_id_fkey'; columns: ['institution_id']; isOneToOne: false; referencedRelation: 'institutions'; referencedColumns: ['id'] },
          { foreignKeyName: 'profiles_field_id_fkey'; columns: ['field_id']; isOneToOne: false; referencedRelation: 'fields'; referencedColumns: ['id'] },
        ];
      };
      institutions: {
        Row: Institution;
        Insert: Pick<Institution, 'name' | 'slug' | 'country'> & Partial<Institution>;
        Update: Partial<Institution>;
        Relationships: [];
      };
      fields: {
        Row: Field;
        Insert: Pick<Field, 'name' | 'slug'> & Partial<Field>;
        Update: Partial<Field>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_post_idempotent: {
        Args: { p_content: string; p_client_request_id: string };
        Returns: (Post & { idempotent_replay: boolean })[];
      };
      get_post_like_summaries: {
        Args: { p_post_ids: string[] };
        Returns: PostLikeSummary[];
      };
      create_post_comment_idempotent: {
        Args: { p_comment_id: string; p_post_id: string; p_content: string };
        Returns: PostCommentCreateResult[];
      };
      get_post_comment_counts: {
        Args: { p_post_ids: string[] };
        Returns: PostCommentCount[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
