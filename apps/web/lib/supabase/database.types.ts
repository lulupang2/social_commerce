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
      profiles: {
        Row: {
          id: string;
          handle: string | null;
          display_name: string | null;
          avatar_url: string | null;
        };
        Insert: {
          id: string;
          handle?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      app_role: 'user' | 'moderator' | 'admin';
      listing_category:
        | 'equipment'
        | 'apparel'
        | 'protective_gear'
        | 'accessories'
        | 'parts'
        | 'other';
      listing_condition: 'new' | 'like_new' | 'good' | 'fair' | 'poor';
      listing_status:
        | 'draft'
        | 'pending_review'
        | 'active'
        | 'reserved'
        | 'sold'
        | 'archived'
        | 'removed';
    };
    CompositeTypes: Record<string, never>;
  };
};

export type ListingRow = Database['public']['Tables']['listings']['Row'];
export type ListingImageRow = Database['public']['Tables']['listing_images']['Row'];
export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type SportRow = Database['public']['Tables']['sports']['Row'];
