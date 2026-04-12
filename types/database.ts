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
          region_id: string | null
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
          route_preview_points: Json | null
          route_render_metadata: Json | null
          metadata_history: Json
          download_count: number
          surface_type: 'road' | 'gravel' | 'mtb' | null
          source_url: string | null
          preview_image_url: string | null
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
          region_id?: string | null
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
          route_preview_points?: Json | null
          route_render_metadata?: Json | null
          metadata_history?: Json
          download_count?: number
          surface_type?: 'road' | 'gravel' | 'mtb' | null
          source_url?: string | null
          preview_image_url?: string | null
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
          region_id?: string | null
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
          route_preview_points?: Json | null
          route_render_metadata?: Json | null
          metadata_history?: Json
          download_count?: number
          surface_type?: 'road' | 'gravel' | 'mtb' | null
          source_url?: string | null
          preview_image_url?: string | null
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
            foreignKeyName: 'courses_region_id_fkey'
            columns: ['region_id']
            isOneToOne: false
            referencedRelation: 'regions'
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
      course_album_photos: {
        Row: {
          id: string
          course_id: string
          user_id: string
          storage_path: string
          public_url: string
          location: unknown | null // PostGIS geography
          taken_at: string | null
          caption: string | null
          width: number | null
          height: number | null
          source_exif_json: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          course_id: string
          user_id: string
          storage_path: string
          public_url: string
          location?: unknown | null
          taken_at?: string | null
          caption?: string | null
          width?: number | null
          height?: number | null
          source_exif_json?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          course_id?: string
          user_id?: string
          storage_path?: string
          public_url?: string
          location?: unknown | null
          taken_at?: string | null
          caption?: string | null
          width?: number | null
          height?: number | null
          source_exif_json?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'course_album_photos_course_id_fkey'
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
      regions: {
        Row: {
          id: string
          name: string
          short_name: string
          code: string
          level: 'sido' | 'sigungu'
          parent_id: string | null
          geom: unknown | null // PostGIS geography(MultiPolygon, 4326)
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          short_name: string
          code: string
          level: 'sido' | 'sigungu'
          parent_id?: string | null
          geom?: unknown | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          short_name?: string
          code?: string
          level?: 'sido' | 'sigungu'
          parent_id?: string | null
          geom?: unknown | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'regions_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'regions'
            referencedColumns: ['id']
          },
        ]
      }
      user_profiles: {
        Row: {
          id: string
          display_name: string | null
          emoji: string
          home_region_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          emoji?: string
          home_region_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          emoji?: string
          home_region_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_profiles_home_region_id_fkey'
            columns: ['home_region_id']
            isOneToOne: false
            referencedRelation: 'regions'
            referencedColumns: ['id']
          },
        ]
      }
      famous_uphills: {
        Row: {
          id: string
          strava_segment_id: number | null
          name: string
          distance_m: number | null
          avg_grade: number | null
          max_grade: number | null
          elevation_gain_m: number | null
          climb_category: number | null
          start_latlng: unknown // PostGIS geography(Point, 4326)
          end_latlng: unknown // PostGIS geography(Point, 4326)
          route: unknown // PostGIS geography(LineString, 4326)
          raw_strava: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          strava_segment_id?: number | null
          name: string
          distance_m?: number | null
          avg_grade?: number | null
          max_grade?: number | null
          elevation_gain_m?: number | null
          climb_category?: number | null
          start_latlng?: unknown
          end_latlng?: unknown
          route?: unknown
          raw_strava?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          strava_segment_id?: number | null
          name?: string
          distance_m?: number | null
          avg_grade?: number | null
          max_grade?: number | null
          elevation_gain_m?: number | null
          climb_category?: number | null
          start_latlng?: unknown
          end_latlng?: unknown
          route?: unknown
          raw_strava?: Json | null
          created_at?: string | null
        }
        Relationships: []
      }
      course_uphills: {
        Row: {
          course_id: string
          famous_uphill_id: string
          matched_at: string | null
          chart_start_km: number | null
          chart_end_km: number | null
        }
        Insert: {
          course_id: string
          famous_uphill_id: string
          matched_at?: string | null
          chart_start_km?: number | null
          chart_end_km?: number | null
        }
        Update: {
          course_id?: string
          famous_uphill_id?: string
          matched_at?: string | null
          chart_start_km?: number | null
          chart_end_km?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'course_uphills_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'course_uphills_famous_uphill_id_fkey'
            columns: ['famous_uphill_id']
            isOneToOne: false
            referencedRelation: 'famous_uphills'
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
      course_album_photos_with_coords: {
        Row: {
          id: string | null
          course_id: string | null
          user_id: string | null
          storage_path: string | null
          public_url: string | null
          taken_at: string | null
          caption: string | null
          width: number | null
          height: number | null
          source_exif_json: Json | null
          created_at: string | null
          updated_at: string | null
          lat: number | null
          lng: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'course_album_photos_course_id_fkey'
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
      detect_region_by_point: {
        Args: {
          p_lng: number
          p_lat: number
        }
        Returns: Array<{
          region_id: string
          region_name: string
          parent_name: string | null
        }>
      }
      match_course_uphills: {
        Args: {
          p_course_id: string
        }
        Returns: number
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
