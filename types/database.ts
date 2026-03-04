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
          created_at: string
          updated_at: string
          route_geojson: Json | null
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
          created_at?: string
          updated_at?: string
          route_geojson?: Json | null
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
          created_at?: string
          updated_at?: string
          route_geojson?: Json | null
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
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
