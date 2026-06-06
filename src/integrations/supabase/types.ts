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
      ai_intake_analysis: {
        Row: {
          category: string | null
          client_id: string | null
          confidence: number | null
          confidence_score: number | null
          conversation_id: string | null
          created_at: string
          extracted_entities: Json
          full_result: Json | null
          id: string
          lead_id: string | null
          legal_analysis: string | null
          missing_documents: Json | null
          model_name: string | null
          next_questions: Json
          practice_area: string | null
          query: string | null
          recommended_action: string | null
          recommended_actions: Json | null
          retrieved_law_chunks: Json | null
          retrieved_laws: Json | null
          retrieved_sources: Json | null
          risk_level: string | null
          risks: Json | null
          service_priority: string | null
          service_type: string | null
          short_answer: string | null
          subcategory: string | null
          summary: string | null
          urgency_level: string | null
        }
        Insert: {
          category?: string | null
          client_id?: string | null
          confidence?: number | null
          confidence_score?: number | null
          conversation_id?: string | null
          created_at?: string
          extracted_entities?: Json
          full_result?: Json | null
          id?: string
          lead_id?: string | null
          legal_analysis?: string | null
          missing_documents?: Json | null
          model_name?: string | null
          next_questions?: Json
          practice_area?: string | null
          query?: string | null
          recommended_action?: string | null
          recommended_actions?: Json | null
          retrieved_law_chunks?: Json | null
          retrieved_laws?: Json | null
          retrieved_sources?: Json | null
          risk_level?: string | null
          risks?: Json | null
          service_priority?: string | null
          service_type?: string | null
          short_answer?: string | null
          subcategory?: string | null
          summary?: string | null
          urgency_level?: string | null
        }
        Update: {
          category?: string | null
          client_id?: string | null
          confidence?: number | null
          confidence_score?: number | null
          conversation_id?: string | null
          created_at?: string
          extracted_entities?: Json
          full_result?: Json | null
          id?: string
          lead_id?: string | null
          legal_analysis?: string | null
          missing_documents?: Json | null
          model_name?: string | null
          next_questions?: Json
          practice_area?: string | null
          query?: string | null
          recommended_action?: string | null
          recommended_actions?: Json | null
          retrieved_law_chunks?: Json | null
          retrieved_laws?: Json | null
          retrieved_sources?: Json | null
          risk_level?: string | null
          risks?: Json | null
          service_priority?: string | null
          service_type?: string | null
          short_answer?: string | null
          subcategory?: string | null
          summary?: string | null
          urgency_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_intake_analysis_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_intake_analysis_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "communication_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_intake_analysis_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_source_routing_rules: {
        Row: {
          created_at: string
          id: string
          route_name: string
          trigger_keywords: string[] | null
          use_internal_laws: boolean
          use_legal_knowledge: boolean
          use_official_sources: boolean
          use_registry_sources: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          route_name: string
          trigger_keywords?: string[] | null
          use_internal_laws?: boolean
          use_legal_knowledge?: boolean
          use_official_sources?: boolean
          use_registry_sources?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          route_name?: string
          trigger_keywords?: string[] | null
          use_internal_laws?: boolean
          use_legal_knowledge?: boolean
          use_official_sources?: boolean
          use_registry_sources?: boolean
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          cost_estimate: number | null
          created_at: string
          id: string
          metadata: Json
          model_name: string | null
          operation_type: string | null
          tokens_input: number | null
          tokens_output: number | null
          user_id: string | null
        }
        Insert: {
          cost_estimate?: number | null
          created_at?: string
          id?: string
          metadata?: Json
          model_name?: string | null
          operation_type?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          user_id?: string | null
        }
        Update: {
          cost_estimate?: number | null
          created_at?: string
          id?: string
          metadata?: Json
          model_name?: string | null
          operation_type?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      case_documents: {
        Row: {
          case_id: string
          created_at: string | null
          document_id: string
          id: string
        }
        Insert: {
          case_id: string
          created_at?: string | null
          document_id: string
          id?: string
        }
        Update: {
          case_id?: string
          created_at?: string | null
          document_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "legal_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "lead_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_attachments: {
        Row: {
          ai_detected_risks: Json
          ai_summary: string | null
          created_at: string
          external_file_id: string | null
          external_file_unique_id: string | null
          file_name: string | null
          file_size: number | null
          id: string
          message_id: string | null
          mime_type: string | null
          ocr_text: string | null
          storage_path: string | null
        }
        Insert: {
          ai_detected_risks?: Json
          ai_summary?: string | null
          created_at?: string
          external_file_id?: string | null
          external_file_unique_id?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          message_id?: string | null
          mime_type?: string | null
          ocr_text?: string | null
          storage_path?: string | null
        }
        Update: {
          ai_detected_risks?: Json
          ai_summary?: string | null
          created_at?: string
          external_file_id?: string | null
          external_file_unique_id?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          message_id?: string | null
          mime_type?: string | null
          ocr_text?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "communication_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_channels: {
        Row: {
          channel_type: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          settings_json: Json
          updated_at: string
        }
        Insert: {
          channel_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          settings_json?: Json
          updated_at?: string
        }
        Update: {
          channel_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          settings_json?: Json
          updated_at?: string
        }
        Relationships: []
      }
      communication_contacts: {
        Row: {
          channel_id: string | null
          created_at: string
          crm_client_id: string | null
          email: string | null
          external_chat_id: string | null
          external_user_id: string | null
          first_name: string | null
          full_name: string | null
          id: string
          is_blocked: boolean
          language_code: string | null
          last_name: string | null
          phone: string | null
          raw_profile: Json
          source: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          crm_client_id?: string | null
          email?: string | null
          external_chat_id?: string | null
          external_user_id?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          is_blocked?: boolean
          language_code?: string | null
          last_name?: string | null
          phone?: string | null
          raw_profile?: Json
          source?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          crm_client_id?: string | null
          email?: string | null
          external_chat_id?: string | null
          external_user_id?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          is_blocked?: boolean
          language_code?: string | null
          last_name?: string | null
          phone?: string | null
          raw_profile?: Json
          source?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_contacts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "communication_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_contacts_crm_client_fk"
            columns: ["crm_client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_conversations: {
        Row: {
          ai_category: string | null
          ai_risk_level: string | null
          ai_subcategory: string | null
          ai_summary: string | null
          assigned_to: string | null
          channel_id: string | null
          contact_id: string | null
          created_at: string
          crm_client_id: string | null
          crm_lead_id: string | null
          id: string
          last_message_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ai_category?: string | null
          ai_risk_level?: string | null
          ai_subcategory?: string | null
          ai_summary?: string | null
          assigned_to?: string | null
          channel_id?: string | null
          contact_id?: string | null
          created_at?: string
          crm_client_id?: string | null
          crm_lead_id?: string | null
          id?: string
          last_message_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ai_category?: string | null
          ai_risk_level?: string | null
          ai_subcategory?: string | null
          ai_summary?: string | null
          assigned_to?: string | null
          channel_id?: string | null
          contact_id?: string | null
          created_at?: string
          crm_client_id?: string | null
          crm_lead_id?: string | null
          id?: string
          last_message_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "communication_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "communication_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_conversations_crm_client_fk"
            columns: ["crm_client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_conversations_crm_lead_fk"
            columns: ["crm_lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_messages: {
        Row: {
          ai_extracted_entities: Json
          ai_summary: string | null
          conversation_id: string | null
          created_at: string
          direction: string
          external_message_id: string | null
          id: string
          message_type: string
          raw_payload: Json
          text_content: string | null
        }
        Insert: {
          ai_extracted_entities?: Json
          ai_summary?: string | null
          conversation_id?: string | null
          created_at?: string
          direction: string
          external_message_id?: string | null
          id?: string
          message_type?: string
          raw_payload?: Json
          text_content?: string | null
        }
        Update: {
          ai_extracted_entities?: Json
          ai_summary?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          external_message_id?: string | null
          id?: string
          message_type?: string
          raw_payload?: Json
          text_content?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "communication_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_webhook_events: {
        Row: {
          channel_type: string
          created_at: string
          external_update_id: string | null
          id: string
          processed: boolean
          processing_error: string | null
          raw_payload: Json
        }
        Insert: {
          channel_type: string
          created_at?: string
          external_update_id?: string | null
          id?: string
          processed?: boolean
          processing_error?: string | null
          raw_payload: Json
        }
        Update: {
          channel_type?: string
          created_at?: string
          external_update_id?: string | null
          id?: string
          processed?: boolean
          processing_error?: string | null
          raw_payload?: Json
        }
        Relationships: []
      }
      compliance_checks: {
        Row: {
          birth_date: string | null
          check_subject: string | null
          client_id: string | null
          created_at: string
          fio: string | null
          id: string
          inn: string | null
          lead_id: string | null
          missing_data: Json
          ogrn: string | null
          ogrnip: string | null
          region: string | null
          registry_results: Json
          risk_level: string | null
          status: string
          subject_type: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          check_subject?: string | null
          client_id?: string | null
          created_at?: string
          fio?: string | null
          id?: string
          inn?: string | null
          lead_id?: string | null
          missing_data?: Json
          ogrn?: string | null
          ogrnip?: string | null
          region?: string | null
          registry_results?: Json
          risk_level?: string | null
          status?: string
          subject_type?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          check_subject?: string | null
          client_id?: string | null
          created_at?: string
          fio?: string | null
          id?: string
          inn?: string | null
          lead_id?: string | null
          missing_data?: Json
          ogrn?: string | null
          ogrnip?: string | null
          region?: string | null
          registry_results?: Json
          risk_level?: string | null
          status?: string
          subject_type?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      consultation_bookings: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          lead_id: string | null
          matter_id: string | null
          meeting_type: string | null
          notes: string | null
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          matter_id?: string | null
          meeting_type?: string | null
          notes?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          matter_id?: string | null
          meeting_type?: string | null
          notes?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultation_bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_bookings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_bookings_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "legal_matters"
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
      contract_clauses: {
        Row: {
          ai_comment: string | null
          clause_number: string | null
          clause_text: string | null
          clause_title: string | null
          contract_id: string | null
          created_at: string
          id: string
          risk_level: string | null
        }
        Insert: {
          ai_comment?: string | null
          clause_number?: string | null
          clause_text?: string | null
          clause_title?: string | null
          contract_id?: string | null
          created_at?: string
          id?: string
          risk_level?: string | null
        }
        Update: {
          ai_comment?: string | null
          clause_number?: string | null
          clause_text?: string | null
          clause_title?: string | null
          contract_id?: string | null
          created_at?: string
          id?: string
          risk_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_clauses_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_reviews: {
        Row: {
          ai_summary: string | null
          contract_id: string | null
          created_at: string
          id: string
          recommended_action: string | null
          review_status: string
          risk_level: string
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          contract_id?: string | null
          created_at?: string
          id?: string
          recommended_action?: string | null
          review_status?: string
          risk_level?: string
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          contract_id?: string | null
          created_at?: string
          id?: string
          recommended_action?: string | null
          review_status?: string
          risk_level?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_reviews_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_risks: {
        Row: {
          contract_review_id: string | null
          created_at: string
          id: string
          recommended_fix: string | null
          risk_description: string | null
          risk_title: string
          severity: string
        }
        Insert: {
          contract_review_id?: string | null
          created_at?: string
          id?: string
          recommended_fix?: string | null
          risk_description?: string | null
          risk_title: string
          severity?: string
        }
        Update: {
          contract_review_id?: string | null
          created_at?: string
          id?: string
          recommended_fix?: string | null
          risk_description?: string | null
          risk_title?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_risks_contract_review_id_fkey"
            columns: ["contract_review_id"]
            isOneToOne: false
            referencedRelation: "contract_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          ai_summary: string | null
          contract_type: string
          created_at: string
          file_name: string | null
          id: string
          matter_id: string | null
          status: string
          storage_path: string | null
          updated_at: string
          version_number: number
        }
        Insert: {
          ai_summary?: string | null
          contract_type: string
          created_at?: string
          file_name?: string | null
          id?: string
          matter_id?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          version_number?: number
        }
        Update: {
          ai_summary?: string | null
          contract_type?: string
          created_at?: string
          file_name?: string | null
          id?: string
          matter_id?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "contracts_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "legal_matters"
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
      court_cases: {
        Row: {
          ai_summary: string | null
          case_number: string | null
          claim_amount: number | null
          court_name: string | null
          created_at: string
          id: string
          judge_name: string | null
          matter_id: string | null
          next_hearing_at: string | null
          risk_level: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          case_number?: string | null
          claim_amount?: number | null
          court_name?: string | null
          created_at?: string
          id?: string
          judge_name?: string | null
          matter_id?: string | null
          next_hearing_at?: string | null
          risk_level?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          case_number?: string | null
          claim_amount?: number | null
          court_name?: string | null
          created_at?: string
          id?: string
          judge_name?: string | null
          matter_id?: string | null
          next_hearing_at?: string | null
          risk_level?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_cases_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "legal_matters"
            referencedColumns: ["id"]
          },
        ]
      }
      court_deadlines: {
        Row: {
          court_case_id: string | null
          created_at: string
          deadline_at: string
          id: string
          notes: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          court_case_id?: string | null
          created_at?: string
          deadline_at: string
          id?: string
          notes?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          court_case_id?: string | null
          created_at?: string
          deadline_at?: string
          id?: string
          notes?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_deadlines_court_case_id_fkey"
            columns: ["court_case_id"]
            isOneToOne: false
            referencedRelation: "court_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      court_documents: {
        Row: {
          ai_summary: string | null
          court_case_id: string | null
          created_at: string
          document_type: string | null
          file_name: string | null
          id: string
          ocr_text: string | null
          storage_path: string | null
        }
        Insert: {
          ai_summary?: string | null
          court_case_id?: string | null
          created_at?: string
          document_type?: string | null
          file_name?: string | null
          id?: string
          ocr_text?: string | null
          storage_path?: string | null
        }
        Update: {
          ai_summary?: string | null
          court_case_id?: string | null
          created_at?: string
          document_type?: string | null
          file_name?: string | null
          id?: string
          ocr_text?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "court_documents_court_case_id_fkey"
            columns: ["court_case_id"]
            isOneToOne: false
            referencedRelation: "court_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      court_hearings: {
        Row: {
          court_case_id: string | null
          created_at: string
          hearing_date: string | null
          hearing_type: string | null
          id: string
          notes: string | null
          result: string | null
        }
        Insert: {
          court_case_id?: string | null
          created_at?: string
          hearing_date?: string | null
          hearing_type?: string | null
          id?: string
          notes?: string | null
          result?: string | null
        }
        Update: {
          court_case_id?: string | null
          created_at?: string
          hearing_date?: string | null
          hearing_type?: string | null
          id?: string
          notes?: string | null
          result?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "court_hearings_court_case_id_fkey"
            columns: ["court_case_id"]
            isOneToOne: false
            referencedRelation: "court_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_clients: {
        Row: {
          client_type: string
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          notes: string | null
          phone: string | null
          source: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          client_type?: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          client_type?: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      crm_leads: {
        Row: {
          ai_category: string | null
          ai_recommended_action: string | null
          ai_risk_level: string | null
          ai_subcategory: string | null
          ai_summary: string | null
          assigned_to: string | null
          client_id: string | null
          created_at: string
          description: string | null
          id: string
          pipeline_stage: string
          source: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          ai_category?: string | null
          ai_recommended_action?: string | null
          ai_risk_level?: string | null
          ai_subcategory?: string | null
          ai_summary?: string | null
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          pipeline_stage?: string
          source?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          ai_category?: string | null
          ai_recommended_action?: string | null
          ai_risk_level?: string | null
          ai_subcategory?: string | null
          ai_summary?: string | null
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          pipeline_stage?: string
          source?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_notes: {
        Row: {
          author_id: string | null
          client_id: string | null
          content: string
          created_at: string
          id: string
          lead_id: string | null
          matter_id: string | null
        }
        Insert: {
          author_id?: string | null
          client_id?: string | null
          content: string
          created_at?: string
          id?: string
          lead_id?: string | null
          matter_id?: string | null
        }
        Update: {
          author_id?: string | null
          client_id?: string | null
          content?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          matter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_notes_matter_fk"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "legal_matters"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          lead_id: string | null
          matter_id: string | null
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          matter_id?: string | null
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          matter_id?: string | null
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_matter_fk"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "legal_matters"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          sort_order: number
          template_key: string
          title: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          template_key: string
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          template_key?: string
          title?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          ai_detected_entities: Json
          ai_detected_risks: Json
          ai_summary: string | null
          client_id: string | null
          created_at: string
          document_type: string | null
          file_name: string | null
          id: string
          lead_id: string | null
          matter_id: string | null
          mime_type: string | null
          ocr_text: string | null
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          ai_detected_entities?: Json
          ai_detected_risks?: Json
          ai_summary?: string | null
          client_id?: string | null
          created_at?: string
          document_type?: string | null
          file_name?: string | null
          id?: string
          lead_id?: string | null
          matter_id?: string | null
          mime_type?: string | null
          ocr_text?: string | null
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          ai_detected_entities?: Json
          ai_detected_risks?: Json
          ai_summary?: string | null
          client_id?: string | null
          created_at?: string
          document_type?: string | null
          file_name?: string | null
          id?: string
          lead_id?: string | null
          matter_id?: string | null
          mime_type?: string | null
          ocr_text?: string | null
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "legal_matters"
            referencedColumns: ["id"]
          },
        ]
      }
      external_registry_sources: {
        Row: {
          base_url: string
          created_at: string
          description: string | null
          domain: string
          id: string
          is_active: boolean
          lookup_url: string | null
          required_data: Json
          source_code: string | null
          source_name: string
          source_priority: number | null
          source_type: string
          use_case: string | null
        }
        Insert: {
          base_url: string
          created_at?: string
          description?: string | null
          domain: string
          id?: string
          is_active?: boolean
          lookup_url?: string | null
          required_data?: Json
          source_code?: string | null
          source_name: string
          source_priority?: number | null
          source_type: string
          use_case?: string | null
        }
        Update: {
          base_url?: string
          created_at?: string
          description?: string | null
          domain?: string
          id?: string
          is_active?: boolean
          lookup_url?: string | null
          required_data?: Json
          source_code?: string | null
          source_name?: string
          source_priority?: number | null
          source_type?: string
          use_case?: string | null
        }
        Relationships: []
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
      generated_legal_documents: {
        Row: {
          content: string | null
          created_at: string
          id: string
          lead_id: string | null
          source_document_id: string | null
          status: string
          template_key: string
          title: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          source_document_id?: string | null
          status?: string
          template_key: string
          title: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          source_document_id?: string | null
          status?: string
          template_key?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_legal_documents_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_consents: {
        Row: {
          ai_processing_consent: boolean
          consent_given: boolean
          consent_source: string
          consent_text: string
          consent_type: string
          consent_version: string
          created_at: string
          id: string
          ip_address: string | null
          lead_id: string | null
          legal_disclaimer_accepted: boolean
          page_url: string | null
          privacy_policy_version: string
          user_agent: string | null
        }
        Insert: {
          ai_processing_consent?: boolean
          consent_given?: boolean
          consent_source: string
          consent_text: string
          consent_type: string
          consent_version?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          lead_id?: string | null
          legal_disclaimer_accepted?: boolean
          page_url?: string | null
          privacy_policy_version?: string
          user_agent?: string | null
        }
        Update: {
          ai_processing_consent?: boolean
          consent_given?: boolean
          consent_source?: string
          consent_text?: string
          consent_type?: string
          consent_version?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          lead_id?: string | null
          legal_disclaimer_accepted?: boolean
          page_url?: string | null
          privacy_policy_version?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_consents_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_documents: {
        Row: {
          ai_risks: string[] | null
          ai_summary: string | null
          analysis_status: string | null
          analyzed_at: string | null
          conversation_id: string | null
          created_at: string | null
          crm_client_id: string | null
          crm_lead_id: string | null
          document_type: string | null
          extracted_data: Json | null
          file_name: string | null
          file_url: string | null
          id: string
          lead_id: string | null
          legal_matter_id: string | null
        }
        Insert: {
          ai_risks?: string[] | null
          ai_summary?: string | null
          analysis_status?: string | null
          analyzed_at?: string | null
          conversation_id?: string | null
          created_at?: string | null
          crm_client_id?: string | null
          crm_lead_id?: string | null
          document_type?: string | null
          extracted_data?: Json | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          lead_id?: string | null
          legal_matter_id?: string | null
        }
        Update: {
          ai_risks?: string[] | null
          ai_summary?: string | null
          analysis_status?: string | null
          analyzed_at?: string | null
          conversation_id?: string | null
          created_at?: string | null
          crm_client_id?: string | null
          crm_lead_id?: string | null
          document_type?: string | null
          extracted_data?: Json | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          lead_id?: string | null
          legal_matter_id?: string | null
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
      lead_timeline: {
        Row: {
          created_at: string | null
          description: string | null
          event_type: string
          id: string
          lead_id: string
          metadata: Json | null
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          event_type: string
          id?: string
          lead_id: string
          metadata?: Json | null
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          event_type?: string
          id?: string
          lead_id?: string
          metadata?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_timeline_lead_id_fkey"
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
          archived_at: string | null
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
          lead_number: number
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
          source_crm_lead_id: string | null
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
          archived_at?: string | null
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
          lead_number?: number
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
          source_crm_lead_id?: string | null
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
          archived_at?: string | null
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
          lead_number?: number
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
          source_crm_lead_id?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          urgency?: Database["public"]["Enums"]["lead_urgency"] | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_source_crm_lead_id_fkey"
            columns: ["source_crm_lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_ai_briefings: {
        Row: {
          affected_practice_areas: string[] | null
          ai_model: string | null
          ai_raw_result: Json | null
          alert_id: string | null
          article: string | null
          created_at: string | null
          created_task_id: string | null
          id: string
          impact_level: string | null
          law_name: string | null
          monitored_source_id: string | null
          practice_area: string | null
          recommendations: string | null
          required_actions: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          risks: Json | null
          source_id: string | null
          source_name: string | null
          source_type: string | null
          status: string | null
          summary: string | null
          title: string
          what_changed: string | null
          who_is_affected: string | null
        }
        Insert: {
          affected_practice_areas?: string[] | null
          ai_model?: string | null
          ai_raw_result?: Json | null
          alert_id?: string | null
          article?: string | null
          created_at?: string | null
          created_task_id?: string | null
          id?: string
          impact_level?: string | null
          law_name?: string | null
          monitored_source_id?: string | null
          practice_area?: string | null
          recommendations?: string | null
          required_actions?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risks?: Json | null
          source_id?: string | null
          source_name?: string | null
          source_type?: string | null
          status?: string | null
          summary?: string | null
          title: string
          what_changed?: string | null
          who_is_affected?: string | null
        }
        Update: {
          affected_practice_areas?: string[] | null
          ai_model?: string | null
          ai_raw_result?: Json | null
          alert_id?: string | null
          article?: string | null
          created_at?: string | null
          created_task_id?: string | null
          id?: string
          impact_level?: string | null
          law_name?: string | null
          monitored_source_id?: string | null
          practice_area?: string | null
          recommendations?: string | null
          required_actions?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risks?: Json | null
          source_id?: string | null
          source_name?: string | null
          source_type?: string | null
          status?: string | null
          summary?: string | null
          title?: string
          what_changed?: string | null
          who_is_affected?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_ai_briefings_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "legal_regulatory_update_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_ai_briefings_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "v_legal_regulatory_alerts_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_ai_briefings_monitored_source_id_fkey"
            columns: ["monitored_source_id"]
            isOneToOne: false
            referencedRelation: "legal_regulatory_monitored_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_ai_briefings_monitored_source_id_fkey"
            columns: ["monitored_source_id"]
            isOneToOne: false
            referencedRelation: "v_legal_regulatory_monitoring_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_ai_briefings_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "legal_regulatory_monitored_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_ai_briefings_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "v_legal_regulatory_monitoring_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_cases: {
        Row: {
          ai_summary: string | null
          case_type: string | null
          claim_amount: number | null
          court_case_number: string | null
          court_name: string | null
          created_at: string | null
          id: string
          lead_id: string | null
          legacy_lead_id: string | null
          matter_status: string | null
          next_deadline_at: string | null
          next_hearing_at: string | null
          opponent_name: string | null
          opponent_phone: string | null
          priority: string | null
          responsible_lawyer: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          ai_summary?: string | null
          case_type?: string | null
          claim_amount?: number | null
          court_case_number?: string | null
          court_name?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          legacy_lead_id?: string | null
          matter_status?: string | null
          next_deadline_at?: string | null
          next_hearing_at?: string | null
          opponent_name?: string | null
          opponent_phone?: string | null
          priority?: string | null
          responsible_lawyer?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          ai_summary?: string | null
          case_type?: string | null
          claim_amount?: number | null
          court_case_number?: string | null
          court_name?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          legacy_lead_id?: string | null
          matter_status?: string | null
          next_deadline_at?: string | null
          next_hearing_at?: string | null
          opponent_name?: string | null
          opponent_phone?: string | null
          priority?: string | null
          responsible_lawyer?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_cases_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_cases_legacy_lead_id_fkey"
            columns: ["legacy_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_document_reviews: {
        Row: {
          compliance_subjects: Json
          created_at: string
          document_id: string | null
          document_type: string | null
          draft_suggestions: Json
          findings: Json
          id: string
          last_error: string | null
          last_run_at: string | null
          last_verified_at: string | null
          lead_id: string | null
          legal_basis: Json
          recommended_actions: Json
          required_documents: Json
          review_status: string
          risk_level: string | null
          run_count: number | null
          summary: string | null
          updated_at: string
          verification_alerts: Json
          verification_status: string | null
        }
        Insert: {
          compliance_subjects?: Json
          created_at?: string
          document_id?: string | null
          document_type?: string | null
          draft_suggestions?: Json
          findings?: Json
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_verified_at?: string | null
          lead_id?: string | null
          legal_basis?: Json
          recommended_actions?: Json
          required_documents?: Json
          review_status?: string
          risk_level?: string | null
          run_count?: number | null
          summary?: string | null
          updated_at?: string
          verification_alerts?: Json
          verification_status?: string | null
        }
        Update: {
          compliance_subjects?: Json
          created_at?: string
          document_id?: string | null
          document_type?: string | null
          draft_suggestions?: Json
          findings?: Json
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_verified_at?: string | null
          lead_id?: string | null
          legal_basis?: Json
          recommended_actions?: Json
          required_documents?: Json
          review_status?: string
          risk_level?: string | null
          run_count?: number | null
          summary?: string | null
          updated_at?: string
          verification_alerts?: Json
          verification_status?: string | null
        }
        Relationships: []
      }
      legal_knowledge_chunks: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          source_type: string | null
          title: string | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          source_type?: string | null
          title?: string | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          source_type?: string | null
          title?: string | null
        }
        Relationships: []
      }
      legal_law_chunks: {
        Row: {
          article: string | null
          code_name: string
          content: string
          content_hash: string | null
          created_at: string | null
          embedding: string | null
          id: string
          is_active: boolean | null
          jurisdiction: string
          law_category: string | null
          law_id: string | null
          metadata: Json | null
          part: string | null
          practice_area: string | null
          source_checked_at: string | null
          source_name: string | null
          source_url: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          article?: string | null
          code_name: string
          content: string
          content_hash?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_active?: boolean | null
          jurisdiction?: string
          law_category?: string | null
          law_id?: string | null
          metadata?: Json | null
          part?: string | null
          practice_area?: string | null
          source_checked_at?: string | null
          source_name?: string | null
          source_url?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          article?: string | null
          code_name?: string
          content?: string
          content_hash?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_active?: boolean | null
          jurisdiction?: string
          law_category?: string | null
          law_id?: string | null
          metadata?: Json | null
          part?: string | null
          practice_area?: string | null
          source_checked_at?: string | null
          source_name?: string | null
          source_url?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      legal_laws: {
        Row: {
          article: string | null
          code_name: string
          content: string
          content_hash: string | null
          created_at: string | null
          embedding: string | null
          id: string
          is_active: boolean | null
          jurisdiction: string
          law_category: string | null
          metadata: Json | null
          practice_area: string | null
          source_checked_at: string | null
          source_name: string | null
          source_url: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          article?: string | null
          code_name: string
          content: string
          content_hash?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_active?: boolean | null
          jurisdiction?: string
          law_category?: string | null
          metadata?: Json | null
          practice_area?: string | null
          source_checked_at?: string | null
          source_name?: string | null
          source_url?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          article?: string | null
          code_name?: string
          content?: string
          content_hash?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_active?: boolean | null
          jurisdiction?: string
          law_category?: string | null
          metadata?: Json | null
          practice_area?: string | null
          source_checked_at?: string | null
          source_name?: string | null
          source_url?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      legal_matters: {
        Row: {
          ai_summary: string | null
          client_id: string | null
          closed_at: string | null
          created_at: string
          description: string | null
          id: string
          lead_id: string | null
          matter_type: string
          opened_at: string | null
          priority: string
          risk_level: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          client_id?: string | null
          closed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          lead_id?: string | null
          matter_type: string
          opened_at?: string | null
          priority?: string
          risk_level?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          client_id?: string | null
          closed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          lead_id?: string | null
          matter_type?: string
          opened_at?: string | null
          priority?: string
          risk_level?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_matters_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_matters_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_parties: {
        Row: {
          created_at: string
          details_json: Json
          email: string | null
          full_name: string | null
          id: string
          matter_id: string | null
          party_type: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          details_json?: Json
          email?: string | null
          full_name?: string | null
          id?: string
          matter_id?: string | null
          party_type: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          details_json?: Json
          email?: string | null
          full_name?: string | null
          id?: string
          matter_id?: string | null
          party_type?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_parties_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "legal_matters"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_regulatory_monitored_sources: {
        Row: {
          article: string | null
          check_frequency: string | null
          created_at: string | null
          current_content: string | null
          current_hash: string | null
          id: string
          importance_level: string | null
          is_active: boolean | null
          last_changed_at: string | null
          last_checked_at: string | null
          law_name: string | null
          metadata: Json | null
          practice_area: string
          source_name: string
          source_type: string
          source_url: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          article?: string | null
          check_frequency?: string | null
          created_at?: string | null
          current_content?: string | null
          current_hash?: string | null
          id?: string
          importance_level?: string | null
          is_active?: boolean | null
          last_changed_at?: string | null
          last_checked_at?: string | null
          law_name?: string | null
          metadata?: Json | null
          practice_area: string
          source_name: string
          source_type?: string
          source_url?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          article?: string | null
          check_frequency?: string | null
          created_at?: string | null
          current_content?: string | null
          current_hash?: string | null
          id?: string
          importance_level?: string | null
          is_active?: boolean | null
          last_changed_at?: string | null
          last_checked_at?: string | null
          law_name?: string | null
          metadata?: Json | null
          practice_area?: string
          source_name?: string
          source_type?: string
          source_url?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      legal_regulatory_update_alerts: {
        Row: {
          ai_impact_analysis: Json | null
          ai_model: string | null
          ai_raw_result: Json | null
          article: string | null
          briefing_id: string | null
          change_summary: string | null
          created_at: string | null
          crm_task_id: string | null
          id: string
          importance_level: string | null
          law_name: string | null
          monitored_source_id: string | null
          new_content_excerpt: string | null
          new_hash: string | null
          old_content_excerpt: string | null
          old_hash: string | null
          practice_area: string
          related_task_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_name: string | null
          source_type: string | null
          status: string | null
          title: string
        }
        Insert: {
          ai_impact_analysis?: Json | null
          ai_model?: string | null
          ai_raw_result?: Json | null
          article?: string | null
          briefing_id?: string | null
          change_summary?: string | null
          created_at?: string | null
          crm_task_id?: string | null
          id?: string
          importance_level?: string | null
          law_name?: string | null
          monitored_source_id?: string | null
          new_content_excerpt?: string | null
          new_hash?: string | null
          old_content_excerpt?: string | null
          old_hash?: string | null
          practice_area: string
          related_task_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_name?: string | null
          source_type?: string | null
          status?: string | null
          title: string
        }
        Update: {
          ai_impact_analysis?: Json | null
          ai_model?: string | null
          ai_raw_result?: Json | null
          article?: string | null
          briefing_id?: string | null
          change_summary?: string | null
          created_at?: string | null
          crm_task_id?: string | null
          id?: string
          importance_level?: string | null
          law_name?: string | null
          monitored_source_id?: string | null
          new_content_excerpt?: string | null
          new_hash?: string | null
          old_content_excerpt?: string | null
          old_hash?: string | null
          practice_area?: string
          related_task_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_name?: string | null
          source_type?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_regulatory_update_alerts_monitored_source_id_fkey"
            columns: ["monitored_source_id"]
            isOneToOne: false
            referencedRelation: "legal_regulatory_monitored_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_regulatory_update_alerts_monitored_source_id_fkey"
            columns: ["monitored_source_id"]
            isOneToOne: false
            referencedRelation: "v_legal_regulatory_monitoring_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_regulatory_update_logs: {
        Row: {
          changed: boolean | null
          created_at: string | null
          error_message: string | null
          id: string
          message: string | null
          monitored_source_id: string | null
          new_hash: string | null
          old_hash: string | null
          raw_response: Json | null
          status: string
        }
        Insert: {
          changed?: boolean | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          message?: string | null
          monitored_source_id?: string | null
          new_hash?: string | null
          old_hash?: string | null
          raw_response?: Json | null
          status?: string
        }
        Update: {
          changed?: boolean | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          message?: string | null
          monitored_source_id?: string | null
          new_hash?: string | null
          old_hash?: string | null
          raw_response?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_regulatory_update_logs_monitored_source_id_fkey"
            columns: ["monitored_source_id"]
            isOneToOne: false
            referencedRelation: "legal_regulatory_monitored_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_regulatory_update_logs_monitored_source_id_fkey"
            columns: ["monitored_source_id"]
            isOneToOne: false
            referencedRelation: "v_legal_regulatory_monitoring_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_risks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          matter_id: string | null
          recommended_action: string | null
          risk_code: string | null
          severity: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          matter_id?: string | null
          recommended_action?: string | null
          risk_code?: string | null
          severity?: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          matter_id?: string | null
          recommended_action?: string | null
          risk_code?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_risks_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "legal_matters"
            referencedColumns: ["id"]
          },
        ]
      }
      official_legal_sources: {
        Row: {
          base_url: string
          created_at: string
          description: string | null
          domain: string
          id: string
          is_active: boolean
          lookup_url: string
          source_code: string
          source_name: string
          source_priority: number | null
          source_type: string
          use_case: string | null
        }
        Insert: {
          base_url: string
          created_at?: string
          description?: string | null
          domain: string
          id?: string
          is_active?: boolean
          lookup_url: string
          source_code: string
          source_name: string
          source_priority?: number | null
          source_type: string
          use_case?: string | null
        }
        Update: {
          base_url?: string
          created_at?: string
          description?: string | null
          domain?: string
          id?: string
          is_active?: boolean
          lookup_url?: string
          source_code?: string
          source_name?: string
          source_priority?: number | null
          source_type?: string
          use_case?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string
          currency: string
          id: string
          lead_id: string | null
          matter_id: string | null
          payment_type: string | null
          provider: string | null
          provider_payload: Json
          provider_payment_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          client_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          lead_id?: string | null
          matter_id?: string | null
          payment_type?: string | null
          provider?: string | null
          provider_payload?: Json
          provider_payment_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          lead_id?: string | null
          matter_id?: string | null
          payment_type?: string | null
          provider?: string | null
          provider_payload?: Json
          provider_payment_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "legal_matters"
            referencedColumns: ["id"]
          },
        ]
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
      properties: {
        Row: {
          address: string | null
          ai_summary: string | null
          area: number | null
          created_at: string
          description: string | null
          district: string | null
          id: string
          images: Json | null
          investment_score: number | null
          is_active: boolean
          last_seen_at: string | null
          legal_risk_score: number | null
          price: number | null
          property_type: string | null
          risk_flags: Json | null
          source: string | null
          source_url: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          ai_summary?: string | null
          area?: number | null
          created_at?: string
          description?: string | null
          district?: string | null
          id?: string
          images?: Json | null
          investment_score?: number | null
          is_active?: boolean
          last_seen_at?: string | null
          legal_risk_score?: number | null
          price?: number | null
          property_type?: string | null
          risk_flags?: Json | null
          source?: string | null
          source_url?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          ai_summary?: string | null
          area?: number | null
          created_at?: string
          description?: string | null
          district?: string | null
          id?: string
          images?: Json | null
          investment_score?: number | null
          is_active?: boolean
          last_seen_at?: string | null
          legal_risk_score?: number | null
          price?: number | null
          property_type?: string | null
          risk_flags?: Json | null
          source?: string | null
          source_url?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      property_matches: {
        Row: {
          ai_reason: string | null
          created_at: string
          id: string
          legal_comment: string | null
          match_score: number | null
          property_id: string
          request_id: string
          status: string
        }
        Insert: {
          ai_reason?: string | null
          created_at?: string
          id?: string
          legal_comment?: string | null
          match_score?: number | null
          property_id: string
          request_id: string
          status?: string
        }
        Update: {
          ai_reason?: string | null
          created_at?: string
          id?: string
          legal_comment?: string | null
          match_score?: number | null
          property_id?: string
          request_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_matches_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_matches_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "property_search_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      property_search_requests: {
        Row: {
          ai_summary: string | null
          area_max: number | null
          area_min: number | null
          budget_max: number | null
          budget_min: number | null
          client_comment: string | null
          client_name: string
          contact_method: string | null
          created_at: string
          deposit_max: number | null
          districts: string[] | null
          furniture_required: boolean | null
          goal: string | null
          has_children: boolean | null
          has_pets: boolean | null
          id: string
          move_in_date: string | null
          phone: string
          property_type: string
          registration_required: boolean | null
          rental_term: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          area_max?: number | null
          area_min?: number | null
          budget_max?: number | null
          budget_min?: number | null
          client_comment?: string | null
          client_name: string
          contact_method?: string | null
          created_at?: string
          deposit_max?: number | null
          districts?: string[] | null
          furniture_required?: boolean | null
          goal?: string | null
          has_children?: boolean | null
          has_pets?: boolean | null
          id?: string
          move_in_date?: string | null
          phone: string
          property_type: string
          registration_required?: boolean | null
          rental_term?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          area_max?: number | null
          area_min?: number | null
          budget_max?: number | null
          budget_min?: number | null
          client_comment?: string | null
          client_name?: string
          contact_method?: string | null
          created_at?: string
          deposit_max?: number | null
          districts?: string[] | null
          furniture_required?: boolean | null
          goal?: string | null
          has_children?: boolean | null
          has_pets?: boolean | null
          id?: string
          move_in_date?: string | null
          phone?: string
          property_type?: string
          registration_required?: boolean | null
          rental_term?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      real_estate_deals: {
        Row: {
          ai_summary: string | null
          buyer_client_id: string | null
          created_at: string
          currency: string | null
          deal_stage: string
          id: string
          matter_id: string | null
          mortgage_flag: boolean
          object_id: string | null
          price: number | null
          registration_status: string | null
          risk_level: string | null
          seller_client_id: string | null
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          buyer_client_id?: string | null
          created_at?: string
          currency?: string | null
          deal_stage?: string
          id?: string
          matter_id?: string | null
          mortgage_flag?: boolean
          object_id?: string | null
          price?: number | null
          registration_status?: string | null
          risk_level?: string | null
          seller_client_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          buyer_client_id?: string | null
          created_at?: string
          currency?: string | null
          deal_stage?: string
          id?: string
          matter_id?: string | null
          mortgage_flag?: boolean
          object_id?: string | null
          price?: number | null
          registration_status?: string | null
          risk_level?: string | null
          seller_client_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "real_estate_deals_buyer_client_id_fkey"
            columns: ["buyer_client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_estate_deals_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "legal_matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_estate_deals_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "real_estate_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_estate_deals_seller_client_id_fkey"
            columns: ["seller_client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      real_estate_documents: {
        Row: {
          ai_detected_risks: Json
          ai_summary: string | null
          created_at: string
          deal_id: string | null
          document_type: string | null
          file_name: string | null
          id: string
          object_id: string | null
          ocr_text: string | null
          storage_path: string | null
        }
        Insert: {
          ai_detected_risks?: Json
          ai_summary?: string | null
          created_at?: string
          deal_id?: string | null
          document_type?: string | null
          file_name?: string | null
          id?: string
          object_id?: string | null
          ocr_text?: string | null
          storage_path?: string | null
        }
        Update: {
          ai_detected_risks?: Json
          ai_summary?: string | null
          created_at?: string
          deal_id?: string | null
          document_type?: string | null
          file_name?: string | null
          id?: string
          object_id?: string | null
          ocr_text?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "real_estate_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "real_estate_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_estate_documents_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "real_estate_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      real_estate_matches: {
        Row: {
          ai_reason: string | null
          created_at: string
          id: string
          investment_score: number | null
          legal_risk_score: number | null
          match_score: number | null
          object_id: string | null
          request_id: string | null
          status: string
        }
        Insert: {
          ai_reason?: string | null
          created_at?: string
          id?: string
          investment_score?: number | null
          legal_risk_score?: number | null
          match_score?: number | null
          object_id?: string | null
          request_id?: string | null
          status?: string
        }
        Update: {
          ai_reason?: string | null
          created_at?: string
          id?: string
          investment_score?: number | null
          legal_risk_score?: number | null
          match_score?: number | null
          object_id?: string | null
          request_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "real_estate_matches_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "real_estate_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_estate_matches_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "real_estate_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      real_estate_negotiations: {
        Row: {
          ai_summary: string | null
          created_at: string
          deal_id: string | null
          id: string
          message: string | null
          negotiation_stage: string
          next_action: string | null
          offer_id: string | null
          party: string | null
          result: string | null
        }
        Insert: {
          ai_summary?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          message?: string | null
          negotiation_stage?: string
          next_action?: string | null
          offer_id?: string | null
          party?: string | null
          result?: string | null
        }
        Update: {
          ai_summary?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          message?: string | null
          negotiation_stage?: string
          next_action?: string | null
          offer_id?: string | null
          party?: string | null
          result?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "real_estate_negotiations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "real_estate_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_estate_negotiations_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "real_estate_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      real_estate_objects: {
        Row: {
          address_text: string | null
          ai_summary: string | null
          area_kitchen: number | null
          area_land: number | null
          area_living: number | null
          area_total: number | null
          cadastral_number: string | null
          city: string | null
          created_at: string
          currency: string | null
          deal_type: string | null
          district: string | null
          floor: number | null
          floors_total: number | null
          id: string
          investment_score: number | null
          legal_risk_score: number | null
          owner_type: string | null
          price: number | null
          property_type: string
          rooms: number | null
          source: string | null
          source_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address_text?: string | null
          ai_summary?: string | null
          area_kitchen?: number | null
          area_land?: number | null
          area_living?: number | null
          area_total?: number | null
          cadastral_number?: string | null
          city?: string | null
          created_at?: string
          currency?: string | null
          deal_type?: string | null
          district?: string | null
          floor?: number | null
          floors_total?: number | null
          id?: string
          investment_score?: number | null
          legal_risk_score?: number | null
          owner_type?: string | null
          price?: number | null
          property_type: string
          rooms?: number | null
          source?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address_text?: string | null
          ai_summary?: string | null
          area_kitchen?: number | null
          area_land?: number | null
          area_living?: number | null
          area_total?: number | null
          cadastral_number?: string | null
          city?: string | null
          created_at?: string
          currency?: string | null
          deal_type?: string | null
          district?: string | null
          floor?: number | null
          floors_total?: number | null
          id?: string
          investment_score?: number | null
          legal_risk_score?: number | null
          owner_type?: string | null
          price?: number | null
          property_type?: string
          rooms?: number | null
          source?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      real_estate_offers: {
        Row: {
          ai_summary: string | null
          created_at: string
          currency: string | null
          deal_id: string | null
          id: string
          legal_risk_level: string | null
          notes: string | null
          object_id: string | null
          offer_price: number | null
          offer_type: string
          request_id: string | null
          status: string
          terms: string | null
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          created_at?: string
          currency?: string | null
          deal_id?: string | null
          id?: string
          legal_risk_level?: string | null
          notes?: string | null
          object_id?: string | null
          offer_price?: number | null
          offer_type?: string
          request_id?: string | null
          status?: string
          terms?: string | null
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          created_at?: string
          currency?: string | null
          deal_id?: string | null
          id?: string
          legal_risk_level?: string | null
          notes?: string | null
          object_id?: string | null
          offer_price?: number | null
          offer_type?: string
          request_id?: string | null
          status?: string
          terms?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "real_estate_offers_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "real_estate_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_estate_offers_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "real_estate_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_estate_offers_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "real_estate_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      real_estate_registry_checks: {
        Row: {
          ai_summary: string | null
          cadastral_number: string | null
          check_type: string | null
          created_at: string
          deal_id: string | null
          detected_risks: Json
          id: string
          object_id: string | null
          result_json: Json
          status: string
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          cadastral_number?: string | null
          check_type?: string | null
          created_at?: string
          deal_id?: string | null
          detected_risks?: Json
          id?: string
          object_id?: string | null
          result_json?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          cadastral_number?: string | null
          check_type?: string | null
          created_at?: string
          deal_id?: string | null
          detected_risks?: Json
          id?: string
          object_id?: string | null
          result_json?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "real_estate_registry_checks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "real_estate_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_estate_registry_checks_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "real_estate_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      real_estate_requests: {
        Row: {
          ai_questions: Json
          ai_summary: string | null
          area_max: number | null
          area_min: number | null
          budget_max: number | null
          budget_min: number | null
          city: string | null
          client_comment: string | null
          client_id: string | null
          created_at: string
          districts: string[]
          goal: string
          id: string
          lead_id: string | null
          must_have: string[]
          must_not_have: string[]
          property_type: string | null
          risk_level: string | null
          rooms_max: number | null
          rooms_min: number | null
          status: string
          updated_at: string
        }
        Insert: {
          ai_questions?: Json
          ai_summary?: string | null
          area_max?: number | null
          area_min?: number | null
          budget_max?: number | null
          budget_min?: number | null
          city?: string | null
          client_comment?: string | null
          client_id?: string | null
          created_at?: string
          districts?: string[]
          goal: string
          id?: string
          lead_id?: string | null
          must_have?: string[]
          must_not_have?: string[]
          property_type?: string | null
          risk_level?: string | null
          rooms_max?: number | null
          rooms_min?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          ai_questions?: Json
          ai_summary?: string | null
          area_max?: number | null
          area_min?: number | null
          budget_max?: number | null
          budget_min?: number | null
          city?: string | null
          client_comment?: string | null
          client_id?: string | null
          created_at?: string
          districts?: string[]
          goal?: string
          id?: string
          lead_id?: string | null
          must_have?: string[]
          must_not_have?: string[]
          property_type?: string | null
          risk_level?: string | null
          rooms_max?: number | null
          rooms_min?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "real_estate_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_estate_requests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      real_estate_risks: {
        Row: {
          created_at: string
          deal_id: string | null
          description: string | null
          id: string
          object_id: string | null
          recommended_action: string | null
          risk_type: string | null
          severity: string
        }
        Insert: {
          created_at?: string
          deal_id?: string | null
          description?: string | null
          id?: string
          object_id?: string | null
          recommended_action?: string | null
          risk_type?: string | null
          severity?: string
        }
        Update: {
          created_at?: string
          deal_id?: string | null
          description?: string | null
          id?: string
          object_id?: string | null
          recommended_action?: string | null
          risk_type?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "real_estate_risks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "real_estate_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_estate_risks_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "real_estate_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      real_estate_viewings: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          object_id: string | null
          request_id: string | null
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          object_id?: string | null
          request_id?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          object_id?: string | null
          request_id?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "real_estate_viewings_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "real_estate_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_estate_viewings_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "real_estate_requests"
            referencedColumns: ["id"]
          },
        ]
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
          advisor_photo_url: string | null
          contact_email: string | null
          contact_max_url: string | null
          contact_phone: string | null
          contact_telegram_url: string | null
          contact_whatsapp_url: string | null
          hero_image_url: string | null
          hero_object_position_x: number
          hero_object_position_y: number
          hero_scale: number
          id: number
          legal_address: string | null
          legal_form: string | null
          legal_full_name: string | null
          legal_inn: string | null
          legal_ogrnip: string | null
          site_domain: string | null
          updated_at: string
        }
        Insert: {
          advisor_photo_url?: string | null
          contact_email?: string | null
          contact_max_url?: string | null
          contact_phone?: string | null
          contact_telegram_url?: string | null
          contact_whatsapp_url?: string | null
          hero_image_url?: string | null
          hero_object_position_x?: number
          hero_object_position_y?: number
          hero_scale?: number
          id?: number
          legal_address?: string | null
          legal_form?: string | null
          legal_full_name?: string | null
          legal_inn?: string | null
          legal_ogrnip?: string | null
          site_domain?: string | null
          updated_at?: string
        }
        Update: {
          advisor_photo_url?: string | null
          contact_email?: string | null
          contact_max_url?: string | null
          contact_phone?: string | null
          contact_telegram_url?: string | null
          contact_whatsapp_url?: string | null
          hero_image_url?: string | null
          hero_object_position_x?: number
          hero_object_position_y?: number
          hero_scale?: number
          id?: number
          legal_address?: string | null
          legal_form?: string | null
          legal_full_name?: string | null
          legal_inn?: string | null
          legal_ogrnip?: string | null
          site_domain?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tax_matter_profiles: {
        Row: {
          act_date: string | null
          ai_summary: string | null
          appeal_deadline: string | null
          created_at: string | null
          decision_date: string | null
          demand_date: string | null
          fine_amount: number | null
          id: string
          inspection_type: string | null
          matter_id: string
          objections_deadline: string | null
          penalty_amount: number | null
          requested_documents: Json | null
          response_deadline: string | null
          risk_factors: Json | null
          tax_amount: number | null
          tax_authority: string | null
          tax_period: string | null
          updated_at: string | null
        }
        Insert: {
          act_date?: string | null
          ai_summary?: string | null
          appeal_deadline?: string | null
          created_at?: string | null
          decision_date?: string | null
          demand_date?: string | null
          fine_amount?: number | null
          id?: string
          inspection_type?: string | null
          matter_id: string
          objections_deadline?: string | null
          penalty_amount?: number | null
          requested_documents?: Json | null
          response_deadline?: string | null
          risk_factors?: Json | null
          tax_amount?: number | null
          tax_authority?: string | null
          tax_period?: string | null
          updated_at?: string | null
        }
        Update: {
          act_date?: string | null
          ai_summary?: string | null
          appeal_deadline?: string | null
          created_at?: string | null
          decision_date?: string | null
          demand_date?: string | null
          fine_amount?: number | null
          id?: string
          inspection_type?: string | null
          matter_id?: string
          objections_deadline?: string | null
          penalty_amount?: number | null
          requested_documents?: Json | null
          response_deadline?: string | null
          risk_factors?: Json | null
          tax_amount?: number | null
          tax_authority?: string | null
          tax_period?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_matter_profiles_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "legal_matters"
            referencedColumns: ["id"]
          },
        ]
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
      v_legal_regulatory_alerts_dashboard: {
        Row: {
          ai_impact_analysis: Json | null
          article: string | null
          briefing_id: string | null
          briefing_impact_level: string | null
          briefing_summary: string | null
          change_summary: string | null
          created_at: string | null
          crm_task_id: string | null
          id: string | null
          importance_level: string | null
          law_name: string | null
          monitored_source_id: string | null
          new_content_excerpt: string | null
          new_hash: string | null
          old_content_excerpt: string | null
          old_hash: string | null
          practice_area: string | null
          required_actions: Json | null
          reviewed_at: string | null
          risks: Json | null
          source_name: string | null
          source_type: string | null
          status: string | null
          title: string | null
          what_changed: string | null
          who_is_affected: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_regulatory_update_alerts_monitored_source_id_fkey"
            columns: ["monitored_source_id"]
            isOneToOne: false
            referencedRelation: "legal_regulatory_monitored_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_regulatory_update_alerts_monitored_source_id_fkey"
            columns: ["monitored_source_id"]
            isOneToOne: false
            referencedRelation: "v_legal_regulatory_monitoring_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      v_legal_regulatory_monitoring_dashboard: {
        Row: {
          article: string | null
          check_frequency: string | null
          id: string | null
          importance_level: string | null
          is_active: boolean | null
          last_alert_at: string | null
          last_changed_at: string | null
          last_checked_at: string | null
          law_name: string | null
          new_alerts_count: number | null
          practice_area: string | null
          source_name: string | null
          source_type: string | null
          title: string | null
        }
        Insert: {
          article?: string | null
          check_frequency?: string | null
          id?: string | null
          importance_level?: string | null
          is_active?: boolean | null
          last_alert_at?: never
          last_changed_at?: string | null
          last_checked_at?: string | null
          law_name?: string | null
          new_alerts_count?: never
          practice_area?: string | null
          source_name?: string | null
          source_type?: string | null
          title?: string | null
        }
        Update: {
          article?: string | null
          check_frequency?: string | null
          id?: string | null
          importance_level?: string | null
          is_active?: boolean | null
          last_alert_at?: never
          last_changed_at?: string | null
          last_checked_at?: string | null
          law_name?: string | null
          new_alerts_count?: never
          practice_area?: string | null
          source_name?: string | null
          source_type?: string | null
          title?: string | null
        }
        Relationships: []
      }
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
      match_legal_knowledge: {
        Args: {
          category_filter?: string
          match_count?: number
          query_embedding: string
          subcategory_boost?: string
        }
        Returns: {
          content: string
          id: string
          metadata: Json
          similarity: number
          title: string
        }[]
      }
      match_legal_law_chunks: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          article: string
          code_name: string
          content: string
          id: string
          metadata: Json
          part: string
          similarity: number
          title: string
        }[]
      }
      match_legal_laws: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          article: string
          code_name: string
          content: string
          id: string
          metadata: Json
          similarity: number
          title: string
        }[]
      }
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
