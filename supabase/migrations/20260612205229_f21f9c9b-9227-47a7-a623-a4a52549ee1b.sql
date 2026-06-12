
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
