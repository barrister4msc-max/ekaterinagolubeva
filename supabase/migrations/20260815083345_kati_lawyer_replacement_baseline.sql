-- KATI LAWYER replacement baseline
-- Generated: 2026-08-15
-- Purpose: rebuild a fresh Preview from the verified production-equivalent
-- schema and repository-owned reference data.
-- Safety: contains no client, document, answer, session, or auth-user rows.
-- Production migration history must not be reconciled by this file without a
-- separate approved rollback plan.

-- Self-contained Preview prerequisite: historical migrations grant narrowly
-- scoped privileges to this internal role. roles.sql also creates it for local
-- development, but branch replay must not depend on that external hook.
DO $kati_role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kati_internal_kb_writer') THEN
    CREATE ROLE kati_internal_kb_writer
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$kati_role$;


-- =============================================================================
-- 1. Production-equivalent public schema core
-- =============================================================================

-- KATI LAWYER production public schema catalog snapshot
-- Project: wiylzbdbjokignwvizxt
-- Extracted: 2026-08-15
-- READ-ONLY catalog-derived snapshot. Contains schema only; no production rows or secrets.
-- NOT YET APPROVED AS A REPOSITORY MIGRATION.
-- Must pass clean-database verification and migration-history reconciliation first.

SET check_function_bodies = false;
SET search_path = public, extensions;

GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT CREATE, USAGE ON SCHEMA public TO pg_database_owner;
GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO service_role;

-- ============================================================================
-- Prelude
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'super_admin');

CREATE TYPE public.lead_status AS ENUM ('new', 'in_progress', 'waiting', 'closed');

CREATE TYPE public.lead_urgency AS ENUM ('low', 'medium', 'high');

CREATE SEQUENCE public.leads_lead_number_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

-- ============================================================================
-- Tables
-- ============================================================================

CREATE TABLE public.ai_drafts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid NOT NULL,
  conversation_id uuid,
  draft_text text NOT NULL,
  confidence numeric,
  needs_human_review boolean DEFAULT true NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  approved_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ai_intake_analysis (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  conversation_id uuid,
  lead_id uuid,
  client_id uuid,
  model_name text,
  category text,
  subcategory text,
  risk_level text,
  urgency_level text,
  confidence numeric,
  summary text,
  extracted_entities jsonb DEFAULT '{}'::jsonb NOT NULL,
  recommended_action text,
  next_questions jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  query text,
  practice_area text,
  confidence_score numeric,
  service_type text,
  service_priority text,
  short_answer text,
  legal_analysis text,
  risks jsonb DEFAULT '[]'::jsonb,
  recommended_actions jsonb DEFAULT '[]'::jsonb,
  missing_documents jsonb DEFAULT '[]'::jsonb,
  retrieved_sources jsonb DEFAULT '[]'::jsonb,
  retrieved_laws jsonb DEFAULT '[]'::jsonb,
  retrieved_law_chunks jsonb DEFAULT '[]'::jsonb,
  full_result jsonb
);

CREATE TABLE public.ai_source_routing_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  route_name text NOT NULL,
  trigger_keywords text[],
  use_internal_laws boolean DEFAULT true NOT NULL,
  use_legal_knowledge boolean DEFAULT true NOT NULL,
  use_official_sources boolean DEFAULT false NOT NULL,
  use_registry_sources boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ai_usage_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  model_name text,
  operation_type text,
  tokens_input integer,
  tokens_output integer,
  cost_estimate numeric,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.case_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  case_id uuid NOT NULL,
  document_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.communication_attachments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  message_id uuid,
  storage_path text,
  external_file_id text,
  external_file_unique_id text,
  file_name text,
  mime_type text,
  file_size bigint,
  ocr_text text,
  ai_summary text,
  ai_detected_risks jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.communication_channels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  channel_type text NOT NULL,
  name text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  settings_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.communication_contacts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  channel_id uuid,
  external_user_id text,
  external_chat_id text,
  phone text,
  email text,
  username text,
  first_name text,
  last_name text,
  full_name text,
  language_code text,
  source text,
  raw_profile jsonb DEFAULT '{}'::jsonb NOT NULL,
  crm_client_id uuid,
  is_blocked boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.communication_conversations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contact_id uuid,
  channel_id uuid,
  status text DEFAULT 'active'::text NOT NULL,
  assigned_to uuid,
  crm_client_id uuid,
  crm_lead_id uuid,
  ai_category text,
  ai_subcategory text,
  ai_risk_level text,
  ai_summary text,
  last_message_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.communication_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  conversation_id uuid,
  direction text NOT NULL,
  message_type text DEFAULT 'text'::text NOT NULL,
  external_message_id text,
  text_content text,
  raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  ai_summary text,
  ai_extracted_entities jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.communication_webhook_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  channel_type text NOT NULL,
  external_update_id text,
  raw_payload jsonb NOT NULL,
  processed boolean DEFAULT false NOT NULL,
  processing_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.compliance_checks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid,
  client_id uuid,
  check_subject text,
  subject_type text,
  inn text,
  ogrn text,
  ogrnip text,
  fio text,
  birth_date text,
  region text,
  status text DEFAULT 'pending'::text NOT NULL,
  risk_level text,
  summary text,
  registry_results jsonb DEFAULT '[]'::jsonb NOT NULL,
  missing_data jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.consultation_bookings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid,
  lead_id uuid,
  matter_id uuid,
  scheduled_at timestamp with time zone,
  status text DEFAULT 'pending'::text NOT NULL,
  meeting_type text DEFAULT 'online'::text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.consultations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid,
  starts_at timestamp with time zone NOT NULL,
  ends_at timestamp with time zone,
  status text DEFAULT 'scheduled'::text NOT NULL,
  meeting_url text,
  notes text,
  price numeric,
  payment_status text DEFAULT 'unpaid'::text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.contract_clauses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contract_id uuid,
  clause_number text,
  clause_title text,
  clause_text text,
  ai_comment text,
  risk_level text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.contract_reviews (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contract_id uuid,
  review_status text DEFAULT 'pending'::text NOT NULL,
  risk_level text DEFAULT 'unknown'::text NOT NULL,
  ai_summary text,
  recommended_action text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.contract_risks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contract_review_id uuid,
  risk_title text NOT NULL,
  risk_description text,
  severity text DEFAULT 'medium'::text NOT NULL,
  recommended_fix text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.contracts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  matter_id uuid,
  contract_type text NOT NULL,
  status text DEFAULT 'uploaded'::text NOT NULL,
  version_number integer DEFAULT 1 NOT NULL,
  storage_path text,
  file_name text,
  ai_summary text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.conversation_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  conversation_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  channel text NOT NULL,
  direction text NOT NULL,
  message_text text,
  external_message_id text,
  raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  ai_generated boolean DEFAULT false NOT NULL,
  sent_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.conversations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid NOT NULL,
  channel text NOT NULL,
  external_chat_id text,
  external_user_id text,
  status text DEFAULT 'open'::text NOT NULL,
  assigned_to uuid,
  last_message_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.court_case_import_queue (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  case_number text,
  case_name text,
  court_name text,
  practice_area text DEFAULT 'tax'::text,
  archive_name text,
  original_file_name text NOT NULL,
  storage_path text,
  volume_number text,
  page_number integer,
  document_type text,
  ocr_text text,
  contains_personal_data boolean DEFAULT true NOT NULL,
  requires_redaction boolean DEFAULT true NOT NULL,
  redacted_text text,
  extracted_legal_position text,
  extracted_court_reasoning text,
  extracted_tax_authority_position text,
  extracted_taxpayer_position text,
  import_status text DEFAULT 'ocr_pending'::text NOT NULL,
  import_error text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.court_cases (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  matter_id uuid,
  court_name text,
  case_number text,
  judge_name text,
  status text DEFAULT 'preparation'::text NOT NULL,
  claim_amount numeric,
  next_hearing_at timestamp with time zone,
  ai_summary text,
  risk_level text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.court_deadlines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  court_case_id uuid,
  title text NOT NULL,
  deadline_at timestamp with time zone NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.court_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  court_case_id uuid,
  document_type text,
  storage_path text,
  file_name text,
  ocr_text text,
  ai_summary text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.court_hearings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  court_case_id uuid,
  hearing_date timestamp with time zone,
  hearing_type text,
  result text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.crm_clients (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  full_name text,
  phone text,
  email text,
  client_type text DEFAULT 'individual'::text NOT NULL,
  source text,
  notes text,
  tags text[] DEFAULT '{}'::text[] NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.crm_leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid,
  source text,
  status text DEFAULT 'new'::text NOT NULL,
  pipeline_stage text DEFAULT 'new'::text NOT NULL,
  assigned_to uuid,
  title text,
  description text,
  ai_category text,
  ai_subcategory text,
  ai_summary text,
  ai_risk_level text,
  ai_recommended_action text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.crm_notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid,
  lead_id uuid,
  matter_id uuid,
  author_id uuid,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.crm_tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid,
  lead_id uuid,
  matter_id uuid,
  title text NOT NULL,
  description text,
  status text DEFAULT 'open'::text NOT NULL,
  priority text DEFAULT 'normal'::text NOT NULL,
  due_at timestamp with time zone,
  assigned_to uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.document_intake_ai_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  session_id uuid NOT NULL,
  generated_document_id uuid,
  run_type text DEFAULT 'initial'::text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  input_snapshot jsonb,
  ai_result jsonb,
  used_sources jsonb,
  source_verification_status text,
  hallucination_risk text,
  legal_accuracy_score numeric,
  needs_lawyer_review boolean DEFAULT true NOT NULL,
  review_status text,
  review_result jsonb,
  problems jsonb,
  required_fixes jsonb,
  recommendations jsonb,
  model_name text,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone
);

CREATE TABLE public.document_intake_answers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  session_id uuid NOT NULL,
  field_name text NOT NULL,
  field_label text,
  field_value jsonb,
  value_source text DEFAULT 'ai_extracted'::text NOT NULL,
  confidence numeric,
  source_document_id uuid,
  source_quote text,
  source_page integer,
  needs_review boolean DEFAULT true NOT NULL,
  is_verified boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.document_intake_schemas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  template_code text NOT NULL,
  jurisdiction text,
  language text DEFAULT 'ru'::text NOT NULL,
  title text NOT NULL,
  description text,
  schema_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  required_fields text[] DEFAULT '{}'::text[] NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  category text DEFAULT 'general'::text,
  display_order integer DEFAULT 1000,
  is_featured boolean DEFAULT false NOT NULL
);

CREATE TABLE public.document_intake_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  matter_id uuid,
  client_id uuid,
  lead_id uuid,
  document_id uuid,
  template_code text NOT NULL,
  jurisdiction text DEFAULT 'RU'::text NOT NULL,
  language text DEFAULT 'ru'::text NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  source_type text DEFAULT 'lawyer_upload'::text NOT NULL,
  ai_summary text,
  ai_risk_level text,
  ai_recommended_action text,
  created_by uuid,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  title text,
  generated_document_id uuid,
  last_opened_at timestamp with time zone,
  analysis_iteration integer DEFAULT 0 NOT NULL,
  last_ai_analysis_at timestamp with time zone,
  archived_at timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.document_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  template_key text NOT NULL,
  description text,
  is_active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 100 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid,
  lead_id uuid,
  matter_id uuid,
  document_type text,
  storage_path text,
  file_name text,
  mime_type text,
  ocr_text text,
  ai_summary text,
  ai_detected_entities jsonb DEFAULT '{}'::jsonb NOT NULL,
  ai_detected_risks jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  uploaded_by uuid,
  upload_source text DEFAULT 'lawyer_manual'::text NOT NULL,
  title text,
  document_category text,
  document_purpose text,
  analysis_status text DEFAULT 'pending'::text NOT NULL,
  review_status text DEFAULT 'not_started'::text NOT NULL,
  risk_level text,
  recommended_actions jsonb DEFAULT '[]'::jsonb NOT NULL,
  recommended_documents jsonb DEFAULT '[]'::jsonb NOT NULL,
  missing_documents jsonb DEFAULT '[]'::jsonb NOT NULL,
  legal_basis jsonb DEFAULT '[]'::jsonb NOT NULL,
  is_archived boolean DEFAULT false NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  batch_id uuid
);

CREATE TABLE public.external_registry_sources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source_name text NOT NULL,
  source_type text NOT NULL,
  domain text NOT NULL,
  base_url text NOT NULL,
  description text,
  required_data jsonb DEFAULT '[]'::jsonb NOT NULL,
  use_case text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  source_code text,
  lookup_url text,
  source_priority integer DEFAULT 100
);

CREATE TABLE public.external_reviews (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source text NOT NULL,
  source_review_id text,
  author_name text,
  rating numeric(2,1),
  review_text text NOT NULL,
  review_date date,
  service_category text,
  external_url text,
  is_published boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.generated_document_sources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  generated_document_id uuid NOT NULL,
  source_registry_id uuid,
  knowledge_chunk_id uuid,
  source_type text NOT NULL,
  source_title text NOT NULL,
  official_url text,
  used_for text,
  why_used text,
  fact_to_law_link text,
  current_status text DEFAULT 'unknown'::text NOT NULL,
  verification_status text DEFAULT 'needs_check'::text NOT NULL,
  last_checked_at timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.generated_legal_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid,
  source_document_id uuid,
  template_key text NOT NULL,
  title text NOT NULL,
  content text,
  status text DEFAULT 'draft'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  category text,
  crm_lead_id text,
  template_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_by uuid,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  intake_session_id uuid,
  ai_review_status text,
  lawyer_approved_at timestamp with time zone,
  lawyer_approved_by uuid,
  parent_document_id uuid,
  version_number integer DEFAULT 1 NOT NULL,
  archived_at timestamp with time zone
);

CREATE TABLE public.lawyer_archive_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  matter_id uuid,
  document_id uuid,
  title text NOT NULL,
  item_type text DEFAULT 'document'::text NOT NULL,
  category text,
  description text,
  storage_path text,
  source_url text,
  content text,
  tags text[] DEFAULT '{}'::text[] NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_by uuid,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.lawyer_document_actions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  matter_id uuid,
  document_id uuid,
  action_type text NOT NULL,
  title text NOT NULL,
  description text,
  priority text DEFAULT 'medium'::text NOT NULL,
  status text DEFAULT 'suggested'::text NOT NULL,
  generated_document_id uuid,
  created_by uuid,
  approved_by uuid,
  approved_at timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.lawyer_matter_strategy (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  matter_id uuid NOT NULL,
  facts jsonb DEFAULT '[]'::jsonb NOT NULL,
  client_position text,
  opponent_position text,
  strengths jsonb DEFAULT '[]'::jsonb NOT NULL,
  weaknesses jsonb DEFAULT '[]'::jsonb NOT NULL,
  risks jsonb DEFAULT '[]'::jsonb NOT NULL,
  legal_basis jsonb DEFAULT '[]'::jsonb NOT NULL,
  court_practice jsonb DEFAULT '[]'::jsonb NOT NULL,
  recommended_documents jsonb DEFAULT '[]'::jsonb NOT NULL,
  next_steps jsonb DEFAULT '[]'::jsonb NOT NULL,
  success_probability text,
  ai_summary text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.lead_consents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid,
  consent_type text NOT NULL,
  consent_text text NOT NULL,
  consent_version text DEFAULT '2026-05'::text NOT NULL,
  privacy_policy_version text DEFAULT '2026-05'::text NOT NULL,
  consent_source text NOT NULL,
  consent_given boolean DEFAULT true NOT NULL,
  ai_processing_consent boolean DEFAULT false NOT NULL,
  legal_disclaimer_accepted boolean DEFAULT false NOT NULL,
  ip_address text,
  user_agent text,
  page_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.lead_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid,
  file_url text,
  created_at timestamp with time zone DEFAULT now(),
  file_name text,
  document_type text,
  ai_summary text,
  ai_risks text[],
  extracted_data jsonb,
  analysis_status text DEFAULT 'pending'::text,
  analyzed_at timestamp with time zone,
  crm_lead_id uuid,
  crm_client_id uuid,
  legal_matter_id uuid,
  conversation_id uuid
);

CREATE TABLE public.lead_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid NOT NULL,
  type text DEFAULT 'note'::text NOT NULL,
  message text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.lead_notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid NOT NULL,
  body text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.lead_tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  status text DEFAULT 'open'::text NOT NULL,
  due_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone
);

CREATE TABLE public.lead_timeline (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid NOT NULL,
  event_type text NOT NULL,
  title text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  contact text,
  original_text text NOT NULL,
  category text,
  qa jsonb DEFAULT '[]'::jsonb NOT NULL,
  ai_summary text,
  urgency lead_urgency,
  risks text[] DEFAULT '{}'::text[] NOT NULL,
  next_step text,
  documents_checklist text[] DEFAULT '{}'::text[] NOT NULL,
  status lead_status DEFAULT 'new'::lead_status NOT NULL,
  admin_notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  source text DEFAULT 'website'::text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_url text,
  referrer text,
  priority text DEFAULT 'normal'::text,
  pipeline_stage text DEFAULT 'new'::text,
  estimated_budget numeric,
  next_followup_at timestamp with time zone,
  assigned_to uuid,
  last_contact_at timestamp with time zone,
  closed_at timestamp with time zone,
  consent_given boolean DEFAULT false NOT NULL,
  consent_timestamp timestamp with time zone,
  consent_version text DEFAULT '2026-05'::text,
  consent_source text,
  privacy_policy_version text DEFAULT '2026-05'::text,
  ai_processing_consent boolean DEFAULT false NOT NULL,
  consent_user_agent text,
  consent_ip text,
  legal_disclaimer_accepted boolean DEFAULT false NOT NULL,
  source_crm_lead_id uuid,
  lead_number bigint DEFAULT nextval('leads_lead_number_seq'::regclass) NOT NULL,
  archived_at timestamp with time zone
);

CREATE TABLE public.legal_ai_briefings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source_id uuid,
  title text NOT NULL,
  summary text,
  impact_level text,
  affected_practice_areas text[],
  recommendations text,
  created_at timestamp with time zone DEFAULT now(),
  monitored_source_id uuid,
  alert_id uuid,
  practice_area text,
  source_type text,
  source_name text,
  law_name text,
  article text,
  what_changed text,
  who_is_affected text,
  risks jsonb DEFAULT '[]'::jsonb,
  required_actions jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'new'::text,
  created_task_id uuid,
  ai_model text,
  ai_raw_result jsonb DEFAULT '{}'::jsonb,
  reviewed_at timestamp with time zone,
  reviewed_by uuid
);

CREATE TABLE public.legal_cases (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid,
  title text NOT NULL,
  case_type text,
  status text DEFAULT 'new'::text,
  priority text DEFAULT 'normal'::text,
  responsible_lawyer uuid,
  ai_summary text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  legacy_lead_id uuid,
  court_name text,
  court_case_number text,
  claim_amount numeric,
  opponent_name text,
  opponent_phone text,
  next_hearing_at timestamp with time zone,
  next_deadline_at timestamp with time zone,
  matter_status text
);

CREATE TABLE public.legal_document_reviews (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid,
  document_id uuid,
  review_status text DEFAULT 'completed'::text NOT NULL,
  document_type text,
  risk_level text,
  summary text,
  findings jsonb DEFAULT '[]'::jsonb NOT NULL,
  legal_basis jsonb DEFAULT '[]'::jsonb NOT NULL,
  recommended_actions jsonb DEFAULT '[]'::jsonb NOT NULL,
  required_documents jsonb DEFAULT '[]'::jsonb NOT NULL,
  draft_suggestions jsonb DEFAULT '[]'::jsonb NOT NULL,
  compliance_subjects jsonb DEFAULT '[]'::jsonb NOT NULL,
  verification_alerts jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  last_run_at timestamp with time zone,
  run_count integer DEFAULT 0,
  last_error text,
  verification_status text DEFAULT 'pending'::text,
  last_verified_at timestamp with time zone
);

CREATE TABLE public.legal_document_revision_decisions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  generated_document_id uuid NOT NULL,
  created_document_id uuid,
  document_intake_session_id uuid,
  based_on_ai_run_id uuid,
  decision text NOT NULL,
  revision_status text NOT NULL,
  revision_number integer DEFAULT 1 NOT NULL,
  ai_recommendation text,
  change_level text,
  risk_level_before text,
  risk_level_after text,
  lawyer_comment text,
  requested_materials text,
  based_on_analysis jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  is_active boolean DEFAULT true NOT NULL
);

CREATE TABLE public.legal_document_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  title text NOT NULL,
  category text NOT NULL,
  subcategory text,
  practice_area text,
  jurisdiction text[] DEFAULT '{}'::text[] NOT NULL,
  languages text[] DEFAULT '{ru}'::text[] NOT NULL,
  complexity text DEFAULT 'basic'::text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  requires_intake boolean DEFAULT true NOT NULL,
  description text,
  sort_order integer DEFAULT 0 NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.legal_knowledge_chunks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  category text,
  title text,
  content text NOT NULL,
  embedding vector(1536),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  source_type text DEFAULT 'manual'::text
);

CREATE TABLE public.legal_knowledge_import_queue (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  archive_name text,
  original_file_name text NOT NULL,
  storage_path text,
  source_type text DEFAULT 'ekaterina_practice'::text NOT NULL,
  category text DEFAULT 'real_estate'::text NOT NULL,
  subcategory text,
  document_type text DEFAULT 'other'::text,
  extracted_text text,
  redacted_text text,
  contains_personal_data boolean DEFAULT false NOT NULL,
  contains_passport_data boolean DEFAULT false NOT NULL,
  contains_bank_data boolean DEFAULT false NOT NULL,
  contains_signature boolean DEFAULT false NOT NULL,
  requires_redaction boolean DEFAULT true NOT NULL,
  import_status text DEFAULT 'pending'::text NOT NULL,
  approved_by_lawyer boolean DEFAULT false NOT NULL,
  approved_at timestamp with time zone,
  approved_by uuid,
  imported_chunk_id uuid,
  import_error text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.legal_law_chunks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code_name text NOT NULL,
  article text,
  part text,
  title text NOT NULL,
  content text NOT NULL,
  jurisdiction text DEFAULT 'RU'::text NOT NULL,
  practice_area text,
  law_category text,
  embedding vector(1536),
  metadata jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  law_id uuid,
  source_url text,
  source_name text,
  source_checked_at timestamp with time zone,
  content_hash text
);

CREATE TABLE public.legal_laws (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code_name text NOT NULL,
  article text,
  title text NOT NULL,
  content text NOT NULL,
  jurisdiction text DEFAULT 'RU'::text NOT NULL,
  practice_area text,
  law_category text,
  embedding vector(1536),
  metadata jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  source_url text,
  source_name text,
  source_checked_at timestamp with time zone,
  content_hash text
);

CREATE TABLE public.legal_matters (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid,
  lead_id uuid,
  matter_type text NOT NULL,
  status text DEFAULT 'new'::text NOT NULL,
  priority text DEFAULT 'normal'::text NOT NULL,
  title text,
  description text,
  ai_summary text,
  risk_level text,
  opened_at timestamp with time zone DEFAULT now(),
  closed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  matter_number text,
  source_type text DEFAULT 'manual'::text NOT NULL,
  created_by uuid,
  lawyer_notes text,
  archive_status text DEFAULT 'active'::text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.legal_parties (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  matter_id uuid,
  party_type text NOT NULL,
  full_name text,
  phone text,
  email text,
  details_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.legal_reasoning_analyses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  intake_session_id uuid,
  matter_id uuid,
  lead_id uuid,
  generated_document_id uuid,
  source_document_ids uuid[] DEFAULT '{}'::uuid[],
  analysis_type text DEFAULT 'legal_position'::text NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  facts jsonb DEFAULT '[]'::jsonb NOT NULL,
  legally_significant_facts jsonb DEFAULT '[]'::jsonb NOT NULL,
  evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
  legal_questions jsonb DEFAULT '[]'::jsonb NOT NULL,
  applicable_laws jsonb DEFAULT '[]'::jsonb NOT NULL,
  rejected_laws jsonb DEFAULT '[]'::jsonb NOT NULL,
  supporting_practice jsonb DEFAULT '[]'::jsonb NOT NULL,
  adverse_practice jsonb DEFAULT '[]'::jsonb NOT NULL,
  client_arguments jsonb DEFAULT '[]'::jsonb NOT NULL,
  opponent_arguments jsonb DEFAULT '[]'::jsonb NOT NULL,
  rebuttal_strategy jsonb DEFAULT '[]'::jsonb NOT NULL,
  risks jsonb DEFAULT '[]'::jsonb NOT NULL,
  missing_documents jsonb DEFAULT '[]'::jsonb NOT NULL,
  recommended_strategy jsonb DEFAULT '{}'::jsonb NOT NULL,
  final_legal_position text,
  lawyer_summary text,
  confidence_score numeric,
  hallucination_risk text DEFAULT 'medium'::text,
  needs_lawyer_review boolean DEFAULT true,
  used_sources jsonb DEFAULT '[]'::jsonb NOT NULL,
  ai_model text,
  raw_ai_response jsonb,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.legal_regulatory_monitored_sources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  practice_area text NOT NULL,
  source_type text DEFAULT 'law_article'::text NOT NULL,
  source_name text NOT NULL,
  source_url text,
  law_name text,
  article text,
  title text NOT NULL,
  current_content text,
  current_hash text,
  last_checked_at timestamp with time zone,
  last_changed_at timestamp with time zone,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  check_frequency text DEFAULT 'weekly'::text,
  importance_level text DEFAULT 'medium'::text,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.legal_regulatory_update_alerts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  monitored_source_id uuid,
  practice_area text NOT NULL,
  article text,
  title text NOT NULL,
  old_hash text,
  new_hash text,
  change_summary text,
  ai_impact_analysis jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'new'::text,
  importance_level text DEFAULT 'medium'::text,
  created_at timestamp with time zone DEFAULT now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  source_type text,
  source_name text,
  law_name text,
  old_content_excerpt text,
  new_content_excerpt text,
  related_task_id uuid,
  briefing_id uuid,
  crm_task_id uuid,
  ai_model text,
  ai_raw_result jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.legal_regulatory_update_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  monitored_source_id uuid,
  status text DEFAULT 'checked'::text NOT NULL,
  message text,
  old_hash text,
  new_hash text,
  changed boolean DEFAULT false,
  error_message text,
  raw_response jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.legal_research_sources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  source_type text NOT NULL,
  url text,
  external_id text,
  authority_level text DEFAULT 'supporting'::text NOT NULL,
  jurisdiction text DEFAULT 'RU'::text NOT NULL,
  practice_area text,
  is_external boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.legal_risks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  matter_id uuid,
  risk_code text,
  title text NOT NULL,
  description text,
  severity text DEFAULT 'medium'::text NOT NULL,
  recommended_action text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.legal_source_gap_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  query_text text,
  missing_source_type text NOT NULL,
  guessed_title text,
  guessed_article text,
  guessed_document_number text,
  context text,
  priority text DEFAULT 'medium'::text NOT NULL,
  status text DEFAULT 'new'::text NOT NULL,
  request_count integer DEFAULT 1 NOT NULL,
  last_requested_at timestamp with time zone DEFAULT now() NOT NULL,
  source_lead_id uuid,
  source_review_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.legal_source_registry (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  source_type text NOT NULL,
  official_url text,
  mirror_url text,
  external_id text,
  authority_name text,
  authority_level text DEFAULT 'supporting'::text NOT NULL,
  jurisdiction text DEFAULT 'RU'::text NOT NULL,
  practice_area text,
  citation text,
  document_number text,
  publication_date date,
  effective_from date,
  effective_to date,
  revision_date date,
  is_external boolean DEFAULT true NOT NULL,
  is_official boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  current_status text DEFAULT 'unknown'::text NOT NULL,
  verification_status text DEFAULT 'needs_check'::text NOT NULL,
  last_checked_at timestamp with time zone,
  retrieved_at timestamp with time zone DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.legal_source_usage_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source_kind text NOT NULL,
  source_id uuid,
  source_ref text,
  lead_id uuid,
  review_id uuid,
  document_id uuid,
  article text,
  reason text,
  verification_status text DEFAULT 'unknown'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.legal_source_verification_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source_kind text NOT NULL,
  source_id uuid,
  source_ref text,
  source_title text,
  requested_by uuid,
  status text DEFAULT 'pending'::text NOT NULL,
  result_summary text,
  external_url text,
  requested_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone
);

CREATE TABLE public.official_legal_sources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source_code text NOT NULL,
  source_name text NOT NULL,
  source_type text NOT NULL,
  domain text NOT NULL,
  base_url text NOT NULL,
  lookup_url text NOT NULL,
  description text,
  use_case text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  source_priority integer DEFAULT 100
);

CREATE TABLE public.payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid,
  lead_id uuid,
  matter_id uuid,
  amount numeric NOT NULL,
  currency text DEFAULT 'RUB'::text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  provider text,
  payment_type text,
  provider_payment_id text,
  provider_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.practice_batches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  archive_name text,
  status text DEFAULT 'uploaded'::text NOT NULL,
  uploaded_by uuid,
  total_files integer DEFAULT 0 NOT NULL,
  total_documents integer DEFAULT 0 NOT NULL,
  total_images integer DEFAULT 0 NOT NULL,
  total_pdfs integer DEFAULT 0 NOT NULL,
  total_docx integer DEFAULT 0 NOT NULL,
  total_errors integer DEFAULT 0 NOT NULL,
  text_extraction_status text DEFAULT 'pending'::text NOT NULL,
  ocr_status text DEFAULT 'pending'::text NOT NULL,
  classification_status text DEFAULT 'pending'::text NOT NULL,
  legal_analysis_status text DEFAULT 'pending'::text NOT NULL,
  lawyer_review_status text DEFAULT 'pending'::text NOT NULL,
  kb_status text DEFAULT 'pending'::text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.practice_document_legal_analysis (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  batch_id uuid,
  document_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  quality_level text,
  quality_score integer,
  document_role text,
  practice_area text,
  document_type text,
  legal_position text,
  legal_reasoning text,
  applicable_laws jsonb DEFAULT '[]'::jsonb NOT NULL,
  fact_to_law_mapping jsonb DEFAULT '[]'::jsonb NOT NULL,
  alternative_positions jsonb DEFAULT '[]'::jsonb NOT NULL,
  counter_arguments jsonb DEFAULT '[]'::jsonb NOT NULL,
  weak_points jsonb DEFAULT '[]'::jsonb NOT NULL,
  missing_evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
  court_practice jsonb DEFAULT '[]'::jsonb NOT NULL,
  fns_letters jsonb DEFAULT '[]'::jsonb NOT NULL,
  minfin_letters jsonb DEFAULT '[]'::jsonb NOT NULL,
  use_in_rag boolean DEFAULT false NOT NULL,
  use_in_generation boolean DEFAULT false NOT NULL,
  requires_lawyer_review boolean DEFAULT true NOT NULL,
  why_quality_level text,
  recommended_use text,
  ai_result jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.practice_import_queue (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  archive_name text,
  original_file_name text NOT NULL,
  storage_path text,
  practice_area text,
  subcategory text,
  document_type text,
  extracted_text text,
  extracted_text_source text,
  contains_personal_data boolean DEFAULT false NOT NULL,
  contains_passport_data boolean DEFAULT false NOT NULL,
  contains_bank_data boolean DEFAULT false NOT NULL,
  requires_redaction boolean DEFAULT true NOT NULL,
  redacted_text text,
  approved_by_lawyer boolean DEFAULT false NOT NULL,
  approved_at timestamp with time zone,
  approved_by uuid,
  import_status text DEFAULT 'pending'::text NOT NULL,
  import_error text,
  target_source_type text DEFAULT 'ekaterina_practice'::text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.practice_legal_analysis_sources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  analysis_id uuid NOT NULL,
  source_id uuid,
  knowledge_chunk_id uuid,
  source_type text NOT NULL,
  source_title text NOT NULL,
  source_url text,
  relevance_score numeric,
  why_used text,
  used_for text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  source_registry_id uuid
);

CREATE TABLE public.profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  display_name text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.properties (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source text,
  source_url text,
  title text,
  price numeric,
  address text,
  district text,
  area numeric,
  property_type text,
  description text,
  images jsonb DEFAULT '[]'::jsonb,
  ai_summary text,
  legal_risk_score integer,
  investment_score integer,
  risk_flags jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'new'::text NOT NULL,
  last_seen_at timestamp with time zone,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.property_matches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  request_id uuid NOT NULL,
  property_id uuid NOT NULL,
  match_score integer,
  ai_reason text,
  legal_comment text,
  status text DEFAULT 'suggested'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.property_search_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_name text NOT NULL,
  phone text NOT NULL,
  contact_method text,
  property_type text NOT NULL,
  budget_min numeric,
  budget_max numeric,
  districts text[] DEFAULT '{}'::text[],
  area_min numeric,
  area_max numeric,
  goal text,
  client_comment text,
  ai_summary text,
  status text DEFAULT 'new'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  move_in_date date,
  rental_term text,
  has_children boolean,
  has_pets boolean,
  furniture_required boolean,
  registration_required boolean,
  deposit_max numeric
);

CREATE TABLE public.real_estate_deals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  matter_id uuid,
  object_id uuid,
  buyer_client_id uuid,
  seller_client_id uuid,
  deal_stage text DEFAULT 'new'::text NOT NULL,
  price numeric,
  currency text DEFAULT 'RUB'::text,
  mortgage_flag boolean DEFAULT false NOT NULL,
  registration_status text,
  ai_summary text,
  risk_level text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.real_estate_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  deal_id uuid,
  object_id uuid,
  document_type text,
  storage_path text,
  file_name text,
  ocr_text text,
  ai_summary text,
  ai_detected_risks jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.real_estate_matches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  request_id uuid,
  object_id uuid,
  match_score numeric,
  legal_risk_score numeric,
  investment_score numeric,
  ai_reason text,
  status text DEFAULT 'new'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.real_estate_negotiations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  deal_id uuid,
  offer_id uuid,
  negotiation_stage text DEFAULT 'initial'::text NOT NULL,
  party text,
  message text,
  result text,
  ai_summary text,
  next_action text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.real_estate_objects (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  property_type text NOT NULL,
  deal_type text,
  city text DEFAULT 'Москва'::text,
  district text,
  address_text text,
  cadastral_number text,
  rooms integer,
  area_total numeric,
  area_living numeric,
  area_kitchen numeric,
  area_land numeric,
  floor integer,
  floors_total integer,
  price numeric,
  currency text DEFAULT 'RUB'::text,
  owner_type text,
  source text,
  source_url text,
  status text DEFAULT 'new'::text NOT NULL,
  ai_summary text,
  legal_risk_score numeric,
  investment_score numeric,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.real_estate_offers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  request_id uuid,
  object_id uuid,
  deal_id uuid,
  offer_type text DEFAULT 'client_offer'::text NOT NULL,
  offer_price numeric,
  currency text DEFAULT 'RUB'::text,
  status text DEFAULT 'draft'::text NOT NULL,
  terms text,
  notes text,
  ai_summary text,
  legal_risk_level text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.real_estate_registry_checks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  object_id uuid,
  deal_id uuid,
  cadastral_number text,
  check_type text,
  status text DEFAULT 'pending'::text NOT NULL,
  result_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  ai_summary text,
  detected_risks jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.real_estate_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid,
  lead_id uuid,
  goal text NOT NULL,
  property_type text,
  city text DEFAULT 'Москва'::text,
  districts text[] DEFAULT '{}'::text[] NOT NULL,
  budget_min numeric,
  budget_max numeric,
  rooms_min integer,
  rooms_max integer,
  area_min numeric,
  area_max numeric,
  must_have text[] DEFAULT '{}'::text[] NOT NULL,
  must_not_have text[] DEFAULT '{}'::text[] NOT NULL,
  client_comment text,
  ai_summary text,
  ai_questions jsonb DEFAULT '[]'::jsonb NOT NULL,
  risk_level text DEFAULT 'unknown'::text,
  status text DEFAULT 'new'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.real_estate_risks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  deal_id uuid,
  object_id uuid,
  risk_type text,
  severity text DEFAULT 'medium'::text NOT NULL,
  description text,
  recommended_action text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.real_estate_viewings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  request_id uuid,
  object_id uuid,
  scheduled_at timestamp with time zone,
  status text DEFAULT 'planned'::text NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.seo_pages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  canonical_path text GENERATED ALWAYS AS (('/'::text || slug)) STORED,
  page_type text DEFAULT 'service'::text NOT NULL,
  title_ru text NOT NULL,
  meta_description_ru text,
  h1_ru text NOT NULL,
  content_ru text NOT NULL,
  title_en text,
  meta_description_en text,
  h1_en text,
  content_en text,
  title_he text,
  meta_description_he text,
  h1_he text,
  content_he text,
  faq_json jsonb DEFAULT '[]'::jsonb NOT NULL,
  schema_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  og_title text,
  og_description text,
  og_image text,
  seo_keywords text[] DEFAULT '{}'::text[],
  priority numeric(2,1) DEFAULT 0.8,
  changefreq text DEFAULT 'weekly'::text,
  sort_order integer DEFAULT 0,
  noindex boolean DEFAULT false NOT NULL,
  nofollow boolean DEFAULT false NOT NULL,
  is_published boolean DEFAULT false NOT NULL,
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.site_settings (
  id integer DEFAULT 1 NOT NULL,
  hero_image_url text,
  hero_object_position_x numeric DEFAULT 50 NOT NULL,
  hero_object_position_y numeric DEFAULT 30 NOT NULL,
  hero_scale numeric DEFAULT 1.0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  legal_form text,
  legal_full_name text,
  legal_inn text,
  legal_ogrnip text,
  legal_address text,
  contact_email text,
  contact_phone text,
  contact_telegram_url text,
  contact_whatsapp_url text,
  contact_max_url text,
  site_domain text,
  advisor_photo_url text
);

CREATE TABLE public.tax_matter_profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  matter_id uuid NOT NULL,
  inspection_type text,
  tax_authority text,
  tax_period text,
  demand_date date,
  response_deadline date,
  act_date date,
  objections_deadline date,
  decision_date date,
  appeal_deadline date,
  requested_documents jsonb DEFAULT '[]'::jsonb,
  tax_amount numeric,
  penalty_amount numeric,
  fine_amount numeric,
  risk_factors jsonb DEFAULT '{}'::jsonb,
  ai_summary text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.webhook_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source text NOT NULL,
  external_event_id text,
  payload jsonb NOT NULL,
  processed boolean DEFAULT false NOT NULL,
  error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ============================================================================
-- Constraints
-- ============================================================================

ALTER TABLE ONLY public.ai_drafts ADD CONSTRAINT ai_drafts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ai_drafts ADD CONSTRAINT ai_drafts_status_check CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'rejected'::text, 'sent'::text]));

