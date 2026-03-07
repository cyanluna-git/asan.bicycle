/**
 * Supabase Database type definitions.
 *
 * Generated manually to match the schema in:
 *   supabase/migrations/20260304000002_initial_schema.sql
 *
 * After the schema is live you can regenerate this file with:
 *   npx supabase gen types typescript --linked > types/database.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      start_points: {
        Row: {
          id: string
          name: string
          location: unknown // PostGIS geography – returned as GeoJSON or WKT depending on query
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          location: unknown
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          location?: unknown
          created_at?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          id: string
          title: string
          description: string | null
          difficulty: Database['public']['Enums']['course_difficulty']
          distance_km: number
          elevation_gain_m: number
          est_duration_min: number | null
          start_point_id: string | null
          start_point: unknown | null // PostGIS geography
          route: unknown | null // PostGIS geography
          gpx_url: string | null
          theme: string | null
          tags: string[]
          created_by: string | null
          uploader_name: string | null
          uploader_emoji: string | null
          created_at: string
          updated_at: string
          route_geojson: Json | null
          metadata_history: Json
          download_count: number
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          difficulty: Database['public']['Enums']['course_difficulty']
          distance_km: number
          elevation_gain_m?: number
          est_duration_min?: number | null
          start_point_id?: string | null
          start_point?: unknown | null
          route?: unknown | null
          gpx_url?: string | null
          theme?: string | null
          tags?: string[]
          created_by?: string | null
          uploader_name?: string | null
          uploader_emoji?: string | null
          created_at?: string
          updated_at?: string
          route_geojson?: Json | null
          metadata_history?: Json
          download_count?: number
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          difficulty?: Database['public']['Enums']['course_difficulty']
          distance_km?: number
          elevation_gain_m?: number
          est_duration_min?: number | null
          start_point_id?: string | null
          start_point?: unknown | null
          route?: unknown | null
          gpx_url?: string | null
          theme?: string | null
          tags?: string[]
          created_by?: string | null
          uploader_name?: string | null
          uploader_emoji?: string | null
          created_at?: string
          updated_at?: string
          route_geojson?: Json | null
          metadata_history?: Json
          download_count?: number
        }
        Relationships: [
          {
            foreignKeyName: 'courses_start_point_id_fkey'
            columns: ['start_point_id']
            isOneToOne: false
            referencedRelation: 'start_points'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'courses_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      admin_users: {
        Row: {
          email: string
          created_at: string
        }
        Insert: {
          email: string
          created_at?: string
        }
        Update: {
          email?: string
          created_at?: string
        }
        Relationships: []
      }
      course_reviews: {
        Row: {
          id: string
          course_id: string
          user_id: string
          rating: number
          content: string
          ridden_at: string | null
          perceived_difficulty: Database['public']['Enums']['course_difficulty'] | null
          condition_note: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
          author_name: string | null
          author_emoji: string | null
        }
        Insert: {
          id?: string
          course_id: string
          user_id: string
          rating: number
          content: string
          ridden_at?: string | null
          perceived_difficulty?: Database['public']['Enums']['course_difficulty'] | null
          condition_note?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
          author_name?: string | null
          author_emoji?: string | null
        }
        Update: {
          id?: string
          course_id?: string
          user_id?: string
          rating?: number
          content?: string
          ridden_at?: string | null
          perceived_difficulty?: Database['public']['Enums']['course_difficulty'] | null
          condition_note?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
          author_name?: string | null
          author_emoji?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'course_reviews_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
        ]
      }
      uphill_segments: {
        Row: {
          id: string
          course_id: string
          name: string | null
          start_km: number
          end_km: number
          created_at: string
        }
        Insert: {
          id?: string
          course_id: string
          name?: string | null
          start_km: number
          end_km: number
          created_at?: string
        }
        Update: {
          id?: string
          course_id?: string
          name?: string | null
          start_km?: number
          end_km?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'uphill_segments_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
        ]
      }
      pois: {
        Row: {
          id: string
          course_id: string
          name: string
          category: Database['public']['Enums']['poi_category']
          location: unknown // PostGIS geography
          photo_url: string | null
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          course_id: string
          name: string
          category: Database['public']['Enums']['poi_category']
          location: unknown
          photo_url?: string | null
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          course_id?: string
          name?: string
          category?: Database['public']['Enums']['poi_category']
          location?: unknown
          photo_url?: string | null
          description?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'pois_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      course_review_stats: {
        Row: {
          course_id: string | null
          review_count: number | null
          avg_rating: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'course_reviews_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
        ]
      }
      course_reviews_public: {
        Row: {
          id: string | null
          course_id: string | null
          user_id: string | null
          rating: number | null
          content: string | null
          ridden_at: string | null
          perceived_difficulty: Database['public']['Enums']['course_difficulty'] | null
          condition_note: string | null
          created_at: string | null
          updated_at: string | null
          author_name: string | null
          author_emoji: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'course_reviews_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
        ]
      }
      pois_with_coords: {
        Row: {
          id: string
          course_id: string
          name: string
          category: Database['public']['Enums']['poi_category']
          description: string | null
          photo_url: string | null
          created_at: string
          lat: number
          lng: number
        }
        Relationships: [
          {
            foreignKeyName: 'pois_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Functions: {
      increment_course_download_count: {
        Args: {
          p_course_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      course_difficulty: 'easy' | 'moderate' | 'hard'
      poi_category:
        | 'rest_area'
        | 'cafe'
        | 'restaurant'
        | 'convenience_store'
        | 'repair_shop'
        | 'photo_spot'
        | 'parking'
        | 'restroom'
        | 'water_fountain'
        | 'other'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience type aliases
// ---------------------------------------------------------------------------

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type InsertDto<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type UpdateDto<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]
