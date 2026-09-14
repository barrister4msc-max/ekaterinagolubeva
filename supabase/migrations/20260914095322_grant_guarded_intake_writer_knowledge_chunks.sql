-- Tracks the Production migration applied on 2026-09-14.
-- Preview databases do not necessarily carry the internal workflow role.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kati_internal_kb_writer') THEN
    GRANT SELECT, INSERT ON TABLE public.legal_knowledge_chunks TO kati_internal_kb_writer;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'legal_knowledge_chunks'
        AND policyname = 'kati_internal_kb_writer_guarded_snapshot_select'
    ) THEN
      EXECUTE $policy$
        CREATE POLICY kati_internal_kb_writer_guarded_snapshot_select
          ON public.legal_knowledge_chunks
          FOR SELECT
          TO kati_internal_kb_writer
          USING (
            metadata->>'ingest_mode' = 'existing_storage_guarded'
            AND metadata->>'source_class' = 'user_supplied_retrieval_snapshot'
          )
      $policy$;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'legal_knowledge_chunks'
        AND policyname = 'kati_internal_kb_writer_guarded_snapshot_insert'
    ) THEN
      EXECUTE $policy$
        CREATE POLICY kati_internal_kb_writer_guarded_snapshot_insert
          ON public.legal_knowledge_chunks
          FOR INSERT
          TO kati_internal_kb_writer
          WITH CHECK (
            category = 'tax'
            AND source_type = 'manual_source'
            AND is_active IS TRUE
            AND metadata->>'ingest_mode' = 'existing_storage_guarded'
            AND metadata->>'source_class' = 'user_supplied_retrieval_snapshot'
            AND metadata->>'storage_bucket' = 'communication-attachments'
            AND metadata->>'official_origin_verified' = 'false'
            AND metadata->>'content_verified' = 'false'
            AND metadata->>'substantive_use_allowed' = 'false'
            AND metadata->>'use_in_generation' = 'false'
            AND metadata->>'embedding_status' = 'pending'
          )
      $policy$;
    END IF;
  END IF;
END
$$;
