import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSignature, Search, Loader2 } from "lucide-react";
import {
  getTemplates,
  CATEGORY_LABELS,
  JURISDICTION_LABELS,
  COMPLEXITY_LABELS,
  type DocumentTemplate,
  type TemplateComplexity,
} from "@/lib/document-templates";

export const Route = createFileRoute("/workspace/document-builder")({
  head: () => ({
    meta: [
      { title: "Конструктор документов — Workspace" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DocumentBuilderPage,
});

const practiceAreaOptions = [
  { value: "", label: "Все области" },
  { value: "general", label: "Общая практика" },
  { value: "contracts", label: "Договоры" },
  { value: "real_estate", label: "Недвижимость" },
  { value: "litigation", label: "Судебные споры" },
  { value: "tax", label: "Налоги" },
  { value: "corporate", label: "Корпоративное (РФ)" },
  { value: "international_corporate", label: "Международное корпоративное" },
  { value: "it", label: "IT / IP" },
  { value: "compliance", label: "Комплаенс" },
  { value: "labour", label: "Трудовое" },
  { value: "logistics", label: "Логистика" },
];

const jurisdictionOptions = ["", "RU", "CY", "IL", "GE"] as const;
const complexityOptions: Array<"" | TemplateComplexity> = ["", "basic", "advanced", "expert"];

function DocumentBuilderPage() {
  const [search, setSearch] = useState("");
  const [practice, setPractice] = useState("");
  const [jurisdiction, setJurisdiction] = useState<string>("");
  const [complexity, setComplexity] = useState<"" | TemplateComplexity>("");
  const [selectedCode, setSelectedCode] = useState<string>("");

  const { data: templates = [], isLoading, error } = useQuery({
    queryKey: ["document-templates"],
    queryFn: getTemplates,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (practice && t.practice_area !== practice) return false;
      if (jurisdiction && !t.jurisdiction.includes(jurisdiction)) return false;
      if (complexity && t.complexity !== complexity) return false;
      if (q) {
        const hay = `${t.title} ${t.category} ${t.subcategory ?? ""} ${t.code}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [templates, search, practice, jurisdiction, complexity]);

  const grouped = useMemo(() => {
    const map = new Map<string, DocumentTemplate[]>();
    for (const t of filtered) {
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const selected = useMemo(
    () => templates.find((t) => t.code === selectedCode) ?? null,
    [templates, selectedCode],
  );

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
              Единый реестр шаблонов: {templates.length} документов. Выберите шаблон, чтобы перейти к подготовке.
            </p>
          </div>
        </div>
      </header>

      <section className="db-card p-6">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию, коду или категории…"
              className="db-search w-full pl-9"
            />
          </div>
          <select
            value={practice}
            onChange={(e) => setPractice(e.target.value)}
            className="db-select"
            aria-label="Область права"
          >
            {practiceAreaOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            className="db-select"
            aria-label="Юрисдикция"
          >
            {jurisdictionOptions.map((j) => (
              <option key={j} value={j}>{j ? JURISDICTION_LABELS[j] : "Все юрисдикции"}</option>
            ))}
          </select>
          <select
            value={complexity}
            onChange={(e) => setComplexity(e.target.value as "" | TemplateComplexity)}
            className="db-select"
            aria-label="Сложность"
          >
            {complexityOptions.map((c) => (
              <option key={c || "all"} value={c}>
                {c ? COMPLEXITY_LABELS[c] : "Любая сложность"}
              </option>
            ))}
          </select>
        </div>

        {selected && (
          <div className="mt-4 rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white/90">
            Выбрано: <span className="text-white">{selected.title}</span>{" "}
            <span className="text-white/50">· {selected.code}</span>
          </div>
        )}

        <div className="mt-6 space-y-6">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-white/70">
              <Loader2 size={14} className="animate-spin" /> Загрузка реестра шаблонов…
            </div>
          )}
          {error && (
            <div className="text-sm text-rose-300">Не удалось загрузить шаблоны. Проверьте подключение.</div>
          )}
          {!isLoading && !error && filtered.length === 0 && (
            <div className="text-sm text-white/60">Ничего не найдено по выбранным фильтрам.</div>
          )}

          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/55">
                {CATEGORY_LABELS[cat] ?? cat}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items.map((t) => {
                  const isSel = t.code === selectedCode;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedCode(t.code)}
                      className={`db-tcard text-left ${isSel ? "db-tcard-active" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-medium text-white">{t.title}</div>
                        <span className={`db-pill db-pill-${t.complexity}`}>
                          {COMPLEXITY_LABELS[t.complexity]}
                        </span>
                      </div>
                      {t.description && (
                        <p className="mt-2 text-xs text-white/65 line-clamp-2">{t.description}</p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="db-tag">{CATEGORY_LABELS[t.category] ?? t.category}</span>
                        {t.jurisdiction.map((j) => (
                          <span key={j} className="db-tag db-tag-juris">
                            {JURISDICTION_LABELS[j] ?? j}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <button type="button" disabled={!selected} className="db-cta">
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
        .db-search, .db-select {
          height: 38px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.16);
          color: rgba(255, 255, 255, 0.92);
          padding: 0 12px;
          font-size: 13px;
          outline: none;
        }
        .db-search::placeholder { color: rgba(255, 255, 255, 0.45); }
        .db-search:focus, .db-select:focus { border-color: rgba(214, 188, 120, 0.55); }
        .db-select { appearance: none; padding-right: 28px; background-image: linear-gradient(45deg, transparent 50%, rgba(255,255,255,0.5) 50%), linear-gradient(135deg, rgba(255,255,255,0.5) 50%, transparent 50%); background-position: calc(100% - 14px) 17px, calc(100% - 9px) 17px; background-size: 5px 5px; background-repeat: no-repeat; }
        .db-select option { background: #0c1a24; color: #fff; }
        .db-tcard {
          background: rgba(8, 18, 26, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          padding: 14px 14px 12px;
          transition: all 160ms ease;
          cursor: pointer;
        }
        .db-tcard:hover {
          background: rgba(12, 26, 36, 0.72);
          border-color: rgba(214, 188, 120, 0.35);
          transform: translateY(-1px);
        }
        .db-tcard-active {
          border-color: rgba(214, 188, 120, 0.65);
          background: rgba(40, 32, 14, 0.55);
          box-shadow: 0 0 0 1px rgba(214, 188, 120, 0.25) inset;
        }
        .db-tag {
          font-size: 10.5px;
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.07);
          color: rgba(255, 255, 255, 0.75);
          border: 1px solid rgba(255, 255, 255, 0.10);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .db-tag-juris { background: rgba(214, 188, 120, 0.12); color: #f0dca0; border-color: rgba(214, 188, 120, 0.30); }
        .db-pill {
          font-size: 10px;
          padding: 3px 8px;
          border-radius: 999px;
          border: 1px solid transparent;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          white-space: nowrap;
        }
        .db-pill-basic { background: rgba(102, 187, 156, 0.14); color: #9be0c4; border-color: rgba(102, 187, 156, 0.35); }
        .db-pill-advanced { background: rgba(120, 160, 220, 0.14); color: #b6d0f5; border-color: rgba(120, 160, 220, 0.35); }
        .db-pill-expert { background: rgba(214, 120, 120, 0.14); color: #f0b8b8; border-color: rgba(214, 120, 120, 0.35); }
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
