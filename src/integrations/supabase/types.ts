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
      ai_drafts: {
        Row: {
          approved_by: string | null
          confidence: number | null
          conversation_id: string | null
          created_at: string
          draft_text: string
          id: string
          lead_id: string
          needs_human_review: boolean
          status: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          draft_text: string
          id?: string
          lead_id: string
          needs_human_review?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          draft_text?: string
          id?: string
          lead_id?: string
          needs_human_review?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_drafts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_drafts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      consultations: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          lead_id: string | null
          meeting_url: string | null
          notes: string | null
          payment_status: string | null
          price: number | null
          starts_at: string
          status: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          lead_id?: string | null
          meeting_url?: string | null
          notes?: string | null
          payment_status?: string | null
          price?: number | null
          starts_at: string
          status?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          lead_id?: string | null
          meeting_url?: string | null
          notes?: string | null
          payment_status?: string | null
          price?: number | null
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          ai_generated: boolean
          channel: string
          conversation_id: string
          created_at: string
          direction: string
          external_message_id: string | null
          id: string
          lead_id: string
          message_text: string | null
          raw_payload: Json
          sent_by: string | null
        }
        Insert: {
          ai_generated?: boolean
          channel: string
          conversation_id: string
          created_at?: string
          direction: string
          external_message_id?: string | null
          id?: string
          lead_id: string
          message_text?: string | null
          raw_payload?: Json
          sent_by?: string | null
        }
        Update: {
          ai_generated?: boolean
          channel?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          external_message_id?: string | null
          id?: string
          lead_id?: string
          message_text?: string | null
          raw_payload?: Json
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          channel: string
          created_at: string
          external_chat_id: string | null
          external_user_id: string | null
          id: string
          last_message_at: string | null
          lead_id: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          channel: string
          created_at?: string
          external_chat_id?: string | null
          external_user_id?: string | null
          id?: string
          last_message_at?: string | null
          lead_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          channel?: string
          created_at?: string
          external_chat_id?: string | null
          external_user_id?: string | null
          id?: string
          last_message_at?: string | null
          lead_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      external_reviews: {
        Row: {
          author_name: string | null
          created_at: string | null
          external_url: string | null
          id: string
          is_published: boolean | null
          rating: number | null
          review_date: string | null
          review_text: string
          service_category: string | null
          source: string
          source_review_id: string | null
        }
        Insert: {
          author_name?: string | null
          created_at?: string | null
          external_url?: string | null
          id?: string
          is_published?: boolean | null
          rating?: number | null
          review_date?: string | null
          review_text: string
          service_category?: string | null
          source: string
          source_review_id?: string | null
        }
        Update: {
          author_name?: string | null
          created_at?: string | null
          external_url?: string | null
          id?: string
          is_published?: boolean | null
          rating?: number | null
          review_date?: string | null
          review_text?: string
          service_category?: string | null
          source?: string
          source_review_id?: string | null
        }
        Relationships: []
      }
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
      lead_events: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          message: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          message: string
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          message?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          lead_id: string
          status: string
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id: string
          status?: string
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tasks_lead_id_fkey"
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
          ai_processing_consent: boolean
          ai_summary: string | null
          assigned_to: string | null
          category: string | null
          closed_at: string | null
          consent_given: boolean
          consent_ip: string | null
          consent_source: string | null
          consent_timestamp: string | null
          consent_user_agent: string | null
          consent_version: string | null
          contact: string | null
          created_at: string
          documents_checklist: string[]
          estimated_budget: number | null
          id: string
          landing_url: string | null
          last_contact_at: string | null
          legal_disclaimer_accepted: boolean
          name: string
          next_followup_at: string | null
          next_step: string | null
          original_text: string
          phone: string
          pipeline_stage: string | null
          priority: string | null
          privacy_policy_version: string | null
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
          ai_processing_consent?: boolean
          ai_summary?: string | null
          assigned_to?: string | null
          category?: string | null
          closed_at?: string | null
          consent_given?: boolean
          consent_ip?: string | null
          consent_source?: string | null
          consent_timestamp?: string | null
          consent_user_agent?: string | null
          consent_version?: string | null
          contact?: string | null
          created_at?: string
          documents_checklist?: string[]
          estimated_budget?: number | null
          id?: string
          landing_url?: string | null
          last_contact_at?: string | null
          legal_disclaimer_accepted?: boolean
          name: string
          next_followup_at?: string | null
          next_step?: string | null
          original_text: string
          phone: string
          pipeline_stage?: string | null
          priority?: string | null
          privacy_policy_version?: string | null
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
          ai_processing_consent?: boolean
          ai_summary?: string | null
          assigned_to?: string | null
          category?: string | null
          closed_at?: string | null
          consent_given?: boolean
          consent_ip?: string | null
          consent_source?: string | null
          consent_timestamp?: string | null
          consent_user_agent?: string | null
          consent_version?: string | null
          contact?: string | null
          created_at?: string
          documents_checklist?: string[]
          estimated_budget?: number | null
          id?: string
          landing_url?: string | null
          last_contact_at?: string | null
          legal_disclaimer_accepted?: boolean
          name?: string
          next_followup_at?: string | null
          next_step?: string | null
          original_text?: string
          phone?: string
          pipeline_stage?: string | null
          priority?: string | null
          privacy_policy_version?: string | null
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
      webhook_events: {
        Row: {
          created_at: string
          error: string | null
          external_event_id: string | null
          id: string
          payload: Json
          processed: boolean
          source: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          external_event_id?: string | null
          id?: string
          payload: Json
          processed?: boolean
          source: string
        }
        Update: {
          created_at?: string
          error?: string | null
          external_event_id?: string | null
          id?: string
          payload?: Json
          processed?: boolean
          source?: string
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
      is_admin_or_superadmin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin"
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
      app_role: ["admin", "user", "super_admin"],
      lead_status: ["new", "in_progress", "waiting", "closed"],
      lead_urgency: ["low", "medium", "high"],
    },
  },
} as const
