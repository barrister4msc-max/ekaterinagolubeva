-- Tracks the Production migration applied on 2026-09-14.
-- The writer can update only embeddings and their bookkeeping for already
-- fail-closed user-supplied retrieval snapshots.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kati_internal_kb_writer') THEN
    GRANT UPDATE (embedding, metadata)
      ON TABLE public.legal_knowledge_chunks
      TO kati_internal_kb_writer;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'legal_knowledge_chunks'
        AND policyname = 'kati_internal_kb_writer_guarded_embedding_update'
    ) THEN
      EXECUTE $policy$
        CREATE POLICY kati_internal_kb_writer_guarded_embedding_update
          ON public.legal_knowledge_chunks
          FOR UPDATE
          TO kati_internal_kb_writer
          USING (
            embedding IS NULL
            AND metadata->>'source_class' = 'user_supplied_retrieval_snapshot'
            AND metadata->>'ingest_mode' = 'existing_storage_guarded'
            AND metadata->>'storage_bucket' = 'communication-attachments'
            AND metadata->>'official_origin_verified' = 'false'
            AND metadata->>'content_verified' = 'false'
            AND metadata->>'substantive_use_allowed' = 'false'
            AND metadata->>'use_in_generation' = 'false'
            AND metadata->>'embedding_status' = 'pending'
          )
          WITH CHECK (
            embedding IS NOT NULL
            AND metadata->>'source_class' = 'user_supplied_retrieval_snapshot'
            AND metadata->>'ingest_mode' = 'existing_storage_guarded'
            AND metadata->>'storage_bucket' = 'communication-attachments'
            AND metadata->>'official_origin_verified' = 'false'
            AND metadata->>'content_verified' = 'false'
            AND metadata->>'substantive_use_allowed' = 'false'
            AND metadata->>'use_in_generation' = 'false'
            AND metadata->>'embedding_status' = 'completed'
            AND metadata->>'embedding_provider' = 'gemini'
            AND metadata->>'embedding_model' = 'gemini-embedding-001'
            AND metadata->>'embedding_dimensions' = '1536'
          )
      $policy$;
    END IF;
  END IF;
END
$$;
