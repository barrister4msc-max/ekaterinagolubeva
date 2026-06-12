UPDATE public.document_intake_schemas
SET
  required_fields = ARRAY['company_type','founder_1_name','founder_2_name','founder_1_share','founder_2_share','governing_law','dispute_resolution']::text[],
  schema_json = jsonb_build_object(
    'version', '2',
    'warnings', jsonb_build_array(
      'Для Cyprus / Israel / Georgia требуется проверка локальным юристом соответствующей юрисдикции.',
      'AI не должен придумывать нормы иностранного права без подтвержденного источника.'
    ),
    'steps', jsonb_build_array(
      jsonb_build_object(
        'id','basic','title','Основные данные',
        'fields', jsonb_build_array(
          jsonb_build_object('key','company_type','label','Тип компании','type','select','required',true,'options',jsonb_build_array(
            jsonb_build_object('value','cyprus_ltd','label','Cyprus Private Company Limited by Shares'),
            jsonb_build_object('value','israel_ltd','label','Israeli Private Limited Company Ltd'),
            jsonb_build_object('value','georgia_llc','label','Georgian LLC'),
            jsonb_build_object('value','ru_ooo','label','ООО'),
            jsonb_build_object('value','ru_ao','label','АО'),
            jsonb_build_object('value','other','label','Другое')
          )),
          jsonb_build_object('key','company_name','label','Название компании','type','text','required',false)
        )
      ),
      jsonb_build_object(
        'id','founders','title','Участники и доли',
        'fields', jsonb_build_array(
          jsonb_build_object('key','founder_1_name','label','Участник 1','type','text','required',true),
          jsonb_build_object('key','founder_1_share','label','Доля участника 1, %','type','percentage','required',true,'min',0,'max',100),
          jsonb_build_object('key','founder_2_name','label','Участник 2','type','text','required',true),
          jsonb_build_object('key','founder_2_share','label','Доля участника 2, %','type','percentage','required',true,'min',0,'max',100),
          jsonb_build_object('key','share_structure_notes','label','Структура акций / долей','type','textarea','required',false,'placeholder','Например: 100 акций, 60 голосующих неотчуждаемых, 40 отчуждаемых')
        )
      ),
      jsonb_build_object(
        'id','governance','title','Управление и контроль',
        'fields', jsonb_build_array(
          jsonb_build_object('key','director_appointment','label','Порядок назначения директора','type','textarea','required',false),
          jsonb_build_object('key','reserved_matters','label','Решения, требующие согласия всех участников','type','textarea','required',false),
          jsonb_build_object('key','voting_thresholds','label','Порог голосования','type','textarea','required',false),
          jsonb_build_object('key','deadlock_mechanism','label','Механизм deadlock','type','select','required',false,'options',jsonb_build_array(
            jsonb_build_object('value','negotiation','label','Переговоры'),
            jsonb_build_object('value','mediation','label','Медиация'),
            jsonb_build_object('value','russian_roulette','label','Russian Roulette'),
            jsonb_build_object('value','texas_shootout','label','Texas Shoot-out'),
            jsonb_build_object('value','buy_sell','label','Buy-Sell'),
            jsonb_build_object('value','arbitration','label','Арбитраж'),
            jsonb_build_object('value','court','label','Суд'),
            jsonb_build_object('value','other','label','Другое')
          ))
        )
      ),
      jsonb_build_object(
        'id','transfer','title','Продажа долей / акций',
        'fields', jsonb_build_array(
          jsonb_build_object('key','right_of_first_refusal','label','Преимущественное право покупки','type','boolean','required',false),
          jsonb_build_object('key','tag_along','label','Tag Along','type','boolean','required',false),
          jsonb_build_object('key','drag_along','label','Drag Along','type','boolean','required',false),
          jsonb_build_object('key','lock_up','label','Lock-up / запрет продажи','type','textarea','required',false)
        )
      ),
      jsonb_build_object(
        'id','protection','title','Защита бизнеса',
        'fields', jsonb_build_array(
          jsonb_build_object('key','non_compete','label','Non-compete','type','boolean','required',false),
          jsonb_build_object('key','confidentiality','label','Конфиденциальность','type','boolean','required',false),
          jsonb_build_object('key','ip_ownership','label','Интеллектуальная собственность','type','textarea','required',false)
        )
      ),
      jsonb_build_object(
        'id','law','title','Право и споры',
        'fields', jsonb_build_array(
          jsonb_build_object('key','governing_law','label','Применимое право','type','select','required',true,'options',jsonb_build_array(
            jsonb_build_object('value','russia','label','Россия'),
            jsonb_build_object('value','cyprus','label','Cyprus'),
            jsonb_build_object('value','israel','label','Israel'),
            jsonb_build_object('value','georgia','label','Georgia'),
            jsonb_build_object('value','english','label','English law'),
            jsonb_build_object('value','other','label','Другое')
          )),
          jsonb_build_object('key','dispute_resolution','label','Разрешение споров','type','textarea','required',true,'placeholder','Например: LCIA, Лондон, английское право; или арбитраж МКАС при ТПП РФ'),
          jsonb_build_object('key','doc_language','label','Язык документа','type','select','required',false,'options',jsonb_build_array(
            jsonb_build_object('value','ru','label','Русский'),
            jsonb_build_object('value','en','label','English'),
            jsonb_build_object('value','bilingual','label','Билингва RU/EN')
          )),
          jsonb_build_object('key','special_terms','label','Особые условия','type','textarea','required',false)
        )
      )
    )
  ),
  updated_at = now()
WHERE template_code = 'corporate_50_50_agreement';