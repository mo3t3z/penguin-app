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
// A participant column is null once that student has deleted their account.
export type Conversation = {
  id: string;
  user_low: string | null;
  user_high: string | null;
  created_by: string | null;
  created_at: string;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  last_message_preview: string | null;
};
// sender_id is null when the sender has deleted their account.
export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  content: string;
  created_at: string;
};
export type MessageSendResult = Message & { idempotent_replay: boolean };
export type ConversationRead = { conversation_id: string; user_id: string; last_read_at: string };
export type UserBlock = { blocker_id: string; blocked_id: string; created_at: string };
export type GroupRole = 'owner' | 'admin' | 'member';
export type GroupStatus = 'active' | 'archived';
// creator_id, client_request_id and member_count exist in the table but are not
// readable by the app: SQL column grants leave them out. A viewer's member count
// comes from get_group_viewer_summaries.
export type Group = {
  id: string;
  name: string;
  description: string | null;
  visibility: 'public';
  status: GroupStatus;
  created_at: string;
  updated_at: string;
};
export type GroupMember = { group_id: string; user_id: string; role: GroupRole; joined_at: string };
export type GroupCreateResult = Pick<Group, 'id' | 'name' | 'description' | 'status' | 'created_at'> & { idempotent_replay: boolean };
export type GroupJoinResult = GroupMember & { already_member: boolean };
// Per group: the actual number of members, how many of them are unavailable to this
// viewer (a number only, nothing about who), and the viewer's own role.
// my_role and role report an admin as 'member', for app code that predates roles;
// my_group_role and group_role (present since the roles migration) hold the full role.
export type GroupViewerSummary = {
  group_id: string; member_count: number; unavailable_member_count: number; my_role: GroupRole | null;
  my_group_role?: GroupRole | null;
};
export type GroupMemberListing = Pick<GroupMember, 'user_id' | 'role' | 'joined_at'>
  & Pick<Profile, 'username' | 'display_name' | 'avatar_url'> & { group_role?: GroupRole };
// A banned student, as staff may see them. Never who placed the ban.
export type GroupBanListing = Pick<Profile, 'username' | 'display_name' | 'avatar_url'> & {
  banned_id: string; banned_at: string; can_unban: boolean;
};
export type GroupAdminEventAction =
  | 'member_promoted' | 'admin_demoted' | 'member_removed' | 'member_banned'
  | 'member_unbanned' | 'ownership_transferred' | 'details_updated';
// One administrative action. Names only: no account identifier is returned.
export type GroupAdminEventListing = {
  id: string; action: GroupAdminEventAction; created_at: string;
  actor_username: string | null; actor_display_name: string | null; actor_missing: boolean;
  target_username: string | null; target_display_name: string | null; target_missing: boolean;
  detail: string | null;
};

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

      conversations: {
        Row: Conversation;
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: 'conversations_user_low_fkey'; columns: ['user_low']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'conversations_user_high_fkey'; columns: ['user_high']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      messages: {
        Row: Message;
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: 'messages_conversation_id_fkey'; columns: ['conversation_id']; isOneToOne: false; referencedRelation: 'conversations'; referencedColumns: ['id'] },
          { foreignKeyName: 'messages_sender_id_fkey'; columns: ['sender_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      conversation_reads: {
        Row: ConversationRead;
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: 'conversation_reads_conversation_id_fkey'; columns: ['conversation_id']; isOneToOne: false; referencedRelation: 'conversations'; referencedColumns: ['id'] },
        ];
      };
      user_blocks: {
        Row: UserBlock;
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: 'user_blocks_blocked_id_fkey'; columns: ['blocked_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      groups: {
        Row: Group;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      group_members: {
        Row: GroupMember;
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: 'group_members_group_id_fkey'; columns: ['group_id']; isOneToOne: false; referencedRelation: 'groups'; referencedColumns: ['id'] },
          { foreignKeyName: 'group_members_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
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
      get_or_create_conversation: {
        Args: { p_other_user_id: string };
        Returns: string;
      };
      send_message_idempotent: {
        Args: { p_message_id: string; p_conversation_id: string; p_content: string };
        Returns: MessageSendResult[];
      };
      block_user: { Args: { p_blocked_id: string }; Returns: undefined };
      unblock_user: { Args: { p_blocked_id: string }; Returns: undefined };
      mark_conversation_read: { Args: { p_conversation_id: string }; Returns: undefined };
      get_read_receipt: { Args: { p_conversation_id: string }; Returns: string | null };
      create_group_idempotent: {
        Args: { p_request_id: string; p_name: string; p_description: string | null };
        Returns: GroupCreateResult[];
      };
      join_group: { Args: { p_group_id: string }; Returns: GroupJoinResult[] };
      leave_group: { Args: { p_group_id: string }; Returns: boolean };
      get_group_viewer_summaries: { Args: { p_group_ids: string[] }; Returns: GroupViewerSummary[] };
      list_group_members: {
        Args: { p_group_id: string; p_after_joined_at?: string | null; p_after_user_id?: string | null; p_limit?: number };
        Returns: GroupMemberListing[];
      };
      promote_group_member: { Args: { p_group_id: string; p_member_id: string }; Returns: GroupRole };
      demote_group_admin: { Args: { p_group_id: string; p_member_id: string }; Returns: GroupRole };
      transfer_group_ownership: { Args: { p_group_id: string; p_new_owner_id: string }; Returns: boolean };
      remove_group_member: { Args: { p_group_id: string; p_member_id: string }; Returns: boolean };
      ban_group_member: { Args: { p_group_id: string; p_member_id: string }; Returns: boolean };
      unban_group_member: { Args: { p_group_id: string; p_banned_id: string }; Returns: boolean };
      update_group_details: {
        Args: { p_group_id: string; p_name: string; p_description: string | null };
        Returns: Pick<Group, 'id' | 'name' | 'description' | 'updated_at'>[];
      };
      list_group_bans: {
        Args: { p_group_id: string; p_before_banned_at?: string | null; p_before_banned_id?: string | null; p_limit?: number };
        Returns: GroupBanListing[];
      };
      list_group_admin_events: {
        Args: { p_group_id: string; p_before_created_at?: string | null; p_before_id?: string | null; p_limit?: number };
        Returns: GroupAdminEventListing[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