ALTER TABLE ONLY public.ai_intake_analysis ADD CONSTRAINT ai_intake_analysis_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ai_source_routing_rules ADD CONSTRAINT ai_source_routing_rules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ai_usage_logs ADD CONSTRAINT ai_usage_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.case_documents ADD CONSTRAINT case_documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.communication_attachments ADD CONSTRAINT communication_attachments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.communication_channels ADD CONSTRAINT communication_channels_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.communication_channels ADD CONSTRAINT communication_channels_type_check CHECK (channel_type = ANY (ARRAY['telegram'::text, 'whatsapp'::text, 'website'::text, 'avito'::text, 'manual'::text, 'email'::text]));

ALTER TABLE ONLY public.communication_contacts ADD CONSTRAINT communication_contacts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.communication_conversations ADD CONSTRAINT communication_conversations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.communication_conversations ADD CONSTRAINT communication_conversations_status_check CHECK (status = ANY (ARRAY['active'::text, 'waiting_client'::text, 'waiting_lawyer'::text, 'closed'::text, 'archived'::text]));

ALTER TABLE ONLY public.communication_messages ADD CONSTRAINT communication_messages_direction_check CHECK (direction = ANY (ARRAY['inbound'::text, 'outbound'::text]));

ALTER TABLE ONLY public.communication_messages ADD CONSTRAINT communication_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.communication_messages ADD CONSTRAINT communication_messages_type_check CHECK (message_type = ANY (ARRAY['text'::text, 'image'::text, 'file'::text, 'document'::text, 'voice'::text, 'video'::text, 'audio'::text, 'location'::text, 'contact'::text, 'system'::text]));

ALTER TABLE ONLY public.communication_webhook_events ADD CONSTRAINT communication_webhook_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.compliance_checks ADD CONSTRAINT compliance_checks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.consultation_bookings ADD CONSTRAINT consultation_bookings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.consultations ADD CONSTRAINT consultations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.contract_clauses ADD CONSTRAINT contract_clauses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.contract_reviews ADD CONSTRAINT contract_reviews_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.contract_risks ADD CONSTRAINT contract_risks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.contract_risks ADD CONSTRAINT contract_risks_severity_check CHECK (severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]));

ALTER TABLE ONLY public.contracts ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.conversation_messages ADD CONSTRAINT conversation_messages_channel_check CHECK (channel = ANY (ARRAY['telegram'::text, 'whatsapp'::text, 'website'::text, 'avito'::text, 'manual'::text]));

ALTER TABLE ONLY public.conversation_messages ADD CONSTRAINT conversation_messages_direction_check CHECK (direction = ANY (ARRAY['inbound'::text, 'outbound'::text]));

ALTER TABLE ONLY public.conversation_messages ADD CONSTRAINT conversation_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.conversations ADD CONSTRAINT conversations_channel_check CHECK (channel = ANY (ARRAY['telegram'::text, 'whatsapp'::text, 'website'::text, 'avito'::text, 'manual'::text]));

ALTER TABLE ONLY public.conversations ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.conversations ADD CONSTRAINT conversations_status_check CHECK (status = ANY (ARRAY['open'::text, 'pending_ai'::text, 'human_needed'::text, 'closed'::text]));

ALTER TABLE ONLY public.court_case_import_queue ADD CONSTRAINT court_case_import_queue_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.court_cases ADD CONSTRAINT court_cases_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.court_deadlines ADD CONSTRAINT court_deadlines_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.court_documents ADD CONSTRAINT court_documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.court_hearings ADD CONSTRAINT court_hearings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.crm_clients ADD CONSTRAINT crm_clients_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.crm_clients ADD CONSTRAINT crm_clients_type_check CHECK (client_type = ANY (ARRAY['individual'::text, 'company'::text, 'agent'::text, 'realtor'::text, 'other'::text]));

ALTER TABLE ONLY public.crm_leads ADD CONSTRAINT crm_leads_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.crm_leads ADD CONSTRAINT crm_leads_status_check CHECK (status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'in_work'::text, 'won'::text, 'lost'::text, 'archived'::text]));

ALTER TABLE ONLY public.crm_notes ADD CONSTRAINT crm_notes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.crm_tasks ADD CONSTRAINT crm_tasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.crm_tasks ADD CONSTRAINT crm_tasks_priority_check CHECK (priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]));

ALTER TABLE ONLY public.crm_tasks ADD CONSTRAINT crm_tasks_status_check CHECK (status = ANY (ARRAY['open'::text, 'in_progress'::text, 'done'::text, 'cancelled'::text]));

ALTER TABLE ONLY public.document_intake_ai_runs ADD CONSTRAINT document_intake_ai_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.document_intake_answers ADD CONSTRAINT document_intake_answers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.document_intake_answers ADD CONSTRAINT document_intake_answers_session_id_field_name_key UNIQUE (session_id, field_name);

ALTER TABLE ONLY public.document_intake_schemas ADD CONSTRAINT document_intake_schemas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.document_intake_sessions ADD CONSTRAINT document_intake_sessions_document_id_template_code_key UNIQUE (document_id, template_code);

ALTER TABLE ONLY public.document_intake_sessions ADD CONSTRAINT document_intake_sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.document_templates ADD CONSTRAINT document_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.document_templates ADD CONSTRAINT document_templates_template_key_key UNIQUE (template_key);

ALTER TABLE ONLY public.documents ADD CONSTRAINT documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.external_registry_sources ADD CONSTRAINT external_registry_sources_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.external_reviews ADD CONSTRAINT external_reviews_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.external_reviews ADD CONSTRAINT external_reviews_source_check CHECK (source = ANY (ARRAY['avito'::text, 'manual'::text]));

ALTER TABLE ONLY public.generated_document_sources ADD CONSTRAINT generated_document_sources_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.generated_legal_documents ADD CONSTRAINT generated_legal_documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lawyer_archive_items ADD CONSTRAINT lawyer_archive_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lawyer_document_actions ADD CONSTRAINT lawyer_document_actions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lawyer_matter_strategy ADD CONSTRAINT lawyer_matter_strategy_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lead_consents ADD CONSTRAINT lead_consents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lead_documents ADD CONSTRAINT lead_documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lead_events ADD CONSTRAINT lead_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lead_notes ADD CONSTRAINT lead_notes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lead_tasks ADD CONSTRAINT lead_tasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lead_tasks ADD CONSTRAINT lead_tasks_status_check CHECK (status = ANY (ARRAY['open'::text, 'done'::text, 'cancelled'::text]));

ALTER TABLE ONLY public.lead_timeline ADD CONSTRAINT lead_timeline_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.leads ADD CONSTRAINT leads_pipeline_stage_check CHECK (pipeline_stage = ANY (ARRAY['new'::text, 'contacted'::text, 'waiting_documents'::text, 'analysis'::text, 'offer_sent'::text, 'in_work'::text, 'court'::text, 'closed'::text, 'lost'::text]));

ALTER TABLE ONLY public.leads ADD CONSTRAINT leads_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.leads ADD CONSTRAINT leads_priority_check CHECK (priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]));

ALTER TABLE ONLY public.legal_ai_briefings ADD CONSTRAINT legal_ai_briefings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_cases ADD CONSTRAINT legal_cases_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_document_reviews ADD CONSTRAINT legal_document_reviews_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_document_revision_decisions ADD CONSTRAINT legal_document_revision_decisions_decision_check CHECK (decision = ANY (ARRAY['keep_current_version'::text, 'create_new_version'::text, 'request_more_documents'::text, 'defer_decision'::text]));

ALTER TABLE ONLY public.legal_document_revision_decisions ADD CONSTRAINT legal_document_revision_decisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_document_revision_decisions ADD CONSTRAINT legal_document_revision_decisions_revision_status_check CHECK (revision_status = ANY (ARRAY['closed'::text, 'waiting_for_materials'::text, 'in_progress'::text]));

ALTER TABLE ONLY public.legal_document_templates ADD CONSTRAINT legal_document_templates_code_key UNIQUE (code);

ALTER TABLE ONLY public.legal_document_templates ADD CONSTRAINT legal_document_templates_complexity_check CHECK (complexity = ANY (ARRAY['basic'::text, 'advanced'::text, 'expert'::text]));

ALTER TABLE ONLY public.legal_document_templates ADD CONSTRAINT legal_document_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_knowledge_chunks ADD CONSTRAINT legal_knowledge_chunks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_knowledge_import_queue ADD CONSTRAINT legal_knowledge_import_queue_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_law_chunks ADD CONSTRAINT legal_law_chunks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_laws ADD CONSTRAINT legal_laws_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_matters ADD CONSTRAINT legal_matters_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_matters ADD CONSTRAINT legal_matters_status_check CHECK (status = ANY (ARRAY['new'::text, 'active'::text, 'waiting_client'::text, 'waiting_court'::text, 'completed'::text, 'cancelled'::text, 'archived'::text]));

ALTER TABLE ONLY public.legal_matters ADD CONSTRAINT legal_matters_type_check CHECK (matter_type = ANY (ARRAY['real_estate'::text, 'contract_review'::text, 'court_dispute'::text, 'tax'::text, 'bankruptcy'::text, 'corporate'::text, 'compliance'::text, 'family'::text, 'inheritance'::text, 'land'::text, 'housing'::text, 'registration'::text, 'debt'::text, 'consumer_dispute'::text, 'consultation'::text, 'other'::text]));

ALTER TABLE ONLY public.legal_parties ADD CONSTRAINT legal_parties_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_reasoning_analyses ADD CONSTRAINT legal_reasoning_analyses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_regulatory_monitored_sources ADD CONSTRAINT legal_regulatory_monitored_sources_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_regulatory_update_alerts ADD CONSTRAINT legal_regulatory_update_alerts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_regulatory_update_logs ADD CONSTRAINT legal_regulatory_update_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_research_sources ADD CONSTRAINT legal_research_sources_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_risks ADD CONSTRAINT legal_risks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_risks ADD CONSTRAINT legal_risks_severity_check CHECK (severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]));

ALTER TABLE ONLY public.legal_source_gap_requests ADD CONSTRAINT legal_source_gap_requests_missing_source_type_check CHECK (missing_source_type = ANY (ARRAY['law'::text, 'article'::text, 'case'::text, 'letter'::text, 'review'::text, 'clarification'::text, 'other'::text]));

ALTER TABLE ONLY public.legal_source_gap_requests ADD CONSTRAINT legal_source_gap_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_source_gap_requests ADD CONSTRAINT legal_source_gap_requests_priority_check CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]));

ALTER TABLE ONLY public.legal_source_gap_requests ADD CONSTRAINT legal_source_gap_requests_status_check CHECK (status = ANY (ARRAY['new'::text, 'in_progress'::text, 'resolved'::text, 'dismissed'::text]));

ALTER TABLE ONLY public.legal_source_registry ADD CONSTRAINT legal_source_registry_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_source_usage_events ADD CONSTRAINT legal_source_usage_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_source_usage_events ADD CONSTRAINT legal_source_usage_events_source_kind_check CHECK (source_kind = ANY (ARRAY['law'::text, 'law_chunk'::text, 'knowledge_chunk'::text, 'case'::text, 'letter'::text, 'other'::text]));

ALTER TABLE ONLY public.legal_source_usage_events ADD CONSTRAINT legal_source_usage_events_verification_status_check CHECK (verification_status = ANY (ARRAY['verified_local_source'::text, 'needs_external_verification'::text, 'not_found'::text, 'unknown'::text]));

ALTER TABLE ONLY public.legal_source_verification_logs ADD CONSTRAINT legal_source_verification_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_source_verification_logs ADD CONSTRAINT legal_source_verification_logs_source_kind_check CHECK (source_kind = ANY (ARRAY['law'::text, 'law_chunk'::text, 'knowledge_chunk'::text, 'case'::text, 'letter'::text, 'other'::text]));

ALTER TABLE ONLY public.legal_source_verification_logs ADD CONSTRAINT legal_source_verification_logs_status_check CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'verified'::text, 'outdated'::text, 'failed'::text]));

ALTER TABLE ONLY public.official_legal_sources ADD CONSTRAINT official_legal_sources_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.official_legal_sources ADD CONSTRAINT official_legal_sources_source_code_key UNIQUE (source_code);

ALTER TABLE ONLY public.payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.practice_batches ADD CONSTRAINT practice_batches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.practice_document_legal_analysis ADD CONSTRAINT practice_document_legal_analysis_document_id_key UNIQUE (document_id);

ALTER TABLE ONLY public.practice_document_legal_analysis ADD CONSTRAINT practice_document_legal_analysis_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.practice_import_queue ADD CONSTRAINT practice_import_queue_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.practice_legal_analysis_sources ADD CONSTRAINT practice_legal_analysis_sources_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);

ALTER TABLE ONLY public.properties ADD CONSTRAINT properties_investment_score_check CHECK (investment_score >= 0 AND investment_score <= 100);

ALTER TABLE ONLY public.properties ADD CONSTRAINT properties_legal_risk_score_check CHECK (legal_risk_score >= 0 AND legal_risk_score <= 100);

ALTER TABLE ONLY public.properties ADD CONSTRAINT properties_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.properties ADD CONSTRAINT properties_source_url_key UNIQUE (source_url);

ALTER TABLE ONLY public.properties ADD CONSTRAINT properties_status_check CHECK (status = ANY (ARRAY['new'::text, 'reviewing'::text, 'approved'::text, 'rejected'::text, 'archived'::text]));

ALTER TABLE ONLY public.property_matches ADD CONSTRAINT property_matches_match_score_check CHECK (match_score >= 0 AND match_score <= 100);

ALTER TABLE ONLY public.property_matches ADD CONSTRAINT property_matches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.property_matches ADD CONSTRAINT property_matches_request_id_property_id_key UNIQUE (request_id, property_id);

ALTER TABLE ONLY public.property_matches ADD CONSTRAINT property_matches_status_check CHECK (status = ANY (ARRAY['suggested'::text, 'selected'::text, 'documents_requested'::text, 'rejected'::text, 'sent_to_client'::text]));

ALTER TABLE ONLY public.property_search_requests ADD CONSTRAINT property_search_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.property_search_requests ADD CONSTRAINT property_search_requests_status_check CHECK (status = ANY (ARRAY['new'::text, 'in_search'::text, 'shortlist_ready'::text, 'documents_requested'::text, 'rejected'::text, 'completed'::text]));

ALTER TABLE ONLY public.real_estate_deals ADD CONSTRAINT real_estate_deals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.real_estate_documents ADD CONSTRAINT real_estate_documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.real_estate_matches ADD CONSTRAINT real_estate_matches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.real_estate_matches ADD CONSTRAINT real_estate_matches_request_id_object_id_key UNIQUE (request_id, object_id);

ALTER TABLE ONLY public.real_estate_negotiations ADD CONSTRAINT real_estate_negotiations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.real_estate_objects ADD CONSTRAINT real_estate_objects_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.real_estate_objects ADD CONSTRAINT real_estate_objects_property_type_check CHECK (property_type = ANY (ARRAY['apartment'::text, 'room'::text, 'house'::text, 'land_plot'::text, 'commercial'::text, 'parking'::text, 'new_building'::text, 'share'::text, 'other'::text]));

ALTER TABLE ONLY public.real_estate_offers ADD CONSTRAINT real_estate_offers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.real_estate_offers ADD CONSTRAINT real_estate_offers_status_check CHECK (status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'rejected'::text, 'counter_offer'::text, 'cancelled'::text]));

ALTER TABLE ONLY public.real_estate_registry_checks ADD CONSTRAINT real_estate_registry_checks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.real_estate_requests ADD CONSTRAINT real_estate_requests_goal_check CHECK (goal = ANY (ARRAY['buy'::text, 'sell'::text, 'rent'::text, 'lease_out'::text, 'document_check'::text, 'deal_support'::text, 'dispute'::text, 'registration'::text, 'other'::text]));

ALTER TABLE ONLY public.real_estate_requests ADD CONSTRAINT real_estate_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.real_estate_risks ADD CONSTRAINT real_estate_risks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.real_estate_risks ADD CONSTRAINT real_estate_risks_severity_check CHECK (severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]));

ALTER TABLE ONLY public.real_estate_viewings ADD CONSTRAINT real_estate_viewings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.seo_pages ADD CONSTRAINT seo_pages_changefreq_check CHECK (changefreq = ANY (ARRAY['always'::text, 'hourly'::text, 'daily'::text, 'weekly'::text, 'monthly'::text, 'yearly'::text, 'never'::text]));

ALTER TABLE ONLY public.seo_pages ADD CONSTRAINT seo_pages_page_type_check CHECK (page_type = ANY (ARRAY['service'::text, 'cluster'::text, 'article'::text, 'landing'::text, 'legal'::text, 'city'::text]));

ALTER TABLE ONLY public.seo_pages ADD CONSTRAINT seo_pages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.seo_pages ADD CONSTRAINT seo_pages_priority_check CHECK (priority >= 0.0 AND priority <= 1.0);

ALTER TABLE ONLY public.seo_pages ADD CONSTRAINT seo_pages_slug_key UNIQUE (slug);

ALTER TABLE ONLY public.site_settings ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.site_settings ADD CONSTRAINT site_settings_singleton CHECK (id = 1);

ALTER TABLE ONLY public.tax_matter_profiles ADD CONSTRAINT tax_matter_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

ALTER TABLE ONLY public.webhook_events ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ai_drafts ADD CONSTRAINT ai_drafts_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ai_drafts ADD CONSTRAINT ai_drafts_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ai_intake_analysis ADD CONSTRAINT ai_intake_analysis_client_id_fkey FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.ai_intake_analysis ADD CONSTRAINT ai_intake_analysis_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES communication_conversations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ai_intake_analysis ADD CONSTRAINT ai_intake_analysis_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.case_documents ADD CONSTRAINT case_documents_case_id_fkey FOREIGN KEY (case_id) REFERENCES legal_cases(id);

ALTER TABLE ONLY public.case_documents ADD CONSTRAINT case_documents_document_id_fkey FOREIGN KEY (document_id) REFERENCES lead_documents(id);

