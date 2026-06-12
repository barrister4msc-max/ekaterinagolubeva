import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileSignature, Search } from "lucide-react";

export const Route = createFileRoute("/workspace/document-builder")({
  head: () => ({
    meta: [
      { title: "Конструктор документов — Workspace" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DocumentBuilderPage,
});

const practiceAreas = [
  "Недвижимость",
  "Договоры",
  "Судебные споры",
  "Налоговые вопросы",
  "Корпоративное право",
  "Международное корпоративное право",
  "Семейное право",
  "Наследство",
  "Земельные вопросы",
  "Комплаенс",
  "Другое",
] as const;

const jurisdictions = ["Россия", "Кипр", "Израиль", "Грузия", "Другая"] as const;

type Category = { label: string; items: string[] };

const categories: Category[] = [
  {
    label: "Общие юридические документы",
    items: [
      "Запрос документов и информации у клиента",
      "Правовое заключение (Legal Opinion)",
      "Аналитическая записка по делу",
      "Юридическое исследование",
      "Правовая позиция по спору",
      "Меморандум юриста",
      "Заключение по рискам",
      "Due Diligence Report",
      "Red Flag Report",
      "Legal Checklist",
      "План правовой защиты",
      "Дорожная карта проекта",
      "Правовой аудит",
      "Юридическая справка",
      "Заключение по перспективам судебного спора",
    ],
  },
  {
    label: "Общегражданские договоры",
    items: [
      "Договор оказания услуг",
      "Договор подряда",
      "Договор бытового подряда",
      "Договор строительного подряда",
      "Договор проектных работ",
      "Договор НИОКР",
      "Договор возмездного оказания услуг",
      "Договор консультационных услуг",
      "Договор аутсорсинга",
      "Договор аутстаффинга",
      "Договор агентский",
      "Агентское соглашение",
      "Договор поручения",
      "Договор комиссии",
      "Договор хранения",
      "Договор перевозки",
      "Договор транспортной экспедиции",
      "Договор займа",
      "Договор кредита",
      "Договор уступки права требования (цессия)",
      "Договор перевода долга",
      "Договор поручительства",
      "Договор независимой гарантии",
      "Договор залога",
      "Договор залога недвижимости (ипотеки)",
      "Договор страхования",
    ],
  },
  {
    label: "Коммерческие договоры",
    items: [
      "Договор поставки",
      "Договор поставки товаров",
      "Договор дистрибуции",
      "Дилерский договор",
      "Договор купли-продажи товара",
      "Договор купли-продажи бизнеса",
      "Договор франчайзинга (коммерческой концессии)",
      "Лицензионный договор",
      "Сублицензионный договор",
      "Договор коммерческого представительства",
      "Договор совместной деятельности",
      "Договор простого товарищества",
      "Инвестиционное соглашение",
      "Term Sheet",
      "Letter of Intent (LOI)",
    ],
  },
  {
    label: "IT и интеллектуальная собственность",
    items: [
      "Договор разработки программного обеспечения",
      "Договор технической поддержки",
      "SaaS Agreement",
      "Software License Agreement",
      "End User License Agreement (EULA)",
      "Договор сопровождения сайта",
      "Договор разработки мобильного приложения",
      "Договор внедрения IT-систем",
      "Договор на разработку AI-решения",
      "Договор обработки данных (DPA)",
      "NDA",
      "Соглашение о конфиденциальности",
      "Соглашение о неразглашении коммерческой тайны",
      "Соглашение о передаче исключительных прав",
    ],
  },
  {
    label: "Корпоративные",
    items: [
      "Корпоративный договор",
      "Shareholders Agreement",
      "Founders Agreement",
      "Investment Agreement",
      "Subscription Agreement",
      "SAFE",
      "Convertible Loan Agreement",
      "Share Purchase Agreement",
      "Option Agreement",
      "Director Agreement",
      "Решение единственного участника",
      "Протокол общего собрания",
      "Board Resolution",
      "Shareholder Resolution",
    ],
  },
  {
    label: "Судебные",
    items: [
      "Исковое заявление",
      "Отзыв на иск",
      "Возражения",
      "Ходатайство",
      "Апелляционная жалоба",
      "Кассационная жалоба",
      "Заявление о выдаче судебного приказа",
      "Заявление об отмене судебного приказа",
      "Мировое соглашение",
    ],
  },
  {
    label: "Налоговые",
    items: [
      "Пояснения в ФНС",
      "Ответ на требование ФНС",
      "Возражения на акт налоговой проверки",
      "Жалоба в УФНС",
      "Заявление о зачёте / возврате налога",
      "Правовое заключение по налоговым рискам",
      "Запрос документов по налоговой проверке",
    ],
  },
  {
    label: "Недвижимость",
    items: [
      "Договор купли-продажи недвижимости",
      "Договор аренды недвижимости",
      "Дополнительное соглашение к договору аренды",
      "Акт приёма-передачи",
      "Соглашение о задатке",
      "Соглашение об авансе",
      "Протокол разногласий",
      "Уведомление о расторжении договора аренды",
      "Претензия по сделке с недвижимостью",
      "Правовое заключение по проверке объекта",
    ],
  },
];

function DocumentBuilderPage() {
  const [practice, setPractice] = useState<string>("");
  const [jurisdiction, setJurisdiction] = useState<string>("");
  const [documentType, setDocumentType] = useState<string>("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map((c) => ({ ...c, items: c.items.filter((i) => i.toLowerCase().includes(q)) }))
      .filter((c) => c.items.length > 0);
  }, [search]);

  const canContinue = practice && jurisdiction && documentType;

  return (
    <div className="space-y-8">
      <header className="db-card p-7">
        <div className="flex items-start gap-4">
          <div className="db-icon">
            <FileSignature size={20} />
          </div>
          <div>
            <h1 className="font-display text-2xl text-white">Конструктор юридических документов</h1>
            <p className="mt-2 text-sm text-white/70">
              Создание документов с нуля по выбранной области права и юрисдикции.
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-5 md:grid-cols-2">
        <div className="db-card p-6">
          <div className="db-label">Область права</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {practiceAreas.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPractice(p)}
                className={`db-chip ${practice === p ? "db-chip-active" : ""}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="db-card p-6">
          <div className="db-label">Юрисдикция</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {jurisdictions.map((j) => (
              <button
                key={j}
                type="button"
                onClick={() => setJurisdiction(j)}
                className={`db-chip ${jurisdiction === j ? "db-chip-active" : ""}`}
              >
                {j}
              </button>
            ))}
          </div>
          {(jurisdiction === "Кипр" || jurisdiction === "Израиль" || jurisdiction === "Грузия") && (
            <p className="mt-4 text-xs text-amber-200/90">
              Для иностранной юрисдикции потребуется проверка локальным юристом соответствующей юрисдикции.
            </p>
          )}
        </div>
      </section>

      <section className="db-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="db-label">Категория документа</div>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по документу…"
              className="db-search pl-9"
            />
          </div>
        </div>

        {documentType && (
          <div className="mt-4 rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white/90">
            Выбрано: <span className="text-white">{documentType}</span>
          </div>
        )}

        <div className="mt-5 space-y-5">
          {filtered.length === 0 && (
            <div className="text-sm text-white/60">Ничего не найдено по запросу «{search}».</div>
          )}
          {filtered.map((c) => (
            <div key={c.label}>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/55">{c.label}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {c.items.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setDocumentType(item)}
                    className={`db-chip db-chip-sm ${documentType === item ? "db-chip-active" : ""}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!canContinue}
          className="db-cta"
        >
          Продолжить создание документа
        </button>
      </div>

      <style>{`
        .db-card {
          background: rgba(8, 20, 30, 0.48);
          backdrop-filter: blur(24px) saturate(140%);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 18px;
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
          color: rgba(255, 255, 255, 0.92);
        }
        .db-icon {
          display: grid; place-items: center;
          width: 44px; height: 44px;
          border-radius: 12px;
          background: rgba(200, 168, 107, 0.16);
          color: #d6bc78;
          border: 1px solid rgba(214, 188, 120, 0.30);
        }
        .db-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          color: rgba(255, 255, 255, 0.65);
        }
        .db-chip {
          padding: 7px 14px;
          border-radius: 999px;
          font-size: 13px;
          line-height: 1;
          color: rgba(255, 255, 255, 0.88);
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.14);
          transition: all 160ms ease;
          cursor: pointer;
        }
        .db-chip:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.24);
        }
        .db-chip-sm { padding: 6px 12px; font-size: 12.5px; }
        .db-chip-active {
          background: rgba(214, 188, 120, 0.20);
          border-color: rgba(214, 188, 120, 0.55);
          color: #f4e3b8;
        }
        .db-search {
          height: 36px;
          width: 260px;
          max-width: 100%;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.16);
          color: rgba(255, 255, 255, 0.92);
          padding: 0 12px;
          font-size: 13px;
          outline: none;
        }
        .db-search::placeholder { color: rgba(255, 255, 255, 0.45); }
        .db-search:focus { border-color: rgba(214, 188, 120, 0.55); }
        .db-cta {
          padding: 12px 24px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 500;
          color: #0d1a22;
          background: linear-gradient(135deg, #e2c889, #c8a86b);
          border: 1px solid rgba(214, 188, 120, 0.70);
          box-shadow: 0 12px 30px rgba(200, 168, 107, 0.25);
          transition: opacity 160ms ease, transform 160ms ease;
          cursor: pointer;
        }
        .db-cta:hover:not(:disabled) { transform: translateY(-1px); }
        .db-cta:disabled { opacity: 0.45; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
