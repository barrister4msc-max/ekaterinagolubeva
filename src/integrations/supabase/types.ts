export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      lead_documents: {
        Row: {
          created_at: string | null
          file_url: string | null
          id: string
          lead_id: string | null
        }
        Insert: {
          created_at?: string | null
          file_url?: string | null
          id?: string
          lead_id?: string | null
        }
        Update: {
          created_at?: string | null
          file_url?: string | null
          id?: string
          lead_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_documents_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          admin_notes: string | null
          ai_summary: string | null
          category: string | null
          contact: string | null
          created_at: string
          documents_checklist: string[]
          id: string
          landing_url: string | null
          name: string
          next_step: string | null
          original_text: string
          phone: string
          qa: Json
          referrer: string | null
          risks: string[]
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          urgency: Database["public"]["Enums"]["lead_urgency"] | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          admin_notes?: string | null
          ai_summary?: string | null
          category?: string | null
          contact?: string | null
          created_at?: string
          documents_checklist?: string[]
          id?: string
          landing_url?: string | null
          name: string
          next_step?: string | null
          original_text: string
          phone: string
          qa?: Json
          referrer?: string | null
          risks?: string[]
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          urgency?: Database["public"]["Enums"]["lead_urgency"] | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          admin_notes?: string | null
          ai_summary?: string | null
          category?: string | null
          contact?: string | null
          created_at?: string
          documents_checklist?: string[]
          id?: string
          landing_url?: string | null
          name?: string
          next_step?: string | null
          original_text?: string
          phone?: string
          qa?: Json
          referrer?: string | null
          risks?: string[]
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          urgency?: Database["public"]["Enums"]["lead_urgency"] | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      seo_pages: {
        Row: {
          canonical_path: string | null
          changefreq: string | null
          content_en: string | null
          content_he: string | null
          content_ru: string
          created_at: string
          faq_json: Json
          h1_en: string | null
          h1_he: string | null
          h1_ru: string
          id: string
          is_published: boolean
          meta_description_en: string | null
          meta_description_he: string | null
          meta_description_ru: string | null
          nofollow: boolean
          noindex: boolean
          og_description: string | null
          og_image: string | null
          og_title: string | null
          page_type: string
          priority: number | null
          published_at: string | null
          schema_json: Json
          seo_keywords: string[] | null
          slug: string
          sort_order: number | null
          title_en: string | null
          title_he: string | null
          title_ru: string
          updated_at: string
        }
        Insert: {
          canonical_path?: string | null
          changefreq?: string | null
          content_en?: string | null
          content_he?: string | null
          content_ru: string
          created_at?: string
          faq_json?: Json
          h1_en?: string | null
          h1_he?: string | null
          h1_ru: string
          id?: string
          is_published?: boolean
          meta_description_en?: string | null
          meta_description_he?: string | null
          meta_description_ru?: string | null
          nofollow?: boolean
          noindex?: boolean
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          page_type?: string
          priority?: number | null
          published_at?: string | null
          schema_json?: Json
          seo_keywords?: string[] | null
          slug: string
          sort_order?: number | null
          title_en?: string | null
          title_he?: string | null
          title_ru: string
          updated_at?: string
        }
        Update: {
          canonical_path?: string | null
          changefreq?: string | null
          content_en?: string | null
          content_he?: string | null
          content_ru?: string
          created_at?: string
          faq_json?: Json
          h1_en?: string | null
          h1_he?: string | null
          h1_ru?: string
          id?: string
          is_published?: boolean
          meta_description_en?: string | null
          meta_description_he?: string | null
          meta_description_ru?: string | null
          nofollow?: boolean
          noindex?: boolean
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          page_type?: string
          priority?: number | null
          published_at?: string | null
          schema_json?: Json
          seo_keywords?: string[] | null
          slug?: string
          sort_order?: number | null
          title_en?: string | null
          title_he?: string | null
          title_ru?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          hero_image_url: string | null
          hero_object_position_x: number
          hero_object_position_y: number
          hero_scale: number
          id: number
          updated_at: string
        }
        Insert: {
          hero_image_url?: string | null
          hero_object_position_x?: number
          hero_object_position_y?: number
          hero_scale?: number
          id?: number
          updated_at?: string
        }
        Update: {
          hero_image_url?: string | null
          hero_object_position_x?: number
          hero_object_position_y?: number
          hero_scale?: number
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      lead_status: "new" | "in_progress" | "waiting" | "closed"
      lead_urgency: "low" | "medium" | "high"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      lead_status: ["new", "in_progress", "waiting", "closed"],
      lead_urgency: ["low", "medium", "high"],
    },
  },
} as const
