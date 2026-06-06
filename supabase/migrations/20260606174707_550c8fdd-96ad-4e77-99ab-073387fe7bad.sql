
-- document_templates: add missing columns
ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_document_templates_updated_at ON public.document_templates;
CREATE TRIGGER trg_document_templates_updated_at
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Unique key for upsert
CREATE UNIQUE INDEX IF NOT EXISTS document_templates_template_key_key
  ON public.document_templates(template_key);

-- generated_legal_documents: add missing columns
ALTER TABLE public.generated_legal_documents
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS crm_lead_id text,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.document_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_generated_legal_documents_lead_id
  ON public.generated_legal_documents(lead_id);
CREATE INDEX IF NOT EXISTS idx_generated_legal_documents_crm_lead_id
  ON public.generated_legal_documents(crm_lead_id);

DROP TRIGGER IF EXISTS trg_generated_legal_documents_updated_at ON public.generated_legal_documents;
CREATE TRIGGER trg_generated_legal_documents_updated_at
  BEFORE UPDATE ON public.generated_legal_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_templates TO authenticated;
GRANT ALL ON public.document_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_legal_documents TO authenticated;
GRANT ALL ON public.generated_legal_documents TO service_role;

-- RLS
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_legal_documents ENABLE ROW LEVEL SECURITY;

-- document_templates policies
DROP POLICY IF EXISTS "Authenticated can read active templates" ON public.document_templates;
CREATE POLICY "Authenticated can read active templates"
  ON public.document_templates FOR SELECT
  TO authenticated
  USING (is_active = true OR public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins insert templates" ON public.document_templates;
CREATE POLICY "Admins insert templates"
  ON public.document_templates FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins update templates" ON public.document_templates;
CREATE POLICY "Admins update templates"
  ON public.document_templates FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()))
  WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins delete templates" ON public.document_templates;
CREATE POLICY "Admins delete templates"
  ON public.document_templates FOR DELETE
  TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

-- generated_legal_documents policies (admin/super_admin full access)
DROP POLICY IF EXISTS "Admins select generated docs" ON public.generated_legal_documents;
CREATE POLICY "Admins select generated docs"
  ON public.generated_legal_documents FOR SELECT
  TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins insert generated docs" ON public.generated_legal_documents;
CREATE POLICY "Admins insert generated docs"
  ON public.generated_legal_documents FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins update generated docs" ON public.generated_legal_documents;
CREATE POLICY "Admins update generated docs"
  ON public.generated_legal_documents FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()))
  WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Admins delete generated docs" ON public.generated_legal_documents;
CREATE POLICY "Admins delete generated docs"
  ON public.generated_legal_documents FOR DELETE
  TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

-- Seed templates (idempotent)
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
