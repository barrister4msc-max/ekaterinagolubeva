
CREATE TABLE public.legal_document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  title text NOT NULL,
  category text NOT NULL,
  subcategory text,
  practice_area text,
  jurisdiction text[] NOT NULL DEFAULT '{}',
  languages text[] NOT NULL DEFAULT '{ru}',
  complexity text NOT NULL DEFAULT 'basic' CHECK (complexity IN ('basic','advanced','expert')),
  is_active boolean NOT NULL DEFAULT true,
  requires_intake boolean NOT NULL DEFAULT true,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.legal_document_templates TO authenticated;
GRANT ALL ON public.legal_document_templates TO service_role;

ALTER TABLE public.legal_document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view active templates"
  ON public.legal_document_templates FOR SELECT
  TO authenticated
  USING (is_active = true OR public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can insert templates"
  ON public.legal_document_templates FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can update templates"
  ON public.legal_document_templates FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()))
  WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can delete templates"
  ON public.legal_document_templates FOR DELETE
  TO authenticated
  USING (public.is_admin_or_superadmin(auth.uid()));

CREATE TRIGGER trg_legal_document_templates_updated_at
  BEFORE UPDATE ON public.legal_document_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_legal_document_templates_category ON public.legal_document_templates(category);
CREATE INDEX idx_legal_document_templates_practice_area ON public.legal_document_templates(practice_area);
CREATE INDEX idx_legal_document_templates_active ON public.legal_document_templates(is_active);

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
('contractor_agreement_intl', 'Independent Contractor Agreement', 'LABOUR', 'employment', 'international_corporate', ARRAY['CY','IL'], 'advanced', true, 'Соглашение с независимым подрядчиком.', 1320);
