UPDATE public.document_intake_schemas
SET schema_json = jsonb_build_object(
  'version', '3',
  'warnings', jsonb_build_array(
    'Для Cyprus / Israel / Georgia требуется проверка локальным юристом соответствующей юрисдикции.',
    'AI не должен придумывать нормы иностранного права без подтвержденного источника.',
    'Governing law и Dispute Resolution — это осознанный выбор. Английское право и суд Лондона по умолчанию НЕ применяются к компаниям Cyprus / Israel / Georgia / RU.',
    'Имена участников должны быть реальными (ФИО или название юр. лица). Заглушки вида "1", "2", "Сторона А" приведут к плейсхолдерам в тексте.'
  ),
  'steps', jsonb_build_array(
    jsonb_build_object(
      'id','basic','title','Основные данные','fields', jsonb_build_array(
        jsonb_build_object('key','company_type','type','select','label','Тип компании','required',true,'options',
          jsonb_build_array(
            jsonb_build_object('value','cyprus_ltd','label','Cyprus Private Company Limited by Shares'),
            jsonb_build_object('value','israel_ltd','label','Israeli Private Limited Company Ltd'),
            jsonb_build_object('value','georgia_llc','label','Georgian LLC'),
            jsonb_build_object('value','ru_ooo','label','ООО'),
            jsonb_build_object('value','ru_ao','label','АО'),
            jsonb_build_object('value','other','label','Другое')
          )),
        jsonb_build_object('key','company_name','type','text','label','Название компании','required',false,'minLength',2)
      )),
    jsonb_build_object(
      'id','founders','title','Участники и доли','fields', jsonb_build_array(
        jsonb_build_object('key','founder_1_name','type','text','label','Участник 1 — реальное ФИО или название юр. лица','required',true,'minLength',3,
          'placeholder','Например: Иван Петрович Смирнов или ООО «Альфа»',
          'help','Введите реальное имя/название. Заглушки вроде "1", "Сторона А" оставят плейсхолдеры в тексте.',
          'pattern','^(?!\d+$).+$','patternMessage','Имя не может состоять только из цифр'),
        jsonb_build_object('key','founder_1_share','type','percentage','label','Доля участника 1, %','required',true,'min',0,'max',100),
        jsonb_build_object('key','founder_2_name','type','text','label','Участник 2 — реальное ФИО или название юр. лица','required',true,'minLength',3,
          'placeholder','Например: Мария Алексеевна Иванова или Acme Ltd',
          'help','Введите реальное имя/название. Заглушки вроде "2", "Сторона Б" оставят плейсхолдеры в тексте.',
          'pattern','^(?!\d+$).+$','patternMessage','Имя не может состоять только из цифр'),
        jsonb_build_object('key','founder_2_share','type','percentage','label','Доля участника 2, %','required',true,'min',0,'max',100),
        jsonb_build_object('key','total_shares','type','number','label','Общее количество акций / долей','required',false,'min',0,
          'placeholder','Например: 100','help','Всего выпущено акций (units / долей) в Компании.'),
        jsonb_build_object('key','voting_shares','type','number','label','Из них голосующих','required',false,'min',0,
          'help','Сколько из общего числа дают право голоса.'),
        jsonb_build_object('key','transferable_shares','type','number','label','Из них отчуждаемых (transferable)','required',false,'min',0),
        jsonb_build_object('key','non_transferable_shares','type','number','label','Из них неотчуждаемых (non-transferable)','required',false,'min',0),
        jsonb_build_object('key','voting_shares_transfer_restriction','type','textarea','label','Ограничения на передачу голосующих акций','required',false,
          'placeholder','Например: голосующие акции непередаваемы при жизни участника без единогласного согласия.'),
        jsonb_build_object('key','transferable_shares_rules','type','textarea','label','Правила передачи отчуждаемых акций','required',false,
          'placeholder','Например: ROFR → tag-along → drag-along (>75%).'),
        jsonb_build_object('key','share_structure_notes','type','textarea','label','Прочие комментарии по структуре','required',false,
          'placeholder','Например: классы акций, привилегии, конвертация.')
      )),
    jsonb_build_object(
      'id','governance','title','Управление и контроль','fields', jsonb_build_array(
        jsonb_build_object('key','director_appointment','type','textarea','label','Порядок назначения директора','required',false),
        jsonb_build_object('key','reserved_matters','type','textarea','label','Решения, требующие согласия всех участников','required',false),
        jsonb_build_object('key','voting_thresholds','type','textarea','label','Порог голосования','required',false),
        jsonb_build_object('key','deadlock_mechanism','type','select','label','Механизм deadlock','required',false,'options',
          jsonb_build_array(
            jsonb_build_object('value','negotiation','label','Переговоры'),
            jsonb_build_object('value','mediation','label','Медиация'),
            jsonb_build_object('value','russian_roulette','label','Russian Roulette'),
            jsonb_build_object('value','texas_shootout','label','Texas Shoot-out'),
            jsonb_build_object('value','buy_sell','label','Buy-Sell'),
            jsonb_build_object('value','arbitration','label','Арбитраж'),
            jsonb_build_object('value','court','label','Суд'),
            jsonb_build_object('value','other','label','Другое')
          ))
      )),
    jsonb_build_object(
      'id','transfer','title','Продажа долей / акций','fields', jsonb_build_array(
        jsonb_build_object('key','right_of_first_refusal','type','boolean','label','Преимущественное право покупки','required',false),
        jsonb_build_object('key','tag_along','type','boolean','label','Tag Along','required',false),
        jsonb_build_object('key','drag_along','type','boolean','label','Drag Along','required',false),
        jsonb_build_object('key','lock_up','type','textarea','label','Lock-up / запрет продажи','required',false)
      )),
    jsonb_build_object(
      'id','protection','title','Защита бизнеса','fields', jsonb_build_array(
        jsonb_build_object('key','non_compete','type','boolean','label','Non-compete','required',false),
        jsonb_build_object('key','confidentiality','type','boolean','label','Конфиденциальность','required',false),
        jsonb_build_object('key','ip_ownership','type','textarea','label','Интеллектуальная собственность','required',false)
      )),
    jsonb_build_object(
      'id','law','title','Право и споры','fields', jsonb_build_array(
        jsonb_build_object('key','governing_law','type','select','label','Применимое право','required',true,
          'help','ВНИМАНИЕ: выбор должен быть осознанным. Для компаний Cyprus/Israel/Georgia/RU английское право — НЕ дефолт.',
          'options', jsonb_build_array(
            jsonb_build_object('value','russia','label','Россия'),
            jsonb_build_object('value','cyprus','label','Cyprus'),
            jsonb_build_object('value','israel','label','Israel'),
            jsonb_build_object('value','georgia','label','Georgia'),
            jsonb_build_object('value','english','label','English law (только для осознанного выбора)'),
            jsonb_build_object('value','other','label','Другое')
          )),
        jsonb_build_object('key','dispute_resolution','type','textarea','label','Разрешение споров','required',true,
          'placeholder','Например: арбитраж МКАС при ТПП РФ; или LCIA, Лондон (если осознанно выбран английский суд).',
          'help','Укажите конкретный форум, место и регламент. Лондон/LCIA — НЕ дефолт для не-английских компаний.'),
        jsonb_build_object('key','doc_language','type','select','label','Язык документа','required',false,'options',
          jsonb_build_array(
            jsonb_build_object('value','ru','label','Русский'),
            jsonb_build_object('value','en','label','English'),
            jsonb_build_object('value','bilingual','label','Билингва RU/EN')
          )),
        jsonb_build_object('key','special_terms','type','textarea','label','Особые условия','required',false)
      ))
  )
)
WHERE template_code = 'corporate_50_50_agreement' AND language = 'ru';