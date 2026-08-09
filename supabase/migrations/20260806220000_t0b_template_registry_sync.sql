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