ALTER TABLE ONLY public.communication_attachments ADD CONSTRAINT communication_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES communication_messages(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.communication_contacts ADD CONSTRAINT communication_contacts_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES communication_channels(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.communication_contacts ADD CONSTRAINT communication_contacts_crm_client_fk FOREIGN KEY (crm_client_id) REFERENCES crm_clients(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE ONLY public.communication_conversations ADD CONSTRAINT communication_conversations_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES communication_channels(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.communication_conversations ADD CONSTRAINT communication_conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES communication_contacts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.communication_conversations ADD CONSTRAINT communication_conversations_crm_client_fk FOREIGN KEY (crm_client_id) REFERENCES crm_clients(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE ONLY public.communication_conversations ADD CONSTRAINT communication_conversations_crm_lead_fk FOREIGN KEY (crm_lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE ONLY public.communication_messages ADD CONSTRAINT communication_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES communication_conversations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.consultation_bookings ADD CONSTRAINT consultation_bookings_client_id_fkey FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.consultation_bookings ADD CONSTRAINT consultation_bookings_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.consultation_bookings ADD CONSTRAINT consultation_bookings_matter_id_fkey FOREIGN KEY (matter_id) REFERENCES legal_matters(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.consultations ADD CONSTRAINT consultations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.contract_clauses ADD CONSTRAINT contract_clauses_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.contract_reviews ADD CONSTRAINT contract_reviews_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.contract_risks ADD CONSTRAINT contract_risks_contract_review_id_fkey FOREIGN KEY (contract_review_id) REFERENCES contract_reviews(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.contracts ADD CONSTRAINT contracts_matter_id_fkey FOREIGN KEY (matter_id) REFERENCES legal_matters(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.conversation_messages ADD CONSTRAINT conversation_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.conversation_messages ADD CONSTRAINT conversation_messages_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.conversations ADD CONSTRAINT conversations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.court_cases ADD CONSTRAINT court_cases_matter_id_fkey FOREIGN KEY (matter_id) REFERENCES legal_matters(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.court_deadlines ADD CONSTRAINT court_deadlines_court_case_id_fkey FOREIGN KEY (court_case_id) REFERENCES court_cases(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.court_documents ADD CONSTRAINT court_documents_court_case_id_fkey FOREIGN KEY (court_case_id) REFERENCES court_cases(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.court_hearings ADD CONSTRAINT court_hearings_court_case_id_fkey FOREIGN KEY (court_case_id) REFERENCES court_cases(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.crm_leads ADD CONSTRAINT crm_leads_client_id_fkey FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.crm_notes ADD CONSTRAINT crm_notes_client_id_fkey FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.crm_notes ADD CONSTRAINT crm_notes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.crm_notes ADD CONSTRAINT crm_notes_matter_fk FOREIGN KEY (matter_id) REFERENCES legal_matters(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE ONLY public.crm_tasks ADD CONSTRAINT crm_tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.crm_tasks ADD CONSTRAINT crm_tasks_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.crm_tasks ADD CONSTRAINT crm_tasks_matter_fk FOREIGN KEY (matter_id) REFERENCES legal_matters(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE ONLY public.document_intake_ai_runs ADD CONSTRAINT document_intake_ai_runs_session_id_fkey FOREIGN KEY (session_id) REFERENCES document_intake_sessions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.document_intake_answers ADD CONSTRAINT document_intake_answers_session_id_fkey FOREIGN KEY (session_id) REFERENCES document_intake_sessions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.documents ADD CONSTRAINT documents_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES practice_batches(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.documents ADD CONSTRAINT documents_client_id_fkey FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.documents ADD CONSTRAINT documents_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.documents ADD CONSTRAINT documents_matter_id_fkey FOREIGN KEY (matter_id) REFERENCES legal_matters(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.generated_document_sources ADD CONSTRAINT generated_document_sources_generated_document_id_fkey FOREIGN KEY (generated_document_id) REFERENCES generated_legal_documents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.generated_document_sources ADD CONSTRAINT generated_document_sources_knowledge_chunk_id_fkey FOREIGN KEY (knowledge_chunk_id) REFERENCES legal_knowledge_chunks(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.generated_document_sources ADD CONSTRAINT generated_document_sources_source_registry_id_fkey FOREIGN KEY (source_registry_id) REFERENCES legal_source_registry(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.generated_legal_documents ADD CONSTRAINT fk_generated_legal_documents_intake_session FOREIGN KEY (intake_session_id) REFERENCES document_intake_sessions(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.generated_legal_documents ADD CONSTRAINT fk_generated_legal_documents_parent_document FOREIGN KEY (parent_document_id) REFERENCES generated_legal_documents(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.generated_legal_documents ADD CONSTRAINT generated_legal_documents_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.generated_legal_documents ADD CONSTRAINT generated_legal_documents_template_id_fkey FOREIGN KEY (template_id) REFERENCES document_templates(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.lawyer_archive_items ADD CONSTRAINT lawyer_archive_items_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.lawyer_archive_items ADD CONSTRAINT lawyer_archive_items_matter_id_fkey FOREIGN KEY (matter_id) REFERENCES legal_matters(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.lawyer_document_actions ADD CONSTRAINT lawyer_document_actions_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lawyer_document_actions ADD CONSTRAINT lawyer_document_actions_generated_document_id_fkey FOREIGN KEY (generated_document_id) REFERENCES generated_legal_documents(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.lawyer_document_actions ADD CONSTRAINT lawyer_document_actions_matter_id_fkey FOREIGN KEY (matter_id) REFERENCES legal_matters(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lawyer_matter_strategy ADD CONSTRAINT lawyer_matter_strategy_matter_id_fkey FOREIGN KEY (matter_id) REFERENCES legal_matters(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lead_consents ADD CONSTRAINT lead_consents_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lead_documents ADD CONSTRAINT lead_documents_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lead_events ADD CONSTRAINT lead_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.lead_events ADD CONSTRAINT lead_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lead_notes ADD CONSTRAINT lead_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.lead_notes ADD CONSTRAINT lead_notes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lead_tasks ADD CONSTRAINT lead_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.lead_tasks ADD CONSTRAINT lead_tasks_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lead_timeline ADD CONSTRAINT lead_timeline_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.leads ADD CONSTRAINT leads_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id);

ALTER TABLE ONLY public.leads ADD CONSTRAINT leads_source_crm_lead_id_fkey FOREIGN KEY (source_crm_lead_id) REFERENCES crm_leads(id);

ALTER TABLE ONLY public.legal_ai_briefings ADD CONSTRAINT legal_ai_briefings_alert_id_fkey FOREIGN KEY (alert_id) REFERENCES legal_regulatory_update_alerts(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.legal_ai_briefings ADD CONSTRAINT legal_ai_briefings_monitored_source_id_fkey FOREIGN KEY (monitored_source_id) REFERENCES legal_regulatory_monitored_sources(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.legal_ai_briefings ADD CONSTRAINT legal_ai_briefings_source_id_fkey FOREIGN KEY (source_id) REFERENCES legal_regulatory_monitored_sources(id);

ALTER TABLE ONLY public.legal_cases ADD CONSTRAINT legal_cases_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.legal_cases ADD CONSTRAINT legal_cases_legacy_lead_id_fkey FOREIGN KEY (legacy_lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.legal_document_revision_decisions ADD CONSTRAINT legal_document_revision_decisio_document_intake_session_id_fkey FOREIGN KEY (document_intake_session_id) REFERENCES document_intake_sessions(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.legal_document_revision_decisions ADD CONSTRAINT legal_document_revision_decisions_based_on_ai_run_id_fkey FOREIGN KEY (based_on_ai_run_id) REFERENCES document_intake_ai_runs(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.legal_document_revision_decisions ADD CONSTRAINT legal_document_revision_decisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.legal_document_revision_decisions ADD CONSTRAINT legal_document_revision_decisions_created_document_id_fkey FOREIGN KEY (created_document_id) REFERENCES generated_legal_documents(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.legal_document_revision_decisions ADD CONSTRAINT legal_document_revision_decisions_generated_document_id_fkey FOREIGN KEY (generated_document_id) REFERENCES generated_legal_documents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.legal_document_revision_decisions ADD CONSTRAINT legal_document_revision_decisions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.legal_matters ADD CONSTRAINT legal_matters_client_id_fkey FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.legal_matters ADD CONSTRAINT legal_matters_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.legal_parties ADD CONSTRAINT legal_parties_matter_id_fkey FOREIGN KEY (matter_id) REFERENCES legal_matters(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.legal_regulatory_update_alerts ADD CONSTRAINT legal_regulatory_update_alerts_monitored_source_id_fkey FOREIGN KEY (monitored_source_id) REFERENCES legal_regulatory_monitored_sources(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.legal_regulatory_update_logs ADD CONSTRAINT legal_regulatory_update_logs_monitored_source_id_fkey FOREIGN KEY (monitored_source_id) REFERENCES legal_regulatory_monitored_sources(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.legal_risks ADD CONSTRAINT legal_risks_matter_id_fkey FOREIGN KEY (matter_id) REFERENCES legal_matters(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payments ADD CONSTRAINT payments_client_id_fkey FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.payments ADD CONSTRAINT payments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.payments ADD CONSTRAINT payments_matter_id_fkey FOREIGN KEY (matter_id) REFERENCES legal_matters(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.practice_document_legal_analysis ADD CONSTRAINT practice_document_legal_analysis_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES practice_batches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.practice_document_legal_analysis ADD CONSTRAINT practice_document_legal_analysis_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.practice_legal_analysis_sources ADD CONSTRAINT practice_legal_analysis_sources_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES practice_document_legal_analysis(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.practice_legal_analysis_sources ADD CONSTRAINT practice_legal_analysis_sources_knowledge_chunk_id_fkey FOREIGN KEY (knowledge_chunk_id) REFERENCES legal_knowledge_chunks(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.practice_legal_analysis_sources ADD CONSTRAINT practice_legal_analysis_sources_source_id_fkey FOREIGN KEY (source_id) REFERENCES legal_research_sources(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.practice_legal_analysis_sources ADD CONSTRAINT practice_legal_analysis_sources_source_registry_id_fkey FOREIGN KEY (source_registry_id) REFERENCES legal_source_registry(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.property_matches ADD CONSTRAINT property_matches_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.property_matches ADD CONSTRAINT property_matches_request_id_fkey FOREIGN KEY (request_id) REFERENCES property_search_requests(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.real_estate_deals ADD CONSTRAINT real_estate_deals_buyer_client_id_fkey FOREIGN KEY (buyer_client_id) REFERENCES crm_clients(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.real_estate_deals ADD CONSTRAINT real_estate_deals_matter_id_fkey FOREIGN KEY (matter_id) REFERENCES legal_matters(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.real_estate_deals ADD CONSTRAINT real_estate_deals_object_id_fkey FOREIGN KEY (object_id) REFERENCES real_estate_objects(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.real_estate_deals ADD CONSTRAINT real_estate_deals_seller_client_id_fkey FOREIGN KEY (seller_client_id) REFERENCES crm_clients(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.real_estate_documents ADD CONSTRAINT real_estate_documents_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES real_estate_deals(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.real_estate_documents ADD CONSTRAINT real_estate_documents_object_id_fkey FOREIGN KEY (object_id) REFERENCES real_estate_objects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.real_estate_matches ADD CONSTRAINT real_estate_matches_object_id_fkey FOREIGN KEY (object_id) REFERENCES real_estate_objects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.real_estate_matches ADD CONSTRAINT real_estate_matches_request_id_fkey FOREIGN KEY (request_id) REFERENCES real_estate_requests(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.real_estate_negotiations ADD CONSTRAINT real_estate_negotiations_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES real_estate_deals(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.real_estate_negotiations ADD CONSTRAINT real_estate_negotiations_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES real_estate_offers(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.real_estate_offers ADD CONSTRAINT real_estate_offers_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES real_estate_deals(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.real_estate_offers ADD CONSTRAINT real_estate_offers_object_id_fkey FOREIGN KEY (object_id) REFERENCES real_estate_objects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.real_estate_offers ADD CONSTRAINT real_estate_offers_request_id_fkey FOREIGN KEY (request_id) REFERENCES real_estate_requests(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.real_estate_registry_checks ADD CONSTRAINT real_estate_registry_checks_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES real_estate_deals(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.real_estate_registry_checks ADD CONSTRAINT real_estate_registry_checks_object_id_fkey FOREIGN KEY (object_id) REFERENCES real_estate_objects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.real_estate_requests ADD CONSTRAINT real_estate_requests_client_id_fkey FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.real_estate_requests ADD CONSTRAINT real_estate_requests_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.real_estate_risks ADD CONSTRAINT real_estate_risks_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES real_estate_deals(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.real_estate_risks ADD CONSTRAINT real_estate_risks_object_id_fkey FOREIGN KEY (object_id) REFERENCES real_estate_objects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.real_estate_viewings ADD CONSTRAINT real_estate_viewings_object_id_fkey FOREIGN KEY (object_id) REFERENCES real_estate_objects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.real_estate_viewings ADD CONSTRAINT real_estate_viewings_request_id_fkey FOREIGN KEY (request_id) REFERENCES real_estate_requests(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tax_matter_profiles ADD CONSTRAINT tax_matter_profiles_matter_id_fkey FOREIGN KEY (matter_id) REFERENCES legal_matters(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================================================
-- Functions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','super_admin')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.archive_document_intake_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin_or_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE document_intake_sessions
  SET 
    archived_at = now(),
    updated_at = now()
  WHERE id = p_session_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.restore_document_intake_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin_or_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE document_intake_sessions
  SET 
    archived_at = NULL,
    updated_at = now()
  WHERE id = p_session_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  is_first boolean;
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  select not exists (select 1 from public.user_roles where role = 'admin') into is_first;

  if is_first then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'user');
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.match_legal_knowledge(query_embedding vector, match_count integer DEFAULT 5, category_filter text DEFAULT NULL::text, subcategory_boost text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, title text, content text, metadata jsonb, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with scored as (
    select
      lkc.id,
      lkc.title,
      lkc.content,
      lkc.metadata,
      1 - (lkc.embedding <=> query_embedding) as base_similarity,

      case
        when subcategory_boost is not null
          and lkc.metadata->>'subcategory' = subcategory_boost
          then 0.12
        else 0
      end as subcategory_bonus,

      case
        when lkc.metadata->>'priority' = 'critical' then 0.06
        when lkc.metadata->>'priority' = 'high' then 0.04
        else 0
      end as priority_bonus,

      case
        when lkc.metadata->>'chunk_type' = 'law_summary' then 0.04
        when lkc.metadata->>'chunk_type' = 'risk_framework' then 0.04
        when lkc.metadata->>'chunk_type' = 'procedure_framework' then 0.04
        when lkc.metadata->>'chunk_type' = 'deadline_framework' then 0.05
        when lkc.metadata->>'chunk_type' = 'navigation' then -0.05
        else 0
      end as type_bonus

    from public.legal_knowledge_chunks lkc
    where lkc.is_active = true
      and lkc.embedding is not null
      and (
        category_filter is null
        or lkc.category = category_filter
      )
  )
  select
    scored.id,
    scored.title,
    scored.content,
    scored.metadata,
    least(
      1.0,
      scored.base_similarity
      + scored.subcategory_bonus
      + scored.priority_bonus
      + scored.type_bonus
    )::double precision as similarity
  from scored
  order by similarity desc
  limit match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.match_legal_law_chunks(query_embedding vector, match_count integer DEFAULT 5)
 RETURNS TABLE(id uuid, code_name text, article text, part text, title text, content text, metadata jsonb, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    id,
    code_name,
    article,
    part,
    title,
    content,
    metadata,
    1 - (embedding <=> query_embedding) as similarity
  from legal_law_chunks
  where is_active = true
    and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.match_legal_laws(query_embedding vector, match_count integer DEFAULT 5)
 RETURNS TABLE(id uuid, code_name text, article text, title text, content text, metadata jsonb, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    id,
    code_name,
    article,
    title,
    content,
    metadata,
    1 - (embedding <=> query_embedding) as similarity
  from legal_laws
  where is_active = true
    and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$function$
;

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX ai_intake_analysis_created_at_idx ON public.ai_intake_analysis USING btree (created_at DESC);

CREATE INDEX ai_intake_analysis_practice_area_idx ON public.ai_intake_analysis USING btree (practice_area);

CREATE INDEX ai_intake_analysis_risk_level_idx ON public.ai_intake_analysis USING btree (risk_level);

CREATE INDEX idx_ai_intake_conversation ON public.ai_intake_analysis USING btree (conversation_id);

CREATE INDEX idx_ai_intake_lead ON public.ai_intake_analysis USING btree (lead_id);

CREATE INDEX idx_comm_attachments_message ON public.communication_attachments USING btree (message_id);

CREATE INDEX idx_comm_channels_type ON public.communication_channels USING btree (channel_type);

CREATE INDEX idx_comm_contacts_external_user ON public.communication_contacts USING btree (external_user_id);

CREATE INDEX idx_comm_contacts_phone ON public.communication_contacts USING btree (phone);

CREATE INDEX idx_comm_conversations_contact ON public.communication_conversations USING btree (contact_id);

CREATE INDEX idx_comm_conversations_lead ON public.communication_conversations USING btree (crm_lead_id);

CREATE INDEX idx_comm_messages_conversation ON public.communication_messages USING btree (conversation_id);

CREATE INDEX idx_comm_messages_created_at ON public.communication_messages USING btree (created_at);

CREATE INDEX idx_comm_webhook_external_update ON public.communication_webhook_events USING btree (external_update_id);

CREATE INDEX idx_compliance_checks_client_id ON public.compliance_checks USING btree (client_id);

CREATE INDEX idx_compliance_checks_created_at ON public.compliance_checks USING btree (created_at DESC);

CREATE INDEX idx_compliance_checks_lead_id ON public.compliance_checks USING btree (lead_id);

CREATE INDEX idx_compliance_checks_risk_level ON public.compliance_checks USING btree (risk_level);

CREATE INDEX idx_compliance_checks_status ON public.compliance_checks USING btree (status);

CREATE INDEX idx_contract_reviews_contract ON public.contract_reviews USING btree (contract_id);

CREATE INDEX idx_contracts_matter ON public.contracts USING btree (matter_id);

CREATE UNIQUE INDEX idx_conversation_messages_unique_external ON public.conversation_messages USING btree (channel, external_message_id) WHERE (external_message_id IS NOT NULL);

CREATE UNIQUE INDEX idx_conversations_unique_external_chat ON public.conversations USING btree (channel, external_chat_id) WHERE (external_chat_id IS NOT NULL);

CREATE INDEX idx_court_case_import_queue_case ON public.court_case_import_queue USING btree (case_number);

CREATE INDEX idx_court_case_import_queue_status ON public.court_case_import_queue USING btree (import_status);

CREATE INDEX idx_court_cases_matter ON public.court_cases USING btree (matter_id);

CREATE INDEX idx_court_cases_number ON public.court_cases USING btree (case_number);

CREATE INDEX idx_court_deadlines_case ON public.court_deadlines USING btree (court_case_id);

CREATE INDEX idx_court_hearings_case ON public.court_hearings USING btree (court_case_id);

CREATE INDEX idx_crm_clients_phone ON public.crm_clients USING btree (phone);

CREATE INDEX idx_crm_leads_category ON public.crm_leads USING btree (ai_category);

CREATE INDEX idx_crm_leads_client ON public.crm_leads USING btree (client_id);

CREATE INDEX idx_crm_leads_status ON public.crm_leads USING btree (status);

CREATE INDEX idx_crm_tasks_lead ON public.crm_tasks USING btree (lead_id);

CREATE INDEX idx_crm_tasks_status ON public.crm_tasks USING btree (status);

CREATE INDEX idx_document_intake_ai_runs_generated_document_id ON public.document_intake_ai_runs USING btree (generated_document_id);

CREATE INDEX idx_document_intake_ai_runs_session_id ON public.document_intake_ai_runs USING btree (session_id);

CREATE INDEX idx_document_intake_ai_runs_status ON public.document_intake_ai_runs USING btree (status);

CREATE INDEX idx_document_intake_answers_field_name ON public.document_intake_answers USING btree (field_name);

CREATE UNIQUE INDEX idx_document_intake_answers_session_field ON public.document_intake_answers USING btree (session_id, field_name);

CREATE INDEX idx_document_intake_answers_session_id ON public.document_intake_answers USING btree (session_id);

CREATE INDEX idx_document_intake_schemas_active ON public.document_intake_schemas USING btree (is_active);

CREATE UNIQUE INDEX idx_document_intake_schemas_active_template_code_unique ON public.document_intake_schemas USING btree (template_code) WHERE (is_active = true);

CREATE INDEX idx_document_intake_schemas_jurisdiction ON public.document_intake_schemas USING btree (jurisdiction);

CREATE INDEX idx_document_intake_schemas_template_code ON public.document_intake_schemas USING btree (template_code);

CREATE INDEX idx_document_intake_sessions_archived_at ON public.document_intake_sessions USING btree (archived_at);

CREATE INDEX idx_document_intake_sessions_client_id ON public.document_intake_sessions USING btree (client_id);

CREATE INDEX idx_document_intake_sessions_document_id ON public.document_intake_sessions USING btree (document_id);

CREATE INDEX idx_document_intake_sessions_lead_id ON public.document_intake_sessions USING btree (lead_id);

CREATE INDEX idx_document_intake_sessions_matter_id ON public.document_intake_sessions USING btree (matter_id);

CREATE INDEX idx_document_intake_sessions_metadata_gin ON public.document_intake_sessions USING gin (metadata);

CREATE INDEX idx_document_intake_sessions_template_code ON public.document_intake_sessions USING btree (template_code);

CREATE INDEX idx_documents_analysis_status ON public.documents USING btree (analysis_status);

CREATE INDEX idx_documents_batch_id ON public.documents USING btree (batch_id);

CREATE INDEX idx_documents_category ON public.documents USING btree (document_category);

CREATE INDEX idx_documents_client ON public.documents USING btree (client_id);

CREATE INDEX idx_documents_client_id ON public.documents USING btree (client_id);

CREATE INDEX idx_documents_created_at ON public.documents USING btree (created_at DESC);

CREATE INDEX idx_documents_lead_id ON public.documents USING btree (lead_id);

CREATE INDEX idx_documents_matter ON public.documents USING btree (matter_id);

CREATE INDEX idx_documents_matter_id ON public.documents USING btree (matter_id);

CREATE INDEX idx_documents_metadata_gin ON public.documents USING gin (metadata);

CREATE INDEX idx_documents_review_status ON public.documents USING btree (review_status);

CREATE INDEX idx_documents_upload_source ON public.documents USING btree (upload_source);

CREATE INDEX idx_documents_uploaded_by ON public.documents USING btree (uploaded_by);

CREATE INDEX idx_external_registry_sources_active ON public.external_registry_sources USING btree (is_active);

CREATE UNIQUE INDEX idx_external_registry_sources_code ON public.external_registry_sources USING btree (source_code);

CREATE INDEX idx_generated_document_sources_chunk_id ON public.generated_document_sources USING btree (knowledge_chunk_id);

CREATE INDEX idx_generated_document_sources_document_id ON public.generated_document_sources USING btree (generated_document_id);

CREATE INDEX idx_generated_document_sources_registry_id ON public.generated_document_sources USING btree (source_registry_id);

CREATE INDEX idx_generated_legal_documents_ai_review_status ON public.generated_legal_documents USING btree (ai_review_status);

CREATE INDEX idx_generated_legal_documents_archived_at ON public.generated_legal_documents USING btree (archived_at);

CREATE INDEX idx_generated_legal_documents_crm_lead_id ON public.generated_legal_documents USING btree (crm_lead_id);

CREATE INDEX idx_generated_legal_documents_intake_session_id ON public.generated_legal_documents USING btree (intake_session_id);

CREATE INDEX idx_generated_legal_documents_lawyer_approved_at ON public.generated_legal_documents USING btree (lawyer_approved_at);

CREATE INDEX idx_generated_legal_documents_lead_id ON public.generated_legal_documents USING btree (lead_id);

CREATE INDEX idx_generated_legal_documents_parent_document_id ON public.generated_legal_documents USING btree (parent_document_id);

CREATE INDEX idx_lawyer_actions_created_at ON public.lawyer_document_actions USING btree (created_at DESC);

CREATE INDEX idx_lawyer_actions_document_id ON public.lawyer_document_actions USING btree (document_id);

CREATE INDEX idx_lawyer_actions_matter_id ON public.lawyer_document_actions USING btree (matter_id);

CREATE INDEX idx_lawyer_actions_priority ON public.lawyer_document_actions USING btree (priority);

CREATE INDEX idx_lawyer_actions_status ON public.lawyer_document_actions USING btree (status);

CREATE INDEX idx_lawyer_archive_category ON public.lawyer_archive_items USING btree (category);

CREATE INDEX idx_lawyer_archive_created_at ON public.lawyer_archive_items USING btree (created_at DESC);

CREATE INDEX idx_lawyer_archive_document_id ON public.lawyer_archive_items USING btree (document_id);

CREATE INDEX idx_lawyer_archive_item_type ON public.lawyer_archive_items USING btree (item_type);

CREATE INDEX idx_lawyer_archive_matter_id ON public.lawyer_archive_items USING btree (matter_id);

CREATE INDEX idx_lawyer_archive_tags ON public.lawyer_archive_items USING gin (tags);

CREATE INDEX idx_lawyer_matter_strategy_metadata_gin ON public.lawyer_matter_strategy USING gin (metadata);

CREATE INDEX idx_lawyer_strategy_court_practice_gin ON public.lawyer_matter_strategy USING gin (court_practice);

CREATE INDEX idx_lawyer_strategy_legal_basis_gin ON public.lawyer_matter_strategy USING gin (legal_basis);

CREATE UNIQUE INDEX idx_lawyer_strategy_matter_unique ON public.lawyer_matter_strategy USING btree (matter_id);

CREATE INDEX idx_lead_consents_lead_id ON public.lead_consents USING btree (lead_id);

CREATE INDEX idx_lead_documents_conversation_id ON public.lead_documents USING btree (conversation_id);

CREATE INDEX idx_lead_documents_crm_client_id ON public.lead_documents USING btree (crm_client_id);

CREATE INDEX idx_lead_documents_crm_lead_id ON public.lead_documents USING btree (crm_lead_id);

CREATE INDEX idx_lead_documents_lead_id ON public.lead_documents USING btree (lead_id);

CREATE INDEX idx_lead_documents_legal_matter_id ON public.lead_documents USING btree (legal_matter_id);

CREATE INDEX idx_lead_events_lead ON public.lead_events USING btree (lead_id, created_at DESC);

CREATE INDEX idx_lead_events_lead_id ON public.lead_events USING btree (lead_id);

CREATE INDEX idx_lead_notes_lead_id ON public.lead_notes USING btree (lead_id);

CREATE INDEX idx_lead_tasks_lead_id ON public.lead_tasks USING btree (lead_id);

CREATE INDEX idx_lead_timeline_lead_id_created_at ON public.lead_timeline USING btree (lead_id, created_at DESC);

CREATE INDEX idx_leads_category ON public.leads USING btree (category);

CREATE INDEX idx_leads_created_at ON public.leads USING btree (created_at DESC);

CREATE UNIQUE INDEX idx_leads_lead_number ON public.leads USING btree (lead_number);

CREATE INDEX idx_leads_next_followup_at ON public.leads USING btree (next_followup_at);

CREATE INDEX idx_leads_pipeline_stage ON public.leads USING btree (pipeline_stage);

CREATE INDEX idx_leads_priority ON public.leads USING btree (priority);

CREATE INDEX idx_leads_source_crm_lead_id ON public.leads USING btree (source_crm_lead_id);

CREATE INDEX idx_leads_status ON public.leads USING btree (status);

CREATE INDEX idx_legal_ai_briefings_alert ON public.legal_ai_briefings USING btree (alert_id);

CREATE INDEX idx_legal_ai_briefings_area ON public.legal_ai_briefings USING btree (practice_area);

CREATE INDEX idx_legal_ai_briefings_created_at ON public.legal_ai_briefings USING btree (created_at DESC);

CREATE INDEX idx_legal_ai_briefings_source ON public.legal_ai_briefings USING btree (monitored_source_id);

CREATE INDEX idx_legal_ai_briefings_status ON public.legal_ai_briefings USING btree (status);

CREATE INDEX idx_legal_cases_lead_id ON public.legal_cases USING btree (lead_id);

CREATE INDEX idx_legal_cases_legacy_lead_id ON public.legal_cases USING btree (legacy_lead_id);

CREATE INDEX idx_legal_document_reviews_created_at ON public.legal_document_reviews USING btree (created_at DESC);

CREATE INDEX idx_legal_document_reviews_document_id ON public.legal_document_reviews USING btree (document_id);

CREATE INDEX idx_legal_document_reviews_findings_gin ON public.legal_document_reviews USING gin (findings);

CREATE INDEX idx_legal_document_reviews_lead_id ON public.legal_document_reviews USING btree (lead_id);

CREATE INDEX idx_legal_document_reviews_legal_basis_gin ON public.legal_document_reviews USING gin (legal_basis);

CREATE INDEX idx_legal_document_reviews_review_status ON public.legal_document_reviews USING btree (review_status);

CREATE INDEX idx_legal_document_reviews_risk_level ON public.legal_document_reviews USING btree (risk_level);

CREATE UNIQUE INDEX idx_legal_document_reviews_unique_document ON public.legal_document_reviews USING btree (document_id);

CREATE INDEX idx_legal_document_reviews_verification_alerts_gin ON public.legal_document_reviews USING gin (verification_alerts);

CREATE INDEX idx_legal_document_templates_active ON public.legal_document_templates USING btree (is_active);

CREATE INDEX idx_legal_document_templates_category ON public.legal_document_templates USING btree (category);

CREATE INDEX idx_legal_document_templates_practice_area ON public.legal_document_templates USING btree (practice_area);

CREATE INDEX idx_legal_knowledge_chunks_active ON public.legal_knowledge_chunks USING btree (is_active);

CREATE INDEX idx_legal_knowledge_chunks_category ON public.legal_knowledge_chunks USING btree (category);

CREATE INDEX idx_legal_knowledge_chunks_created_at ON public.legal_knowledge_chunks USING btree (created_at DESC);

CREATE INDEX idx_legal_knowledge_chunks_metadata_gin ON public.legal_knowledge_chunks USING gin (metadata);

CREATE INDEX idx_legal_knowledge_chunks_source_type ON public.legal_knowledge_chunks USING btree (source_type);

CREATE INDEX idx_legal_law_chunks_active ON public.legal_law_chunks USING btree (is_active);

CREATE INDEX idx_legal_law_chunks_article ON public.legal_law_chunks USING btree (article);

CREATE INDEX idx_legal_law_chunks_code_article ON public.legal_law_chunks USING btree (code_name, article);

CREATE INDEX idx_legal_law_chunks_code_name ON public.legal_law_chunks USING btree (code_name);

CREATE INDEX idx_legal_matters_archive_status ON public.legal_matters USING btree (archive_status);

CREATE INDEX idx_legal_matters_client ON public.legal_matters USING btree (client_id);

CREATE INDEX idx_legal_matters_client_id ON public.legal_matters USING btree (client_id);

CREATE INDEX idx_legal_matters_created_by ON public.legal_matters USING btree (created_by);

CREATE INDEX idx_legal_matters_lead ON public.legal_matters USING btree (lead_id);

CREATE INDEX idx_legal_matters_lead_id ON public.legal_matters USING btree (lead_id);

CREATE UNIQUE INDEX idx_legal_matters_number ON public.legal_matters USING btree (matter_number) WHERE (matter_number IS NOT NULL);

CREATE INDEX idx_legal_matters_source_type ON public.legal_matters USING btree (source_type);

CREATE INDEX idx_legal_matters_status ON public.legal_matters USING btree (status);

CREATE INDEX idx_legal_matters_type ON public.legal_matters USING btree (matter_type);

CREATE INDEX idx_legal_reasoning_analyses_created_at ON public.legal_reasoning_analyses USING btree (created_at DESC);

CREATE INDEX idx_legal_reasoning_analyses_intake_session_id ON public.legal_reasoning_analyses USING btree (intake_session_id);

CREATE INDEX idx_legal_reasoning_analyses_matter_id ON public.legal_reasoning_analyses USING btree (matter_id);

CREATE INDEX idx_legal_reasoning_analyses_status ON public.legal_reasoning_analyses USING btree (status);

CREATE INDEX idx_legal_regulatory_alerts_area ON public.legal_regulatory_update_alerts USING btree (practice_area);

CREATE INDEX idx_legal_regulatory_alerts_status ON public.legal_regulatory_update_alerts USING btree (status);

CREATE INDEX idx_legal_regulatory_sources_area ON public.legal_regulatory_monitored_sources USING btree (practice_area);

CREATE INDEX idx_legal_regulatory_sources_article ON public.legal_regulatory_monitored_sources USING btree (article);

CREATE INDEX idx_legal_research_sources_practice_area ON public.legal_research_sources USING btree (practice_area);

CREATE INDEX idx_legal_research_sources_type ON public.legal_research_sources USING btree (source_type);

CREATE INDEX idx_legal_revision_decisions_ai_run_id ON public.legal_document_revision_decisions USING btree (based_on_ai_run_id);

CREATE INDEX idx_legal_revision_decisions_created_at ON public.legal_document_revision_decisions USING btree (created_at DESC);

CREATE INDEX idx_legal_revision_decisions_created_document_id ON public.legal_document_revision_decisions USING btree (created_document_id);

CREATE INDEX idx_legal_revision_decisions_decision ON public.legal_document_revision_decisions USING btree (decision);

CREATE INDEX idx_legal_revision_decisions_document_id ON public.legal_document_revision_decisions USING btree (generated_document_id);

CREATE INDEX idx_legal_revision_decisions_session_id ON public.legal_document_revision_decisions USING btree (document_intake_session_id);

CREATE INDEX idx_legal_revision_decisions_status ON public.legal_document_revision_decisions USING btree (revision_status);

CREATE INDEX idx_legal_source_registry_current_status ON public.legal_source_registry USING btree (current_status);

CREATE INDEX idx_legal_source_registry_official_url ON public.legal_source_registry USING btree (official_url);

CREATE INDEX idx_legal_source_registry_source_type ON public.legal_source_registry USING btree (source_type);

CREATE INDEX idx_legal_source_registry_verification_status ON public.legal_source_registry USING btree (verification_status);

CREATE INDEX idx_lkiq_metadata ON public.legal_knowledge_import_queue USING gin (metadata);

CREATE INDEX idx_lkiq_source_category ON public.legal_knowledge_import_queue USING btree (source_type, category);

CREATE INDEX idx_lkiq_status ON public.legal_knowledge_import_queue USING btree (import_status);

CREATE INDEX idx_lsgr_status_priority ON public.legal_source_gap_requests USING btree (status, priority);

CREATE INDEX idx_lsgr_type ON public.legal_source_gap_requests USING btree (missing_source_type);

CREATE INDEX idx_lsue_created ON public.legal_source_usage_events USING btree (created_at DESC);

CREATE INDEX idx_lsue_review ON public.legal_source_usage_events USING btree (review_id);

CREATE INDEX idx_lsue_source ON public.legal_source_usage_events USING btree (source_kind, source_id);

CREATE INDEX idx_lsvl_source ON public.legal_source_verification_logs USING btree (source_kind, source_id);

CREATE INDEX idx_lsvl_status ON public.legal_source_verification_logs USING btree (status, requested_at DESC);

CREATE INDEX idx_official_legal_sources_active ON public.official_legal_sources USING btree (is_active);

CREATE INDEX idx_practice_batches_created_at ON public.practice_batches USING btree (created_at DESC);

CREATE INDEX idx_practice_batches_status ON public.practice_batches USING btree (status);

CREATE INDEX idx_practice_document_legal_analysis_batch_id ON public.practice_document_legal_analysis USING btree (batch_id);

CREATE INDEX idx_practice_document_legal_analysis_document_id ON public.practice_document_legal_analysis USING btree (document_id);

CREATE INDEX idx_practice_document_legal_analysis_quality_level ON public.practice_document_legal_analysis USING btree (quality_level);

CREATE INDEX idx_practice_document_legal_analysis_use_in_rag ON public.practice_document_legal_analysis USING btree (use_in_rag);

CREATE INDEX idx_practice_import_queue_area ON public.practice_import_queue USING btree (practice_area, document_type);

CREATE INDEX idx_practice_import_queue_status ON public.practice_import_queue USING btree (import_status);

CREATE INDEX idx_practice_legal_analysis_sources_analysis_id ON public.practice_legal_analysis_sources USING btree (analysis_id);

CREATE INDEX idx_practice_legal_analysis_sources_chunk_id ON public.practice_legal_analysis_sources USING btree (knowledge_chunk_id);

CREATE INDEX idx_practice_legal_analysis_sources_registry_id ON public.practice_legal_analysis_sources USING btree (source_registry_id);

CREATE INDEX idx_properties_active ON public.properties USING btree (is_active);

CREATE INDEX idx_properties_price ON public.properties USING btree (price);

CREATE INDEX idx_properties_source_url ON public.properties USING btree (source_url);

CREATE INDEX idx_properties_type ON public.properties USING btree (property_type);

CREATE INDEX idx_property_matches_created_at ON public.property_matches USING btree (created_at DESC);

CREATE INDEX idx_property_matches_property ON public.property_matches USING btree (property_id);

CREATE INDEX idx_property_matches_request ON public.property_matches USING btree (request_id);

CREATE INDEX idx_property_matches_request_score ON public.property_matches USING btree (request_id, match_score DESC);

CREATE INDEX idx_property_matches_score ON public.property_matches USING btree (match_score DESC);

CREATE INDEX idx_property_matches_status ON public.property_matches USING btree (status);

CREATE INDEX idx_property_requests_created_at ON public.property_search_requests USING btree (created_at DESC);

CREATE INDEX idx_property_requests_status ON public.property_search_requests USING btree (status);

CREATE INDEX idx_re_deals_matter ON public.real_estate_deals USING btree (matter_id);

CREATE INDEX idx_re_deals_object ON public.real_estate_deals USING btree (object_id);

CREATE INDEX idx_re_matches_object ON public.real_estate_matches USING btree (object_id);

CREATE INDEX idx_re_matches_request ON public.real_estate_matches USING btree (request_id);

CREATE INDEX idx_re_negotiations_deal ON public.real_estate_negotiations USING btree (deal_id);

CREATE INDEX idx_re_objects_cadastral ON public.real_estate_objects USING btree (cadastral_number);

CREATE INDEX idx_re_objects_type ON public.real_estate_objects USING btree (property_type);

CREATE INDEX idx_re_offers_object ON public.real_estate_offers USING btree (object_id);

CREATE INDEX idx_re_offers_request ON public.real_estate_offers USING btree (request_id);

CREATE INDEX idx_re_requests_client ON public.real_estate_requests USING btree (client_id);

CREATE INDEX idx_re_requests_lead ON public.real_estate_requests USING btree (lead_id);

CREATE INDEX idx_reg_alerts_created_at ON public.legal_regulatory_update_alerts USING btree (created_at DESC);

CREATE INDEX idx_reg_alerts_practice_area ON public.legal_regulatory_update_alerts USING btree (practice_area);

CREATE INDEX idx_reg_alerts_status ON public.legal_regulatory_update_alerts USING btree (status);

CREATE INDEX idx_reg_logs_source_id ON public.legal_regulatory_update_logs USING btree (monitored_source_id);

CREATE INDEX idx_reg_sources_active ON public.legal_regulatory_monitored_sources USING btree (is_active);

CREATE INDEX idx_reg_sources_article ON public.legal_regulatory_monitored_sources USING btree (article);

CREATE INDEX idx_reg_sources_practice_area ON public.legal_regulatory_monitored_sources USING btree (practice_area);

CREATE INDEX idx_seo_pages_canonical_path ON public.seo_pages USING btree (canonical_path);

CREATE INDEX idx_seo_pages_keywords ON public.seo_pages USING gin (seo_keywords);

CREATE INDEX idx_seo_pages_noindex ON public.seo_pages USING btree (noindex);

CREATE INDEX idx_seo_pages_page_type ON public.seo_pages USING btree (page_type);

CREATE INDEX idx_seo_pages_priority ON public.seo_pages USING btree (priority DESC);

CREATE INDEX idx_seo_pages_published ON public.seo_pages USING btree (is_published, updated_at DESC);

CREATE INDEX idx_seo_pages_slug ON public.seo_pages USING btree (slug);

CREATE INDEX idx_seo_pages_sort_order ON public.seo_pages USING btree (sort_order);

CREATE INDEX idx_tax_matter_profiles_inspection_type ON public.tax_matter_profiles USING btree (inspection_type);

CREATE INDEX idx_tax_matter_profiles_matter_id ON public.tax_matter_profiles USING btree (matter_id);

CREATE INDEX idx_tax_matter_profiles_response_deadline ON public.tax_matter_profiles USING btree (response_deadline);

CREATE UNIQUE INDEX idx_webhook_events_unique_external ON public.webhook_events USING btree (source, external_event_id) WHERE (external_event_id IS NOT NULL);

CREATE INDEX legal_knowledge_chunks_embedding_idx ON public.legal_knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists='100');

CREATE INDEX legal_laws_embedding_idx ON public.legal_laws USING ivfflat (embedding vector_cosine_ops) WITH (lists='100');

CREATE UNIQUE INDEX properties_source_url_unique ON public.properties USING btree (source_url) WHERE (source_url IS NOT NULL);

-- ============================================================================
-- Triggers
-- ============================================================================

CREATE TRIGGER set_updated_at BEFORE UPDATE ON communication_channels FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON communication_contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON communication_conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON consultation_bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON contract_reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON court_cases FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON court_deadlines FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm_clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm_leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm_tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_document_intake_schemas_updated_at BEFORE UPDATE ON document_intake_schemas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_document_templates_updated_at BEFORE UPDATE ON document_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_generated_legal_documents_updated_at BEFORE UPDATE ON generated_legal_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_lawyer_archive_items_updated_at BEFORE UPDATE ON lawyer_archive_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_lawyer_document_actions_updated_at BEFORE UPDATE ON lawyer_document_actions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_lawyer_matter_strategy_updated_at BEFORE UPDATE ON lawyer_matter_strategy FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_legal_document_templates_updated_at BEFORE UPDATE ON legal_document_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON legal_matters FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER update_legal_regulatory_monitored_sources_updated_at BEFORE UPDATE ON legal_regulatory_monitored_sources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_lsgr_updated_at BEFORE UPDATE ON legal_source_gap_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON real_estate_deals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON real_estate_objects FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON real_estate_registry_checks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON real_estate_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON real_estate_viewings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_update_seo_pages_updated_at BEFORE UPDATE ON seo_pages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_site_settings_updated_at BEFORE UPDATE ON site_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tax_matter_profiles_updated_at BEFORE UPDATE ON tax_matter_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Views
-- ============================================================================

CREATE VIEW public.v_document_drafts_dashboard WITH (security_invoker=true) AS
 SELECT s.id AS session_id,
    s.title,
    s.template_code,
    s.source_type,
    s.status,
    s.matter_id,
    s.client_id,
    s.lead_id,
    s.document_id,
    s.generated_document_id,
    s.analysis_iteration,
    s.last_ai_analysis_at,
    s.last_opened_at,
    s.archived_at,
    s.created_at,
    s.updated_at,
    schema.title AS template_title,
    schema.description AS template_description,
    schema.metadata AS template_metadata,
    d.title AS source_document_title,
    d.file_name AS source_document_file_name,
    d.document_type AS source_document_type,
    d.risk_level AS source_document_risk_level,
    g.title AS generated_document_title,
    g.status AS generated_document_status,
    g.ai_review_status,
    g.version_number,
    g.lawyer_approved_at,
    COALESCE(ai.ai_runs_count, 0::bigint) AS ai_runs_count,
    ai.last_ai_run_at,
    ai.last_review_status,
    ai.last_hallucination_risk,
    ai.last_legal_accuracy_score,
    ai.last_needs_lawyer_review,
    ai.last_recommendations,
    ai.last_required_fixes,
    ai.last_problems
   FROM document_intake_sessions s
     LEFT JOIN document_intake_schemas schema ON schema.template_code = s.template_code AND schema.jurisdiction = s.jurisdiction AND schema.language = s.language
     LEFT JOIN documents d ON d.id = s.document_id
     LEFT JOIN generated_legal_documents g ON g.id = s.generated_document_id
     LEFT JOIN LATERAL ( SELECT count(*) AS ai_runs_count,
            max(r.created_at) AS last_ai_run_at,
            (array_agg(r.review_status ORDER BY r.created_at DESC))[1] AS last_review_status,
            (array_agg(r.hallucination_risk ORDER BY r.created_at DESC))[1] AS last_hallucination_risk,
            (array_agg(r.legal_accuracy_score ORDER BY r.created_at DESC))[1] AS last_legal_accuracy_score,
            (array_agg(r.needs_lawyer_review ORDER BY r.created_at DESC))[1] AS last_needs_lawyer_review,
            (array_agg(r.recommendations ORDER BY r.created_at DESC))[1] AS last_recommendations,
            (array_agg(r.required_fixes ORDER BY r.created_at DESC))[1] AS last_required_fixes,
            (array_agg(r.problems ORDER BY r.created_at DESC))[1] AS last_problems
           FROM document_intake_ai_runs r
          WHERE r.session_id = s.id) ai ON true;;

CREATE VIEW public.v_generated_document_sources WITH (security_invoker=true) AS
 SELECT d.id AS generated_document_id,
    d.title AS document_title,
    s.source_type,
    s.source_title,
    s.official_url,
    s.used_for,
    s.why_used,
    s.fact_to_law_link,
    s.current_status,
    s.verification_status,
    s.last_checked_at,
    s.created_at
   FROM generated_legal_documents d
     LEFT JOIN generated_document_sources s ON s.generated_document_id = d.id;;

CREATE VIEW public.v_legal_regulatory_alerts_dashboard WITH (security_invoker=true) AS
 SELECT a.id,
    a.monitored_source_id,
    a.practice_area,
    a.source_type,
    a.source_name,
    a.law_name,
    a.article,
    a.title,
    a.importance_level,
    a.status,
    a.change_summary,
    a.ai_impact_analysis,
    a.old_hash,
    a.new_hash,
    a.old_content_excerpt,
    a.new_content_excerpt,
    a.briefing_id,
    a.crm_task_id,
    a.created_at,
    a.reviewed_at,
    b.summary AS briefing_summary,
    b.what_changed,
    b.who_is_affected,
    b.risks,
    b.required_actions,
    b.impact_level AS briefing_impact_level
   FROM legal_regulatory_update_alerts a
     LEFT JOIN legal_ai_briefings b ON b.id = a.briefing_id
  ORDER BY (
        CASE a.importance_level
            WHEN 'critical'::text THEN 1
            WHEN 'high'::text THEN 2
            WHEN 'medium'::text THEN 3
            ELSE 4
        END), a.created_at DESC;;

CREATE VIEW public.v_legal_regulatory_monitoring_dashboard WITH (security_invoker=true) AS
 SELECT id,
    practice_area,
    source_type,
    source_name,
    law_name,
    article,
    title,
    check_frequency,
    importance_level,
    is_active,
    last_checked_at,
    last_changed_at,
    ( SELECT count(*) AS count
           FROM legal_regulatory_update_alerts a
          WHERE a.monitored_source_id = s.id AND a.status = 'new'::text) AS new_alerts_count,
    ( SELECT max(a.created_at) AS max
           FROM legal_regulatory_update_alerts a
          WHERE a.monitored_source_id = s.id) AS last_alert_at
   FROM legal_regulatory_monitored_sources s
  ORDER BY (
        CASE importance_level
            WHEN 'critical'::text THEN 1
            WHEN 'high'::text THEN 2
            WHEN 'medium'::text THEN 3
            ELSE 4
        END), practice_area, title;;

CREATE VIEW public.v_legal_sources_catalog WITH (security_invoker=true) AS
 WITH usage_counts AS (
         SELECT legal_source_usage_events.source_kind,
            legal_source_usage_events.source_id,
            count(*)::integer AS usage_count
           FROM legal_source_usage_events
          WHERE legal_source_usage_events.source_id IS NOT NULL
          GROUP BY legal_source_usage_events.source_kind, legal_source_usage_events.source_id
        ), last_verif AS (
         SELECT DISTINCT ON (legal_source_verification_logs.source_kind, legal_source_verification_logs.source_id) legal_source_verification_logs.source_kind,
            legal_source_verification_logs.source_id,
            legal_source_verification_logs.status AS last_verification_status,
            legal_source_verification_logs.completed_at AS last_verified_at
           FROM legal_source_verification_logs
          WHERE legal_source_verification_logs.source_id IS NOT NULL
          ORDER BY legal_source_verification_logs.source_kind, legal_source_verification_logs.source_id, legal_source_verification_logs.requested_at DESC
        ), law_chunk_counts AS (
         SELECT legal_law_chunks.law_id,
            count(*)::integer AS chunks_count
           FROM legal_law_chunks
          WHERE legal_law_chunks.law_id IS NOT NULL
          GROUP BY legal_law_chunks.law_id
        )
 SELECT 'law'::text AS source_kind,
    l.id AS source_id,
    COALESCE((l.code_name || ' '::text) || l.article, l.code_name, l.title) AS title,
    l.article AS reference_number,
    l.source_name,
    l.source_url,
    l.law_category AS category,
    l.practice_area,
    l.jurisdiction,
    l.is_active,
    l.created_at,
    l.updated_at,
    l.source_checked_at,
    COALESCE(lcc.chunks_count, 0) AS chunks_count,
    COALESCE(uc.usage_count, 0) AS usage_count,
    lv.last_verification_status,
    lv.last_verified_at
   FROM legal_laws l
     LEFT JOIN law_chunk_counts lcc ON lcc.law_id = l.id
     LEFT JOIN usage_counts uc ON uc.source_kind = 'law'::text AND uc.source_id = l.id
     LEFT JOIN last_verif lv ON lv.source_kind = 'law'::text AND lv.source_id = l.id
UNION ALL
 SELECT 'knowledge_chunk'::text AS source_kind,
    k.id AS source_id,
    k.title,
    NULL::text AS reference_number,
    NULL::text AS source_name,
    NULL::text AS source_url,
    k.category,
    NULL::text AS practice_area,
    NULL::text AS jurisdiction,
    k.is_active,
    k.created_at,
    NULL::timestamp with time zone AS updated_at,
    NULL::timestamp with time zone AS source_checked_at,
    1 AS chunks_count,
    COALESCE(uc.usage_count, 0) AS usage_count,
    lv.last_verification_status,
    lv.last_verified_at
   FROM legal_knowledge_chunks k
     LEFT JOIN usage_counts uc ON uc.source_kind = 'knowledge_chunk'::text AND uc.source_id = k.id
     LEFT JOIN last_verif lv ON lv.source_kind = 'knowledge_chunk'::text AND lv.source_id = k.id;;

CREATE VIEW public.v_practice_analysis_sources WITH (security_invoker=true) AS
 SELECT a.id AS analysis_id,
    a.document_id,
    a.batch_id,
    s.id AS source_registry_id,
    s.title AS source_title,
    s.source_type,
    s.official_url,
    s.current_status,
    s.verification_status,
    s.last_checked_at,
    las.used_for,
    las.why_used,
    las.relevance_score
   FROM practice_document_legal_analysis a
     LEFT JOIN practice_legal_analysis_sources las ON las.analysis_id = a.id
     LEFT JOIN legal_source_registry s ON s.id = las.source_registry_id;;

CREATE VIEW public.v_practice_batch_legal_analysis_stats WITH (security_invoker=true) AS
 SELECT b.id AS batch_id,
    b.title,
    count(a.id) AS analyzed_count,
    count(a.id) FILTER (WHERE a.quality_level = 'gold'::text) AS gold_count,
    count(a.id) FILTER (WHERE a.quality_level = 'silver'::text) AS silver_count,
    count(a.id) FILTER (WHERE a.quality_level = 'bronze'::text) AS bronze_count,
    count(a.id) FILTER (WHERE a.quality_level = 'reject'::text) AS reject_count,
    count(a.id) FILTER (WHERE a.use_in_rag = true) AS rag_ready_count,
    count(a.id) FILTER (WHERE a.use_in_generation = true) AS generation_ready_count,
    count(a.id) FILTER (WHERE a.requires_lawyer_review = true) AS needs_lawyer_review_count
   FROM practice_batches b
     LEFT JOIN practice_document_legal_analysis a ON a.batch_id = b.id
  GROUP BY b.id, b.title;;

CREATE VIEW public.v_practice_batches_dashboard WITH (security_invoker=true) AS
 SELECT b.id,
    b.title,
    b.archive_name,
    b.status,
    b.created_at,
    count(d.id) AS documents_count,
    count(d.id) FILTER (WHERE d.mime_type ~~* '%pdf%'::text) AS pdf_count,
    count(d.id) FILTER (WHERE d.mime_type ~~* '%wordprocessingml%'::text OR d.file_name ~~* '%.docx'::text) AS docx_count,
    count(d.id) FILTER (WHERE d.mime_type ~~* 'image/%'::text) AS image_count,
    count(d.id) FILTER (WHERE d.ocr_text IS NOT NULL AND length(d.ocr_text) > 0) AS text_extracted_count,
    count(d.id) FILTER (WHERE (d.metadata ->> 'extraction_status'::text) = 'failed'::text) AS extraction_failed_count,
    b.text_extraction_status,
    b.ocr_status,
    b.classification_status,
    b.legal_analysis_status,
    b.lawyer_review_status,
    b.kb_status,
    b.metadata
   FROM practice_batches b
     LEFT JOIN documents d ON d.batch_id = b.id
  GROUP BY b.id;;

-- ============================================================================
-- Sequence ownership
-- ============================================================================

ALTER SEQUENCE public.leads_lead_number_seq OWNED BY public.leads.lead_number;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.ai_drafts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_intake_analysis ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_source_routing_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.case_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.communication_attachments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.communication_channels ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.communication_contacts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.communication_conversations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.communication_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.communication_webhook_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.compliance_checks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.consultation_bookings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contract_clauses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contract_reviews ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contract_risks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.court_case_import_queue ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.court_cases ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.court_deadlines ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.court_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.court_hearings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.crm_clients ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.crm_notes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.document_intake_ai_runs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.document_intake_answers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.document_intake_schemas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.document_intake_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.external_registry_sources ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.external_reviews ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.generated_document_sources ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.generated_legal_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lawyer_archive_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lawyer_document_actions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lawyer_matter_strategy ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lead_consents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lead_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lead_timeline ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_ai_briefings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_cases ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_document_reviews ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_document_revision_decisions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_document_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_knowledge_chunks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_knowledge_import_queue ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_law_chunks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_laws ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_matters ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_parties ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_reasoning_analyses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_regulatory_monitored_sources ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_regulatory_update_alerts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_regulatory_update_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_research_sources ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_risks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_source_gap_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_source_registry ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_source_usage_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_source_verification_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.official_legal_sources ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.practice_batches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.practice_document_legal_analysis ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.practice_import_queue ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.practice_legal_analysis_sources ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.property_matches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.property_search_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.real_estate_deals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.real_estate_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.real_estate_matches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.real_estate_negotiations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.real_estate_objects ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.real_estate_offers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.real_estate_registry_checks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.real_estate_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.real_estate_risks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.real_estate_viewings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.seo_pages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tax_matter_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Policies
-- ============================================================================

CREATE POLICY "admins manage ai_drafts" ON public.ai_drafts AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));

CREATE POLICY "Admins can manage ai_intake_analysis" ON public.ai_intake_analysis AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_all_ai_source_routing_rules ON public.ai_source_routing_rules AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage ai_usage_logs" ON public.ai_usage_logs AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_all_case_documents ON public.case_documents AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage communication_attachments" ON public.communication_attachments AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage communication_channels" ON public.communication_channels AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage communication_contacts" ON public.communication_contacts AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage communication_conversations" ON public.communication_conversations AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage communication_messages" ON public.communication_messages AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage communication_webhook_events" ON public.communication_webhook_events AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_all_compliance_checks ON public.compliance_checks AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage consultation_bookings" ON public.consultation_bookings AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "admins can manage consultations" ON public.consultations AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));

CREATE POLICY "Admins can manage contract_clauses" ON public.contract_clauses AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage contract_reviews" ON public.contract_reviews AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage contract_risks" ON public.contract_risks AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage contracts" ON public.contracts AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "admins manage conversation_messages" ON public.conversation_messages AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));

CREATE POLICY "admins manage conversations" ON public.conversations AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));

CREATE POLICY "Admins can manage court_cases" ON public.court_cases AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage court_deadlines" ON public.court_deadlines AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage court_documents" ON public.court_documents AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage court_hearings" ON public.court_hearings AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage crm_clients" ON public.crm_clients AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage crm_leads" ON public.crm_leads AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage crm_notes" ON public.crm_notes AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage crm_tasks" ON public.crm_tasks AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage document_intake_ai_runs" ON public.document_intake_ai_runs AS PERMISSIVE FOR ALL TO PUBLIC USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage document_intake_answers" ON public.document_intake_answers AS PERMISSIVE FOR ALL TO PUBLIC USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can delete intake schemas" ON public.document_intake_schemas AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can insert intake schemas" ON public.document_intake_schemas AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can update intake schemas" ON public.document_intake_schemas AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Authenticated can view active intake schemas" ON public.document_intake_schemas AS PERMISSIVE FOR SELECT TO authenticated USING (((is_active = true) OR is_admin_or_superadmin(auth.uid())));

CREATE POLICY "Admins can manage document_intake_sessions" ON public.document_intake_sessions AS PERMISSIVE FOR ALL TO PUBLIC USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins delete templates" ON public.document_templates AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins insert templates" ON public.document_templates AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins update templates" ON public.document_templates AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Authenticated can read active templates" ON public.document_templates AS PERMISSIVE FOR SELECT TO authenticated USING (((is_active = true) OR is_admin_or_superadmin(auth.uid())));

CREATE POLICY "admins manage document templates" ON public.document_templates AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));

CREATE POLICY "authenticated read active document templates" ON public.document_templates AS PERMISSIVE FOR SELECT TO authenticated USING ((is_active = true));

CREATE POLICY "Admins can manage documents" ON public.documents AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_all_external_registry_sources ON public.external_registry_sources AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage reviews" ON public.external_reviews AS PERMISSIVE FOR ALL TO PUBLIC USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Public can read published reviews" ON public.external_reviews AS PERMISSIVE FOR SELECT TO anon, authenticated USING ((is_published = true));

CREATE POLICY "Admins manage generated_document_sources" ON public.generated_document_sources AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins delete generated docs" ON public.generated_legal_documents AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins insert generated docs" ON public.generated_legal_documents AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins select generated docs" ON public.generated_legal_documents AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins update generated docs" ON public.generated_legal_documents AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "admins manage generated legal documents" ON public.generated_legal_documents AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));

CREATE POLICY "Admins manage lawyer archive items" ON public.lawyer_archive_items AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins manage lawyer document actions" ON public.lawyer_document_actions AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins manage lawyer matter strategy" ON public.lawyer_matter_strategy AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "admins manage lead_consents" ON public.lead_consents AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins manage lead documents" ON public.lead_documents AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));

CREATE POLICY "admins can manage lead documents" ON public.lead_documents AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));

CREATE POLICY "Admins manage lead events" ON public.lead_events AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));

CREATE POLICY "admins can manage lead events" ON public.lead_events AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));

CREATE POLICY "Admins manage lead notes" ON public.lead_notes AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));

CREATE POLICY "Admins manage lead tasks" ON public.lead_tasks AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));

CREATE POLICY admin_all_lead_timeline ON public.lead_timeline AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Anyone can submit a lead" ON public.leads AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK ((((length(name) >= 1) AND (length(name) <= 200)) AND ((length(phone) >= 1) AND (length(phone) <= 50)) AND ((contact IS NULL) OR (length(contact) <= 200)) AND ((length(original_text) >= 1) AND (length(original_text) <= 5000)) AND (admin_notes IS NULL) AND (status = 'new'::lead_status) AND (source_crm_lead_id IS NULL) AND (assigned_to IS NULL) AND (ai_summary IS NULL) AND (category IS NULL) AND (qa IS NULL) AND (urgency IS NULL) AND (risks IS NULL) AND (next_step IS NULL) AND (documents_checklist IS NULL) AND (estimated_budget IS NULL) AND (next_followup_at IS NULL) AND (closed_at IS NULL) AND (last_contact_at IS NULL) AND (archived_at IS NULL) AND (lead_number IS NULL) AND (pipeline_stage = 'new'::text) AND (priority = 'normal'::text)));

CREATE POLICY "admins can manage leads" ON public.leads AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));

CREATE POLICY admin_all_legal_ai_briefings ON public.legal_ai_briefings AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_delete_legal_cases ON public.legal_cases AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_insert_legal_cases ON public.legal_cases AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_select_legal_cases ON public.legal_cases AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_update_legal_cases ON public.legal_cases AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "admins can manage legal document reviews" ON public.legal_document_reviews AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));

CREATE POLICY "admins can read legal document reviews" ON public.legal_document_reviews AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));

CREATE POLICY "Admins can delete legal revision decisions" ON public.legal_document_revision_decisions AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can insert legal revision decisions" ON public.legal_document_revision_decisions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can read legal revision decisions" ON public.legal_document_revision_decisions AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can update legal revision decisions" ON public.legal_document_revision_decisions AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can delete templates" ON public.legal_document_templates AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can insert templates" ON public.legal_document_templates AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can update templates" ON public.legal_document_templates AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Authenticated can view active templates" ON public.legal_document_templates AS PERMISSIVE FOR SELECT TO authenticated USING (((is_active = true) OR is_admin_or_superadmin(auth.uid())));

CREATE POLICY admin_all_legal_law_chunks ON public.legal_law_chunks AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_all_legal_laws ON public.legal_laws AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage legal_matters" ON public.legal_matters AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage legal_parties" ON public.legal_parties AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins manage legal_reasoning_analyses" ON public.legal_reasoning_analyses AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins manage regulatory monitored sources" ON public.legal_regulatory_monitored_sources AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins manage regulatory update alerts" ON public.legal_regulatory_update_alerts AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins manage regulatory update logs" ON public.legal_regulatory_update_logs AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins manage legal_research_sources" ON public.legal_research_sources AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage legal_risks" ON public.legal_risks AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY lsgr_admin_delete ON public.legal_source_gap_requests AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_superadmin(auth.uid()));

CREATE POLICY lsgr_admin_insert ON public.legal_source_gap_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY lsgr_admin_select ON public.legal_source_gap_requests AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_superadmin(auth.uid()));

CREATE POLICY lsgr_admin_update ON public.legal_source_gap_requests AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins manage legal_source_registry" ON public.legal_source_registry AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY lsue_admin_delete ON public.legal_source_usage_events AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_superadmin(auth.uid()));

CREATE POLICY lsue_admin_insert ON public.legal_source_usage_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY lsue_admin_select ON public.legal_source_usage_events AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_superadmin(auth.uid()));

CREATE POLICY lsue_admin_update ON public.legal_source_usage_events AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY lsvl_admin_delete ON public.legal_source_verification_logs AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_superadmin(auth.uid()));

CREATE POLICY lsvl_admin_insert ON public.legal_source_verification_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY lsvl_admin_select ON public.legal_source_verification_logs AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_superadmin(auth.uid()));

CREATE POLICY lsvl_admin_update ON public.legal_source_verification_logs AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY admin_all_official_legal_sources ON public.official_legal_sources AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage payments" ON public.payments AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins manage practice_batches" ON public.practice_batches AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins manage practice_document_legal_analysis" ON public.practice_document_legal_analysis AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins manage practice_import_queue" ON public.practice_import_queue AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins manage practice_legal_analysis_sources" ON public.practice_legal_analysis_sources AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Profiles viewable by owner" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY "Admins manage properties" ON public.properties AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins manage property_matches" ON public.property_matches AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins manage property_search_requests" ON public.property_search_requests AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Anyone can submit property search request" ON public.property_search_requests AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK ((((length(client_name) >= 1) AND (length(client_name) <= 200)) AND ((length(phone) >= 1) AND (length(phone) <= 50)) AND ((length(property_type) >= 1) AND (length(property_type) <= 100)) AND (status = 'new'::text)));

CREATE POLICY "Admins can manage real_estate_deals" ON public.real_estate_deals AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage real_estate_documents" ON public.real_estate_documents AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage real_estate_matches" ON public.real_estate_matches AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage real_estate_objects" ON public.real_estate_objects AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage real_estate_registry_checks" ON public.real_estate_registry_checks AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage real_estate_requests" ON public.real_estate_requests AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage real_estate_risks" ON public.real_estate_risks AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage real_estate_viewings" ON public.real_estate_viewings AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage seo pages" ON public.seo_pages AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'admin'::app_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'admin'::app_role)))));

CREATE POLICY "Public can read published seo pages" ON public.seo_pages AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_published = true));

CREATE POLICY "Admins can update site settings" ON public.site_settings AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can read site settings" ON public.site_settings AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins manage tax matter profiles" ON public.tax_matter_profiles AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_superadmin(auth.uid())) WITH CHECK (is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can view all roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage non-superadmin roles" ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) AND (role <> 'super_admin'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) AND (role <> 'super_admin'::app_role)));

CREATE POLICY "Super admins manage all roles" ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can view own roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY "admins manage webhook_events" ON public.webhook_events AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))));

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN public.generated_legal_documents.ai_review_status IS 'AI legal review status: pending, passed, needs_revision, blocked.';

COMMENT ON COLUMN public.generated_legal_documents.intake_session_id IS 'Links generated document to the document intake session used to produce it.';

COMMENT ON COLUMN public.generated_legal_documents.lawyer_approved_at IS 'Timestamp when lawyer approved this generated document as final or client-ready.';

COMMENT ON COLUMN public.generated_legal_documents.lawyer_approved_by IS 'User ID of lawyer/admin who approved this generated document.';

COMMENT ON COLUMN public.generated_legal_documents.parent_document_id IS 'Parent generated document for version history.';

COMMENT ON COLUMN public.generated_legal_documents.version_number IS 'Version number of generated document in the document drafting workflow.';

-- ============================================================================

-- SECURITY NOTE:
-- Production-wide table/function/sequence GRANT statements are intentionally omitted.
-- Apply only least-privilege grants after a separate security review.

-- =============================================================================
-- 2. Repository-owned reference seeds: legacy templates
-- =============================================================================

INSERT INTO public.document_templates (category, template_key, title, sort_order) VALUES
  ('Договоры', 'contract_sale_real_estate', 'Договор купли-продажи недвижимости', 10),
  ('Договоры', 'contract_residential_lease', 'Договор аренды жилого помещения', 20),
  ('Договоры', 'contract_commercial_lease', 'Договор аренды коммерческого помещения', 30),
  ('Договоры', 'contract_legal_services', 'Договор оказания юридических услуг', 40),
  ('Договоры', 'contract_supply', 'Договор поставки', 50),
  ('Договоры', 'contract_loan', 'Договор займа', 60),
  ('Договоры', 'contract_termination', 'Соглашение о расторжении', 70),
  ('Договоры', 'contract_claim', 'Претензия по договору', 80),
  ('Судебные документы', 'court_statement_of_claim', 'Исковое заявление', 10),
  ('Судебные документы', 'court_response_to_claim', 'Отзыв на иск', 20),
  ('Судебные документы', 'court_objections', 'Возражения на иск', 30),
  ('Судебные документы', 'court_motion', 'Ходатайство', 40),
  ('Судебные документы', 'court_appeal', 'Апелляционная жалоба', 50),
  ('Судебные документы', 'court_settlement', 'Мировое соглашение', 60),
  ('Налоговые проверки', 'tax_response_to_fns', 'Ответ на требование ФНС', 10),
  ('Налоговые проверки', 'tax_explanation_desk_audit', 'Пояснения по камеральной проверке', 20),
  ('Налоговые проверки', 'tax_objections_audit_act', 'Возражения на акт налоговой проверки', 30),
  ('Налоговые проверки', 'tax_complaint_ufns', 'Жалоба в УФНС', 40),
  ('Налоговые проверки', 'tax_motion_extend_deadline', 'Ходатайство о продлении срока ответа', 50),
  ('Недвижимость', 're_apartment_check_report', 'Заключение по проверке квартиры', 10),
  ('Недвижимость', 're_inspection_act', 'Акт осмотра объекта', 20),
  ('Недвижимость', 're_risk_list', 'Список рисков сделки', 30),
  ('Недвижимость', 're_document_request', 'Запрос документов у продавца', 40)
ON CONFLICT (template_key) DO UPDATE
  SET category = EXCLUDED.category,
      title = EXCLUDED.title,
      sort_order = EXCLUDED.sort_order,
      is_active = true;

-- =============================================================================
-- 3. Repository-owned reference seeds: canonical registry
-- =============================================================================

INSERT INTO public.legal_document_templates (code, title, category, subcategory, practice_area, jurisdiction, complexity, requires_intake, description, sort_order) VALUES
-- GENERAL
('legal_opinion', 'Правовое заключение (Legal Opinion)', 'GENERAL', 'opinion', 'general', ARRAY['RU','CY','IL','GE'], 'advanced', true, 'Юридическое заключение по поставленному вопросу со ссылками на нормы и практику.', 10),
('legal_memo', 'Меморандум юриста', 'GENERAL', 'opinion', 'general', ARRAY['RU','CY','IL','GE'], 'advanced', true, 'Внутренний правовой меморандум по делу.', 20),
('legal_risk_report', 'Заключение по рискам', 'GENERAL', 'risk', 'general', ARRAY['RU','CY','IL','GE'], 'advanced', true, 'Структурированный отчёт о юридических рисках.', 30),
('client_document_request', 'Запрос документов и информации у клиента', 'GENERAL', 'intake', 'general', ARRAY['RU'], 'basic', true, 'Список документов и сведений, необходимых для работы по делу.', 40),
('due_diligence_report', 'Due Diligence Report', 'GENERAL', 'dd', 'general', ARRAY['RU','CY','IL','GE'], 'expert', true, 'Отчёт по юридической проверке (DD) актива или компании.', 50),
('legal_research', 'Юридическое исследование', 'GENERAL', 'research', 'general', ARRAY['RU'], 'advanced', true, 'Исследование по правовому вопросу с обзором норм и практики.', 60),
('analytical_note', 'Аналитическая записка по делу', 'GENERAL', 'analysis', 'general', ARRAY['RU'], 'advanced', true, 'Краткая аналитика по материалам дела.', 70),
('legal_position', 'Правовая позиция по спору', 'GENERAL', 'opinion', 'litigation', ARRAY['RU'], 'advanced', true, 'Сформированная правовая позиция стороны спора.', 80),
('red_flag_report', 'Red Flag Report', 'GENERAL', 'dd', 'general', ARRAY['RU','CY','IL','GE'], 'expert', true, 'Краткий отчёт по красным флагам сделки.', 90),
('legal_checklist', 'Legal Checklist', 'GENERAL', 'checklist', 'general', ARRAY['RU'], 'basic', false, 'Чек-лист правовой проверки.', 100),

-- CONTRACTS
('services_agreement', 'Договор оказания услуг', 'CONTRACTS', 'services', 'contracts', ARRAY['RU'], 'basic', true, 'Договор возмездного оказания услуг.', 200),
('supply_agreement', 'Договор поставки', 'CONTRACTS', 'commercial', 'contracts', ARRAY['RU'], 'advanced', true, 'Договор поставки товаров между юр. лицами.', 210),
('nda', 'NDA / Соглашение о конфиденциальности', 'CONTRACTS', 'protective', 'contracts', ARRAY['RU','CY','IL','GE'], 'basic', true, 'Соглашение о неразглашении конфиденциальной информации.', 220),
('loan_agreement', 'Договор займа', 'CONTRACTS', 'finance', 'contracts', ARRAY['RU'], 'basic', true, 'Договор займа между физическими или юридическими лицами.', 230),
('agency_agreement', 'Агентский договор', 'CONTRACTS', 'representation', 'contracts', ARRAY['RU'], 'advanced', true, 'Агентский договор.', 240),
('commission_agreement', 'Договор комиссии', 'CONTRACTS', 'representation', 'contracts', ARRAY['RU'], 'advanced', true, 'Договор комиссии.', 250),
('consulting_agreement', 'Договор консультационных услуг', 'CONTRACTS', 'services', 'contracts', ARRAY['RU','CY'], 'basic', true, 'Договор оказания консультационных услуг.', 260),
('franchise_agreement', 'Договор франчайзинга (коммерческой концессии)', 'CONTRACTS', 'commercial', 'contracts', ARRAY['RU'], 'expert', true, 'Договор коммерческой концессии.', 270),
('software_development_agreement', 'Договор разработки ПО', 'CONTRACTS', 'it', 'it', ARRAY['RU','CY','IL'], 'advanced', true, 'Договор разработки программного обеспечения.', 280),
('saas_agreement', 'SaaS Agreement', 'CONTRACTS', 'it', 'it', ARRAY['RU','CY','IL'], 'advanced', true, 'Договор предоставления SaaS-сервиса.', 290),
('data_processing_agreement', 'Договор обработки персональных данных (DPA)', 'CONTRACTS', 'it', 'it', ARRAY['RU','CY','IL'], 'advanced', true, 'Соглашение об обработке персональных данных.', 300),
('work_contract', 'Договор подряда', 'CONTRACTS', 'services', 'contracts', ARRAY['RU'], 'basic', true, 'Общий договор подряда.', 310),
('construction_contract', 'Договор строительного подряда', 'CONTRACTS', 'services', 'real_estate', ARRAY['RU'], 'advanced', true, 'Договор строительного подряда.', 320),
('design_contract', 'Договор проектных работ', 'CONTRACTS', 'services', 'real_estate', ARRAY['RU'], 'advanced', true, 'Договор на выполнение проектных работ.', 330),
('rnd_contract', 'Договор НИОКР', 'CONTRACTS', 'services', 'it', ARRAY['RU'], 'expert', true, 'Договор на НИОКР.', 340),
('storage_agreement', 'Договор хранения', 'CONTRACTS', 'logistics', 'contracts', ARRAY['RU'], 'basic', true, 'Договор хранения имущества.', 350),
('transport_agreement', 'Договор перевозки', 'CONTRACTS', 'logistics', 'contracts', ARRAY['RU'], 'basic', true, 'Договор перевозки груза.', 360),
('forwarding_agreement', 'Договор транспортной экспедиции', 'CONTRACTS', 'logistics', 'contracts', ARRAY['RU'], 'advanced', true, 'Договор транспортной экспедиции.', 370),
('credit_agreement', 'Договор кредита', 'CONTRACTS', 'finance', 'contracts', ARRAY['RU'], 'advanced', true, 'Кредитный договор.', 380),
('assignment_agreement', 'Договор уступки права требования (цессия)', 'CONTRACTS', 'finance', 'contracts', ARRAY['RU'], 'advanced', true, 'Договор цессии.', 390),
('debt_transfer_agreement', 'Договор перевода долга', 'CONTRACTS', 'finance', 'contracts', ARRAY['RU'], 'advanced', true, 'Договор перевода долга.', 400),
('surety_agreement', 'Договор поручительства', 'CONTRACTS', 'finance', 'contracts', ARRAY['RU'], 'basic', true, 'Договор поручительства.', 410),
('pledge_agreement', 'Договор залога', 'CONTRACTS', 'finance', 'contracts', ARRAY['RU'], 'advanced', true, 'Договор залога имущества.', 420),
('insurance_agreement', 'Договор страхования', 'CONTRACTS', 'finance', 'contracts', ARRAY['RU'], 'basic', true, 'Договор страхования.', 430),
('eula', 'End User License Agreement (EULA)', 'CONTRACTS', 'it', 'it', ARRAY['RU','CY','IL'], 'advanced', true, 'Лицензионное соглашение с конечным пользователем.', 440),
('software_license', 'Software License Agreement', 'CONTRACTS', 'it', 'it', ARRAY['RU','CY','IL'], 'advanced', true, 'Лицензионный договор на ПО.', 450),
('distribution_agreement', 'Договор дистрибуции', 'CONTRACTS', 'commercial', 'contracts', ARRAY['RU','CY'], 'advanced', true, 'Дистрибьюторский договор.', 460),
('letter_of_intent', 'Letter of Intent (LOI)', 'CONTRACTS', 'protective', 'general', ARRAY['RU','CY','IL'], 'basic', true, 'Письмо о намерениях.', 470),

-- REAL_ESTATE
('purchase_sale_real_estate', 'Договор купли-продажи недвижимости', 'REAL_ESTATE', 'purchase', 'real_estate', ARRAY['RU'], 'advanced', true, 'Договор купли-продажи объекта недвижимости.', 500),
('residential_lease', 'Договор аренды жилой недвижимости', 'REAL_ESTATE', 'lease', 'real_estate', ARRAY['RU'], 'basic', true, 'Договор найма жилого помещения.', 510),
('commercial_lease', 'Договор аренды коммерческой недвижимости', 'REAL_ESTATE', 'lease', 'real_estate', ARRAY['RU'], 'advanced', true, 'Договор аренды нежилого помещения.', 520),
('handover_act', 'Акт приёма-передачи', 'REAL_ESTATE', 'acts', 'real_estate', ARRAY['RU'], 'basic', false, 'Акт приёма-передачи недвижимости.', 530),
('deposit_agreement', 'Соглашение о задатке', 'REAL_ESTATE', 'preliminary', 'real_estate', ARRAY['RU'], 'basic', true, 'Соглашение о задатке.', 540),
('advance_payment_agreement', 'Соглашение об авансе', 'REAL_ESTATE', 'preliminary', 'real_estate', ARRAY['RU'], 'basic', true, 'Соглашение об авансе.', 550),
('lease_termination_notice', 'Уведомление о расторжении договора аренды', 'REAL_ESTATE', 'termination', 'real_estate', ARRAY['RU'], 'basic', true, 'Уведомление о расторжении аренды.', 560),
('lease_addendum', 'Дополнительное соглашение к договору аренды', 'REAL_ESTATE', 'lease', 'real_estate', ARRAY['RU'], 'basic', true, 'ДС к договору аренды.', 570),
('disagreement_protocol', 'Протокол разногласий', 'REAL_ESTATE', 'acts', 'real_estate', ARRAY['RU'], 'basic', false, 'Протокол разногласий к договору.', 580),
('real_estate_claim', 'Претензия по сделке с недвижимостью', 'REAL_ESTATE', 'dispute', 'real_estate', ARRAY['RU'], 'advanced', true, 'Досудебная претензия по сделке.', 590),
('real_estate_dd_opinion', 'Правовое заключение по проверке объекта', 'REAL_ESTATE', 'dd', 'real_estate', ARRAY['RU'], 'expert', true, 'Юридическая проверка объекта недвижимости.', 600),

-- COURT
('statement_of_claim', 'Исковое заявление', 'COURT', 'pleading', 'litigation', ARRAY['RU'], 'advanced', true, 'Исковое заявление в суд.', 700),
('response_to_claim', 'Отзыв на иск', 'COURT', 'pleading', 'litigation', ARRAY['RU'], 'advanced', true, 'Отзыв (возражения) на исковое заявление.', 710),
('objections', 'Возражения', 'COURT', 'pleading', 'litigation', ARRAY['RU'], 'advanced', true, 'Письменные возражения по делу.', 720),
('motion', 'Ходатайство', 'COURT', 'motion', 'litigation', ARRAY['RU'], 'basic', true, 'Процессуальное ходатайство в суд.', 730),
('appeal', 'Апелляционная жалоба', 'COURT', 'appeal', 'litigation', ARRAY['RU'], 'advanced', true, 'Апелляционная жалоба.', 740),
('cassation', 'Кассационная жалоба', 'COURT', 'appeal', 'litigation', ARRAY['RU'], 'expert', true, 'Кассационная жалоба.', 750),
('court_order_request', 'Заявление о выдаче судебного приказа', 'COURT', 'pleading', 'litigation', ARRAY['RU'], 'basic', true, 'Заявление о выдаче судебного приказа.', 760),
('court_order_cancel', 'Заявление об отмене судебного приказа', 'COURT', 'pleading', 'litigation', ARRAY['RU'], 'basic', true, 'Заявление об отмене судебного приказа.', 770),
('settlement_agreement', 'Мировое соглашение', 'COURT', 'settlement', 'litigation', ARRAY['RU'], 'advanced', true, 'Мировое соглашение сторон.', 780),

-- TAX
('response_to_tax_request', 'Ответ на требование ФНС', 'TAX', 'response', 'tax', ARRAY['RU'], 'advanced', true, 'Ответ на требование налогового органа.', 800),
('tax_explanations', 'Пояснения в ФНС', 'TAX', 'response', 'tax', ARRAY['RU'], 'basic', true, 'Пояснения по запросу ФНС.', 810),
('objections_tax_audit', 'Возражения на акт налоговой проверки', 'TAX', 'audit', 'tax', ARRAY['RU'], 'expert', true, 'Возражения на акт налоговой проверки.', 820),
('tax_complaint', 'Жалоба в УФНС', 'TAX', 'appeal', 'tax', ARRAY['RU'], 'advanced', true, 'Жалоба в вышестоящий налоговый орган.', 830),
('tax_offset_application', 'Заявление о зачёте/возврате налога', 'TAX', 'application', 'tax', ARRAY['RU'], 'basic', true, 'Заявление о зачёте или возврате налога.', 840),
('tax_risk_opinion', 'Правовое заключение по налоговым рискам', 'TAX', 'opinion', 'tax', ARRAY['RU'], 'expert', true, 'Заключение по налоговым рискам.', 850),
('tax_audit_doc_request', 'Запрос документов по налоговой проверке', 'TAX', 'audit', 'tax', ARRAY['RU'], 'basic', true, 'Запрос документов в рамках налоговой проверки.', 860),

-- CORPORATE
('corporate_agreement', 'Корпоративный договор', 'CORPORATE', 'governance', 'corporate', ARRAY['RU'], 'expert', true, 'Корпоративный договор участников.', 900),
('shareholder_agreement_ru', 'Акционерное соглашение (РФ)', 'CORPORATE', 'governance', 'corporate', ARRAY['RU'], 'expert', true, 'Акционерное соглашение по праву РФ.', 910),
('founders_agreement_ru', 'Договор об учреждении', 'CORPORATE', 'governance', 'corporate', ARRAY['RU'], 'advanced', true, 'Договор об учреждении общества.', 920),
('board_resolution', 'Решение совета директоров', 'CORPORATE', 'resolutions', 'corporate', ARRAY['RU','CY','IL'], 'basic', true, 'Решение совета директоров.', 930),
('shareholder_resolution', 'Решение общего собрания', 'CORPORATE', 'resolutions', 'corporate', ARRAY['RU','CY','IL'], 'basic', true, 'Решение общего собрания участников.', 940),
('sole_participant_decision', 'Решение единственного участника', 'CORPORATE', 'resolutions', 'corporate', ARRAY['RU'], 'basic', true, 'Решение единственного участника.', 950),
('shareholders_meeting_minutes', 'Протокол общего собрания', 'CORPORATE', 'resolutions', 'corporate', ARRAY['RU'], 'basic', true, 'Протокол общего собрания участников.', 960),

-- INTERNATIONAL_CORPORATE
('shareholders_agreement', 'Shareholders Agreement (SHA)', 'INTERNATIONAL_CORPORATE', 'governance', 'international_corporate', ARRAY['CY','IL','GE'], 'expert', true, 'Соглашение акционеров по международному праву.', 1000),
('founders_agreement', 'Founders Agreement', 'INTERNATIONAL_CORPORATE', 'governance', 'international_corporate', ARRAY['CY','IL'], 'advanced', true, 'Соглашение основателей стартапа.', 1010),
('investment_agreement', 'Investment Agreement', 'INTERNATIONAL_CORPORATE', 'investment', 'international_corporate', ARRAY['CY','IL'], 'expert', true, 'Инвестиционное соглашение.', 1020),
('safe', 'SAFE', 'INTERNATIONAL_CORPORATE', 'investment', 'international_corporate', ARRAY['CY','IL'], 'advanced', true, 'Simple Agreement for Future Equity.', 1030),
('convertible_note', 'Convertible Loan / Note', 'INTERNATIONAL_CORPORATE', 'investment', 'international_corporate', ARRAY['CY','IL'], 'expert', true, 'Конвертируемый заём.', 1040),
('share_purchase_agreement', 'Share Purchase Agreement (SPA)', 'INTERNATIONAL_CORPORATE', 'm_and_a', 'international_corporate', ARRAY['CY','IL','GE'], 'expert', true, 'Договор купли-продажи акций/долей.', 1050),
('subscription_agreement', 'Subscription Agreement', 'INTERNATIONAL_CORPORATE', 'investment', 'international_corporate', ARRAY['CY','IL'], 'advanced', true, 'Договор подписки на акции.', 1060),
('option_agreement', 'Option Agreement', 'INTERNATIONAL_CORPORATE', 'investment', 'international_corporate', ARRAY['CY','IL'], 'advanced', true, 'Опционное соглашение на доли/акции.', 1070),
('term_sheet', 'Term Sheet', 'INTERNATIONAL_CORPORATE', 'preliminary', 'international_corporate', ARRAY['CY','IL','GE'], 'advanced', true, 'Term Sheet по инвестиционной сделке.', 1080),
('ip_assignment', 'IP Assignment Agreement', 'INTERNATIONAL_CORPORATE', 'ip', 'international_corporate', ARRAY['CY','IL'], 'advanced', true, 'Соглашение об уступке прав на интеллектуальную собственность.', 1090),
('director_agreement', 'Director Agreement', 'INTERNATIONAL_CORPORATE', 'governance', 'international_corporate', ARRAY['CY','IL'], 'advanced', true, 'Соглашение с директором компании.', 1100),
('international_nda', 'NDA (International)', 'INTERNATIONAL_CORPORATE', 'protective', 'international_corporate', ARRAY['CY','IL','GE'], 'basic', true, 'NDA по международному стандарту.', 1110),
('international_loi', 'Letter of Intent (International)', 'INTERNATIONAL_CORPORATE', 'preliminary', 'international_corporate', ARRAY['CY','IL'], 'basic', true, 'LOI по международной сделке.', 1120),

-- COMPLIANCE / OTHER
('compliance_policy', 'Политика комплаенс', 'COMPLIANCE', 'policy', 'compliance', ARRAY['RU','CY'], 'advanced', true, 'Внутренняя политика по комплаенс.', 1200),
('aml_policy', 'AML / KYC политика', 'COMPLIANCE', 'policy', 'compliance', ARRAY['RU','CY','IL'], 'expert', true, 'Политика противодействия отмыванию денежных средств.', 1210),
('privacy_policy', 'Политика конфиденциальности', 'COMPLIANCE', 'policy', 'it', ARRAY['RU','CY','IL'], 'basic', true, 'Политика обработки персональных данных.', 1220),
('terms_of_use', 'Пользовательское соглашение', 'COMPLIANCE', 'policy', 'it', ARRAY['RU'], 'basic', true, 'Пользовательское соглашение для сайта/сервиса.', 1230),
('cookie_policy', 'Cookie Policy', 'COMPLIANCE', 'policy', 'it', ARRAY['RU','CY','IL'], 'basic', false, 'Политика использования cookie.', 1240),
('whistleblowing_policy', 'Whistleblowing Policy', 'COMPLIANCE', 'policy', 'compliance', ARRAY['CY','IL'], 'advanced', true, 'Политика по сообщениям о нарушениях.', 1250),

-- LABOUR
('employment_agreement', 'Трудовой договор', 'LABOUR', 'employment', 'labour', ARRAY['RU'], 'basic', true, 'Трудовой договор с работником.', 1300),
('service_provider_agreement', 'Договор с самозанятым', 'LABOUR', 'employment', 'labour', ARRAY['RU'], 'basic', true, 'Договор оказания услуг с самозанятым.', 1310),
('contractor_agreement_intl', 'Independent Contractor Agreement', 'LABOUR', 'employment', 'international_corporate', ARRAY['CY','IL'], 'advanced', true, 'Соглашение с независимым подрядчиком.', 1320)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.legal_document_templates
  (code, title, category, subcategory, practice_area, jurisdiction, languages, complexity, requires_intake, description, sort_order)
VALUES
  -- CONTRACTS additions
  ('non_compete_agreement','Соглашение о неконкуренции (NCA)','CONTRACTS','restrictive','contracts',ARRAY['RU','CY','IL'],ARRAY['ru','en'],'advanced',true,'Запрет конкурирующей деятельности с условиями компенсации и срока.',210),
  ('nnn_agreement','NNN Agreement','CONTRACTS','restrictive','contracts',ARRAY['CY','IL'],ARRAY['en'],'advanced',true,'Non-Use, Non-Disclosure, Non-Circumvention для работы с поставщиками и партнёрами.',211),
  ('mou','Меморандум о взаимопонимании (MOU)','CONTRACTS','preliminary','contracts',ARRAY['RU','CY','IL','GE'],ARRAY['ru','en'],'basic',true,'Фиксация общих договорённостей сторон до заключения основного договора.',212),
  ('investment_agreement_ru','Инвестиционный договор (РФ)','CONTRACTS','investment','contracts',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Условия инвестирования, контроля и выхода инвестора по российскому праву.',213),
  ('project_participants_agreement','Соглашение участников проекта','CONTRACTS','investment','contracts',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Распределение ролей, вкладов и прибыли между участниками проекта.',214),
  ('cloud_service_agreement','Cloud Service Agreement','CONTRACTS','it','contracts',ARRAY['RU','CY','IL'],ARRAY['ru','en'],'advanced',true,'Соглашение об оказании облачных услуг с SLA и условиями обработки данных.',215),
  ('api_agreement','API Agreement','CONTRACTS','it','contracts',ARRAY['RU','CY','IL'],ARRAY['ru','en'],'advanced',true,'Условия доступа к API, лимиты, ответственность и интеллектуальная собственность.',216),
  ('white_label_agreement','White Label Agreement','CONTRACTS','distribution','contracts',ARRAY['RU','CY','IL'],ARRAY['ru','en'],'advanced',true,'Соглашение о распространении продукта под брендом партнёра.',217),
  ('marketplace_agreement','Marketplace Agreement','CONTRACTS','distribution','contracts',ARRAY['RU','CY'],ARRAY['ru','en'],'advanced',true,'Условия размещения и продажи через маркетплейс.',218),
  ('affiliate_agreement','Affiliate Agreement','CONTRACTS','distribution','contracts',ARRAY['RU','CY','IL'],ARRAY['ru','en'],'basic',true,'Партнёрская программа: условия вознаграждения и порядок расчётов.',219),
  ('advertising_agreement','Договор на рекламные услуги','CONTRACTS','services','contracts',ARRAY['RU'],ARRAY['ru'],'basic',true,'Размещение рекламы, метрики, ответственность исполнителя.',220),
  ('influencer_agreement','Influencer Agreement','CONTRACTS','services','contracts',ARRAY['RU','CY','IL'],ARRAY['ru','en'],'basic',true,'Соглашение с инфлюенсером: контент, права, KPI.',221),
  ('property_sale_agreement','Договор купли-продажи имущества','CONTRACTS','sale','contracts',ARRAY['RU'],ARRAY['ru'],'basic',true,'Купля-продажа движимого имущества по российскому праву.',222),
  ('business_sale_agreement','Договор купли-продажи бизнеса','CONTRACTS','sale','contracts',ARRAY['RU'],ARRAY['ru'],'expert',true,'Продажа действующего бизнеса как имущественного комплекса.',223),
  ('mandate_agreement','Договор поручения','CONTRACTS','agency','contracts',ARRAY['RU'],ARRAY['ru'],'basic',true,'Совершение юридических действий от имени и за счёт доверителя.',224),

  -- REAL ESTATE
  ('apartment_sale_agreement','Договор купли-продажи квартиры','REAL_ESTATE','residential','real_estate',ARRAY['RU'],ARRAY['ru'],'basic',true,'Сделка купли-продажи жилого помещения.',410),
  ('house_sale_agreement','Договор купли-продажи дома','REAL_ESTATE','residential','real_estate',ARRAY['RU'],ARRAY['ru'],'basic',true,'Купля-продажа жилого дома с земельным участком.',411),
  ('land_plot_sale_agreement','Договор купли-продажи земельного участка','REAL_ESTATE','land','real_estate',ARRAY['RU'],ARRAY['ru'],'basic',true,'Сделка по земельному участку.',412),
  ('commercial_real_estate_sale','Договор купли-продажи коммерческой недвижимости','REAL_ESTATE','commercial','real_estate',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Купля-продажа объекта коммерческой недвижимости.',413),
  ('preliminary_real_estate_agreement','Предварительный договор по недвижимости','REAL_ESTATE','residential','real_estate',ARRAY['RU'],ARRAY['ru'],'basic',true,'Закрепление условий будущей сделки с недвижимостью.',414),
  ('long_term_lease','Договор долгосрочной аренды','REAL_ESTATE','commercial','real_estate',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Аренда сроком от 1 года с регистрацией.',415),
  ('sublease_agreement','Договор субаренды','REAL_ESTATE','commercial','real_estate',ARRAY['RU'],ARRAY['ru'],'basic',true,'Передача арендованного помещения в субаренду.',416),

  -- COURT
  ('interim_measures_application','Заявление об обеспечительных мерах','COURT','procedural','litigation',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Ходатайство о принятии обеспечительных мер по делу.',520),
  ('supreme_court_complaint','Жалоба в Верховный Суд','COURT','appeal','litigation',ARRAY['RU'],ARRAY['ru'],'expert',true,'Подготовка кассационной жалобы в ВС РФ.',521),
  ('case_legal_position','Правовая позиция по делу','COURT','strategy','litigation',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Развернутая правовая позиция стороны по спору.',522),
  ('litigation_strategy','Стратегия судебного спора','COURT','strategy','litigation',ARRAY['RU'],ARRAY['ru'],'expert',true,'Сценарии ведения спора, риски и ожидаемые результаты.',523),

  -- TAX
  ('onsite_tax_audit_explanations','Пояснения по выездной проверке','TAX','audit','tax',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Подготовка письменных пояснений в рамках выездной налоговой проверки.',620),
  ('fns_complaint','Жалоба в ФНС России','TAX','disputes','tax',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Жалоба в центральный аппарат ФНС на решение нижестоящего органа.',621),
  ('tax_refund_application','Заявление о возврате налога','TAX','administrative','tax',ARRAY['RU'],ARRAY['ru'],'basic',true,'Возврат излишне уплаченного или взысканного налога.',622),
  ('tax_due_diligence','Налоговый Due Diligence','TAX','analysis','tax',ARRAY['RU'],ARRAY['ru'],'expert',true,'Аудит налоговых рисков компании или сделки.',623),
  ('tax_strategy','Налоговая стратегия','TAX','analysis','tax',ARRAY['RU'],ARRAY['ru'],'expert',true,'Долгосрочный налоговый план с учётом рисков и оптимизации.',624),

  -- CORPORATE RU
  ('incorporation_agreement','Договор об учреждении','CORPORATE','formation','corporate',ARRAY['RU'],ARRAY['ru'],'basic',true,'Договор учредителей о создании юридического лица.',720),
  ('board_regulations','Положение о совете директоров','CORPORATE','governance','corporate',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Внутренний документ, регулирующий работу совета директоров.',721),
  ('corporate_policy','Корпоративная политика','CORPORATE','governance','corporate',ARRAY['RU'],ARRAY['ru'],'basic',true,'Внутренний регламент компании по корпоративным процедурам.',722),
  ('option_agreement_ru','Опционный договор (РФ)','CORPORATE','equity','corporate',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Опцион на долю/акции по российскому праву.',723),
  ('share_sale_agreement_ru','Договор купли-продажи доли (ООО)','CORPORATE','equity','corporate',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Сделка по отчуждению доли в уставном капитале ООО.',724),
  ('corporate_due_diligence','Корпоративный Due Diligence','CORPORATE','analysis','corporate',ARRAY['RU'],ARRAY['ru'],'expert',true,'Проверка корпоративной истории компании.',725),

  -- INTERNATIONAL CORPORATE
  ('vesting_agreement','Vesting Agreement','INTERNATIONAL_CORPORATE','equity','international_corporate',ARRAY['CY','IL','GE'],ARRAY['en'],'advanced',true,'Условия вестинга акций/опционов основателей и сотрудников.',830),
  ('founder_exit_agreement','Founder Exit Agreement','INTERNATIONAL_CORPORATE','equity','international_corporate',ARRAY['CY','IL','GE'],ARRAY['en'],'advanced',true,'Условия выхода основателя из проекта.',831),
  ('intl_employment_agreement','International Employment Agreement','INTERNATIONAL_CORPORATE','hr','international_corporate',ARRAY['CY','IL','GE'],ARRAY['en'],'advanced',true,'Трудовой договор по иностранному праву.',832),
  ('technology_transfer_agreement','Technology Transfer Agreement','INTERNATIONAL_CORPORATE','ip','international_corporate',ARRAY['CY','IL','GE'],ARRAY['en'],'expert',true,'Передача технологий и сопутствующих прав ИС.',833),
  ('ma_due_diligence','M&A Due Diligence','INTERNATIONAL_CORPORATE','analysis','international_corporate',ARRAY['CY','IL','GE'],ARRAY['en'],'expert',true,'Юридическая проверка цели сделки M&A.',834),
  ('intl_corporate_resolutions','Corporate Resolutions','INTERNATIONAL_CORPORATE','governance','international_corporate',ARRAY['CY','IL','GE'],ARRAY['en'],'basic',true,'Корпоративные решения иностранной компании.',835),
  ('intl_board_resolutions','Board Resolutions','INTERNATIONAL_CORPORATE','governance','international_corporate',ARRAY['CY','IL','GE'],ARRAY['en'],'basic',true,'Решения совета директоров иностранной компании.',836),
  ('intl_shareholders_resolutions','Shareholders Resolutions','INTERNATIONAL_CORPORATE','governance','international_corporate',ARRAY['CY','IL','GE'],ARRAY['en'],'basic',true,'Решения акционеров иностранной компании.',837),

  -- COMPLIANCE
  ('kyc_policy','KYC Policy','COMPLIANCE','aml','compliance',ARRAY['RU','CY','IL'],ARRAY['ru','en'],'advanced',true,'Политика идентификации клиентов (Know Your Customer).',1240),
  ('anti_corruption_policy','Anti-Corruption Policy','COMPLIANCE','aml','compliance',ARRAY['RU','CY','IL'],ARRAY['ru','en'],'advanced',true,'Политика противодействия коррупции.',1241),
  ('compliance_manual','Internal Compliance Manual','COMPLIANCE','internal','compliance',ARRAY['RU','CY','IL'],ARRAY['ru','en'],'expert',true,'Внутренний регламент комплаенс-функции компании.',1242),

  -- FAMILY
  ('prenuptial_agreement','Брачный договор','FAMILY','marriage','family',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Регулирование имущественных отношений супругов.',1310),
  ('marital_property_agreement','Соглашение о разделе имущества','FAMILY','property','family',ARRAY['RU'],ARRAY['ru'],'basic',true,'Внесудебный раздел имущества супругов.',1320),
  ('property_division_claim','Иск о разделе имущества','FAMILY','property','family',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Судебное требование о разделе совместно нажитого имущества.',1330),
  ('divorce_claim','Иск о расторжении брака','FAMILY','divorce','family',ARRAY['RU'],ARRAY['ru'],'basic',true,'Заявление о расторжении брака в суд.',1340),
  ('alimony_agreement','Алиментное соглашение','FAMILY','children','family',ARRAY['RU'],ARRAY['ru'],'basic',true,'Нотариальное соглашение об уплате алиментов.',1350),
  ('alimony_claim','Иск о взыскании алиментов','FAMILY','children','family',ARRAY['RU'],ARRAY['ru'],'basic',true,'Судебное требование о взыскании алиментов.',1360),
  ('children_agreement','Соглашение о детях','FAMILY','children','family',ARRAY['RU'],ARRAY['ru'],'basic',true,'Соглашение о порядке общения и проживания детей.',1370),

  -- INHERITANCE
  ('last_will','Завещание','INHERITANCE','will','inheritance',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Составление завещания с учётом обязательной доли.',1410),
  ('inheritance_acceptance','Заявление о принятии наследства','INHERITANCE','acceptance','inheritance',ARRAY['RU'],ARRAY['ru'],'basic',true,'Подача нотариусу заявления о принятии наследства.',1420),
  ('inheritance_division','Соглашение о разделе наследства','INHERITANCE','division','inheritance',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Раздел наследственного имущества между наследниками.',1430),
  ('heirs_agreement','Соглашение наследников','INHERITANCE','division','inheritance',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Соглашение наследников по управлению имуществом.',1440),
  ('inheritance_dispute','Наследственный спор','INHERITANCE','dispute','inheritance',ARRAY['RU'],ARRAY['ru'],'expert',true,'Иск по наследственному спору.',1450),
  ('will_challenge','Оспаривание завещания','INHERITANCE','dispute','inheritance',ARRAY['RU'],ARRAY['ru'],'expert',true,'Иск об оспаривании завещания.',1460),
  ('inheritance_due_diligence','Наследственный Due Diligence','INHERITANCE','analysis','inheritance',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Анализ наследственной массы и рисков.',1470),

  -- LAND
  ('land_sale_agreement','Купля-продажа земельного участка','LAND','sale','land',ARRAY['RU'],ARRAY['ru'],'basic',true,'Сделка по земельному участку.',1510),
  ('land_lease_agreement','Договор аренды земельного участка','LAND','lease','land',ARRAY['RU'],ARRAY['ru'],'basic',true,'Аренда земельного участка.',1520),
  ('easement_agreement','Соглашение о сервитуте','LAND','rights','land',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Установление права ограниченного пользования участком.',1530),
  ('land_boundary_dispute','Спор о границах участка','LAND','dispute','land',ARRAY['RU'],ARRAY['ru'],'expert',true,'Подготовка позиции по спору о границах.',1540),
  ('land_use_dispute','Спор о пользовании землёй','LAND','dispute','land',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Спор о порядке пользования земельным участком.',1550),
  ('land_due_diligence','Земельный Due Diligence','LAND','analysis','land',ARRAY['RU'],ARRAY['ru'],'expert',true,'Юридическая проверка земельного участка.',1560),

  -- BANKRUPTCY
  ('bankruptcy_application_debtor','Заявление о банкротстве (должник)','BANKRUPTCY','application','bankruptcy',ARRAY['RU'],ARRAY['ru'],'expert',true,'Заявление должника о собственном банкротстве.',1610),
  ('bankruptcy_application_creditor','Заявление кредитора о банкротстве','BANKRUPTCY','application','bankruptcy',ARRAY['RU'],ARRAY['ru'],'expert',true,'Заявление кредитора о признании должника банкротом.',1620),
  ('claims_register_inclusion','Включение в реестр требований','BANKRUPTCY','claims','bankruptcy',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Заявление о включении требований в реестр кредиторов.',1630),
  ('claims_objections','Возражения на требования кредиторов','BANKRUPTCY','claims','bankruptcy',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Возражения относительно заявленных требований.',1640),
  ('subsidiary_liability_defense','Защита от субсидиарной ответственности','BANKRUPTCY','liability','bankruptcy',ARRAY['RU'],ARRAY['ru'],'expert',true,'Стратегия защиты контролирующих лиц от субсидиарной ответственности.',1650),
  ('bankruptcy_financial_analysis','Финансовый анализ должника','BANKRUPTCY','analysis','bankruptcy',ARRAY['RU'],ARRAY['ru'],'expert',true,'Финансовый анализ для целей банкротства.',1660),
  ('bankruptcy_strategy','Стратегия банкротства','BANKRUPTCY','strategy','bankruptcy',ARRAY['RU'],ARRAY['ru'],'expert',true,'Дорожная карта процедуры банкротства.',1670),

  -- CONSUMER
  ('consumer_claim','Претензия потребителя','CONSUMER','claim','consumer',ARRAY['RU'],ARRAY['ru'],'basic',true,'Досудебная претензия продавцу/исполнителю.',1710),
  ('seller_response','Ответ продавца на претензию','CONSUMER','claim','consumer',ARRAY['RU'],ARRAY['ru'],'basic',true,'Ответ продавца/исполнителя на претензию потребителя.',1720),
  ('consumer_lawsuit','Иск о защите прав потребителя','CONSUMER','litigation','consumer',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Иск в суд о защите прав потребителя.',1730),
  ('penalty_calculation','Расчёт неустойки','CONSUMER','calculation','consumer',ARRAY['RU'],ARRAY['ru'],'basic',true,'Расчёт неустойки и штрафов по закону о защите прав потребителей.',1740),

  -- ENFORCEMENT
  ('bailiff_application','Заявление судебному приставу','ENFORCEMENT','application','enforcement',ARRAY['RU'],ARRAY['ru'],'basic',true,'Заявление о возбуждении исполнительного производства.',1810),
  ('bailiff_complaint','Жалоба на судебного пристава','ENFORCEMENT','complaint','enforcement',ARRAY['RU'],ARRAY['ru'],'basic',true,'Жалоба на действия/бездействие пристава.',1820),
  ('debtor_assets_search','Поиск имущества должника','ENFORCEMENT','assets','enforcement',ARRAY['RU'],ARRAY['ru'],'advanced',true,'Стратегия и запросы по розыску имущества должника.',1830),
  ('enforcement_deferral','Отсрочка исполнения','ENFORCEMENT','procedure','enforcement',ARRAY['RU'],ARRAY['ru'],'basic',true,'Заявление об отсрочке исполнения решения.',1840),
  ('enforcement_installment','Рассрочка исполнения','ENFORCEMENT','procedure','enforcement',ARRAY['RU'],ARRAY['ru'],'basic',true,'Заявление о рассрочке исполнения решения.',1850),
  ('enforcement_termination','Прекращение исполнительного производства','ENFORCEMENT','procedure','enforcement',ARRAY['RU'],ARRAY['ru'],'basic',true,'Заявление о прекращении исполнительного производства.',1860)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 4. Five approved flagship intake schemas
-- =============================================================================

-- Five approved flagship intake schemas; reference data only.
insert into public.document_intake_schemas (
  id, template_code, jurisdiction, language, title, description, schema_json,
  required_fields, is_active, sort_order, metadata, created_at, updated_at,
  category, display_order, is_featured
)
select
  x.id, x.template_code, x.jurisdiction, x.language, x.title, x.description,
  x.schema_json, x.required_fields, x.is_active, x.sort_order, x.metadata,
  x.created_at, x.updated_at, x.category, x.display_order, x.is_featured
from jsonb_to_recordset($intake$[{"id":"5874b0c1-c3a1-4d3c-b8eb-f984f1a8a6b8","title":"Опросник для ответа на требование ФНС","category":"general","language":"ru","metadata":{},"is_active":true,"created_at":"2026-07-17T12:38:39.777899+00:00","sort_order":0,"updated_at":"2026-07-17T12:38:39.777899+00:00","description":"Данные, необходимые для подготовки ответа на требование налогового органа","is_featured":false,"schema_json":{"steps":[{"id":"taxpayer","title":"Налогоплательщик","fields":[{"name":"taxpayer_name","type":"text","label":"Наименование / ФИО","required":true},{"name":"taxpayer_inn","type":"text","label":"ИНН","required":true},{"name":"taxpayer_kpp","type":"text","label":"КПП","required":false},{"name":"taxpayer_ogrn","type":"text","label":"ОГРН / ОГРНИП","required":false},{"name":"taxpayer_address","type":"address","label":"Юридический адрес","required":false},{"name":"tax_regime","type":"select","label":"Налоговый режим","options":[{"label":"ОСН","value":"osn"},{"label":"УСН доходы","value":"usn_income"},{"label":"УСН доходы−расходы","value":"usn_income_expense"},{"label":"Патент","value":"patent"},{"label":"НПД","value":"nao"},{"label":"ЕСХН","value":"esh"},{"label":"Иное","value":"other"}],"required":false},{"name":"representative","type":"text","label":"Представитель / юрист","required":false}]},{"id":"tax_authority","title":"Налоговый орган","fields":[{"name":"tax_authority_name","type":"text","label":"Наименование инспекции","required":true},{"name":"tax_authority_number","type":"text","label":"Номер инспекции","required":false},{"name":"tax_authority_region","type":"text","label":"Регион","required":false},{"name":"tax_authority_official","type":"text","label":"Должностное лицо","required":false}]},{"id":"requirement","title":"Реквизиты требования","fields":[{"name":"requirement_number","type":"text","label":"Номер требования","required":true},{"name":"requirement_date","type":"date","label":"Дата требования","required":true},{"name":"received_date","type":"date","label":"Дата получения","required":false},{"name":"response_deadline","type":"date","label":"Срок ответа","required":true},{"name":"tax_audit_type","type":"select","label":"Вид контроля","options":[{"label":"Камеральная проверка","value":"camera"},{"label":"Выездная проверка","value":"onsite"},{"label":"Встречная проверка","value":"counter"},{"label":"Вне рамок проверки","value":"out_of_audit"},{"label":"Иное","value":"other"}],"required":false},{"name":"legal_basis","type":"text","label":"Правовое основание (статья НК РФ)","required":false}]},{"id":"docs","title":"Документы","fields":[{"help":"Каждый пункт с новой строки","name":"requested_documents","type":"textarea","label":"Перечень запрошенных документов","required":false},{"name":"available_documents","type":"textarea","label":"Имеющиеся документы","required":false},{"name":"unavailable_documents","type":"textarea","label":"Отсутствующие документы","required":false},{"name":"unavailable_reason","type":"textarea","label":"Причина отсутствия","required":false}]},{"id":"explanation","title":"Пояснения по операциям","fields":[{"name":"operation_explanation","type":"textarea","label":"Пояснения по операциям / вопросам инспекции","required":true},{"name":"counterparties","type":"textarea","label":"Контрагенты (наименование, ИНН, роль)","required":false}]},{"id":"legality","title":"Законность требования","fields":[{"name":"is_contested","type":"boolean","label":"Оспаривается ли законность требования?","required":false},{"name":"illegality_grounds","type":"multiselect","label":"Основания незаконности","options":[{"label":"Превышение периода","value":"period_exceeded"},{"label":"Отсутствие конкретизации","value":"not_specific"},{"label":"Запрос вне полномочий","value":"out_of_powers"},{"label":"Нарушение формы","value":"form_violation"},{"label":"Пропуск срока","value":"deadline_missed"}],"required":false}]},{"id":"delivery","title":"Способ передачи","fields":[{"name":"delivery_method","type":"select","label":"Способ передачи","options":[{"label":"ТКС / оператор ЭДО","value":"tks"},{"label":"Лично","value":"personally"},{"label":"Почта","value":"post"},{"label":"ЛК налогоплательщика","value":"lk_fns"}],"required":false},{"name":"special_instructions","type":"textarea","label":"Комментарий юриста","required":false}]}],"version":"1.0"},"jurisdiction":"RU","display_order":1000,"template_code":"response_to_tax_request","required_fields":["taxpayer_name","taxpayer_inn","tax_authority_name","requirement_number","requirement_date","response_deadline","operation_explanation"]},{"id":"70422d2a-1b09-4bbf-a51e-829535d9d311","title":"Опросник для правовой позиции в арбитражном суде","category":"general","language":"ru","metadata":{},"is_active":true,"created_at":"2026-07-17T12:38:39.777899+00:00","sort_order":0,"updated_at":"2026-07-17T13:22:49.998816+00:00","description":"Правовая позиция заявителя по налоговому спору для арбитражного суда","is_featured":false,"schema_json":{"steps":[{"id":"taxpayer","title":"Налогоплательщик","fields":[{"name":"taxpayer_name","type":"text","label":"Наименование / ФИО","required":true},{"name":"taxpayer_inn","type":"text","label":"ИНН","required":true},{"name":"taxpayer_kpp","type":"text","label":"КПП","required":false},{"name":"taxpayer_ogrn","type":"text","label":"ОГРН / ОГРНИП","required":false},{"name":"taxpayer_address","type":"address","label":"Юридический адрес","required":false},{"name":"tax_regime","type":"select","label":"Налоговый режим","options":[{"label":"ОСН","value":"osn"},{"label":"УСН доходы","value":"usn_income"},{"label":"УСН доходы−расходы","value":"usn_income_expense"},{"label":"Патент","value":"patent"},{"label":"НПД","value":"nao"},{"label":"ЕСХН","value":"esh"},{"label":"Иное","value":"other"}],"required":false},{"name":"representative","type":"text","label":"Представитель / юрист","required":false}]},{"id":"court","title":"Суд и стороны","fields":[{"name":"court_name","type":"text","label":"Наименование арбитражного суда","required":true},{"name":"case_number","type":"text","label":"Номер дела (если есть)","required":false},{"name":"claimant","type":"text","label":"Заявитель","required":true},{"name":"respondent","type":"text","label":"Ответчик (налоговый орган)","required":true},{"name":"third_parties","type":"textarea","label":"Третьи лица","required":false}]},{"id":"decision","title":"Оспариваемое решение","fields":[{"name":"contested_decision","type":"text","label":"Оспариваемое решение / акт","required":true},{"name":"contested_decision_number","type":"text","label":"Номер решения","required":false},{"name":"contested_decision_date","type":"date","label":"Дата решения","required":true},{"name":"disputed_tax_amounts","type":"textarea","label":"Оспариваемые суммы (налог, пени, штраф)","required":false}]},{"id":"facts","title":"Фактические обстоятельства","fields":[{"name":"facts","type":"textarea","label":"Фактические обстоятельства дела","required":true},{"name":"procedural_violations","type":"textarea","label":"Процессуальные нарушения инспекции","required":false}]},{"id":"legal","title":"Правовая квалификация","fields":[{"name":"legal_arguments","type":"textarea","label":"Правовые доводы заявителя","required":true},{"name":"violated_rights","type":"textarea","label":"Нарушенные права и законные интересы","required":false},{"help":"Можно оставить пустым — источники дополнит RAG.","name":"court_practice","type":"textarea","label":"Судебная практика (опционально)","required":false}]},{"id":"evidence","title":"Доказательства","fields":[{"name":"evidence","type":"textarea","label":"Перечень доказательств","required":false},{"name":"witnesses","type":"textarea","label":"Свидетели / эксперты","required":false}]},{"id":"claims","title":"Просительная часть","fields":[{"name":"claims","type":"textarea","label":"Требования заявителя","required":true},{"name":"applications","type":"textarea","label":"Ходатайства (обеспечение, экспертиза и т.д.)","required":false},{"name":"attachments","type":"textarea","label":"Приложения","required":false},{"name":"special_instructions","type":"textarea","label":"Специальные указания","required":false}]}],"version":"1.0"},"jurisdiction":"RU","display_order":1000,"template_code":"tax_court_position","required_fields":["taxpayer_name","taxpayer_inn","court_name","claimant","respondent","contested_decision","contested_decision_date","facts","legal_arguments","claims"]},{"id":"b3f1dbe2-2bcd-428b-b44b-8224eea25ff8","title":"Опросник для пояснений в ФНС","category":"general","language":"ru","metadata":{},"is_active":true,"created_at":"2026-07-17T12:38:39.777899+00:00","sort_order":0,"updated_at":"2026-07-17T12:38:39.777899+00:00","description":"Формирование письменных пояснений налогоплательщика в налоговый орган","is_featured":false,"schema_json":{"steps":[{"id":"taxpayer","title":"Налогоплательщик","fields":[{"name":"taxpayer_name","type":"text","label":"Наименование / ФИО","required":true},{"name":"taxpayer_inn","type":"text","label":"ИНН","required":true},{"name":"taxpayer_kpp","type":"text","label":"КПП","required":false},{"name":"taxpayer_ogrn","type":"text","label":"ОГРН / ОГРНИП","required":false},{"name":"taxpayer_address","type":"address","label":"Юридический адрес","required":false},{"name":"tax_regime","type":"select","label":"Налоговый режим","options":[{"label":"ОСН","value":"osn"},{"label":"УСН доходы","value":"usn_income"},{"label":"УСН доходы−расходы","value":"usn_income_expense"},{"label":"Патент","value":"patent"},{"label":"НПД","value":"nao"},{"label":"ЕСХН","value":"esh"},{"label":"Иное","value":"other"}],"required":false},{"name":"representative","type":"text","label":"Представитель / юрист","required":false}]},{"id":"tax_authority","title":"Налоговый орган","fields":[{"name":"tax_authority_name","type":"text","label":"Наименование инспекции","required":true},{"name":"tax_authority_number","type":"text","label":"Номер инспекции","required":false},{"name":"tax_authority_region","type":"text","label":"Регион","required":false},{"name":"tax_authority_official","type":"text","label":"Должностное лицо","required":false}]},{"id":"reason","title":"Основание пояснений","fields":[{"name":"explanation_reason","type":"select","label":"Основание","options":[{"label":"Требование ФНС","value":"requirement"},{"label":"Уведомление о вызове","value":"call"},{"label":"Выявленные расхождения","value":"discrepancy"},{"label":"По собственной инициативе","value":"initiative"},{"label":"Иное","value":"other"}],"required":true},{"name":"reason_document","type":"text","label":"Реквизиты документа-основания","required":false}]},{"id":"tax","title":"Налог и период","fields":[{"name":"tax_type","type":"select","label":"Налог","options":[{"label":"НДС","value":"vat"},{"label":"Налог на прибыль","value":"profit"},{"label":"УСН","value":"usn"},{"label":"НДФЛ","value":"ndfl"},{"label":"Страховые взносы","value":"insurance"},{"label":"Налог на имущество","value":"property"},{"label":"Иное","value":"other"}],"required":true},{"name":"tax_period","type":"text","label":"Налоговый период","required":true}]},{"id":"facts","title":"Обстоятельства и позиция","fields":[{"name":"facts","type":"textarea","label":"Фактические обстоятельства","required":false},{"name":"taxpayer_position","type":"textarea","label":"Позиция налогоплательщика","required":true},{"name":"discrepancies","type":"textarea","label":"Расхождения / претензии инспекции","required":false}]},{"id":"docs","title":"Документы и контрагенты","fields":[{"name":"supporting_documents","type":"textarea","label":"Подтверждающие документы","required":false},{"name":"counterparties","type":"textarea","label":"Контрагенты (наименование, ИНН, сумма)","required":false}]},{"id":"extras","title":"Дополнительные указания","fields":[{"name":"special_instructions","type":"textarea","label":"Комментарий юриста","required":false}]}],"version":"1.0"},"jurisdiction":"RU","display_order":1000,"template_code":"tax_explanations","required_fields":["taxpayer_name","taxpayer_inn","tax_authority_name","explanation_reason","tax_type","tax_period","taxpayer_position"]},{"id":"1afd5b29-3ebd-4b59-8ae5-38342b203782","title":"Опросник для стратегии защиты по налоговому спору","category":"general","language":"ru","metadata":{},"is_active":true,"created_at":"2026-07-17T12:38:39.777899+00:00","sort_order":0,"updated_at":"2026-07-17T12:38:39.777899+00:00","description":"Разработка комплексной стратегии защиты налогоплательщика","is_featured":false,"schema_json":{"steps":[{"id":"taxpayer","title":"Налогоплательщик","fields":[{"name":"taxpayer_name","type":"text","label":"Наименование / ФИО","required":true},{"name":"taxpayer_inn","type":"text","label":"ИНН","required":true},{"name":"taxpayer_kpp","type":"text","label":"КПП","required":false},{"name":"taxpayer_ogrn","type":"text","label":"ОГРН / ОГРНИП","required":false},{"name":"taxpayer_address","type":"address","label":"Юридический адрес","required":false},{"name":"tax_regime","type":"select","label":"Налоговый режим","options":[{"label":"ОСН","value":"osn"},{"label":"УСН доходы","value":"usn_income"},{"label":"УСН доходы−расходы","value":"usn_income_expense"},{"label":"Патент","value":"patent"},{"label":"НПД","value":"nao"},{"label":"ЕСХН","value":"esh"},{"label":"Иное","value":"other"}],"required":false},{"name":"representative","type":"text","label":"Представитель / юрист","required":false}]},{"id":"stage","title":"Стадия спора","fields":[{"name":"dispute_stage","type":"select","label":"Текущая стадия","options":[{"label":"До акта проверки","value":"pre_act"},{"label":"Акт проверки","value":"act"},{"label":"Решение налогового органа","value":"decision"},{"label":"Жалоба в УФНС","value":"ufns"},{"label":"Жалоба в ФНС России","value":"fns"},{"label":"Арбитражный суд 1 инстанции","value":"court_first"},{"label":"Апелляция / кассация","value":"court_appeal"},{"label":"Иное","value":"other"}],"required":true}]},{"id":"contested","title":"Оспариваемый документ","fields":[{"name":"tax_authority_document","type":"text","label":"Реквизиты оспариваемого документа","required":true},{"name":"document_date","type":"date","label":"Дата документа","required":true},{"name":"disputed_amount","type":"number","label":"Оспариваемая сумма, руб.","required":false},{"name":"tax_types","type":"multiselect","label":"Налоги","options":[{"label":"НДС","value":"vat"},{"label":"Прибыль","value":"profit"},{"label":"УСН","value":"usn"},{"label":"НДФЛ","value":"ndfl"},{"label":"Страховые взносы","value":"insurance"},{"label":"Имущество","value":"property"},{"label":"Иное","value":"other"}],"required":true}]},{"id":"positions","title":"Позиции сторон","fields":[{"name":"fns_position","type":"textarea","label":"Позиция ФНС (претензии, доводы)","required":true},{"name":"client_position","type":"textarea","label":"Позиция клиента","required":true},{"name":"available_evidence","type":"textarea","label":"Имеющиеся доказательства","required":false},{"name":"missing_evidence","type":"textarea","label":"Отсутствующие доказательства / пробелы","required":false}]},{"id":"deadlines","title":"Процессуальные сроки","fields":[{"name":"appeal_deadline","type":"date","label":"Срок обжалования","required":false},{"name":"other_deadlines","type":"textarea","label":"Иные ключевые сроки","required":false}]},{"id":"strategy","title":"Стратегии защиты","fields":[{"name":"preferred_strategies","type":"multiselect","label":"Возможные стратегии","options":[{"label":"Полная отмена","value":"full_cancellation"},{"label":"Частичное оспаривание","value":"partial"},{"label":"Налоговая реконструкция","value":"reconstruction"},{"label":"Процессуальная защита","value":"procedural"},{"label":"Досудебное урегулирование","value":"pre_trial"},{"label":"Судебное обжалование","value":"court"},{"label":"Сбор дополнительных доказательств","value":"more_evidence"}],"required":false},{"name":"risks","type":"textarea","label":"Риски и слабые стороны","required":false}]},{"id":"goal","title":"Цель клиента","fields":[{"name":"client_goal","type":"select","label":"Основная цель","options":[{"label":"Отменить решение","value":"cancel"},{"label":"Уменьшить начисления","value":"reduce"},{"label":"Подтвердить вычеты","value":"confirm_deductions"},{"label":"Подтвердить расходы","value":"confirm_expenses"},{"label":"Применить реконструкцию","value":"reconstruction"},{"label":"Оценить риски","value":"risk_assessment"},{"label":"Иное","value":"other"}],"required":true},{"name":"special_instructions","type":"textarea","label":"Специальные указания","required":false}]}],"version":"1.0"},"jurisdiction":"RU","display_order":1000,"template_code":"tax_strategy_memo","required_fields":["taxpayer_name","taxpayer_inn","dispute_stage","tax_authority_document","document_date","tax_types","fns_position","client_position","client_goal"]},{"id":"d6ee948a-80ea-4e30-a732-798e77206886","title":"Опросник для пояснений по НДС","category":"general","language":"ru","metadata":{},"is_active":true,"created_at":"2026-07-17T12:38:39.777899+00:00","sort_order":0,"updated_at":"2026-07-17T12:38:39.777899+00:00","description":"Пояснения в ответ на требование инспекции по НДС / расхождениям в декларации","is_featured":false,"schema_json":{"steps":[{"id":"taxpayer","title":"Налогоплательщик","fields":[{"name":"taxpayer_name","type":"text","label":"Наименование / ФИО","required":true},{"name":"taxpayer_inn","type":"text","label":"ИНН","required":true},{"name":"taxpayer_kpp","type":"text","label":"КПП","required":false},{"name":"taxpayer_ogrn","type":"text","label":"ОГРН / ОГРНИП","required":false},{"name":"taxpayer_address","type":"address","label":"Юридический адрес","required":false},{"name":"tax_regime","type":"select","label":"Налоговый режим","options":[{"label":"ОСН","value":"osn"},{"label":"УСН доходы","value":"usn_income"},{"label":"УСН доходы−расходы","value":"usn_income_expense"},{"label":"Патент","value":"patent"},{"label":"НПД","value":"nao"},{"label":"ЕСХН","value":"esh"},{"label":"Иное","value":"other"}],"required":false},{"name":"representative","type":"text","label":"Представитель / юрист","required":false}]},{"id":"tax_authority","title":"Налоговый орган","fields":[{"name":"tax_authority_name","type":"text","label":"Наименование инспекции","required":true},{"name":"tax_authority_number","type":"text","label":"Номер инспекции","required":false},{"name":"tax_authority_region","type":"text","label":"Регион","required":false},{"name":"tax_authority_official","type":"text","label":"Должностное лицо","required":false}]},{"id":"declaration","title":"Декларация по НДС","fields":[{"name":"vat_period","type":"text","label":"Налоговый период (квартал / год)","required":true},{"name":"declaration_number","type":"text","label":"Номер / корректировка декларации","required":false},{"name":"declaration_date","type":"date","label":"Дата подачи декларации","required":false},{"name":"vat_amount","type":"number","label":"Оспариваемая сумма НДС, руб.","required":false}]},{"id":"discrepancy","title":"Причина пояснений","fields":[{"name":"discrepancy_type","type":"multiselect","label":"Тип расхождения","options":[{"label":"Разрыв по цепочке","value":"gap"},{"label":"Расхождение книги покупок","value":"book_purchase"},{"label":"Расхождение книги продаж","value":"book_sales"},{"label":"Контрольные соотношения","value":"control_ratios"},{"label":"Заявленные вычеты","value":"deduction_claim"},{"label":"Проблемный контрагент","value":"counterparty_flag"},{"label":"Иное","value":"other"}],"required":true}]},{"id":"invoices","title":"Счета-фактуры и книги","fields":[{"name":"invoices","type":"textarea","label":"Счета-фактуры (№, дата, сумма, контрагент)","required":false},{"name":"purchase_book","type":"textarea","label":"Книга покупок — спорные записи","required":false},{"name":"sales_book","type":"textarea","label":"Книга продаж — спорные записи","required":false}]},{"id":"counterparties","title":"Контрагенты и операции","fields":[{"name":"counterparties","type":"textarea","label":"Контрагенты (наименование, ИНН, роль)","required":false},{"name":"payments","type":"textarea","label":"Платежи (даты, суммы, назначение)","required":false},{"name":"logistics","type":"textarea","label":"Транспортировка / логистика","required":false},{"name":"goods_usage","type":"textarea","label":"Использование товаров / услуг","required":false}]},{"id":"position","title":"Позиция налогоплательщика","fields":[{"name":"taxpayer_position","type":"textarea","label":"Позиция и обоснование вычета / операции","required":true},{"name":"available_evidence","type":"textarea","label":"Имеющиеся доказательства","required":false},{"name":"missing_evidence","type":"textarea","label":"Отсутствующие доказательства","required":false},{"name":"special_instructions","type":"textarea","label":"Комментарий юриста","required":false}]}],"version":"1.0"},"jurisdiction":"RU","display_order":1000,"template_code":"tax_vat_explanations","required_fields":["taxpayer_name","taxpayer_inn","tax_authority_name","vat_period","discrepancy_type","taxpayer_position"]},{"id":"f2ed9e78-9a0d-40a6-90d4-8627e79a75a4","title":"Опросник для корпоративного соглашения 50/50","category":"general","language":"ru","metadata":{},"is_active":false,"created_at":"2026-06-14T00:55:08.396159+00:00","sort_order":10,"updated_at":"2026-06-16T13:13:41.103676+00:00","description":"Сбор данных для подготовки корпоративного договора / shareholders agreement с паритетной структурой.","is_featured":false,"schema_json":{"steps":[{"id":"basic","title":"Основные данные","fields":[{"key":"company_type","type":"select","label":"Тип компании","options":[{"label":"Cyprus Private Company Limited by Shares","value":"cyprus_ltd"},{"label":"Israeli Private Limited Company Ltd","value":"israel_ltd"},{"label":"Georgian LLC","value":"georgia_llc"},{"label":"ООО","value":"ru_ooo"},{"label":"АО","value":"ru_ao"},{"label":"Другое","value":"other"}],"required":true},{"key":"company_name","type":"text","label":"Название компании","required":false,"minLength":2}]},{"id":"founders","title":"Участники и доли","fields":[{"key":"founder_1_name","help":"Введите реальное имя/название. Заглушки вроде \"1\", \"Сторона А\" оставят плейсхолдеры в тексте.","type":"text","label":"Участник 1 — реальное ФИО или название юр. лица","pattern":"^(?!\\d+$).+$","required":true,"minLength":3,"placeholder":"Например: Иван Петрович Смирнов или ООО «Альфа»","patternMessage":"Имя не может состоять только из цифр"},{"key":"founder_1_share","max":100,"min":0,"type":"percentage","label":"Доля участника 1, %","default":50,"required":true},{"key":"founder_2_name","help":"Введите реальное имя/название. Заглушки вроде \"2\", \"Сторона Б\" оставят плейсхолдеры в тексте.","type":"text","label":"Участник 2 — реальное ФИО или название юр. лица","pattern":"^(?!\\d+$).+$","required":true,"minLength":3,"placeholder":"Например: Мария Алексеевна Иванова или Acme Ltd","patternMessage":"Имя не может состоять только из цифр"},{"key":"founder_2_share","max":100,"min":0,"type":"percentage","label":"Доля участника 2, %","default":50,"required":true},{"key":"total_shares","min":0,"help":"Всего выпущено акций (units / долей) в Компании.","type":"number","label":"Общее количество акций / долей","required":false,"placeholder":"Например: 100"},{"key":"voting_shares","min":0,"help":"Сколько из общего числа дают право голоса.","type":"number","label":"Из них голосующих","required":false},{"key":"transferable_shares","min":0,"type":"number","label":"Из них отчуждаемых (transferable)","required":false},{"key":"non_transferable_shares","min":0,"type":"number","label":"Из них неотчуждаемых (non-transferable)","required":false},{"key":"voting_shares_transfer_restriction","type":"textarea","label":"Ограничения на передачу голосующих акций","required":false,"placeholder":"Например: голосующие акции непередаваемы при жизни участника без единогласного согласия."},{"key":"transferable_shares_rules","type":"textarea","label":"Правила передачи отчуждаемых акций","required":false,"placeholder":"Например: ROFR → tag-along → drag-along (>75%)."},{"key":"share_structure_notes","type":"textarea","label":"Прочие комментарии по структуре","required":false,"placeholder":"Например: классы акций, привилегии, конвертация."}]},{"id":"governance","title":"Управление и контроль","fields":[{"key":"director_appointment","type":"textarea","label":"Порядок назначения директора","required":false},{"key":"reserved_matters","type":"textarea","label":"Решения, требующие согласия всех участников","required":false},{"key":"voting_thresholds","type":"textarea","label":"Порог голосования","required":false},{"key":"deadlock_mechanism","type":"select","label":"Механизм deadlock","options":[{"label":"Переговоры","value":"negotiation"},{"label":"Медиация","value":"mediation"},{"label":"Russian Roulette","value":"russian_roulette"},{"label":"Texas Shoot-out","value":"texas_shootout"},{"label":"Buy-Sell","value":"buy_sell"},{"label":"Арбитраж","value":"arbitration"},{"label":"Суд","value":"court"},{"label":"Другое","value":"other"}],"required":false}]},{"id":"transfer","title":"Продажа долей / акций","fields":[{"key":"right_of_first_refusal","type":"boolean","label":"Преимущественное право покупки","required":false},{"key":"tag_along","type":"boolean","label":"Tag Along","required":false},{"key":"drag_along","type":"boolean","label":"Drag Along","required":false},{"key":"lock_up","type":"textarea","label":"Lock-up / запрет продажи","required":false}]},{"id":"protection","title":"Защита бизнеса","fields":[{"key":"non_compete","type":"boolean","label":"Non-compete","required":false},{"key":"confidentiality","type":"boolean","label":"Конфиденциальность","required":false},{"key":"ip_ownership","type":"textarea","label":"Интеллектуальная собственность","required":false}]},{"id":"law","title":"Право и споры","fields":[{"key":"governing_law","help":"ВНИМАНИЕ: выбор должен быть осознанным. Для компаний Cyprus/Israel/Georgia/RU английское право — НЕ дефолт.","type":"select","label":"Применимое право","options":[{"label":"Россия","value":"russia"},{"label":"Cyprus","value":"cyprus"},{"label":"Israel","value":"israel"},{"label":"Georgia","value":"georgia"},{"label":"English law (только для осознанного выбора)","value":"english"},{"label":"Другое","value":"other"}],"required":true},{"key":"dispute_resolution","help":"Укажите конкретный форум, место и регламент. Лондон/LCIA — НЕ дефолт для не-английских компаний.","type":"textarea","label":"Разрешение споров","required":true,"placeholder":"Например: арбитраж МКАС при ТПП РФ; или LCIA, Лондон (если осознанно выбран английский суд)."},{"key":"doc_language","type":"select","label":"Язык документа","options":[{"label":"Русский","value":"ru"},{"label":"English","value":"en"},{"label":"Билингва RU/EN","value":"bilingual"}],"required":false},{"key":"special_terms","type":"textarea","label":"Особые условия","required":false}]}],"version":"3","warnings":["Для Cyprus / Israel / Georgia требуется проверка локальным юристом соответствующей юрисдикции.","AI не должен придумывать нормы иностранного права без подтвержденного источника.","Governing law и Dispute Resolution — это осознанный выбор. Английское право и суд Лондона по умолчанию НЕ применяются к компаниям Cyprus / Israel / Georgia / RU.","Имена участников должны быть реальными (ФИО или название юр. лица). Заглушки вида \"1\", \"2\", \"Сторона А\" приведут к плейсхолдерам в тексте."]},"jurisdiction":"CY","display_order":1000,"template_code":"corporate_50_50_agreement","required_fields":["company_type","founder_1_name","founder_2_name","founder_1_share","founder_2_share","governing_law","dispute_resolution"]},{"id":"1dbdca54-e5af-4cce-8b0e-436f3724a3e0","title":"Опросник для корпоративного соглашения 50/50","category":"general","language":"ru","metadata":{},"is_active":true,"created_at":"2026-06-12T21:21:04.667441+00:00","sort_order":10,"updated_at":"2026-06-13T23:58:26.582471+00:00","description":"Сбор данных для подготовки корпоративного договора / shareholders agreement с паритетной структурой.","is_featured":false,"schema_json":{"steps":[{"id":"basic","title":"Основные данные","fields":[{"key":"company_type","type":"select","label":"Тип компании","options":[{"label":"Cyprus Private Company Limited by Shares","value":"cyprus_ltd"},{"label":"Israeli Private Limited Company Ltd","value":"israel_ltd"},{"label":"Georgian LLC","value":"georgia_llc"},{"label":"ООО","value":"ru_ooo"},{"label":"АО","value":"ru_ao"},{"label":"Другое","value":"other"}],"required":true},{"key":"company_name","type":"text","label":"Название компании","required":false,"minLength":2}]},{"id":"founders","title":"Участники и доли","fields":[{"key":"founder_1_name","help":"Введите реальное имя/название. Заглушки вроде \"1\", \"Сторона А\" оставят плейсхолдеры в тексте.","type":"text","label":"Участник 1 — реальное ФИО или название юр. лица","pattern":"^(?!\\d+$).+$","required":true,"minLength":3,"placeholder":"Например: Иван Петрович Смирнов или ООО «Альфа»","patternMessage":"Имя не может состоять только из цифр"},{"key":"founder_1_share","max":100,"min":0,"type":"percentage","label":"Доля участника 1, %","default":50,"required":true},{"key":"founder_2_name","help":"Введите реальное имя/название. Заглушки вроде \"2\", \"Сторона Б\" оставят плейсхолдеры в тексте.","type":"text","label":"Участник 2 — реальное ФИО или название юр. лица","pattern":"^(?!\\d+$).+$","required":true,"minLength":3,"placeholder":"Например: Мария Алексеевна Иванова или Acme Ltd","patternMessage":"Имя не может состоять только из цифр"},{"key":"founder_2_share","max":100,"min":0,"type":"percentage","label":"Доля участника 2, %","default":50,"required":true},{"key":"total_shares","min":0,"help":"Всего выпущено акций (units / долей) в Компании.","type":"number","label":"Общее количество акций / долей","required":false,"placeholder":"Например: 100"},{"key":"voting_shares","min":0,"help":"Сколько из общего числа дают право голоса.","type":"number","label":"Из них голосующих","required":false},{"key":"transferable_shares","min":0,"type":"number","label":"Из них отчуждаемых (transferable)","required":false},{"key":"non_transferable_shares","min":0,"type":"number","label":"Из них неотчуждаемых (non-transferable)","required":false},{"key":"voting_shares_transfer_restriction","type":"textarea","label":"Ограничения на передачу голосующих акций","required":false,"placeholder":"Например: голосующие акции непередаваемы при жизни участника без единогласного согласия."},{"key":"transferable_shares_rules","type":"textarea","label":"Правила передачи отчуждаемых акций","required":false,"placeholder":"Например: ROFR → tag-along → drag-along (>75%)."},{"key":"share_structure_notes","type":"textarea","label":"Прочие комментарии по структуре","required":false,"placeholder":"Например: классы акций, привилегии, конвертация."}]},{"id":"governance","title":"Управление и контроль","fields":[{"key":"director_appointment","type":"textarea","label":"Порядок назначения директора","required":false},{"key":"reserved_matters","type":"textarea","label":"Решения, требующие согласия всех участников","required":false},{"key":"voting_thresholds","type":"textarea","label":"Порог голосования","required":false},{"key":"deadlock_mechanism","type":"select","label":"Механизм deadlock","options":[{"label":"Переговоры","value":"negotiation"},{"label":"Медиация","value":"mediation"},{"label":"Russian Roulette","value":"russian_roulette"},{"label":"Texas Shoot-out","value":"texas_shootout"},{"label":"Buy-Sell","value":"buy_sell"},{"label":"Арбитраж","value":"arbitration"},{"label":"Суд","value":"court"},{"label":"Другое","value":"other"}],"required":false}]},{"id":"transfer","title":"Продажа долей / акций","fields":[{"key":"right_of_first_refusal","type":"boolean","label":"Преимущественное право покупки","required":false},{"key":"tag_along","type":"boolean","label":"Tag Along","required":false},{"key":"drag_along","type":"boolean","label":"Drag Along","required":false},{"key":"lock_up","type":"textarea","label":"Lock-up / запрет продажи","required":false}]},{"id":"protection","title":"Защита бизнеса","fields":[{"key":"non_compete","type":"boolean","label":"Non-compete","required":false},{"key":"confidentiality","type":"boolean","label":"Конфиденциальность","required":false},{"key":"ip_ownership","type":"textarea","label":"Интеллектуальная собственность","required":false}]},{"id":"law","title":"Право и споры","fields":[{"key":"governing_law","help":"ВНИМАНИЕ: выбор должен быть осознанным. Для компаний Cyprus/Israel/Georgia/RU английское право — НЕ дефолт.","type":"select","label":"Применимое право","options":[{"label":"Россия","value":"russia"},{"label":"Cyprus","value":"cyprus"},{"label":"Israel","value":"israel"},{"label":"Georgia","value":"georgia"},{"label":"English law (только для осознанного выбора)","value":"english"},{"label":"Другое","value":"other"}],"required":true},{"key":"dispute_resolution","help":"Укажите конкретный форум, место и регламент. Лондон/LCIA — НЕ дефолт для не-английских компаний.","type":"textarea","label":"Разрешение споров","required":true,"placeholder":"Например: арбитраж МКАС при ТПП РФ; или LCIA, Лондон (если осознанно выбран английский суд)."},{"key":"doc_language","type":"select","label":"Язык документа","options":[{"label":"Русский","value":"ru"},{"label":"English","value":"en"},{"label":"Билингва RU/EN","value":"bilingual"}],"required":false},{"key":"special_terms","type":"textarea","label":"Особые условия","required":false}]}],"version":"3","warnings":["Для Cyprus / Israel / Georgia требуется проверка локальным юристом соответствующей юрисдикции.","AI не должен придумывать нормы иностранного права без подтвержденного источника.","Governing law и Dispute Resolution — это осознанный выбор. Английское право и суд Лондона по умолчанию НЕ применяются к компаниям Cyprus / Israel / Georgia / RU.","Имена участников должны быть реальными (ФИО или название юр. лица). Заглушки вида \"1\", \"2\", \"Сторона А\" приведут к плейсхолдерам в тексте."]},"jurisdiction":null,"display_order":1000,"template_code":"corporate_50_50_agreement","required_fields":["company_type","founder_1_name","founder_2_name","founder_1_share","founder_2_share","governing_law","dispute_resolution"]},{"id":"9e3e620a-e6ea-4ae3-893b-622e28a41589","title":"Опросник — возражения на акт налоговой проверки (базовые)","category":"general","language":"ru","metadata":{},"is_active":true,"created_at":"2026-07-08T10:23:21.618382+00:00","sort_order":0,"updated_at":"2026-07-17T12:38:39.777899+00:00","description":"Сбор данных для подготовки развёрнутых возражений на акт налоговой проверки: факты, претензии ФНС, суммы, доказательства, процессуальные нарушения и правовая позиция.","is_featured":false,"schema_json":{"steps":[{"id":"taxpayer","title":"Налогоплательщик","fields":[{"name":"taxpayer_name","type":"text","label":"Наименование налогоплательщика","required":true},{"name":"taxpayer_inn","type":"text","label":"ИНН","required":true},{"name":"taxpayer_ogrn","type":"text","label":"ОГРН / ОГРНИП","required":false},{"name":"business_activity","type":"textarea","label":"Сфера деятельности","required":false}]},{"id":"audit","title":"Проверка","fields":[{"name":"audit_type","type":"select","label":"Вид проверки","options":[{"label":"Камеральная проверка","value":"camera_audit"},{"label":"Выездная проверка","value":"onsite_audit"}],"required":true},{"name":"audit_decision_number","type":"text","label":"Номер решения о проверке","required":false},{"name":"audit_period","type":"text","label":"Проверяемый период","required":false},{"name":"tax_authority","type":"text","label":"Налоговый орган","required":false}]},{"id":"act","title":"Акт налоговой проверки","fields":[{"name":"act_number","type":"text","label":"Номер акта","required":true},{"name":"act_date","type":"date","label":"Дата акта","required":true},{"name":"act_received_date","type":"date","label":"Дата получения акта","required":false},{"name":"objection_deadline","type":"date","label":"Срок подачи возражений","required":false}]},{"id":"taxes_amounts","title":"Налоги и суммы","fields":[{"name":"tax_type","type":"multiselect","label":"Налоги","options":[{"label":"НДС","value":"vat"},{"label":"Налог на прибыль","value":"profit_tax"},{"label":"НДФЛ","value":"personal_income_tax"},{"label":"Страховые взносы","value":"insurance_contributions"},{"label":"УСН","value":"usn"},{"label":"Иное","value":"other"}],"required":true},{"name":"additional_tax_amount","type":"money","label":"Доначисленный налог","required":false},{"name":"penalties_amount","type":"money","label":"Пени","required":false},{"name":"fine_amount","type":"money","label":"Штраф","required":false},{"name":"total_amount","type":"money","label":"Общая сумма претензий","required":false}]},{"id":"fns_findings","title":"Выводы ФНС","fields":[{"name":"fns_findings","type":"textarea","label":"Кратко изложите выводы ФНС из акта","required":true},{"name":"fns_claims","type":"multiselect","label":"Основные претензии","options":[{"label":"Ст. 54.1 НК РФ","value":"54_1"},{"label":"Технический контрагент","value":"technical_counterparty"},{"label":"Нереальность операций","value":"unreal_operation"},{"label":"Отказ в вычетах НДС","value":"vat_deduction_denial"},{"label":"Исключение расходов","value":"expense_denial"},{"label":"Дробление бизнеса","value":"business_splitting"},{"label":"Формальный документооборот","value":"formal_documents"},{"label":"Отсутствие деловой цели","value":"no_business_purpose"}],"required":false}]},{"id":"client_position","title":"Позиция налогоплательщика","fields":[{"name":"client_position","type":"textarea","label":"С чем налогоплательщик не согласен","required":true},{"name":"facts_supporting_position","type":"textarea","label":"Факты в пользу налогоплательщика","required":false},{"name":"weak_points","type":"textarea","label":"Слабые места / риски","required":false}]},{"id":"evidence","title":"Доказательства","fields":[{"name":"available_evidence","type":"multiselect","label":"Какие доказательства есть","options":[{"label":"Договоры","value":"contracts"},{"label":"Акты","value":"acts"},{"label":"Счета-фактуры","value":"invoices"},{"label":"Платежи","value":"payments"},{"label":"Переписка","value":"correspondence"},{"label":"Складские документы","value":"warehouse"},{"label":"Транспортные документы","value":"transport"},{"label":"Фото / видео","value":"photos"},{"label":"Отчёты","value":"reports"},{"label":"Свидетели / сотрудники","value":"witnesses"}],"required":false},{"name":"missing_evidence","type":"textarea","label":"Каких доказательств не хватает","required":false}]},{"id":"procedural_violations","title":"Процессуальные нарушения ФНС","fields":[{"name":"procedural_violations","type":"multiselect","label":"Есть ли процессуальные нарушения","options":[{"label":"Нарушения по ст. 88 НК РФ","value":"88_violation"},{"label":"Нарушения по ст. 89 НК РФ","value":"89_violation"},{"label":"Нарушения по ст. 93 НК РФ","value":"93_violation"},{"label":"Нарушения по ст. 93.1 НК РФ","value":"93_1_violation"},{"label":"Нарушения по ст. 100 НК РФ","value":"100_violation"},{"label":"Нарушения по ст. 101 НК РФ","value":"101_violation"},{"label":"ФНС не исследовала доказательства","value":"evidence_not_examined"},{"label":"Нарушение сроков","value":"deadlines"}],"required":false},{"name":"procedural_violation_details","type":"textarea","label":"Описание нарушений","required":false}]},{"id":"reconstruction","title":"54.1 и налоговая реконструкция","fields":[{"name":"article_54_1_relevant","type":"select","label":"Применяется ли ст. 54.1 НК РФ","options":[{"label":"Да","value":"yes"},{"label":"Нет","value":"no"},{"label":"Нужно оценить","value":"unclear"}],"required":false},{"name":"reconstruction_possible","type":"select","label":"Нужен довод о налоговой реконструкции","options":[{"label":"Да","value":"yes"},{"label":"Нет","value":"no"},{"label":"Нужно оценить","value":"unclear"}],"required":false},{"name":"real_supplier_info","type":"textarea","label":"Сведения о реальном исполнителе / поставщике","required":false},{"name":"actual_expenses","type":"money","label":"Фактические расходы","required":false}]},{"id":"documents","title":"Документы","fields":[{"name":"audit_documents","type":"file_upload","label":"Загрузите акт, требования, договоры, первичку, переписку","required":false},{"name":"document_comments","type":"textarea","label":"Комментарии к документам","required":false}]},{"id":"result","title":"Что подготовить","fields":[{"name":"desired_result","type":"multiselect","label":"Нужный результат","options":[{"label":"Полные возражения на акт","value":"full_objections"},{"label":"Отдельный раздел по ст. 54.1","value":"54_1_section"},{"label":"Матрица доказательств","value":"evidence_matrix"},{"label":"Список недостающих документов","value":"missing_docs"},{"label":"Подготовить базу для жалобы","value":"appeal_ready"}],"required":false},{"name":"special_instructions","type":"textarea","label":"Особые указания","required":false}]}],"warnings":["Возражения должны быть основаны на акте проверки, фактах и подтверждённых документах.","AI не должен придумывать нормы, судебную практику, письма ФНС, даты и номера.","Процессуальные нарушения ФНС необходимо подтверждать материалами проверки.","Доводы по налоговой реконструкции требуют фактической базы."]},"jurisdiction":"RU","display_order":1000,"template_code":"objections_tax_audit","required_fields":["taxpayer_name","taxpayer_inn","audit_type","act_number","act_date","tax_type","fns_findings","client_position"]},{"id":"9ea12f06-05f7-47ad-822d-09c338d0f645","title":"Опросник для анализа рисков по ст. 54.1 НК РФ","category":"tax","language":"ru","metadata":{"tax_article":"54.1","practice_area":"tax","document_family":"tax_opinion","generation_type":"standalone"},"is_active":true,"created_at":"2026-06-13T13:19:55.008189+00:00","sort_order":10,"updated_at":"2026-06-16T13:24:33.368748+00:00","description":"Сбор информации для оценки налоговых рисков, реальности операций, деловой цели, контрагентов, доказательств и возможности налоговой реконструкции.","is_featured":true,"schema_json":{"steps":[{"id":"taxpayer","title":"Налогоплательщик","fields":[{"name":"taxpayer_name","type":"text","label":"Наименование налогоплательщика","required":true},{"name":"taxpayer_inn","type":"text","label":"ИНН","required":true},{"name":"taxpayer_ogrn","type":"text","label":"ОГРН / ОГРНИП","required":false},{"name":"business_activity","type":"textarea","label":"Сфера деятельности","required":false},{"name":"annual_turnover","type":"money","label":"Годовой оборот","required":false}]},{"id":"tax_control","title":"Проверка и претензии ФНС","fields":[{"name":"tax_control_type","type":"select","label":"Вид налогового контроля","options":[{"label":"Камеральная проверка","value":"camera_audit"},{"label":"Выездная проверка","value":"onsite_audit"},{"label":"Предпроверочный анализ","value":"pre_audit"},{"label":"Требование ФНС","value":"tax_request"},{"label":"Судебный спор","value":"court_dispute"}],"required":true},{"name":"tax_type","type":"multiselect","label":"Налог","options":[{"label":"НДС","value":"vat"},{"label":"Налог на прибыль","value":"profit_tax"},{"label":"НДФЛ","value":"personal_income_tax"},{"label":"Страховые взносы","value":"insurance_contributions"},{"label":"Иное","value":"other"}],"required":true},{"name":"fns_claim_type","type":"multiselect","label":"Претензии ФНС","options":[{"label":"Нереальность операции","value":"unreal_operation"},{"label":"Технический контрагент","value":"technical_counterparty"},{"label":"Отсутствие деловой цели","value":"no_business_purpose"},{"label":"Дробление бизнеса","value":"business_splitting"},{"label":"Отказ в вычете НДС","value":"vat_deduction_denial"},{"label":"Исключение расходов","value":"expense_denial"}],"required":true}]},{"id":"risk_amounts","title":"Суммы риска","fields":[{"name":"tax_amount","type":"money","label":"Сумма налога","required":false},{"name":"penalties_amount","type":"money","label":"Пени","required":false},{"name":"fine_amount","type":"money","label":"Штраф","required":false},{"name":"total_risk_amount","type":"money","label":"Общая сумма риска","required":false}]},{"id":"counterparties","title":"Контрагенты и операции","fields":[{"name":"counterparties","type":"party_list","label":"Контрагенты, по которым есть претензии","required":false},{"name":"operation_description","type":"textarea","label":"Описание спорных операций","required":false},{"name":"operation_period","type":"text","label":"Период операций","required":false}]},{"id":"evidence","title":"Доказательства реальности операций","fields":[{"name":"available_evidence","type":"multiselect","label":"Какие доказательства есть","options":[{"label":"Договоры","value":"contracts"},{"label":"Акты","value":"acts"},{"label":"Счета-фактуры","value":"invoices"},{"label":"Платежи","value":"payments"},{"label":"Переписка","value":"correspondence"},{"label":"Логистика / доставка","value":"logistics"},{"label":"Фото / видео","value":"photos"},{"label":"Сотрудники / исполнители","value":"employees"},{"label":"Отчеты / результаты работ","value":"reports"}],"required":false},{"name":"missing_evidence","type":"textarea","label":"Каких документов или доказательств не хватает","required":false}]},{"id":"business_purpose","title":"Деловая цель","fields":[{"name":"business_purpose","type":"textarea","label":"В чём была деловая цель операций","required":false},{"name":"counterparty_selection_reason","type":"textarea","label":"Почему выбран этот контрагент","required":false},{"name":"economic_effect","type":"textarea","label":"Экономический эффект сделки","required":false}]},{"id":"reconstruction","title":"Налоговая реконструкция","fields":[{"name":"reconstruction_possible","type":"select","label":"Есть основания для налоговой реконструкции?","options":[{"label":"Да","value":"yes"},{"label":"Нет","value":"no"},{"label":"Нужно оценить","value":"unclear"}],"required":false},{"name":"real_supplier_info","type":"textarea","label":"Есть сведения о реальном поставщике / исполнителе","required":false},{"name":"actual_expenses","type":"money","label":"Фактически понесённые расходы","required":false}]},{"id":"documents","title":"Документы","fields":[{"name":"tax_documents","type":"file_upload","label":"Загрузите требования, акт, решение, договоры, первичку","required":false},{"name":"document_comments","type":"textarea","label":"Комментарии к документам","required":false}]},{"id":"goal","title":"Цель клиента","fields":[{"name":"client_goal","type":"select","label":"Что нужно получить","options":[{"label":"Оценить риски","value":"risk_opinion"},{"label":"Подготовить ответ ФНС","value":"prepare_response"},{"label":"Подготовить возражения","value":"prepare_objections"},{"label":"Подготовить жалобу","value":"appeal"},{"label":"Подготовить позицию для суда","value":"court_strategy"}],"required":true},{"name":"special_instructions","type":"textarea","label":"Особые указания юристу","required":false}]}],"warnings":["Документ является предварительным до анализа первичных документов и позиции ФНС.","AI не должен придумывать нормы, письма ФНС, судебную практику, даты и номера.","По ст. 54.1 НК РФ важно анализировать реальность операций, деловую цель и доказательства исполнения.","Налоговая реконструкция оценивается только при наличии фактической базы."]},"jurisdiction":"RU","display_order":10,"template_code":"tax_54_1_risk_opinion","required_fields":["taxpayer_name","taxpayer_inn","tax_control_type","fns_claim_type","tax_type","client_goal"]},{"id":"4c56369b-d580-4b15-b9c4-535ce70c11bb","title":"Опросник для заявления в арбитражный суд по налоговому спору","category":"tax","language":"ru","metadata":{},"is_active":true,"created_at":"2026-06-16T14:14:16.661368+00:00","sort_order":0,"updated_at":"2026-06-16T14:14:16.661368+00:00","description":"Опросник для подготовки заявления в арбитражный суд об оспаривании решения налогового органа: стороны, оспариваемый акт, сроки, требования, факты, доказательства, правовые основания и приложения.","is_featured":true,"schema_json":{"steps":[{"id":"general","title":"1. Общая информация","fields":[{"name":"taxpayer_name","type":"text","label":"Заявитель / налогоплательщик","required":true},{"name":"taxpayer_inn","type":"text","label":"ИНН заявителя","required":true},{"name":"court_name","type":"text","label":"Арбитражный суд","required":true},{"name":"representative","type":"text","label":"Представитель"}]},{"id":"parties","title":"2. Стороны и налоговый орган","fields":[{"name":"tax_authority","type":"text","label":"Налоговый орган","required":true},{"name":"tax_authority_address","type":"text","label":"Адрес налогового органа"},{"name":"ufns_authority","type":"text","label":"Вышестоящий налоговый орган / УФНС"},{"name":"third_parties","type":"textarea","label":"Третьи лица, если есть"}]},{"id":"challenged_decision","title":"3. Оспариваемое решение","fields":[{"name":"challenged_decision","type":"textarea","label":"Решение / акт налогового органа","required":true},{"name":"decision_date","type":"text","label":"Дата решения","required":true},{"name":"decision_number","type":"text","label":"Номер решения"},{"name":"ufns_appeal_date","type":"text","label":"Дата подачи жалобы в УФНС"},{"name":"ufns_result","type":"textarea","label":"Результат рассмотрения жалобы в УФНС"},{"name":"deadline_status","type":"textarea","label":"Соблюдены ли сроки обращения в суд"}]},{"id":"claims","title":"4. Требования заявителя","fields":[{"name":"claim_requirements","type":"textarea","label":"Просительная часть заявления","required":true},{"name":"challenged_amounts","type":"textarea","label":"Оспариваемые суммы доначислений, пеней, штрафов"},{"name":"partial_or_full_challenge","type":"select","label":"Оспаривание полностью или частично","options":["Полностью","Частично","Нужно определить"]}]},{"id":"facts","title":"5. Фактические обстоятельства","fields":[{"name":"main_facts","type":"textarea","label":"Ключевые обстоятельства дела"},{"name":"tax_periods","type":"text","label":"Налоговые периоды"},{"name":"disputed_operations","type":"textarea","label":"Оспариваемые операции"},{"name":"chronology","type":"textarea","label":"Хронология событий"}]},{"id":"legal_basis","title":"6. Правовые основания","fields":[{"name":"legal_basis","type":"textarea","label":"Нормы права и правовая позиция"},{"name":"why_decision_illegal","type":"textarea","label":"Почему решение ФНС незаконно / необоснованно"},{"name":"procedural_violations","type":"textarea","label":"Процессуальные нарушения ФНС"},{"name":"court_practice","type":"textarea","label":"Судебная практика"}]},{"id":"evidence","title":"7. Доказательства и приложения","fields":[{"name":"evidence_list","type":"textarea","label":"Доказательства в подтверждение позиции"},{"name":"attachments","type":"textarea","label":"Приложения к заявлению"},{"name":"missing_documents","type":"textarea","label":"Каких документов не хватает"}]},{"id":"risks","title":"8. Риски и процессуальные вопросы","fields":[{"name":"court_risks","type":"textarea","label":"Риски судебного спора"},{"name":"interim_measures","type":"textarea","label":"Нужны ли обеспечительные меры"},{"name":"state_duty","type":"textarea","label":"Госпошлина / процессуальные расходы"},{"name":"next_actions","type":"textarea","label":"Следующие действия"}]}]},"jurisdiction":"RU","display_order":110,"template_code":"tax_arbitration_claim","required_fields":["taxpayer_name","taxpayer_inn","tax_authority","challenged_decision","decision_date","claim_requirements","court_name"]},{"id":"2fb415b0-e566-48ab-9ca9-ff7f4e30e6c6","title":"Опросник для правовой позиции по налоговому спору в арбитражном суде","category":"tax","language":"ru","metadata":{},"is_active":true,"created_at":"2026-06-16T14:14:02.011394+00:00","sort_order":0,"updated_at":"2026-06-16T14:14:02.011394+00:00","description":"Опросник для подготовки правовой позиции налогоплательщика в арбитражном суде: факты, позиция ФНС, доказательства, нормы права, судебная практика, контраргументы, риски и просительная часть.","is_featured":true,"schema_json":{"steps":[{"id":"general","title":"1. Общая информация","fields":[{"name":"taxpayer_name","type":"text","label":"Налогоплательщик","required":true},{"name":"taxpayer_inn","type":"text","label":"ИНН налогоплательщика","required":true},{"name":"court_stage","type":"select","label":"Стадия судебного спора","options":["Подготовка заявления","Первая инстанция","Апелляция","Кассация","Повторное рассмотрение","Иное"],"required":true},{"name":"client_goal","type":"select","label":"Цель клиента","options":["Оспорить решение ФНС полностью","Оспорить решение частично","Снизить доначисления","Снизить штрафы","Защитить вычеты/расходы","Сформировать позицию для суда"],"required":true}]},{"id":"challenged_act","title":"2. Оспариваемый акт ФНС","fields":[{"name":"challenged_decision","type":"textarea","label":"Какое решение / акт оспаривается","required":true},{"name":"tax_authority","type":"text","label":"Налоговый орган"},{"name":"decision_date","type":"text","label":"Дата решения"},{"name":"ufns_appeal_result","type":"textarea","label":"Результат жалобы в УФНС"},{"name":"amounts_at_stake","type":"textarea","label":"Суммы доначислений, пеней, штрафов"}]},{"id":"facts","title":"3. Факты дела","fields":[{"name":"main_facts","type":"textarea","label":"Ключевые факты дела"},{"name":"disputed_operations","type":"textarea","label":"Оспариваемые операции"},{"name":"tax_periods","type":"text","label":"Налоговые периоды"},{"name":"chronology","type":"textarea","label":"Хронология событий"}]},{"id":"positions","title":"4. Позиции сторон","fields":[{"name":"fns_position","type":"textarea","label":"Позиция ФНС","required":true},{"name":"taxpayer_position","type":"textarea","label":"Позиция налогоплательщика","required":true},{"name":"disputed_issues","type":"textarea","label":"Ключевые спорные вопросы"},{"name":"expected_fns_arguments","type":"textarea","label":"Ожидаемые аргументы ФНС в суде"}]},{"id":"evidence","title":"5. Доказательства","fields":[{"name":"available_evidence","type":"textarea","label":"Имеющиеся доказательства","required":true},{"name":"documentary_evidence","type":"textarea","label":"Документы: договоры, первичка, платежи, переписка"},{"name":"witnesses_explanations","type":"textarea","label":"Пояснения сотрудников, свидетели, деловая переписка"},{"name":"missing_evidence","type":"textarea","label":"Каких доказательств не хватает"},{"name":"evidence_risks","type":"textarea","label":"Риски доказательственной базы"}]},{"id":"law","title":"6. Правовое обоснование","fields":[{"name":"applicable_laws","type":"textarea","label":"Применимые нормы права"},{"name":"why_laws_apply","type":"textarea","label":"Почему применяются именно эти нормы"},{"name":"alternative_laws","type":"textarea","label":"Альтернативные нормы и подходы"},{"name":"why_alternatives_rejected","type":"textarea","label":"Почему альтернативы не выбраны как основные"}]},{"id":"court_practice","title":"7. Судебная практика","fields":[{"name":"supporting_cases","type":"textarea","label":"Практика в поддержку налогоплательщика"},{"name":"opposing_cases","type":"textarea","label":"Практика в поддержку ФНС"},{"name":"conflicting_cases","type":"textarea","label":"Противоречивая практика"},{"name":"practice_conclusion","type":"textarea","label":"Вывод по судебной практике"}]},{"id":"court_strategy","title":"8. Судебная стратегия и просительная часть","fields":[{"name":"court_strategy","type":"textarea","label":"Стратегия поведения в суде"},{"name":"counterarguments","type":"textarea","label":"Контраргументы на позицию ФНС"},{"name":"risk_assessment","type":"textarea","label":"Оценка судебных рисков"},{"name":"requested_relief","type":"textarea","label":"Что просим у суда"},{"name":"lawyer_decision","type":"textarea","label":"Предварительное решение юриста"}]}]},"jurisdiction":"RU","display_order":100,"template_code":"tax_arbitration_position","required_fields":["taxpayer_name","taxpayer_inn","court_stage","challenged_decision","fns_position","taxpayer_position","available_evidence","client_goal"]},{"id":"37d3c965-c497-45b6-9354-f1e61c49d1c4","title":"Опросник — возражения на акт налоговой проверки (расширенные)","category":"tax","language":"ru","metadata":{"legal_focus":["НК РФ ст. 54.1","НК РФ ст. 88","НК РФ ст. 89","НК РФ ст. 100","НК РФ ст. 101"],"practice_area":"tax","document_family":"tax_objections","generation_type":"standalone"},"is_active":true,"created_at":"2026-06-13T14:11:52.936269+00:00","sort_order":12,"updated_at":"2026-08-16T22:34:24.321597+00:00","description":"Сбор данных для подготовки развёрнутых возражений на акт налоговой проверки: факты, претензии ФНС, суммы, доказательства, процессуальные нарушения и правовая позиция.","is_featured":true,"schema_json":{"steps":[{"id":"taxpayer","title":"Налогоплательщик","fields":[{"name":"taxpayer_name","type":"text","label":"Наименование налогоплательщика","required":true},{"name":"taxpayer_inn","type":"text","label":"ИНН","required":true},{"name":"taxpayer_ogrn","type":"text","label":"ОГРН / ОГРНИП","required":false},{"name":"business_activity","type":"textarea","label":"Сфера деятельности","required":false},{"name":"taxpayer_kpp","type":"text","label":"КПП","required":false},{"name":"taxpayer_legal_address","type":"text","label":"Юридический адрес","required":false}]},{"id":"audit","title":"Проверка","fields":[{"name":"audit_type","type":"select","label":"Вид проверки","options":[{"label":"Камеральная проверка","value":"camera_audit"},{"label":"Выездная проверка","value":"onsite_audit"}],"required":true},{"name":"audit_decision_number","type":"text","label":"Номер решения о проверке","required":false},{"name":"audit_period","type":"text","label":"Проверяемый период","required":false},{"name":"tax_authority","type":"text","label":"Налоговый орган","required":false}]},{"id":"act","title":"Акт налоговой проверки","fields":[{"name":"act_number","type":"text","label":"Номер акта","required":true},{"name":"act_date","type":"date","label":"Дата акта","required":true},{"name":"act_received_date","type":"date","label":"Дата получения акта","required":false},{"name":"objection_deadline","type":"date","label":"Срок подачи возражений","required":false}]},{"id":"taxes_amounts","title":"Налоги и суммы","fields":[{"name":"tax_type","type":"multiselect","label":"Налоги","options":[{"label":"НДС","value":"vat"},{"label":"Налог на прибыль","value":"profit_tax"},{"label":"НДФЛ","value":"personal_income_tax"},{"label":"Страховые взносы","value":"insurance_contributions"},{"label":"УСН","value":"usn"},{"label":"Иное","value":"other"}],"required":true},{"name":"additional_tax_amount","type":"money","label":"Доначисленный налог","required":false},{"name":"penalties_amount","type":"money","label":"Пени","required":false},{"name":"fine_amount","type":"money","label":"Штраф","required":false},{"name":"total_amount","type":"money","label":"Общая сумма претензий","required":false}]},{"id":"fns_findings","title":"Выводы ФНС","fields":[{"name":"fns_findings","type":"textarea","label":"Кратко изложите выводы ФНС из акта","required":true},{"name":"fns_claims","type":"multiselect","label":"Основные претензии","options":[{"label":"Ст. 54.1 НК РФ","value":"54_1"},{"label":"Технический контрагент","value":"technical_counterparty"},{"label":"Нереальность операций","value":"unreal_operation"},{"label":"Отказ в вычетах НДС","value":"vat_deduction_denial"},{"label":"Исключение расходов","value":"expense_denial"},{"label":"Дробление бизнеса","value":"business_splitting"},{"label":"Формальный документооборот","value":"formal_documents"},{"label":"Отсутствие деловой цели","value":"no_business_purpose"}],"required":false}]},{"id":"client_position","title":"Позиция налогоплательщика","fields":[{"name":"client_position","type":"textarea","label":"С чем налогоплательщик не согласен","required":true},{"name":"facts_supporting_position","type":"textarea","label":"Факты в пользу налогоплательщика","required":false},{"name":"weak_points","type":"textarea","label":"Слабые места / риски","required":false}]},{"id":"evidence","title":"Доказательства","fields":[{"name":"available_evidence","type":"multiselect","label":"Какие доказательства есть","options":[{"label":"Договоры","value":"contracts"},{"label":"Акты","value":"acts"},{"label":"Счета-фактуры","value":"invoices"},{"label":"Платежи","value":"payments"},{"label":"Переписка","value":"correspondence"},{"label":"Складские документы","value":"warehouse"},{"label":"Транспортные документы","value":"transport"},{"label":"Фото / видео","value":"photos"},{"label":"Отчёты","value":"reports"},{"label":"Свидетели / сотрудники","value":"witnesses"}],"required":false},{"name":"missing_evidence","type":"textarea","label":"Каких доказательств не хватает","required":false}]},{"id":"procedural_violations","title":"Процессуальные нарушения ФНС","fields":[{"name":"procedural_violations","type":"multiselect","label":"Есть ли процессуальные нарушения","options":[{"label":"Нарушения по ст. 88 НК РФ","value":"88_violation"},{"label":"Нарушения по ст. 89 НК РФ","value":"89_violation"},{"label":"Нарушения по ст. 93 НК РФ","value":"93_violation"},{"label":"Нарушения по ст. 93.1 НК РФ","value":"93_1_violation"},{"label":"Нарушения по ст. 100 НК РФ","value":"100_violation"},{"label":"Нарушения по ст. 101 НК РФ","value":"101_violation"},{"label":"ФНС не исследовала доказательства","value":"evidence_not_examined"},{"label":"Нарушение сроков","value":"deadlines"}],"required":false},{"name":"procedural_violation_details","type":"textarea","label":"Описание нарушений","required":false}]},{"id":"reconstruction","title":"54.1 и налоговая реконструкция","fields":[{"name":"article_54_1_relevant","type":"select","label":"Применяется ли ст. 54.1 НК РФ","options":[{"label":"Да","value":"yes"},{"label":"Нет","value":"no"},{"label":"Нужно оценить","value":"unclear"}],"required":false},{"name":"reconstruction_possible","type":"select","label":"Нужен довод о налоговой реконструкции","options":[{"label":"Да","value":"yes"},{"label":"Нет","value":"no"},{"label":"Нужно оценить","value":"unclear"}],"required":false},{"name":"real_supplier_info","type":"textarea","label":"Сведения о реальном исполнителе / поставщике","required":false},{"name":"actual_expenses","type":"money","label":"Фактические расходы","required":false}]},{"id":"documents","title":"Документы","fields":[{"name":"audit_documents","type":"file_upload","label":"Загрузите акт, требования, договоры, первичку, переписку","required":false},{"name":"document_comments","type":"textarea","label":"Комментарии к документам","required":false}]},{"id":"result","title":"Что подготовить","fields":[{"name":"desired_result","type":"multiselect","label":"Нужный результат","options":[{"label":"Полные возражения на акт","value":"full_objections"},{"label":"Отдельный раздел по ст. 54.1","value":"54_1_section"},{"label":"Матрица доказательств","value":"evidence_matrix"},{"label":"Список недостающих документов","value":"missing_docs"},{"label":"Подготовить базу для жалобы","value":"appeal_ready"}],"required":false},{"name":"special_instructions","type":"textarea","label":"Особые указания","required":false}]}],"warnings":["Возражения должны быть основаны на акте проверки, фактах и подтверждённых документах.","AI не должен придумывать нормы, судебную практику, письма ФНС, даты и номера.","Процессуальные нарушения ФНС необходимо подтверждать материалами проверки.","Доводы по налоговой реконструкции требуют фактической базы."]},"jurisdiction":"RU","display_order":40,"template_code":"tax_audit_objections_extended","required_fields":["taxpayer_name","taxpayer_inn","audit_type","act_number","act_date","tax_type","fns_findings","client_position"]},{"id":"eafe1be2-8d96-4603-994e-d42d85453a94","title":"Опросник для анализа рисков дробления бизнеса","category":"tax","language":"ru","metadata":{},"is_active":true,"created_at":"2026-06-16T13:24:10.19425+00:00","sort_order":0,"updated_at":"2026-06-16T13:24:39.943995+00:00","description":"Опросник для анализа признаков искусственного дробления бизнеса, самостоятельности компаний, деловой цели, взаимозависимости, распределения сотрудников, активов, клиентов, налоговой нагрузки и доказательственной базы для защиты позиции налогоплательщика.","is_featured":true,"schema_json":{"steps":[{"id":"general","title":"1. Общая информация","fields":[{"name":"taxpayer_name","type":"text","label":"Налогоплательщик / основная компания","required":true},{"name":"taxpayer_inn","type":"text","label":"ИНН налогоплательщика","required":true},{"name":"client_goal","type":"select","label":"Цель анализа","options":["Предварительная оценка рисков","Подготовка к налоговой проверке","Ответ на претензии ФНС","Возражения на акт проверки","Судебный спор","Реструктуризация бизнеса"],"required":true}]},{"id":"group_structure","title":"2. Структура группы","fields":[{"name":"business_group_description","type":"textarea","label":"Описание структуры бизнеса","required":true},{"name":"entities_count","type":"number","label":"Количество компаний / ИП в группе","required":true},{"name":"entities_roles","type":"textarea","label":"Роли каждой компании / ИП"},{"name":"ownership_links","type":"textarea","label":"Есть ли общие участники, родственники, управляющие лица"}]},{"id":"tax_regimes","title":"3. Налоговые режимы и экономический эффект","fields":[{"name":"tax_regimes","type":"textarea","label":"Применяемые налоговые режимы","required":true},{"name":"tax_saving_effect","type":"textarea","label":"Есть ли налоговая экономия от разделения бизнеса"},{"name":"revenue_distribution","type":"textarea","label":"Распределение выручки между участниками группы"}]},{"id":"business_independence","title":"4. Самостоятельность участников","fields":[{"name":"separate_management","type":"textarea","label":"Есть ли самостоятельное управление у каждой компании"},{"name":"separate_staff","type":"textarea","label":"Сотрудники: общие или разные"},{"name":"separate_assets","type":"textarea","label":"Активы, офисы, склады, оборудование"},{"name":"separate_clients","type":"textarea","label":"Клиенты и контрагенты: общие или разные"},{"name":"separate_expenses","type":"textarea","label":"Самостоятельные расходы и банковские операции"}]},{"id":"fns_claims","title":"5. Позиция ФНС","fields":[{"name":"fns_position","type":"textarea","label":"В чём ФНС видит дробление бизнеса","required":true},{"name":"fns_evidence","type":"textarea","label":"Какие доказательства приводит ФНС"},{"name":"tax_periods","type":"text","label":"Проверяемые налоговые периоды"},{"name":"additional_charges","type":"textarea","label":"Суммы доначислений, пеней, штрафов"}]},{"id":"business_purpose","title":"6. Деловая цель","fields":[{"name":"business_purpose","type":"textarea","label":"Экономические причины разделения бизнеса"},{"name":"non_tax_reasons","type":"textarea","label":"Неналоговые причины структуры"},{"name":"market_logic","type":"textarea","label":"Коммерческая логика разделения направлений"}]},{"id":"evidence","title":"7. Доказательства защиты","fields":[{"name":"supporting_documents","type":"textarea","label":"Документы, подтверждающие самостоятельность"},{"name":"contracts_and_primary_docs","type":"textarea","label":"Договоры, первичные документы, платежи"},{"name":"witnesses_and_employees","type":"textarea","label":"Свидетели, сотрудники, пояснения"},{"name":"missing_evidence","type":"textarea","label":"Каких доказательств не хватает"}]},{"id":"strategy","title":"8. Стратегия защиты","fields":[{"name":"defense_position","type":"textarea","label":"Основная позиция налогоплательщика"},{"name":"weak_points","type":"textarea","label":"Слабые места позиции"},{"name":"desired_result","type":"textarea","label":"Желаемый результат"}]}]},"jurisdiction":"RU","display_order":70,"template_code":"tax_business_splitting_analysis","required_fields":["taxpayer_name","taxpayer_inn","business_group_description","entities_count","tax_regimes","fns_position","client_goal"]},{"id":"e5fb4fca-8fc5-4c0e-bafd-081e415e4acf","title":"Опросник для проверки контрагента по налоговым рискам","category":"tax","language":"ru","metadata":{},"is_active":true,"created_at":"2026-06-16T14:19:43.708685+00:00","sort_order":0,"updated_at":"2026-06-16T14:19:43.708685+00:00","description":"Опросник для анализа контрагента в целях налоговой безопасности, подтверждения должной осмотрительности и подготовки защиты по спорам по ст. 54.1 НК РФ.","is_featured":true,"schema_json":{"steps":[{"id":"general","title":"1. Общая информация","fields":[{"name":"taxpayer_name","type":"text","label":"Налогоплательщик","required":true},{"name":"counterparty_name","type":"text","label":"Контрагент","required":true},{"name":"counterparty_inn","type":"text","label":"ИНН контрагента","required":true},{"name":"client_goal","type":"select","label":"Цель проверки","options":["Проверка перед заключением договора","Подготовка к налоговой проверке","Ответ на претензии ФНС","Подготовка возражений","Судебный спор","Внутренний аудит"],"required":true}]},{"id":"transaction","title":"2. Сделка и взаимодействие","fields":[{"name":"transaction_description","type":"textarea","label":"Описание сделки или операции","required":true},{"name":"contract_amount","type":"text","label":"Стоимость сделки"},{"name":"period_of_cooperation","type":"text","label":"Период сотрудничества"},{"name":"selection_reason","type":"textarea","label":"Почему был выбран именно этот контрагент"}]},{"id":"counterparty_reality","title":"3. Реальность деятельности контрагента","fields":[{"name":"employees","type":"textarea","label":"Сведения о сотрудниках и персонале"},{"name":"assets","type":"textarea","label":"Оборудование, помещения, транспорт, активы"},{"name":"licenses","type":"textarea","label":"Лицензии, допуски, разрешения"},{"name":"business_reputation","type":"textarea","label":"Деловая репутация и опыт работы"}]},{"id":"due_diligence","title":"4. Должная осмотрительность","fields":[{"name":"egrul_check","type":"textarea","label":"Проверка ЕГРЮЛ и регистрационных данных"},{"name":"authority_check","type":"textarea","label":"Проверка полномочий руководителя и подписантов"},{"name":"commercial_offer","type":"textarea","label":"Коммерческие предложения, переговоры, переписка"},{"name":"internal_approval","type":"textarea","label":"Внутреннее согласование выбора контрагента"}]},{"id":"risk_indicators","title":"5. Признаки налогового риска","fields":[{"name":"mass_address","type":"textarea","label":"Признаки массового адреса/руководителя"},{"name":"unusual_conditions","type":"textarea","label":"Необычные условия сделки"},{"name":"dependency","type":"textarea","label":"Взаимозависимость сторон"},{"name":"other_risks","type":"textarea","label":"Иные признаки технической компании"}]},{"id":"evidence","title":"6. Доказательства","fields":[{"name":"available_documents","type":"textarea","label":"Имеющиеся документы"},{"name":"missing_documents","type":"textarea","label":"Каких документов не хватает"},{"name":"additional_documents_needed","type":"textarea","label":"Какие документы необходимо получить"}]},{"id":"final_assessment","title":"7. Оценка рисков и стратегия","fields":[{"name":"main_risks","type":"textarea","label":"Основные налоговые риски"},{"name":"fns_possible_arguments","type":"textarea","label":"Какие аргументы может использовать ФНС"},{"name":"defense_arguments","type":"textarea","label":"Аргументы налогоплательщика"},{"name":"recommended_actions","type":"textarea","label":"Рекомендуемые действия юриста"}]}]},"jurisdiction":"RU","display_order":140,"template_code":"tax_counterparty_due_diligence","required_fields":["taxpayer_name","counterparty_name","counterparty_inn","transaction_description","client_goal"]},{"id":"77685c51-efb8-4108-96ea-24a3b6368a98","title":"Опросник для анализа решения налогового органа","category":"tax","language":"ru","metadata":{"legal_focus":["НК РФ ст. 101","НК РФ ст. 138","НК РФ ст. 139","НК РФ ст. 139.1","анализ решения ФНС"],"practice_area":"tax","document_family":"tax_decision_analysis","generation_type":"standalone"},"is_active":true,"created_at":"2026-06-13T20:05:52.999547+00:00","sort_order":14,"updated_at":"2026-06-16T13:24:33.368748+00:00","description":"Сбор данных для анализа решения ФНС по результатам налоговой проверки: выводы, суммы, мотивировка, процессуальные нарушения, перспективы обжалования.","is_featured":true,"schema_json":{"steps":[{"id":"taxpayer","title":"Налогоплательщик","fields":[{"name":"taxpayer_name","type":"text","label":"Наименование налогоплательщика","required":true},{"name":"taxpayer_inn","type":"text","label":"ИНН","required":true},{"name":"taxpayer_ogrn","type":"text","label":"ОГРН / ОГРНИП","required":false},{"name":"business_activity","type":"textarea","label":"Сфера деятельности","required":false}]},{"id":"decision","title":"Решение ФНС","fields":[{"name":"tax_authority","type":"text","label":"Налоговый орган","required":true},{"name":"decision_number","type":"text","label":"Номер решения","required":true},{"name":"decision_date","type":"date","label":"Дата решения","required":true},{"name":"decision_received_date","type":"date","label":"Дата получения решения","required":false},{"name":"decision_result","type":"select","label":"Результат решения","options":[{"label":"Привлечён к ответственности / доначисления подтверждены","value":"tax_liability_confirmed"},{"label":"Частичное снижение начислений","value":"partial_reduction"},{"label":"Отказ в привлечении к ответственности","value":"no_liability"},{"label":"Иное","value":"other"}],"required":true}]},{"id":"audit_context","title":"Контекст проверки","fields":[{"name":"audit_type","type":"select","label":"Вид проверки","options":[{"label":"Камеральная проверка","value":"camera_audit"},{"label":"Выездная проверка","value":"onsite_audit"},{"label":"Дополнительные мероприятия налогового контроля","value":"additional_measures"},{"label":"Иное","value":"other"}],"required":false},{"name":"audit_period","type":"text","label":"Проверяемый период","required":false},{"name":"act_number","type":"text","label":"Номер акта проверки","required":false},{"name":"act_date","type":"date","label":"Дата акта проверки","required":false},{"name":"objections_submitted","type":"boolean","label":"Возражения на акт подавались?","required":false}]},{"id":"taxes_amounts","title":"Налоги и суммы","fields":[{"name":"tax_type","type":"multiselect","label":"Налоги","options":[{"label":"НДС","value":"vat"},{"label":"Налог на прибыль","value":"profit_tax"},{"label":"НДФЛ","value":"personal_income_tax"},{"label":"Страховые взносы","value":"insurance_contributions"},{"label":"УСН","value":"usn"},{"label":"Иное","value":"other"}],"required":true},{"name":"additional_tax_amount","type":"money","label":"Доначисленный налог","required":false},{"name":"penalties_amount","type":"money","label":"Пени","required":false},{"name":"fine_amount","type":"money","label":"Штраф","required":false},{"name":"total_amount","type":"money","label":"Общая сумма по решению","required":false}]},{"id":"decision_findings","title":"Выводы в решении","fields":[{"name":"decision_findings","type":"textarea","label":"Кратко изложите выводы ФНС в решении","required":false},{"name":"decision_basis","type":"multiselect","label":"Основания решения","options":[{"label":"Ст. 54.1 НК РФ","value":"54_1"},{"label":"Технический контрагент","value":"technical_counterparty"},{"label":"Нереальность операций","value":"unreal_operation"},{"label":"Отказ в вычетах НДС","value":"vat_deduction_denial"},{"label":"Исключение расходов","value":"expense_denial"},{"label":"Дробление бизнеса","value":"business_splitting"},{"label":"Формальный документооборот","value":"formal_documents"},{"label":"Отсутствие деловой цели","value":"no_business_purpose"}],"required":false}]},{"id":"objections_review","title":"Как ФНС рассмотрела возражения","fields":[{"name":"taxpayer_objections_summary","type":"textarea","label":"Какие доводы заявлял налогоплательщик","required":false},{"name":"accepted_arguments","type":"textarea","label":"Какие доводы ФНС приняла","required":false},{"name":"rejected_arguments","type":"textarea","label":"Какие доводы ФНС отклонила","required":false},{"name":"unexamined_evidence","type":"textarea","label":"Какие доказательства ФНС не оценила","required":false}]},{"id":"procedural_violations","title":"Процессуальные нарушения","fields":[{"name":"procedural_violations","type":"multiselect","label":"Возможные нарушения процедуры","options":[{"label":"Нарушение порядка рассмотрения материалов проверки по ст. 101 НК РФ","value":"101_hearing_violation"},{"label":"Не дали возможность представить пояснения","value":"no_opportunity_to_explain"},{"label":"Не исследованы доказательства","value":"evidence_not_examined"},{"label":"Нарушения при дополнительных мероприятиях","value":"additional_measures_violation"},{"label":"Нарушение сроков","value":"deadline_violation"},{"label":"Решение недостаточно мотивировано","value":"motivation_defect"},{"label":"Использованы недопустимые доказательства","value":"inadmissible_evidence"}],"required":false},{"name":"procedural_violation_details","type":"textarea","label":"Описание процессуальных нарушений","required":false}]},{"id":"appeal_strategy","title":"Перспективы обжалования","fields":[{"name":"appeal_route","type":"select","label":"Планируемый способ защиты","options":[{"label":"Жалоба в УФНС","value":"ufns_appeal"},{"label":"Жалоба в ФНС России","value":"fns_appeal"},{"label":"Арбитражный суд","value":"arbitration_court"},{"label":"Только анализ перспектив","value":"risk_opinion_only"}],"required":false},{"name":"strong_arguments","type":"textarea","label":"Сильные доводы","required":false},{"name":"weak_arguments","type":"textarea","label":"Слабые места","required":false},{"name":"additional_evidence_needed","type":"textarea","label":"Какие доказательства нужно добрать","required":false}]},{"id":"documents","title":"Документы","fields":[{"name":"decision_documents","type":"file_upload","label":"Загрузите решение, акт, возражения, протоколы, доказательства","required":false},{"name":"document_comments","type":"textarea","label":"Комментарии к документам","required":false}]},{"id":"goal","title":"Цель анализа","fields":[{"name":"client_goal","type":"select","label":"Что нужно получить","options":[{"label":"Анализ законности решения","value":"decision_analysis"},{"label":"Подготовка жалобы в УФНС","value":"appeal_preparation"},{"label":"Подготовка позиции для суда","value":"court_preparation"},{"label":"Оценка рисков и перспектив","value":"risk_assessment"}],"required":true},{"name":"special_instructions","type":"textarea","label":"Особые указания","required":false}]}],"warnings":["Анализ решения ФНС должен учитывать ст. 101 НК РФ и порядок рассмотрения материалов проверки.","Необходимо проверить сроки получения решения и сроки обжалования.","AI не должен придумывать судебную практику, письма ФНС, даты, номера дел или нормы.","Выводы должны быть связаны с конкретными пунктами решения, доказательствами и нарушениями процедуры."]},"jurisdiction":"RU","display_order":50,"template_code":"tax_decision_analysis","required_fields":["taxpayer_name","taxpayer_inn","tax_authority","decision_number","decision_date","tax_type","decision_result","client_goal"]},{"id":"f1cb12f7-f01e-412c-9fd9-4109bbe6774c","title":"Опросник для стратегии защиты по налоговому спору","category":"tax","language":"ru","metadata":{},"is_active":true,"created_at":"2026-06-16T14:11:01.925829+00:00","sort_order":0,"updated_at":"2026-06-16T14:11:01.925829+00:00","description":"Опросник для формирования стратегии защиты налогоплательщика: факты, доказательства, позиция ФНС, применимое право, альтернативные правовые подходы, судебная практика, аргументы оппонента, риски и план действий.","is_featured":true,"schema_json":{"steps":[{"id":"general","title":"1. Общая информация","fields":[{"name":"taxpayer_name","type":"text","label":"Налогоплательщик","required":true},{"name":"taxpayer_inn","type":"text","label":"ИНН налогоплательщика","required":true},{"name":"dispute_stage","type":"select","label":"Стадия налогового спора","options":["Получено требование ФНС","Идёт камеральная проверка","Идёт выездная проверка","Получен акт проверки","Поданы возражения","Получено решение ФНС","Жалоба в УФНС","Подготовка к арбитражному суду","Судебный спор"],"required":true},{"name":"client_goal","type":"select","label":"Цель клиента","options":["Снизить доначисления","Отменить решение ФНС","Подготовить возражения","Подготовить жалобу","Подготовить судебную позицию","Оценить перспективы спора","Сформировать доказательственную стратегию"],"required":true}]},{"id":"facts","title":"2. Фактическая база","fields":[{"name":"main_facts","type":"textarea","label":"Ключевые факты спора","required":true},{"name":"disputed_operations","type":"textarea","label":"Какие операции оспаривает ФНС"},{"name":"tax_periods","type":"text","label":"Налоговые периоды"},{"name":"taxes_involved","type":"textarea","label":"Какие налоги затронуты"},{"name":"amounts_at_stake","type":"textarea","label":"Суммы доначислений, пеней, штрафов"}]},{"id":"fns_position","title":"3. Позиция ФНС","fields":[{"name":"fns_position","type":"textarea","label":"Позиция ФНС","required":true},{"name":"fns_evidence","type":"textarea","label":"Доказательства ФНС"},{"name":"fns_legal_basis","type":"textarea","label":"На какие нормы ссылается ФНС"},{"name":"fns_weak_points","type":"textarea","label":"Слабые места позиции ФНС"}]},{"id":"evidence","title":"4. Доказательства налогоплательщика","fields":[{"name":"available_evidence","type":"textarea","label":"Имеющиеся доказательства","required":true},{"name":"documentary_evidence","type":"textarea","label":"Документы: договоры, первичка, платежи"},{"name":"business_reality_evidence","type":"textarea","label":"Доказательства реальности операций"},{"name":"economic_purpose_evidence","type":"textarea","label":"Доказательства деловой цели"},{"name":"missing_evidence","type":"textarea","label":"Каких доказательств не хватает"}]},{"id":"law","title":"5. Применимое право","fields":[{"name":"applicable_laws","type":"textarea","label":"Какие нормы применимы"},{"name":"why_laws_apply","type":"textarea","label":"Почему применяются именно эти нормы"},{"name":"alternative_laws","type":"textarea","label":"Какие альтернативные нормы / подходы возможны"},{"name":"why_alternatives_rejected","type":"textarea","label":"Почему альтернативы не выбраны как основные"}]},{"id":"court_practice","title":"6. Судебная практика","fields":[{"name":"supporting_cases","type":"textarea","label":"Практика в поддержку налогоплательщика"},{"name":"opposing_cases","type":"textarea","label":"Практика в поддержку ФНС"},{"name":"conflicting_cases","type":"textarea","label":"Противоречивая практика"},{"name":"court_practice_conclusion","type":"textarea","label":"Вывод по судебной практике"}]},{"id":"opponent_arguments","title":"7. Аргументы оппонента и контраргументы","fields":[{"name":"expected_fns_arguments","type":"textarea","label":"Ожидаемые аргументы ФНС"},{"name":"counterarguments","type":"textarea","label":"Контраргументы налогоплательщика"},{"name":"weak_points_of_taxpayer","type":"textarea","label":"Слабые места позиции налогоплательщика"},{"name":"how_to_reduce_weaknesses","type":"textarea","label":"Как снизить слабые места позиции"}]},{"id":"strategy","title":"8. Стратегия защиты","fields":[{"name":"defense_strategy","type":"textarea","label":"Основная стратегия защиты"},{"name":"strategy_options","type":"textarea","label":"Альтернативные варианты стратегии"},{"name":"risk_assessment","type":"textarea","label":"Оценка рисков"},{"name":"action_plan","type":"textarea","label":"План действий"},{"name":"lawyer_decision","type":"textarea","label":"Предварительное решение юриста"}]}]},"jurisdiction":"RU","display_order":90,"template_code":"tax_dispute_strategy","required_fields":["taxpayer_name","taxpayer_inn","dispute_stage","fns_position","client_goal","main_facts","available_evidence"]},{"id":"24f3cd23-5aee-4c66-84e9-443c6599937e","title":"Опросник для налогового Due Diligence","category":"tax","language":"ru","metadata":{},"is_active":true,"created_at":"2026-06-16T14:08:38.674246+00:00","sort_order":0,"updated_at":"2026-06-16T14:08:38.674246+00:00","description":"Опросник для комплексной проверки налоговых рисков компании, группы компаний или сделки: налоговая история, проверки, задолженности, контрагенты, структура бизнеса, сделки, льготы, специальные режимы и потенциальные претензии ФНС.","is_featured":true,"schema_json":{"steps":[{"id":"general","title":"1. Общая информация","fields":[{"name":"target_company_name","type":"text","label":"Проверяемая компания / группа компаний","required":true},{"name":"target_company_inn","type":"text","label":"ИНН проверяемой компании","required":true},{"name":"client_goal","type":"select","label":"Цель клиента","options":["Покупка бизнеса","Инвестиция","Вход в долю","Крупная сделка","Внутренний налоговый аудит","Подготовка к продаже бизнеса","Реструктуризация группы","Оценка рисков перед проверкой ФНС"],"required":true},{"name":"due_diligence_goal","type":"textarea","label":"Что нужно получить по итогам проверки","required":true},{"name":"transaction_type","type":"select","label":"Тип сделки / ситуации","options":["Покупка доли / акций","Покупка активов","Инвестиционный раунд","Реорганизация","Внутригрупповая сделка","Крупный договор","Проверка перед налоговой проверкой","Иное"],"required":true}]},{"id":"business_structure","title":"2. Структура бизнеса","fields":[{"name":"business_description","type":"textarea","label":"Описание бизнеса"},{"name":"group_structure","type":"textarea","label":"Структура группы компаний"},{"name":"beneficiaries","type":"textarea","label":"Бенефициары и взаимозависимые лица"},{"name":"foreign_entities","type":"textarea","label":"Есть ли иностранные компании / трансграничные элементы"},{"name":"business_splitting_indicators","type":"textarea","label":"Есть ли признаки дробления бизнеса"}]},{"id":"tax_history","title":"3. Налоговая история","fields":[{"name":"tax_periods","type":"text","label":"Проверяемые налоговые периоды","required":true},{"name":"tax_audits_history","type":"textarea","label":"Были ли камеральные / выездные проверки"},{"name":"tax_claims_history","type":"textarea","label":"Претензии ФНС, требования, акты, решения"},{"name":"tax_litigation_history","type":"textarea","label":"Налоговые споры и суды"},{"name":"additional_charges_history","type":"textarea","label":"Доначисления, пени, штрафы"}]},{"id":"tax_obligations","title":"4. Налоговые обязательства и режимы","fields":[{"name":"tax_regimes","type":"textarea","label":"Применяемые налоговые режимы"},{"name":"tax_debts","type":"textarea","label":"Есть ли задолженность по налогам"},{"name":"tax_overpayments","type":"textarea","label":"Есть ли переплаты / заявления на возврат"},{"name":"tax_benefits","type":"textarea","label":"Льготы, преференции, пониженные ставки"},{"name":"risky_tax_positions","type":"textarea","label":"Рисковые налоговые позиции"}]},{"id":"counterparties_54_1","title":"5. Контрагенты и риски по ст. 54.1 НК РФ","fields":[{"name":"key_counterparties","type":"textarea","label":"Ключевые контрагенты"},{"name":"suspicious_counterparties","type":"textarea","label":"Контрагенты с признаками риска"},{"name":"due_diligence_documents","type":"textarea","label":"Документы должной осмотрительности"},{"name":"operation_reality_evidence","type":"textarea","label":"Доказательства реальности операций"},{"name":"primary_documents_quality","type":"textarea","label":"Качество первичных документов"}]},{"id":"transactions","title":"6. Сделки и операции","fields":[{"name":"major_transactions","type":"textarea","label":"Крупные и необычные сделки"},{"name":"related_party_transactions","type":"textarea","label":"Сделки с взаимозависимыми лицами"},{"name":"agency_or_intermediary_schemes","type":"textarea","label":"Агентские, комиссионные, посреднические схемы"},{"name":"cross_border_transactions","type":"textarea","label":"Трансграничные операции"},{"name":"cash_or_unusual_payments","type":"textarea","label":"Нестандартные платежи, наличные, займы, взаимозачёты"}]},{"id":"evidence_matrix","title":"7. Доказательная база","fields":[{"name":"available_documents","type":"textarea","label":"Какие документы доступны для проверки"},{"name":"missing_documents","type":"textarea","label":"Каких документов не хватает"},{"name":"evidence_gaps","type":"textarea","label":"Пробелы в доказательствах"},{"name":"documents_to_request","type":"textarea","label":"Какие документы нужно запросить дополнительно"}]},{"id":"risk_assessment","title":"8. Риски и выводы","fields":[{"name":"main_tax_risks","type":"textarea","label":"Основные налоговые риски"},{"name":"potential_fns_claims","type":"textarea","label":"Какие претензии может предъявить ФНС"},{"name":"risk_level","type":"select","label":"Предварительный уровень риска","options":["Низкий","Средний","Высокий","Критический","Недостаточно данных"]},{"name":"mitigation_plan","type":"textarea","label":"План снижения рисков"},{"name":"final_recommendation","type":"textarea","label":"Предварительная рекомендация юриста"}]}]},"jurisdiction":"RU","display_order":80,"template_code":"tax_due_diligence","required_fields":["target_company_name","target_company_inn","due_diligence_goal","transaction_type","tax_periods","client_goal"]},{"id":"f013aede-1e1e-4389-b229-d4a386f63e54","title":"Опросник для матрицы доказательств налогового спора","category":"tax","language":"ru","metadata":{"legal_focus":["НК РФ ст. 54.1","НК РФ ст. 88","НК РФ ст. 89","НК РФ ст. 100","НК РФ ст. 101","НК РФ ст. 138","НК РФ ст. 139","НК РФ ст. 139.1","доказательства налогового спора","налоговая реконструкция","матрица защиты"],"practice_area":"tax","document_family":"tax_evidence_matrix","generation_type":"standalone","linked_templates":["tax_54_1_risk_opinion","tax_reconstruction_analysis","tax_audit_objections_extended","tax_ufns_appeal","tax_decision_analysis"]},"is_active":true,"created_at":"2026-06-13T20:38:09.696575+00:00","sort_order":15,"updated_at":"2026-06-16T13:24:33.368748+00:00","description":"Сбор данных для построения доказательной карты налогового спора: доводы ФНС, позиция налогоплательщика, подтверждающие документы, пробелы в доказательствах и стратегия защиты.","is_featured":true,"schema_json":{"steps":[{"id":"case_general","title":"Общие сведения о налоговом споре","fields":[{"name":"taxpayer_name","type":"text","label":"Наименование налогоплательщика","required":true},{"name":"taxpayer_inn","type":"text","label":"ИНН","required":true},{"name":"taxpayer_ogrn","type":"text","label":"ОГРН / ОГРНИП","required":false},{"name":"tax_authority","type":"text","label":"Налоговый орган","required":true},{"name":"dispute_stage","type":"select","label":"Стадия налогового спора","options":[{"label":"Предпроверочный анализ","value":"pre_audit"},{"label":"Требование ФНС","value":"tax_demand"},{"label":"Акт налоговой проверки","value":"audit_act"},{"label":"Подготовка возражений","value":"objections"},{"label":"Решение ФНС","value":"decision"},{"label":"Жалоба в УФНС","value":"ufns_appeal"},{"label":"Арбитражный суд","value":"court"}],"required":true},{"name":"risk_amount","type":"money","label":"Сумма налогового риска / доначислений","required":false}]},{"id":"fns_claims_block","title":"Доводы ФНС","fields":[{"name":"fns_claims","type":"multiselect","label":"Какие доводы заявляет ФНС","options":[{"label":"Ст. 54.1 НК РФ","value":"54_1"},{"label":"Технический контрагент","value":"technical_counterparty"},{"label":"Нереальность операции","value":"unreal_operation"},{"label":"Формальный документооборот","value":"formal_documents"},{"label":"Отказ в вычетах НДС","value":"vat_deduction_denial"},{"label":"Исключение расходов","value":"expense_denial"},{"label":"Дробление бизнеса","value":"business_splitting"},{"label":"Отсутствие деловой цели","value":"no_business_purpose"},{"label":"Взаимозависимость","value":"interdependence"},{"label":"Нерыночность цены","value":"price_non_market"},{"label":"Иное","value":"other"}],"required":true},{"name":"fns_position_summary","type":"textarea","label":"Кратко изложите позицию ФНС","required":false},{"name":"fns_evidence_summary","type":"textarea","label":"На какие доказательства ссылается ФНС","required":false}]},{"id":"taxpayer_position","title":"Позиция налогоплательщика","fields":[{"name":"taxpayer_position_summary","type":"textarea","label":"Краткая позиция налогоплательщика","required":false},{"name":"real_business_purpose","type":"textarea","label":"В чем была деловая цель операций","required":false},{"name":"economic_effect","type":"textarea","label":"Какой экономический эффект был получен","required":false},{"name":"client_weak_points","type":"textarea","label":"Какие слабые места клиент уже видит","required":false}]},{"id":"operation_reality","title":"Реальность хозяйственных операций","fields":[{"name":"operation_description","type":"textarea","label":"Опишите спорные операции","required":false},{"name":"who_found_counterparty","type":"textarea","label":"Кто и как нашел контрагента","required":false},{"name":"negotiation_process","type":"textarea","label":"Как проходили переговоры","required":false},{"name":"actual_executor","type":"textarea","label":"Кто фактически выполнял работы / поставлял товар / оказывал услуги","required":false},{"name":"acceptance_process","type":"textarea","label":"Кто принимал результат и как фиксировалась приемка","required":false},{"name":"employees_involved","type":"textarea","label":"Какие сотрудники участвовали со стороны налогоплательщика","required":false},{"name":"logistics_details","type":"textarea","label":"Перевозка, склад, доставка, пропуска, маршруты","required":false}]},{"id":"existing_documents","title":"Имеющиеся доказательства","fields":[{"name":"existing_contract_documents","type":"multiselect","label":"Договорные документы","options":[{"label":"Договор","value":"contract"},{"label":"Приложения","value":"annexes"},{"label":"Спецификации","value":"specifications"},{"label":"Дополнительные соглашения","value":"additional_agreements"},{"label":"Технические задания","value":"technical_tasks"}],"required":false},{"name":"existing_primary_documents","type":"multiselect","label":"Первичные документы","options":[{"label":"Акты","value":"acts"},{"label":"УПД","value":"upd"},{"label":"Счета-фактуры","value":"invoices"},{"label":"Накладные","value":"waybills"},{"label":"Товарные накладные","value":"delivery_notes"},{"label":"Отчеты о выполненных работах","value":"work_reports"}],"required":false},{"name":"existing_payment_documents","type":"multiselect","label":"Финансовые документы","options":[{"label":"Платежные поручения","value":"payment_orders"},{"label":"Банковские выписки","value":"bank_statements"},{"label":"Акты сверки","value":"reconciliation_acts"}],"required":false},{"name":"existing_fact_documents","type":"multiselect","label":"Документы фактического исполнения","options":[{"label":"Email-переписка","value":"emails"},{"label":"Переписка в мессенджерах","value":"messengers"},{"label":"Фото","value":"photos"},{"label":"Видео","value":"videos"},{"label":"Транспортные документы","value":"transport_documents"},{"label":"Складские документы","value":"warehouse_documents"},{"label":"Пропуска / журналы доступа","value":"access_logs"},{"label":"GPS / маршрутные листы","value":"gps_logs"},{"label":"Внутренние отчеты","value":"internal_reports"}],"required":false},{"name":"document_comments","type":"textarea","label":"Комментарии к имеющимся доказательствам","required":false}]},{"id":"missing_evidence","title":"Недостающие доказательства","fields":[{"name":"missing_documents","type":"textarea","label":"Каких документов не хватает","required":false},{"name":"missing_explanations","type":"textarea","label":"Каких пояснений не хватает","required":false},{"name":"missing_counterparty_documents","type":"textarea","label":"Что нужно запросить у контрагентов","required":false},{"name":"missing_employee_explanations","type":"textarea","label":"Какие объяснения сотрудников нужны","required":false},{"name":"critical_gaps","type":"textarea","label":"Критические пробелы в доказательствах","required":false}]},{"id":"argument_matrix","title":"Матрица доводов и доказательств","fields":[{"name":"fns_argument_1","type":"textarea","label":"Довод ФНС №1","required":false},{"name":"taxpayer_counterargument_1","type":"textarea","label":"Контраргумент налогоплательщика №1","required":false},{"name":"supporting_evidence_1","type":"textarea","label":"Доказательства по доводу №1","required":false},{"name":"evidence_strength_1","type":"select","label":"Сила доказательств по доводу №1","options":[{"label":"Сильная","value":"strong"},{"label":"Средняя","value":"medium"},{"label":"Слабая","value":"weak"},{"label":"Отсутствует","value":"absent"}],"required":false},{"name":"what_to_strengthen_1","type":"textarea","label":"Что нужно усилить по доводу №1","required":false},{"name":"fns_argument_2","type":"textarea","label":"Довод ФНС №2","required":false},{"name":"taxpayer_counterargument_2","type":"textarea","label":"Контраргумент налогоплательщика №2","required":false},{"name":"supporting_evidence_2","type":"textarea","label":"Доказательства по доводу №2","required":false},{"name":"evidence_strength_2","type":"select","label":"Сила доказательств по доводу №2","options":[{"label":"Сильная","value":"strong"},{"label":"Средняя","value":"medium"},{"label":"Слабая","value":"weak"},{"label":"Отсутствует","value":"absent"}],"required":false},{"name":"what_to_strengthen_2","type":"textarea","label":"Что нужно усилить по доводу №2","required":false},{"name":"additional_arguments","type":"textarea","label":"Дополнительные доводы и доказательства","required":false}]},{"id":"witnesses_explanations","title":"Свидетели и пояснения","fields":[{"name":"company_witnesses","type":"textarea","label":"Кто из сотрудников может подтвердить реальность операций","required":false},{"name":"counterparty_witnesses","type":"textarea","label":"Кто со стороны контрагентов может дать пояснения","required":false},{"name":"third_party_witnesses","type":"textarea","label":"Перевозчики, субподрядчики, склад, иные третьи лица","required":false},{"name":"needed_written_explanations","type":"textarea","label":"Какие письменные объяснения нужно подготовить","required":false}]},{"id":"tax_reconstruction","title":"Налоговая реконструкция","fields":[{"name":"reconstruction_needed","type":"boolean","label":"Нужна ли налоговая реконструкция","required":false},{"name":"real_expenses_confirmed","type":"textarea","label":"Какие реальные расходы можно подтвердить","required":false},{"name":"market_price_evidence","type":"textarea","label":"Есть ли подтверждение рыночности цены","required":false},{"name":"alternative_tax_calculation","type":"textarea","label":"Есть ли альтернативный расчет налоговых обязательств","required":false},{"name":"reconstruction_documents_needed","type":"textarea","label":"Какие документы нужны для реконструкции","required":false}]},{"id":"position_rating","title":"Оценка силы позиции","fields":[{"name":"strong_points","type":"textarea","label":"Сильные стороны позиции","required":false},{"name":"weak_points","type":"textarea","label":"Слабые стороны позиции","required":false},{"name":"critical_risks","type":"textarea","label":"Критические риски","required":false},{"name":"defense_perspective","type":"select","label":"Предварительная перспектива защиты","options":[{"label":"Высокая","value":"high"},{"label":"Средняя","value":"medium"},{"label":"Низкая","value":"low"},{"label":"Нужно больше данных","value":"unclear"}],"required":false},{"name":"evidence_collection_urgency","type":"select","label":"Срочность сбора доказательств","options":[{"label":"Критическая","value":"critical"},{"label":"Высокая","value":"high"},{"label":"Обычная","value":"normal"}],"required":false}]},{"id":"strategy","title":"Стратегия защиты","fields":[{"name":"client_goal","type":"select","label":"Что нужно получить","options":[{"label":"Матрица доказательств","value":"evidence_matrix"},{"label":"Стратегия защиты","value":"defense_strategy"},{"label":"Подготовка к возражениям","value":"objections_support"},{"label":"Подготовка к жалобе в УФНС","value":"ufns_appeal_support"},{"label":"Подготовка к суду","value":"court_strategy"}],"required":true},{"name":"seven_day_action_plan","type":"textarea","label":"Что нужно сделать в ближайшие 7 дней","required":false},{"name":"documents_to_request","type":"textarea","label":"Какие документы запросить","required":false},{"name":"explanations_to_prepare","type":"textarea","label":"Какие пояснения подготовить","required":false},{"name":"special_instructions","type":"textarea","label":"Особые указания","required":false}]},{"id":"uploads","title":"Загрузка документов","fields":[{"name":"tax_dispute_files","type":"file_upload","label":"Загрузите акт, решение, требования, договоры, первичку, переписку и иные доказательства","required":false},{"name":"upload_comments","type":"textarea","label":"Комментарии к загруженным документам","required":false}]}],"warnings":["AI не должен придумывать судебную практику, письма ФНС, номера дел, даты или нормы.","Каждый вывод должен быть связан с конкретным доводом ФНС или конкретным доказательством.","Если доказательств недостаточно, AI должен прямо указать на пробел, а не делать уверенный вывод.","Оценка перспектив является предварительной и требует проверки юристом.","При наличии решения ФНС нужно учитывать сроки и порядок обжалования по НК РФ."],"output_expectations":["AI должен сформировать таблицу: довод ФНС → контраргумент → доказательство → сила доказательства → что нужно добрать.","AI должен отдельно выделить критические пробелы в доказательствах.","AI должен предложить план сбора доказательств и приоритеты.","AI должен определить, нужна ли налоговая реконструкция.","AI должен дать осторожную оценку перспектив без выдумывания судебной практики."]},"jurisdiction":"RU","display_order":30,"template_code":"tax_evidence_matrix","required_fields":["taxpayer_name","taxpayer_inn","dispute_stage","tax_authority","fns_claims","client_goal"]},{"id":"d703758a-b4da-4283-b661-268d2b028790","title":"Опросник для пояснений в ФНС","category":"tax","language":"ru","metadata":{},"is_active":true,"created_at":"2026-06-16T14:18:47.174153+00:00","sort_order":0,"updated_at":"2026-06-16T14:18:47.174153+00:00","description":"Опросник для подготовки письменных пояснений в ФНС: НДС, камеральная проверка, выездная проверка, расхождения, вычеты, контрагенты, операции и доказательства позиции налогоплательщика.","is_featured":true,"schema_json":{"steps":[{"id":"general","title":"1. Общая информация","fields":[{"name":"taxpayer_name","type":"text","label":"Налогоплательщик","required":true},{"name":"taxpayer_inn","type":"text","label":"ИНН налогоплательщика","required":true},{"name":"tax_authority","type":"text","label":"Налоговый орган","required":true},{"name":"client_goal","type":"select","label":"Цель пояснений","options":["Снять вопросы ФНС","Подтвердить правомерность вычетов","Подтвердить расходы","Объяснить расхождения","Снизить риск проверки","Подготовить позицию для дальнейшего спора"],"required":true}]},{"id":"explanation_context","title":"2. Контекст пояснений","fields":[{"name":"explanation_type","type":"select","label":"Тип пояснений","options":["Пояснения по НДС","Пояснения по камеральной проверке","Пояснения по выездной проверке","Пояснения по расхождениям","Пояснения по контрагентам","Пояснения по расходам","Иное"],"required":true},{"name":"request_basis","type":"textarea","label":"Основание запроса / причина пояснений","required":true},{"name":"request_number","type":"text","label":"Номер требования / уведомления"},{"name":"request_date","type":"text","label":"Дата требования / уведомления"},{"name":"response_deadline","type":"text","label":"Срок представления пояснений"}]},{"id":"facts","title":"3. Фактические обстоятельства","fields":[{"name":"main_facts","type":"textarea","label":"Ключевые факты"},{"name":"tax_periods","type":"text","label":"Налоговые периоды"},{"name":"operations_in_question","type":"textarea","label":"Какие операции вызвали вопросы ФНС"},{"name":"amounts_in_question","type":"textarea","label":"Суммы расхождений / вычетов / расходов"},{"name":"counterparties_involved","type":"textarea","label":"Контрагенты, связанные с вопросами ФНС"}]},{"id":"taxpayer_position","title":"4. Позиция налогоплательщика","fields":[{"name":"taxpayer_position","type":"textarea","label":"Основная позиция налогоплательщика"},{"name":"economic_reasoning","type":"textarea","label":"Экономическое объяснение операций"},{"name":"legal_reasoning","type":"textarea","label":"Правовое обоснование позиции"},{"name":"explanation_of_discrepancies","type":"textarea","label":"Объяснение расхождений"}]},{"id":"evidence","title":"5. Документы и доказательства","fields":[{"name":"supporting_documents","type":"textarea","label":"Документы, подтверждающие позицию"},{"name":"primary_documents","type":"textarea","label":"Первичные документы, договоры, счета, акты, накладные"},{"name":"payment_documents","type":"textarea","label":"Платёжные документы"},{"name":"business_correspondence","type":"textarea","label":"Переписка, заявки, отчёты, иные подтверждения"},{"name":"missing_documents","type":"textarea","label":"Каких документов не хватает"}]},{"id":"risks","title":"6. Риски и ограничения","fields":[{"name":"risk_of_additional_questions","type":"textarea","label":"Риск дополнительных вопросов ФНС"},{"name":"risk_of_audit","type":"textarea","label":"Риск назначения проверки / углубления контроля"},{"name":"weak_points","type":"textarea","label":"Слабые места пояснений"},{"name":"risk_level","type":"select","label":"Предварительный уровень риска","options":["Низкий","Средний","Высокий","Критический","Недостаточно данных"]}]},{"id":"draft_explanation","title":"7. Проект пояснений","fields":[{"name":"draft_main_text","type":"textarea","label":"Основной текст пояснений"},{"name":"legal_clauses","type":"textarea","label":"Правовые формулировки"},{"name":"attachments_list","type":"textarea","label":"Перечень приложений"},{"name":"final_notes","type":"textarea","label":"Особые оговорки и замечания юриста"}]}]},"jurisdiction":"RU","display_order":130,"template_code":"tax_fns_explanations","required_fields":["taxpayer_name","taxpayer_inn","tax_authority","explanation_type","request_basis","client_goal"]},{"id":"1018b017-271e-4e60-b02f-f7e698f182a7","title":"Опросник для ответа на требование ФНС","category":"tax","language":"ru","metadata":{},"is_active":true,"created_at":"2026-06-16T14:16:24.183168+00:00","sort_order":0,"updated_at":"2026-06-16T14:16:24.183168+00:00","description":"Опросник для подготовки ответа на требование налогового органа: вид требования, основание, сроки, запрашиваемые документы, законность требования, риски предоставления информации и позиция налогоплательщика.","is_featured":true,"schema_json":{"steps":[{"id":"general","title":"1. Общая информация","fields":[{"name":"taxpayer_name","type":"text","label":"Налогоплательщик","required":true},{"name":"taxpayer_inn","type":"text","label":"ИНН налогоплательщика","required":true},{"name":"tax_authority","type":"text","label":"Налоговый орган","required":true},{"name":"client_goal","type":"select","label":"Цель подготовки ответа","options":["Предоставить документы","Предоставить пояснения","Оспорить/ограничить требование","Запросить продление срока","Снизить риски раскрытия информации","Иное"],"required":true}]},{"id":"request_details","title":"2. Требование ФНС","fields":[{"name":"request_type","type":"select","label":"Вид требования","options":["Камеральная проверка","Выездная проверка","Встречная проверка","Истребование документов","Пояснения","НДС-разрывы / расхождения","Иное"],"required":true},{"name":"request_date","type":"text","label":"Дата требования","required":true},{"name":"request_number","type":"text","label":"Номер требования"},{"name":"response_deadline","type":"text","label":"Срок ответа","required":true},{"name":"legal_basis_in_request","type":"textarea","label":"На какие нормы ссылается ФНС"}]},{"id":"requested_info","title":"3. Запрашиваемая информация","fields":[{"name":"requested_information","type":"textarea","label":"Что именно требует ФНС","required":true},{"name":"requested_documents","type":"textarea","label":"Какие документы запрошены"},{"name":"requested_explanations","type":"textarea","label":"Какие пояснения запрошены"},{"name":"related_counterparties","type":"textarea","label":"Какие контрагенты / операции затронуты"}]},{"id":"legality","title":"4. Законность и пределы требования","fields":[{"name":"is_request_lawful","type":"textarea","label":"Есть ли сомнения в законности требования"},{"name":"excessive_scope","type":"textarea","label":"Есть ли признаки чрезмерного объёма запроса"},{"name":"not_related_info","type":"textarea","label":"Запрошены ли сведения, не относящиеся к проверке"},{"name":"possible_refusal_arguments","type":"textarea","label":"Возможные основания отказа / ограничения ответа"}]},{"id":"risk_assessment","title":"5. Риски ответа","fields":[{"name":"disclosure_risks","type":"textarea","label":"Риски предоставления информации"},{"name":"non_response_risks","type":"textarea","label":"Риски непредоставления / неполного ответа"},{"name":"tax_risks_identified","type":"textarea","label":"Какие налоговые риски выявлены из требования"},{"name":"risk_level","type":"select","label":"Предварительный уровень риска","options":["Низкий","Средний","Высокий","Критический","Недостаточно данных"]}]},{"id":"response_strategy","title":"6. Стратегия ответа","fields":[{"name":"response_strategy","type":"textarea","label":"Стратегия ответа на требование"},{"name":"documents_to_provide","type":"textarea","label":"Какие документы предоставить"},{"name":"documents_to_withhold_or_limit","type":"textarea","label":"Какие документы не предоставлять / ограничить"},{"name":"extension_request_needed","type":"textarea","label":"Нужно ли просить продление срока"}]},{"id":"draft_content","title":"7. Содержание ответа","fields":[{"name":"main_response_text","type":"textarea","label":"Основной текст позиции для ответа"},{"name":"legal_arguments","type":"textarea","label":"Правовые аргументы"},{"name":"attachments_list","type":"textarea","label":"Перечень приложений"},{"name":"reservation_clauses","type":"textarea","label":"Оговорки и формулировки для снижения рисков"}]}]},"jurisdiction":"RU","display_order":120,"template_code":"tax_fns_request_response","required_fields":["taxpayer_name","taxpayer_inn","tax_authority","request_type","request_date","response_deadline","requested_information","client_goal"]},{"id":"7d918c7d-7b8c-4a3d-a057-459de26c2e87","title":"Опросник для анализа налоговой реконструкции","category":"tax","language":"ru","metadata":{"tax_article":"54.1","practice_area":"tax","document_family":"tax_reconstruction","generation_type":"standalone"},"is_active":true,"created_at":"2026-06-13T13:31:51.49397+00:00","sort_order":11,"updated_at":"2026-06-16T13:24:33.368748+00:00","description":"Сбор данных для оценки возможности налоговой реконструкции: реальный исполнитель, фактические расходы, документы, рыночность цены и действительная налоговая обязанность.","is_featured":true,"schema_json":{"steps":[{"id":"basic","title":"Основные данные","fields":[{"name":"taxpayer_name","type":"text","label":"Наименование налогоплательщика","required":true},{"name":"taxpayer_inn","type":"text","label":"ИНН","required":true},{"name":"tax_period","type":"text","label":"Налоговый период","required":false},{"name":"tax_type","type":"multiselect","label":"Налог","options":[{"label":"НДС","value":"vat"},{"label":"Налог на прибыль","value":"profit_tax"},{"label":"УСН","value":"usn"},{"label":"Иное","value":"other"}],"required":true}]},{"id":"fns_position","title":"Позиция ФНС","fields":[{"name":"fns_position","type":"textarea","label":"В чём позиция ФНС","required":true},{"name":"fns_denial_type","type":"multiselect","label":"Что именно сняла / доначислила ФНС","options":[{"label":"Вычеты НДС","value":"vat_deductions"},{"label":"Расходы по налогу на прибыль","value":"profit_expenses"},{"label":"Полностью исключила операцию","value":"full_operation_denial"},{"label":"Признала контрагента техническим","value":"counterparty_denial"},{"label":"Дробление бизнеса","value":"business_splitting"}],"required":false}]},{"id":"real_operation","title":"Реальность операции","fields":[{"name":"real_operation_confirmed","type":"select","label":"Фактическое исполнение операции подтверждается?","options":[{"label":"Да","value":"yes"},{"label":"Частично","value":"partly"},{"label":"Нет","value":"no"},{"label":"Нужно анализировать","value":"unknown"}],"required":true},{"name":"actual_goods_services","type":"textarea","label":"Что реально было поставлено / выполнено","required":false},{"name":"actual_supplier","type":"textarea","label":"Кто фактически поставил товар / оказал услуги","required":false}]},{"id":"expenses","title":"Фактические расходы","fields":[{"name":"contract_price","type":"money","label":"Цена по документам","required":false},{"name":"actual_expenses","type":"money","label":"Фактически понесённые расходы","required":false},{"name":"market_price_evidence","type":"textarea","label":"Есть ли подтверждение рыночной цены","required":false}]},{"id":"documents","title":"Документы и доказательства","fields":[{"name":"available_documents","type":"multiselect","label":"Какие документы есть","options":[{"label":"Договор","value":"contract"},{"label":"Акты","value":"acts"},{"label":"Счета-фактуры","value":"invoices"},{"label":"Платежи","value":"payments"},{"label":"Переписка","value":"correspondence"},{"label":"Складские документы","value":"warehouse"},{"label":"Транспортные документы","value":"transport"},{"label":"Отчёты / результат работ","value":"reports"}],"required":false},{"name":"uploaded_documents","type":"file_upload","label":"Загрузите документы","required":false}]},{"id":"client_goal","title":"Цель клиента","fields":[{"name":"client_goal","type":"select","label":"Что нужно получить","options":[{"label":"Оценить возможность реконструкции","value":"reconstruction_opinion"},{"label":"Подготовить аргумент для возражений","value":"objections_argument"},{"label":"Подготовить аргумент для жалобы","value":"appeal_argument"},{"label":"Подготовить позицию для суда","value":"court_position"}],"required":true},{"name":"special_instructions","type":"textarea","label":"Особые указания","required":false}]}],"warnings":["Налоговая реконструкция требует подтверждения реального экономического содержания операции.","Без фактических расходов, реального исполнителя и доказательств исполнения вывод будет предварительным.","AI не должен придумывать судебную практику, письма ФНС, номера дел или правовые позиции без подтверждённых источников."]},"jurisdiction":"RU","display_order":20,"template_code":"tax_reconstruction_analysis","required_fields":["taxpayer_name","taxpayer_inn","tax_type","fns_position","real_operation_confirmed","client_goal"]},{"id":"db4c05f8-0d2f-415b-9e21-19238a8dd421","title":"Опросник для жалобы в УФНС","category":"tax","language":"ru","metadata":{"legal_focus":["НК РФ ст. 101","НК РФ ст. 138","НК РФ ст. 139","НК РФ ст. 139.1","досудебное обжалование"],"practice_area":"tax","document_family":"tax_appeal","generation_type":"standalone"},"is_active":true,"created_at":"2026-06-13T19:10:07.462026+00:00","sort_order":13,"updated_at":"2026-06-16T13:24:33.368748+00:00","description":"Сбор данных для подготовки досудебной жалобы в УФНС на решение налогового органа: решение, сроки, суммы, доводы, доказательства и требования заявителя.","is_featured":true,"schema_json":{"steps":[{"id":"taxpayer","title":"Налогоплательщик","fields":[{"name":"taxpayer_name","type":"text","label":"Наименование налогоплательщика","required":true},{"name":"taxpayer_inn","type":"text","label":"ИНН","required":true},{"name":"taxpayer_ogrn","type":"text","label":"ОГРН / ОГРНИП","required":false},{"name":"taxpayer_address","type":"address","label":"Адрес налогоплательщика","required":false},{"name":"representative","type":"text","label":"Представитель / юрист","required":false}]},{"id":"decision","title":"Обжалуемое решение ФНС","fields":[{"name":"tax_authority","type":"text","label":"Налоговый орган, вынесший решение","required":true},{"name":"decision_number","type":"text","label":"Номер решения","required":true},{"name":"decision_date","type":"date","label":"Дата решения","required":true},{"name":"decision_received_date","type":"date","label":"Дата получения решения","required":false},{"name":"appeal_deadline","type":"date","label":"Срок подачи жалобы","required":false}]},{"id":"audit_context","title":"Контекст проверки","fields":[{"name":"audit_type","type":"select","label":"Вид проверки","options":[{"label":"Камеральная проверка","value":"camera_audit"},{"label":"Выездная проверка","value":"onsite_audit"},{"label":"Дополнительные мероприятия налогового контроля","value":"additional_control"},{"label":"Иное","value":"other"}],"required":false},{"name":"audit_period","type":"text","label":"Проверяемый период","required":false},{"name":"act_number","type":"text","label":"Номер акта проверки","required":false},{"name":"act_date","type":"date","label":"Дата акта проверки","required":false}]},{"id":"taxes_amounts","title":"Налоги и суммы","fields":[{"name":"tax_type","type":"multiselect","label":"Налоги","options":[{"label":"НДС","value":"vat"},{"label":"Налог на прибыль","value":"profit_tax"},{"label":"НДФЛ","value":"personal_income_tax"},{"label":"Страховые взносы","value":"insurance_contributions"},{"label":"УСН","value":"usn"},{"label":"Иное","value":"other"}],"required":true},{"name":"additional_tax_amount","type":"money","label":"Доначисленный налог","required":false},{"name":"penalties_amount","type":"money","label":"Пени","required":false},{"name":"fine_amount","type":"money","label":"Штраф","required":false},{"name":"total_amount","type":"money","label":"Общая сумма к обжалованию","required":false}]},{"id":"fns_arguments","title":"Доводы налогового органа","fields":[{"name":"fns_arguments","type":"textarea","label":"Кратко изложите позицию ФНС","required":false},{"name":"fns_claims","type":"multiselect","label":"Основные основания решения","options":[{"label":"Ст. 54.1 НК РФ","value":"54_1"},{"label":"Технический контрагент","value":"technical_counterparty"},{"label":"Нереальность операций","value":"unreal_operation"},{"label":"Отказ в вычете НДС","value":"vat_deduction_denial"},{"label":"Исключение расходов","value":"expense_denial"},{"label":"Дробление бизнеса","value":"business_splitting"},{"label":"Формальный документооборот","value":"formal_documents"},{"label":"Отсутствие деловой цели","value":"no_business_purpose"}],"required":false}]},{"id":"client_position","title":"Позиция налогоплательщика","fields":[{"name":"client_position","type":"textarea","label":"Позиция налогоплательщика","required":true},{"name":"main_arguments","type":"textarea","label":"Основные доводы жалобы","required":false},{"name":"weak_points","type":"textarea","label":"Риски и слабые места","required":false}]},{"id":"procedural_violations","title":"Процессуальные нарушения","fields":[{"name":"procedural_violations","type":"multiselect","label":"Какие нарушения допущены ФНС","options":[{"label":"Нарушения ст. 88 НК РФ","value":"88_violation"},{"label":"Нарушения ст. 89 НК РФ","value":"89_violation"},{"label":"Нарушения ст. 93 НК РФ","value":"93_violation"},{"label":"Нарушения ст. 93.1 НК РФ","value":"93_1_violation"},{"label":"Нарушения ст. 100 НК РФ","value":"100_violation"},{"label":"Нарушения ст. 101 НК РФ","value":"101_violation"},{"label":"Не исследованы доказательства","value":"unexamined_evidence"},{"label":"Нарушены сроки","value":"deadline_violation"}],"required":false},{"name":"procedural_violation_details","type":"textarea","label":"Описание процессуальных нарушений","required":false}]},{"id":"evidence","title":"Доказательства","fields":[{"name":"available_evidence","type":"multiselect","label":"Какие доказательства есть","options":[{"label":"Договоры","value":"contracts"},{"label":"Акты","value":"acts"},{"label":"Счета-фактуры","value":"invoices"},{"label":"Платежи","value":"payments"},{"label":"Переписка","value":"correspondence"},{"label":"Складские документы","value":"warehouse"},{"label":"Транспортные документы","value":"transport"},{"label":"Отчёты","value":"reports"},{"label":"Экспертное заключение","value":"expert_opinion"},{"label":"Судебная практика","value":"court_practice"}],"required":false},{"name":"missing_evidence","type":"textarea","label":"Каких доказательств не хватает","required":false}]},{"id":"appeal_goal","title":"Требования к УФНС","fields":[{"name":"appeal_goal","type":"multiselect","label":"Что просим у УФНС","options":[{"label":"Отменить решение полностью","value":"cancel_decision_full"},{"label":"Отменить решение частично","value":"cancel_decision_part"},{"label":"Снизить доначисления","value":"reduce_tax"},{"label":"Отменить штраф","value":"remove_fine"},{"label":"Направить на новое рассмотрение","value":"send_for_new_review"}],"required":true},{"name":"special_instructions","type":"textarea","label":"Особые указания","required":false}]},{"id":"documents","title":"Документы","fields":[{"name":"appeal_documents","type":"file_upload","label":"Загрузите решение, акт, возражения, документы и доказательства","required":false},{"name":"document_comments","type":"textarea","label":"Комментарии к документам","required":false}]}],"warnings":["Жалоба в УФНС должна учитывать сроки и порядок досудебного обжалования.","Необходимо проверить дату получения решения и срок подачи жалобы.","AI не должен придумывать судебную практику, письма ФНС, даты, номера дел или нормы.","Доводы должны быть связаны с конкретными фактами, документами и нарушениями ФНС."]},"jurisdiction":"RU","display_order":60,"template_code":"tax_ufns_appeal","required_fields":["taxpayer_name","taxpayer_inn","tax_authority","decision_number","decision_date","tax_type","appeal_goal","client_position"]}]$intake$::jsonb) as x(
  id uuid,
  template_code text,
  jurisdiction text,
  language text,
  title text,
  description text,
  schema_json jsonb,
  required_fields text[],
  is_active boolean,
  sort_order integer,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  category text,
  display_order integer,
  is_featured boolean
);

-- =============================================================================
-- 5. Auth trigger and storage runtime configuration
-- =============================================================================

-- KATI LAWYER auth/storage runtime configuration snapshot
-- Extracted read-only from production and replay-tested only on disposable Preview.
-- QUARANTINE: do not apply to production or move into supabase/migrations yet.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('communication-attachments', 'communication-attachments', false, null, null),
  ('hero', 'hero', true, null, null),
  ('lead-documents', 'lead-documents', false, null, null)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins can delete communication-attachments" ON storage.objects;
CREATE POLICY "Admins can delete communication-attachments" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'communication-attachments' AND public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins can read communication-attachments" ON storage.objects;
CREATE POLICY "Admins can read communication-attachments" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'communication-attachments' AND public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update communication-attachments" ON storage.objects;
CREATE POLICY "Admins can update communication-attachments" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'communication-attachments' AND public.is_admin_or_superadmin(auth.uid()))
WITH CHECK (bucket_id = 'communication-attachments' AND public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins can upload communication-attachments" ON storage.objects;
CREATE POLICY "Admins can upload communication-attachments" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'communication-attachments' AND public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete hero images" ON storage.objects;
CREATE POLICY "Admins can delete hero images" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'hero' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can list hero images" ON storage.objects;
CREATE POLICY "Admins can list hero images" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'hero' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update hero images" ON storage.objects;
CREATE POLICY "Admins can update hero images" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'hero' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can upload hero images" ON storage.objects;
CREATE POLICY "Admins can upload hero images" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'hero' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins delete lead documents" ON storage.objects;
CREATE POLICY "Admins delete lead documents" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'lead-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Admins read lead documents" ON storage.objects;
CREATE POLICY "Admins read lead documents" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'lead-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Admins upload lead documents" ON storage.objects;
CREATE POLICY "Admins upload lead documents" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'lead-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "admins can view lead documents files" ON storage.objects;
CREATE POLICY "admins can view lead documents files" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'lead-documents' AND public.is_admin_or_superadmin(auth.uid()));

-- =============================================================================
-- 6. Canonical Relations observational tables
-- =============================================================================

create table public.document_intake_canonical_shadow_runs (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null
    references public.document_intake_ai_runs(id)
    on delete cascade,
  analysis_version integer not null check (analysis_version > 0),
  status text not null check (status in ('succeeded', 'projection_failed')),
  schema_version smallint not null check (schema_version > 0),
  claim_count integer,
  relation_count integer,
  unique_relation_count integer,
  skipped_count integer,
  duration_ms integer,
  relations jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  constraint document_intake_canonical_shadow_runs_analysis_run_unique
    unique (analysis_run_id),
  constraint document_intake_canonical_shadow_runs_nonnegative_counts
    check (
      (claim_count is null or claim_count >= 0)
      and (relation_count is null or relation_count >= 0)
      and (unique_relation_count is null or unique_relation_count >= 0)
      and (skipped_count is null or skipped_count >= 0)
      and (duration_ms is null or duration_ms >= 0)
    ),
  constraint document_intake_canonical_shadow_runs_result_shape
    check (
      (
        status = 'succeeded'
        and claim_count is not null
        and relation_count is not null
        and unique_relation_count is not null
        and skipped_count is not null
        and duration_ms is not null
        and relations is not null
        and jsonb_typeof(relations) = 'array'
        and error_code is null
        and relation_count <= claim_count
        and unique_relation_count <= relation_count
      )
      or
      (
        status = 'projection_failed'
        and claim_count is null
        and relation_count is null
        and unique_relation_count is null
        and skipped_count is null
        and duration_ms is null
        and relations is null
        and error_code = 'projection_failed'
      )
    )
);

create index document_intake_canonical_shadow_runs_created_at_idx
  on public.document_intake_canonical_shadow_runs (created_at desc);
create index document_intake_canonical_shadow_runs_status_created_at_idx
  on public.document_intake_canonical_shadow_runs (status, created_at desc);
create index document_intake_canonical_shadow_runs_analysis_version_idx
  on public.document_intake_canonical_shadow_runs (analysis_version);

alter table public.document_intake_canonical_shadow_runs enable row level security;

revoke all on table public.document_intake_canonical_shadow_runs from anon, authenticated;
grant select, insert, update, delete
  on table public.document_intake_canonical_shadow_runs to service_role;

create table public.document_intake_canonical_consumer_observations (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid null references public.document_intake_ai_runs(id) on delete cascade,
  analysis_version integer null check (analysis_version is null or analysis_version > 0),
  schema_version smallint null check (schema_version is null or schema_version > 0),
  observer_version smallint not null check (observer_version > 0),
  outcome text not null check (outcome in ('match', 'mismatch', 'fallback')),
  fallback_reason text null,
  mismatch_reasons jsonb not null default '[]'::jsonb,
  claim_count integer null, relation_count integer null, unique_relation_count integer null,
  legacy_claim_count integer null, legacy_relation_count integer null, legacy_unique_relation_count integer null,
  ordered_equality boolean null, duplicate_equality boolean null, coverage_equality boolean null,
  identity_equality boolean null, per_conclusion_equality boolean null, reverse_index_equality boolean null,
  observed_at timestamptz not null default now(),
  constraint canonical_consumer_observations_nonnegative_counts check (
    (claim_count is null or claim_count >= 0) and (relation_count is null or relation_count >= 0)
    and (unique_relation_count is null or unique_relation_count >= 0)
    and (legacy_claim_count is null or legacy_claim_count >= 0)
    and (legacy_relation_count is null or legacy_relation_count >= 0)
    and (legacy_unique_relation_count is null or legacy_unique_relation_count >= 0)),
  constraint canonical_consumer_observations_mismatch_reasons_array check (jsonb_typeof(mismatch_reasons) = 'array'),
  constraint canonical_consumer_observations_outcome_shape check (
    (outcome = 'fallback' and fallback_reason is not null and jsonb_array_length(mismatch_reasons) = 0
      and ordered_equality is null and duplicate_equality is null and coverage_equality is null
      and identity_equality is null and per_conclusion_equality is null and reverse_index_equality is null)
    or (outcome = 'match' and fallback_reason is null and jsonb_array_length(mismatch_reasons) = 0
      and ordered_equality is true and duplicate_equality is true and coverage_equality is true
      and identity_equality is true and per_conclusion_equality is true and reverse_index_equality is true)
    or (outcome = 'mismatch' and fallback_reason is null and jsonb_array_length(mismatch_reasons) > 0
      and ordered_equality is not null and duplicate_equality is not null and coverage_equality is not null
      and identity_equality is not null and per_conclusion_equality is not null and reverse_index_equality is not null))
);
create index canonical_consumer_observations_observed_at_idx on public.document_intake_canonical_consumer_observations (observed_at desc);
create index canonical_consumer_observations_outcome_observed_at_idx on public.document_intake_canonical_consumer_observations (outcome, observed_at desc);
create index canonical_consumer_observations_fallback_reason_idx on public.document_intake_canonical_consumer_observations (fallback_reason) where fallback_reason is not null;
create index canonical_consumer_observations_versions_idx on public.document_intake_canonical_consumer_observations (analysis_version, schema_version, observer_version);
create index canonical_consumer_observations_analysis_run_idx on public.document_intake_canonical_consumer_observations (analysis_run_id) where analysis_run_id is not null;
alter table public.document_intake_canonical_consumer_observations enable row level security;
revoke all on table public.document_intake_canonical_consumer_observations from anon, authenticated;
grant select, insert, delete on table public.document_intake_canonical_consumer_observations to service_role;

-- =============================================================================
-- 7. T0-B registry synchronization
-- =============================================================================

-- T0-B: align the reproducible canonical template registry with the
-- read-only production snapshot captured on 2026-08-06.
--
-- public.legal_document_templates is the canonical catalog. The legacy
-- public.document_templates table remains unchanged for CRM compatibility.

INSERT INTO public.legal_document_templates (
  code,
  title,
  category,
  subcategory,
  practice_area,
  jurisdiction,
  languages,
  complexity,
  is_active,
  requires_intake,
  description,
  sort_order,
  metadata
) VALUES
  ('corporate_50_50_agreement', 'Корпоративное соглашение 50/50', 'INTERNATIONAL_CORPORATE', 'governance', 'international_corporate', ARRAY['CY','IL','GE','RU'], ARRAY['ru','en'], 'expert', true, true, 'Корпоративное соглашение между двумя участниками 50/50 с регулированием голосования, deadlock, продажи долей, выхода участников, передачи акций, защиты IP и разрешения споров.', 1, '{}'::jsonb),
  ('tax_54_1_risk_opinion', 'Заключение по рискам ст. 54.1 НК РФ', 'TAX', '54_1', 'tax', ARRAY['RU'], ARRAY['ru'], 'expert', true, true, 'Анализ реальности операций, деловой цели, контрагентов и налоговой выгоды.', 10, '{}'::jsonb),
  ('tax_reconstruction_analysis', 'Анализ налоговой реконструкции', 'TAX', '54_1', 'tax', ARRAY['RU'], ARRAY['ru'], 'expert', true, true, 'Анализ возможности налоговой реконструкции по спорам о необоснованной налоговой выгоде, ст. 54.1 НК РФ, реальности операций и определении действительных налоговых обязательств.', 20, '{"tax_stage":"54_1","legal_focus":["налоговая реконструкция","НК РФ ст. 54.1","реальность операций","действительный размер налоговой обязанности","расходы","вычеты НДС"]}'::jsonb),
  ('tax_evidence_matrix', 'Матрица доказательств по налоговому спору', 'TAX', 'evidence', 'tax', ARRAY['RU'], ARRAY['ru'], 'expert', true, true, 'Таблица доказательств: факт, документ, источник, риск, пробел, действие.', 30, '{"tax_stage":"evidence","legal_focus":["доказательства","первичные документы","контрагенты","риски"]}'::jsonb),
  ('tax_audit_objections_extended', 'Возражения на акт налоговой проверки — расширенные', 'TAX', 'audit_objections', 'tax', ARRAY['RU'], ARRAY['ru'], 'expert', true, true, 'Развёрнутые возражения на акт налоговой проверки.', 40, '{}'::jsonb),
  ('tax_decision_analysis', 'Анализ решения налогового органа', 'TAX', 'decision', 'tax', ARRAY['RU'], ARRAY['ru'], 'expert', true, true, 'Анализ решения ФНС по результатам проверки: выводы, нарушения, сроки, основания для обжалования.', 50, '{"tax_stage":"decision","legal_focus":["НК РФ ст. 101","обжалование","сроки","доказательства"]}'::jsonb),
  ('tax_ufns_appeal', 'Жалоба в УФНС', 'TAX', 'appeal', 'tax', ARRAY['RU'], ARRAY['ru'], 'expert', true, true, 'Досудебная жалоба на решение налогового органа.', 60, '{}'::jsonb),
  ('tax_business_splitting_analysis', 'Анализ рисков дробления бизнеса', 'TAX', '54_1', 'tax', ARRAY['RU'], ARRAY['ru'], 'expert', true, true, 'Оценка признаков дробления бизнеса.', 70, '{}'::jsonb),
  ('tax_strategy_memo', 'Стратегия защиты по налоговому спору', 'TAX', 'strategy', 'tax', ARRAY['RU'], ARRAY['ru'], 'expert', true, true, 'План защиты: риски, доказательства, сроки, документы.', 90, '{}'::jsonb),
  ('tax_court_position', 'Правовая позиция для арбитражного суда по налоговому спору', 'TAX', 'court', 'tax', ARRAY['RU'], ARRAY['ru'], 'expert', true, true, 'Правовая позиция налогоплательщика для арбитражного суда.', 100, '{"tax_stage":"court","legal_focus":["арбитраж","оспаривание решения ФНС","доказательства","позиция"]}'::jsonb),
  ('tax_arbitration_claim', 'Заявление в арбитражный суд по налоговому спору', 'TAX', 'court', 'tax', ARRAY['RU'], ARRAY['ru'], 'expert', true, true, 'Оспаривание решения ФНС в арбитражном суде.', 110, '{}'::jsonb),
  ('tax_counterparty_due_diligence', 'Проверка контрагента для налогового спора', 'TAX', 'counterparty', 'tax', ARRAY['RU'], ARRAY['ru'], 'advanced', true, true, 'Проверка контрагента: реальность деятельности, ресурсы, документы, деловая цель, налоговые риски.', 140, '{"tax_stage":"preparation","legal_focus":["контрагент","осмотрительность","реальность операций","54.1"]}'::jsonb),
  ('tax_camera_audit_response', 'Ответ на требование ФНС при камеральной проверке', 'TAX', 'camera_audit', 'tax', ARRAY['RU'], ARRAY['ru'], 'advanced', true, true, 'Ответ на требование ФНС по камеральной налоговой проверке.', 801, '{}'::jsonb),
  ('tax_vat_explanations', 'Пояснения по НДС', 'TAX', 'vat', 'tax', ARRAY['RU'], ARRAY['ru'], 'advanced', true, true, 'Пояснения по НДС, расхождениям, вычетам и контрагентам.', 802, '{}'::jsonb),
  ('tax_request_legality_analysis', 'Анализ законности требования ФНС', 'TAX', 'request', 'tax', ARRAY['RU'], ARRAY['ru'], 'advanced', true, true, 'Проверка законности требования ФНС.', 805, '{}'::jsonb),
  ('tax_additional_control_objections', 'Возражения на дополнительные мероприятия налогового контроля', 'TAX', 'additional_control', 'tax', ARRAY['RU'], ARRAY['ru'], 'expert', true, true, 'Возражения по результатам дополнительных мероприятий налогового контроля.', 816, '{"tax_stage":"additional_measures","legal_focus":["дополнительные мероприятия","акт проверки","возражения"]}'::jsonb),
  ('tax_54_1_defense_strategy', 'Стратегия защиты по ст. 54.1 НК РФ', 'TAX', '54_1', 'tax', ARRAY['RU'], ARRAY['ru'], 'expert', true, true, 'Стратегия защиты по спорам о необоснованной налоговой выгоде, реальности операций и деловой цели.', 817, '{"tax_stage":"strategy","legal_focus":["НК РФ ст. 54.1","реальность операций","деловая цель","контрагенты"]}'::jsonb),
  ('tax_document_submission_registry', 'Реестр документов для передачи в ФНС', 'TAX', 'request', 'tax', ARRAY['RU'], ARRAY['ru'], 'basic', true, true, 'Реестр документов, передаваемых в налоговый орган по требованию.', 821, '{"tax_stage":"request","legal_focus":["требование ФНС","реестр документов","сопроводительное письмо"]}'::jsonb)
ON CONFLICT (code) DO NOTHING;

UPDATE public.legal_document_templates
SET title = 'Возражения на акт налоговой проверки — базовые'
WHERE code = 'objections_tax_audit';

UPDATE public.legal_document_templates
SET sort_order = CASE code
  WHEN 'tax_due_diligence' THEN 80
  WHEN 'response_to_tax_request' THEN 120
  WHEN 'tax_explanations' THEN 130
END
WHERE code IN ('tax_due_diligence', 'response_to_tax_request', 'tax_explanations');

UPDATE public.legal_document_templates
SET
  is_active = false,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'deprecated', true,
    'replacement_code', CASE code
      WHEN 'tax_complaint' THEN 'tax_ufns_appeal'
      WHEN 'tax_refund_application' THEN 'tax_offset_application'
      WHEN 'tax_strategy' THEN 'tax_strategy_memo'
    END,
    'deprecated_reason', 'Duplicate tax template; kept for backward compatibility'
  )
WHERE code IN ('tax_complaint', 'tax_refund_application', 'tax_strategy');

-- =============================================================================
-- 8. Deprecated-template session restore
-- =============================================================================

-- Allow an authenticated user to read an inactive template only when the
-- user's existing RLS access to document_intake_sessions exposes a saved
-- session that uses that template code. The active catalog policy remains
-- unchanged, and getTemplates() still filters to is_active = true.

CREATE POLICY "Authenticated can view templates used by accessible intake sessions"
  ON public.legal_document_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.document_intake_sessions AS intake_session
      WHERE intake_session.template_code = legal_document_templates.code
    )
  );

-- =============================================================================
-- 9. T0-C flagship metadata
-- =============================================================================

-- T0-C: mark the five approved flagship templates in the canonical registry.
--
-- This migration is registry-only. It intentionally does not change UI code,
-- template consumers, or the legacy public.document_templates table.

DO $guard$
DECLARE
  matched_count integer;
BEGIN
  WITH expected(code, flagship_rank) AS (
    VALUES
      ('response_to_tax_request', 1),
      ('tax_explanations', 2),
      ('tax_vat_explanations', 3),
      ('tax_strategy_memo', 4),
      ('tax_court_position', 5)
  )
  SELECT count(template.code)
  INTO matched_count
  FROM expected
  LEFT JOIN public.legal_document_templates AS template
    ON template.code = expected.code;

  IF matched_count <> 5 THEN
    RAISE EXCEPTION
      'T0-C aborted: expected all five exact flagship template codes, found %',
      matched_count;
  END IF;
END;
$guard$;

WITH flagship(code, title, flagship_rank) AS (
  VALUES
    ('response_to_tax_request', 'Ответ на требование ФНС', 1),
    ('tax_explanations', 'Пояснения в ФНС', 2),
    ('tax_vat_explanations', 'Пояснения по НДС', 3),
    ('tax_strategy_memo', 'Стратегия защиты по налоговому спору', 4),
    ('tax_court_position', 'Позиция в суд', 5)
)
UPDATE public.legal_document_templates AS template
SET
  title = flagship.title,
  sort_order = flagship.flagship_rank,
  metadata = COALESCE(template.metadata, '{}'::jsonb) || jsonb_build_object(
    'flagship', true,
    'flagship_rank', flagship.flagship_rank
  )
FROM flagship
WHERE template.code = flagship.code;

-- =============================================================================
-- 10. Least-privilege grants and policy narrowing
-- =============================================================================

-- KATI LAWYER: least-privilege grants candidate
-- Date: 2026-08-15
--
-- QUARANTINE ONLY. This file is not an active Supabase migration.
-- It must be replayed and application-tested on a disposable branch before it
-- can be considered for supabase/migrations. Do not run on production directly.

-- Remove implicit Data API access. RLS alone is not a replacement for object
-- privileges: both layers must permit an operation.
revoke all privileges on all tables in schema public from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- These administrative ALL policies were created TO PUBLIC. That makes anon
-- evaluate their admin-check functions even when a separate public SELECT/INSERT
-- policy exists. Restrict the administrative policies to authenticated instead
-- of exposing SECURITY DEFINER role checks to anon.
alter policy "Admins can manage document_intake_ai_runs"
  on public.document_intake_ai_runs to authenticated;
alter policy "Admins can manage document_intake_answers"
  on public.document_intake_answers to authenticated;
alter policy "Admins can manage document_intake_sessions"
  on public.document_intake_sessions to authenticated;
alter policy "Admins can manage reviews"
  on public.external_reviews to authenticated;
alter policy "Admins can manage seo pages"
  on public.seo_pages to authenticated;
alter policy "Anyone can submit a lead"
  on public.leads to authenticated;

-- service_role is used by trusted Edge Functions and backend jobs. It does not
-- need schema-changing privileges such as REFERENCES, TRIGGER, or TRUNCATE.
do $grant_service_role$
declare
  item record;
begin
  for item in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format(
      'grant select, insert, update, delete on table public.%I to service_role',
      item.relname
    );
  end loop;

  for item in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    execute format('grant select on table public.%I to service_role', item.relname);
  end loop;
end
$grant_service_role$;

grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Browser-accessible anonymous surface. These four operations are the only
-- ones supported by explicit public/anon RLS policies and current application
-- behavior.
grant insert on table public.property_search_requests to anon;
grant select on table public.external_reviews to anon;
grant select on table public.seo_pages to anon;
grant select on table public.site_settings to anon;

-- Grant authenticated table operations only when an authenticated or PUBLIC
-- RLS policy exists for that command. Remaining PUBLIC policies are intentional
-- public reads; this grants the object-level prerequisite only.
do $grant_authenticated_from_policies$
declare
  item record;
begin
  for item in
    select distinct tablename
    from pg_policies
    where schemaname = 'public'
      and ('authenticated' = any(roles) or 'public' = any(roles))
      and cmd in ('ALL', 'SELECT')
  loop
    execute format('grant select on table public.%I to authenticated', item.tablename);
  end loop;

  for item in
    select distinct tablename
    from pg_policies
    where schemaname = 'public'
      and ('authenticated' = any(roles) or 'public' = any(roles))
      and cmd in ('ALL', 'INSERT')
  loop
    execute format('grant insert on table public.%I to authenticated', item.tablename);
  end loop;

  for item in
    select distinct tablename
    from pg_policies
    where schemaname = 'public'
      and ('authenticated' = any(roles) or 'public' = any(roles))
      and cmd in ('ALL', 'UPDATE')
  loop
    execute format('grant select, update on table public.%I to authenticated', item.tablename);
  end loop;

  for item in
    select distinct tablename
    from pg_policies
    where schemaname = 'public'
      and ('authenticated' = any(roles) or 'public' = any(roles))
      and cmd in ('ALL', 'DELETE')
  loop
    execute format('grant delete on table public.%I to authenticated', item.tablename);
  end loop;
end
$grant_authenticated_from_policies$;

-- All eight views are security_invoker=true and are authenticated workspace
-- surfaces. The underlying tables remain protected by their own grants + RLS.
do $grant_authenticated_views$
declare
  item record;
begin
  for item in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v', 'm')
  loop
    execute format('grant select on table public.%I to authenticated', item.relname);
  end loop;
end
$grant_authenticated_views$;

-- v_legal_sources_catalog references this RLS-enabled table. SELECT is needed
-- for the security-invoker view to execute, while the absence of an RLS policy
-- still denies direct rows from this source.
grant select on table public.legal_knowledge_chunks to authenticated;

grant usage on sequence public.leads_lead_number_seq to authenticated;

-- RPC surface used by the authenticated application and its RLS policies.
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_admin_or_superadmin(uuid) to authenticated;
grant execute on function public.archive_document_intake_session(uuid) to authenticated;
grant execute on function public.restore_document_intake_session(uuid) to authenticated;

-- match_legal_* is called by analyze-document-legal-position with the service
-- role key. Trigger helpers are not browser RPC endpoints. They therefore keep
-- service_role/postgres execution only.

-- Prevent newly created objects owned by postgres from silently reintroducing
-- broad Data API access. Future migrations must grant intended access explicitly.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

-- Preview replay prerequisite for the existing GARANT NK importer.
-- Matches the deployed namespace-limited writer surface; no legal data copied.
GRANT USAGE ON SCHEMA public TO kati_internal_kb_writer;
GRANT SELECT, INSERT, UPDATE ON public.legal_law_chunks TO kati_internal_kb_writer;
CREATE POLICY kati_garant_nk_writer_select ON public.legal_law_chunks
  FOR SELECT TO kati_internal_kb_writer
  USING (metadata->>'source_namespace' = 'garant_user_supplied_nk');
CREATE POLICY kati_garant_nk_writer_insert ON public.legal_law_chunks
  FOR INSERT TO kati_internal_kb_writer
  WITH CHECK (metadata->>'source_namespace' = 'garant_user_supplied_nk');
CREATE POLICY kati_garant_nk_writer_update ON public.legal_law_chunks
  FOR UPDATE TO kati_internal_kb_writer
  USING (metadata->>'source_namespace' = 'garant_user_supplied_nk')
  WITH CHECK (metadata->>'source_namespace' = 'garant_user_supplied_nk');
