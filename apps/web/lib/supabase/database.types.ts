export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          handle: string | null;
          display_name: string | null;
          bio: string | null;
          avatar_url: string | null;
          location: Json | null;
          role: Database['public']['Enums']['app_role'];
          is_banned: boolean;
          onboarding_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          handle?: string | null;
          display_name?: string | null;
          bio?: string | null;
          avatar_url?: string | null;
          location?: Json | null;
          role?: Database['public']['Enums']['app_role'];
          is_banned?: boolean;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      sports: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['sports']['Insert']>;
        Relationships: [];
      };
      listings: {
        Row: {
          id: string;
          seller_id: string;
          sport_id: string;
          category: Database['public']['Enums']['listing_category'];
          title: string;
          description: string | null;
          price: number;
          currency: string;
          condition: Database['public']['Enums']['listing_condition'];
          status: Database['public']['Enums']['listing_status'];
          details: Json;
          location_text: string | null;
          published_at: string | null;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          seller_id: string;
          sport_id: string;
          category?: Database['public']['Enums']['listing_category'];
          title: string;
          description?: string | null;
          price: number;
          currency?: string;
          condition?: Database['public']['Enums']['listing_condition'];
          status?: Database['public']['Enums']['listing_status'];
          details?: Json;
          location_text?: string | null;
          published_at?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['listings']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'listings_seller_id_fkey';
            columns: ['seller_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listings_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
        ];
      };
      listing_images: {
        Row: {
          id: string;
          listing_id: string;
          storage_path: string;
          alt_text: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          storage_path: string;
          alt_text?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['listing_images']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'listing_images_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      favorites: {
        Row: { user_id: string; listing_id: string; created_at: string };
        Insert: { user_id: string; listing_id: string; created_at?: string };
        Update: never;
        Relationships: [];
      };
      profile_sports: {
        Row: {
          profile_id: string;
          sport_id: string;
          skill_level: string | null;
          size_preferences: Json | null;
          preferences: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          sport_id: string;
          skill_level?: string | null;
          size_preferences?: Json | null;
          preferences?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profile_sports']['Insert']>;
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          listing_id: string | null;
          buyer_id: string;
          seller_id: string;
          status: Database['public']['Enums']['conversation_status'];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          listing_id?: string | null;
          buyer_id: string;
          seller_id: string;
          status?: Database['public']['Enums']['conversation_status'];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          read_at: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          read_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
        Relationships: [];
      };
      community_posts: {
        Row: {
          id: string;
          author_id: string;
          sport_id: string | null;
          post_type: Database['public']['Enums']['community_post_type'];
          title: string;
          body: string;
          status: Database['public']['Enums']['post_status'];
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          sport_id?: string | null;
          post_type?: Database['public']['Enums']['community_post_type'];
          title: string;
          body: string;
          status?: Database['public']['Enums']['post_status'];
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['community_posts']['Insert']>;
        Relationships: [];
      };
      comments: {
        Row: {
          id: string;
          post_id: string;
          author_id: string;
          parent_comment_id: string | null;
          body: string;
          status: Database['public']['Enums']['comment_status'];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          author_id: string;
          parent_comment_id?: string | null;
          body: string;
          status?: Database['public']['Enums']['comment_status'];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['comments']['Insert']>;
        Relationships: [];
      };
      community_reactions: {
        Row: { post_id: string; user_id: string; created_at: string };
        Insert: { post_id: string; user_id: string; created_at?: string };
        Update: never;
        Relationships: [];
      };
      push_tokens: {
        Row: {
          id: string;
          user_id: string;
          expo_push_token: string;
          platform: 'ios' | 'android';
          device_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          expo_push_token: string;
          platform: 'ios' | 'android';
          device_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['push_tokens']['Insert']>;
        Relationships: [];
      };
    };
    Views: {
      public_seller_profiles: {
        Row: {
          id: string | null;
          handle: string | null;
          display_name: string | null;
          avatar_url: string | null;
        };
        Relationships: [];
      };
      public_community_authors: {
        Row: {
          id: string | null;
          display_name: string | null;
          avatar_url: string | null;
        };
        Relationships: [];
      };
      community_post_reaction_counts: {
        Row: { post_id: string | null; like_count: number | null };
        Relationships: [];
      };
    };
    Functions: {
      mark_conversation_read: {
        Args: { p_conversation_id: string };
        Returns: number;
      };
      get_my_conversation_unread_counts: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{ conversation_id: string; unread_count: number }>;
      };
    };
    Enums: {
      app_role: 'user' | 'moderator' | 'admin';
      listing_category:
        | 'equipment'
        | 'apparel'
        | 'footwear'
        | 'protective'
        | 'accessories'
        | 'other';
      listing_condition: 'new' | 'like_new' | 'good' | 'fair' | 'poor';
      listing_status:
        | 'draft'
        | 'pending_review'
        | 'rejected'
        | 'active'
        | 'reserved'
        | 'sold'
        | 'archived'
        | 'removed';
      conversation_status: 'active' | 'archived' | 'blocked';
      community_post_type: 'discussion' | 'question' | 'guide' | 'meetup' | 'review';
      post_status: 'draft' | 'active' | 'hidden' | 'deleted';
      comment_status: 'active' | 'hidden' | 'deleted';
    };
    CompositeTypes: Record<string, never>;
  };
};

export type ListingRow = Database['public']['Tables']['listings']['Row'];
export type ListingImageRow = Database['public']['Tables']['listing_images']['Row'];
export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type SportRow = Database['public']['Tables']['sports']['Row'];
