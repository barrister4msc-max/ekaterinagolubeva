import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSignature, Search, Loader2, Check, ArrowRight, ArrowLeft, Globe2, Scale, Layers, FileText } from "lucide-react";
import {
  getTemplates,
  CATEGORY_LABELS,
  PRACTICE_AREA_LABELS,
  JURISDICTION_LABELS,
  LANGUAGE_LABELS,
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

const ALL_JURISDICTIONS = ["RU", "CY", "IL", "GE"] as const;
const COMPLEXITIES: TemplateComplexity[] = ["basic", "advanced", "expert"];

function DocumentBuilderPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [search, setSearch] = useState("");
  const [jurisdiction, setJurisdiction] = useState<string>("");
  const [practiceArea, setPracticeArea] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [complexity, setComplexity] = useState<"" | TemplateComplexity>("");
  const [selectedCode, setSelectedCode] = useState<string>("");

  const { data: templates = [], isLoading, error } = useQuery({
    queryKey: ["document-templates"],
    queryFn: getTemplates,
  });

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const t of templates) set.add(t.category);
    return Array.from(set).sort();
  }, [templates]);

  const availablePracticeAreas = useMemo(() => {
    const set = new Set<string>();
    for (const t of templates) if (t.practice_area) set.add(t.practice_area);
    return Array.from(set).sort();
  }, [templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (jurisdiction && !t.jurisdiction.includes(jurisdiction)) return false;
      if (practiceArea && t.practice_area !== practiceArea) return false;
      if (category && t.category !== category) return false;
      if (complexity && t.complexity !== complexity) return false;
      if (q) {
        const hay = `${t.title} ${t.category} ${t.subcategory ?? ""} ${t.code}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [templates, search, jurisdiction, practiceArea, category, complexity]);

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

  const resetAll = () => {
    setStep(1);
    setSearch("");
    setJurisdiction("");
    setPracticeArea("");
    setCategory("");
    setComplexity("");
    setSelectedCode("");
  };

  return (
    <div className="space-y-7">
      <header className="db-card p-7">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="db-icon"><FileSignature size={20} /></div>
            <div>
              <h1 className="font-display text-2xl text-white">Конструктор юридических документов</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/70">
                Единый реестр: {templates.length} шаблонов в {availableCategories.length} категориях.
                Подготовка идёт в 3 шага — выбор шаблона, проверка карточки и запуск подготовки.
              </p>
            </div>
          </div>
          <Stepper step={step} />
        </div>
      </header>

      {/* STEP 1 */}
      {step === 1 && (
        <section className="db-card p-6 space-y-6">
          <div>
            <div className="db-section-label">Шаг 1 · Юрисдикция</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ChipBtn active={jurisdiction === ""} onClick={() => setJurisdiction("")}>
                <Globe2 size={12} /> Все юрисдикции
              </ChipBtn>
              {ALL_JURISDICTIONS.map((j) => (
                <ChipBtn key={j} active={jurisdiction === j} onClick={() => setJurisdiction(j)}>
                  {JURISDICTION_LABELS[j]}
                </ChipBtn>
              ))}
            </div>
          </div>

          <div>
            <div className="db-section-label">Область права</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ChipBtn active={practiceArea === ""} onClick={() => setPracticeArea("")}>
                <Scale size={12} /> Все области
              </ChipBtn>
              {availablePracticeAreas.map((p) => (
                <ChipBtn key={p} active={practiceArea === p} onClick={() => setPracticeArea(p)}>
                  {PRACTICE_AREA_LABELS[p] ?? p}
                </ChipBtn>
              ))}
            </div>
          </div>

          <div>
            <div className="db-section-label">Категория документа</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ChipBtn active={category === ""} onClick={() => setCategory("")}>
                <Layers size={12} /> Все категории
              </ChipBtn>
              {availableCategories.map((c) => (
                <ChipBtn key={c} active={category === c} onClick={() => setCategory(c)}>
                  {CATEGORY_LABELS[c] ?? c}
                </ChipBtn>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
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
              value={complexity}
              onChange={(e) => setComplexity(e.target.value as "" | TemplateComplexity)}
              className="db-select"
              aria-label="Сложность"
            >
              <option value="">Любая сложность</option>
              {COMPLEXITIES.map((c) => (
                <option key={c} value={c}>{COMPLEXITY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          <div className="space-y-5">
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-white/70">
                <Loader2 size={14} className="animate-spin" /> Загрузка реестра шаблонов…
              </div>
            )}
            {error && (
              <div className="text-sm text-rose-300">Не удалось загрузить шаблоны.</div>
            )}
            {!isLoading && !error && filtered.length === 0 && (
              <div className="text-sm text-white/60">Ничего не найдено по выбранным фильтрам.</div>
            )}

            {grouped.map(([cat, items]) => (
              <div key={cat}>
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/55">
                  {CATEGORY_LABELS[cat] ?? cat} · {items.length}
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
                          {t.jurisdiction.map((j) => (
                            <span key={j} className="db-tag db-tag-juris">
                              {JURISDICTION_LABELS[j] ?? j}
                            </span>
                          ))}
                          {isSel && (
                            <span className="db-tag db-tag-active"><Check size={10}/> выбрано</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-white/55">
              Найдено: <span className="text-white">{filtered.length}</span>{selected ? " · выбран шаблон" : ""}
            </div>
            <button
              type="button"
              disabled={!selected}
              onClick={() => setStep(2)}
              className="db-cta"
            >
              Далее <ArrowRight size={14} />
            </button>
          </div>
        </section>
      )}

      {/* STEP 2 */}
      {step === 2 && selected && (
        <section className="db-card p-7 space-y-6">
          <div className="db-section-label">Шаг 2 · Карточка шаблона</div>

          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              <div className="db-icon"><FileText size={20}/></div>
              <div>
                <h2 className="font-display text-xl text-white">{selected.title}</h2>
                <div className="mt-1 text-xs text-white/55">{selected.code}</div>
              </div>
            </div>
            <span className={`db-pill db-pill-${selected.complexity} self-start`}>
              {COMPLEXITY_LABELS[selected.complexity]}
            </span>
          </div>

          {selected.description && (
            <p className="text-sm leading-relaxed text-white/80">{selected.description}</p>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <InfoBlock title="Категория" value={CATEGORY_LABELS[selected.category] ?? selected.category} />
            <InfoBlock
              title="Область права"
              value={selected.practice_area ? (PRACTICE_AREA_LABELS[selected.practice_area] ?? selected.practice_area) : "—"}
            />
            <InfoBlock
              title="Юрисдикции"
              value={selected.jurisdiction.map((j) => JURISDICTION_LABELS[j] ?? j).join(", ") || "—"}
            />
            <InfoBlock
              title="Поддерживаемые языки"
              value={selected.languages.map((l) => LANGUAGE_LABELS[l] ?? l).join(", ") || "—"}
            />
            <InfoBlock
              title="Сложность"
              value={COMPLEXITY_LABELS[selected.complexity]}
            />
            <InfoBlock
              title="Требуется ввод данных"
              value={selected.requires_intake ? "Да — будет запрошен intake" : "Нет — генерация без анкеты"}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={() => setStep(1)} className="db-ghost">
              <ArrowLeft size={14}/> Назад
            </button>
            <button type="button" onClick={() => setStep(3)} className="db-cta">
              Продолжить <ArrowRight size={14}/>
            </button>
          </div>
        </section>
      )}

      {/* STEP 3 */}
      {step === 3 && selected && (
        <section className="db-card p-7 space-y-6">
          <div className="db-section-label">Шаг 3 · Подготовка документа</div>

          <div>
            <h2 className="font-display text-xl text-white">{selected.title}</h2>
            <p className="mt-2 text-sm text-white/70">
              Шаблон выбран. На следующем этапе AI Intake запросит данные и подготовит проект документа.
              Подключение генерации появится в следующем релизе.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <ReadyBlock title="Юрисдикция" value={selected.jurisdiction.map((j) => JURISDICTION_LABELS[j] ?? j).join(", ")} />
            <ReadyBlock title="Язык" value={selected.languages.map((l) => LANGUAGE_LABELS[l] ?? l).join(", ")} />
            <ReadyBlock title="Intake" value={selected.requires_intake ? "Требуется" : "Не требуется"} />
          </div>

          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={() => setStep(2)} className="db-ghost">
              <ArrowLeft size={14}/> Назад
            </button>
            <div className="flex items-center gap-3">
              <button type="button" onClick={resetAll} className="db-ghost">Сбросить</button>
              <button type="button" className="db-cta" disabled title="AI Intake появится на следующем этапе">
                Начать подготовку документа
              </button>
            </div>
          </div>
        </section>
      )}

      <style>{`
        .db-card { background: rgba(8,20,30,0.48); backdrop-filter: blur(24px) saturate(140%); border: 1px solid rgba(255,255,255,0.14); border-radius: 18px; box-shadow: 0 18px 50px rgba(0,0,0,0.28); color: rgba(255,255,255,0.92); }
        .db-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: rgba(200,168,107,0.16); color: #d6bc78; border: 1px solid rgba(214,188,120,0.30); }
        .db-section-label { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(214,188,120,0.85); }
        .db-search, .db-select { height: 38px; border-radius: 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.16); color: rgba(255,255,255,0.92); padding: 0 12px; font-size: 13px; outline: none; }
        .db-search::placeholder { color: rgba(255,255,255,0.45); }
        .db-search:focus, .db-select:focus { border-color: rgba(214,188,120,0.55); }
        .db-select { appearance: none; padding-right: 28px; background-image: linear-gradient(45deg, transparent 50%, rgba(255,255,255,0.5) 50%), linear-gradient(135deg, rgba(255,255,255,0.5) 50%, transparent 50%); background-position: calc(100% - 14px) 17px, calc(100% - 9px) 17px; background-size: 5px 5px; background-repeat: no-repeat; }
        .db-select option { background: #0c1a24; color: #fff; }
        .db-tcard { background: rgba(8,18,26,0.55); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 14px 14px 12px; transition: all 160ms ease; cursor: pointer; }
        .db-tcard:hover { background: rgba(12,26,36,0.72); border-color: rgba(214,188,120,0.35); transform: translateY(-1px); }
        .db-tcard-active { border-color: rgba(214,188,120,0.65); background: rgba(40,32,14,0.55); box-shadow: 0 0 0 1px rgba(214,188,120,0.25) inset; }
        .db-tag { font-size: 10.5px; padding: 3px 8px; border-radius: 999px; background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.75); border: 1px solid rgba(255,255,255,0.10); text-transform: uppercase; letter-spacing: 0.08em; display: inline-flex; align-items: center; gap: 4px; }
        .db-tag-juris { background: rgba(214,188,120,0.12); color: #f0dca0; border-color: rgba(214,188,120,0.30); }
        .db-tag-active { background: rgba(102,187,156,0.18); color: #b6ecd1; border-color: rgba(102,187,156,0.40); }
        .db-pill { font-size: 10px; padding: 3px 8px; border-radius: 999px; border: 1px solid transparent; text-transform: uppercase; letter-spacing: 0.08em; white-space: nowrap; }
        .db-pill-basic { background: rgba(102,187,156,0.14); color: #9be0c4; border-color: rgba(102,187,156,0.35); }
        .db-pill-advanced { background: rgba(120,160,220,0.14); color: #b6d0f5; border-color: rgba(120,160,220,0.35); }
        .db-pill-expert { background: rgba(214,120,120,0.14); color: #f0b8b8; border-color: rgba(214,120,120,0.35); }
        .db-cta { display: inline-flex; align-items: center; gap: 8px; padding: 11px 22px; border-radius: 12px; font-size: 13px; font-weight: 500; color: #0d1a22; background: linear-gradient(135deg, #e2c889, #c8a86b); border: 1px solid rgba(214,188,120,0.70); box-shadow: 0 12px 30px rgba(200,168,107,0.25); transition: opacity 160ms ease, transform 160ms ease; cursor: pointer; }
        .db-cta:hover:not(:disabled) { transform: translateY(-1px); }
        .db-cta:disabled { opacity: 0.45; cursor: not-allowed; }
        .db-ghost { display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 10px; font-size: 13px; color: rgba(255,255,255,0.80); background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); cursor: pointer; transition: all 160ms ease; }
        .db-ghost:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .db-chip { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 999px; font-size: 12px; color: rgba(255,255,255,0.80); background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); cursor: pointer; transition: all 140ms ease; }
        .db-chip:hover { background: rgba(255,255,255,0.10); color: #fff; }
        .db-chip-active { background: rgba(214,188,120,0.20); border-color: rgba(214,188,120,0.55); color: #f5e2a5; }
        .db-info { border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 14px 16px; background: rgba(8,18,26,0.45); }
        .db-info-label { font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255,255,255,0.55); }
        .db-info-value { margin-top: 6px; font-size: 14px; color: rgba(255,255,255,0.92); }
        .db-ready { border: 1px solid rgba(214,188,120,0.25); border-radius: 12px; padding: 14px 16px; background: rgba(40,32,14,0.35); }
        .db-step { display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 999px; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.55); background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.10); }
        .db-step-active { color: #0d1a22; background: linear-gradient(135deg, #e2c889, #c8a86b); border-color: rgba(214,188,120,0.70); }
        .db-step-done { color: #b6ecd1; background: rgba(102,187,156,0.12); border-color: rgba(102,187,156,0.35); }
      `}</style>
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items = [
    { n: 1, label: "Шаблон" },
    { n: 2, label: "Карточка" },
    { n: 3, label: "Подготовка" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((it) => {
        const state = step === it.n ? "active" : step > it.n ? "done" : "idle";
        return (
          <div
            key={it.n}
            className={`db-step ${state === "active" ? "db-step-active" : state === "done" ? "db-step-done" : ""}`}
          >
            <span style={{ fontWeight: 600 }}>{it.n}</span>
            <span>{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ChipBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`db-chip ${active ? "db-chip-active" : ""}`}>
      {children}
    </button>
  );
}

function InfoBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="db-info">
      <div className="db-info-label">{title}</div>
      <div className="db-info-value">{value}</div>
    </div>
  );
}

function ReadyBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="db-ready">
      <div className="db-info-label">{title}</div>
      <div className="db-info-value">{value || "—"}</div>
    </div>
  );
}
