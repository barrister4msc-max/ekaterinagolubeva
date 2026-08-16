-- PR27 — add optional taxpayer_kpp and taxpayer_legal_address to the
-- tax_audit_objections_extended intake schema.
--
-- NOT APPLIED to production. Idempotent: re-running is a no-op. Step order is
-- preserved; the two optional fields are appended to the "taxpayer" step only.

DO $$
DECLARE
  rec RECORD;
  steps jsonb;
  step jsonb;
  new_steps jsonb;
  fields jsonb;
  has_kpp boolean;
  has_address boolean;
BEGIN
  FOR rec IN
    SELECT id, schema_json
    FROM public.document_intake_schemas
    WHERE template_code = 'tax_audit_objections_extended'
  LOOP
    steps := COALESCE(rec.schema_json -> 'steps', '[]'::jsonb);
    new_steps := '[]'::jsonb;

    FOR step IN SELECT * FROM jsonb_array_elements(steps)
    LOOP
      IF step ->> 'id' = 'taxpayer' THEN
        fields := COALESCE(step -> 'fields', '[]'::jsonb);

        SELECT EXISTS (
          SELECT 1 FROM jsonb_array_elements(fields) f
          WHERE f ->> 'name' = 'taxpayer_kpp' OR f ->> 'key' = 'taxpayer_kpp'
        ) INTO has_kpp;

        SELECT EXISTS (
          SELECT 1 FROM jsonb_array_elements(fields) f
          WHERE f ->> 'name' = 'taxpayer_legal_address'
             OR f ->> 'key' = 'taxpayer_legal_address'
        ) INTO has_address;

        IF NOT has_kpp THEN
          fields := fields || jsonb_build_array(jsonb_build_object(
            'name', 'taxpayer_kpp', 'type', 'text', 'label', 'КПП', 'required', false
          ));
        END IF;

        IF NOT has_address THEN
          fields := fields || jsonb_build_array(jsonb_build_object(
            'name', 'taxpayer_legal_address', 'type', 'text',
            'label', 'Юридический адрес', 'required', false
          ));
        END IF;

        step := jsonb_set(step, '{fields}', fields);
      END IF;

      new_steps := new_steps || jsonb_build_array(step);
    END LOOP;

    UPDATE public.document_intake_schemas
    SET schema_json = jsonb_set(rec.schema_json, '{steps}', new_steps),
        updated_at = now()
    WHERE id = rec.id
      AND jsonb_set(rec.schema_json, '{steps}', new_steps) IS DISTINCT FROM rec.schema_json;
  END LOOP;
END $$;
