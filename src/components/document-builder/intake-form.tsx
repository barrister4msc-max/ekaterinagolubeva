import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, Plus, Trash2, Upload, Sparkles, AlertTriangle } from "lucide-react";
import {
  type DocumentIntakeSchema,
  type IntakeField,
  type IntakeState,
  type IntakeAnswers,
  type IntakeAttachment,
  validateIntake,
  getMissingRequiredFields,
} from "@/lib/document-intake-schemas";
import {
  CATEGORY_LABELS,
  COMPLEXITY_LABELS,
  JURISDICTION_LABELS,
  LANGUAGE_LABELS,
  PRACTICE_AREA_LABELS,
  type DocumentTemplate,
} from "@/lib/document-templates";
import { buildGenerateRequest } from "@/lib/generate-legal-document";

type Props = {
  schema: DocumentIntakeSchema;
  state: IntakeState;
  template: DocumentTemplate;
  onChange: (next: IntakeState) => void;
  onSubmit: (state: IntakeState) => void;
  onBack: () => void;
};

export function IntakeForm({ schema, state, template, onChange, onSubmit, onBack }: Props) {
  const steps = schema.schema_json?.steps ?? [];
  const [stepIdx, setStepIdx] = useState(0);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const totalSteps = steps.length + 1; // +1 for review

  const requiredSet = useMemo(
    () => new Set(schema.required_fields ?? []),
    [schema.required_fields],
  );

  const validation = useMemo(() => validateIntake(schema, state.answers), [schema, state.answers]);
  const missing = useMemo(() => getMissingRequiredFields(schema, state.answers), [schema, state.answers]);

  const issuesByField = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of validation.issues) map.set(i.fieldKey, i.message);
    return map;
  }, [validation]);

  const setAnswer = (key: string, value: unknown) => {
    onChange({ ...state, answers: { ...state.answers, [key]: value } });
  };
  const setMode = (mode: IntakeState["generationMode"]) =>
    onChange({ ...state, generationMode: mode });
  const setInstructions = (v: string) => onChange({ ...state, specialInstructions: v });
  const addAttachment = (a: IntakeAttachment) =>
    onChange({ ...state, attachments: [...state.attachments, a] });
  const removeAttachment = (id: string) =>
    onChange({ ...state, attachments: state.attachments.filter((x) => x.id !== id) });

  if (steps.length === 0) {
    return (
      <div className="db-info">
        <div className="db-info-label">Опросник</div>
        <div className="db-info-value">Схема не содержит шагов.</div>
      </div>
    );
  }

  const isReview = stepIdx >= steps.length;
  const currentStep = steps[Math.min(stepIdx, steps.length - 1)];

  const goNext = () => setStepIdx((i) => Math.min(i + 1, totalSteps - 1));
  const goPrev = () => {
    if (stepIdx === 0) return onBack();
    setStepIdx((i) => i - 1);
  };

  const markTouchedForStep = (s: typeof currentStep) => {
    const next: Record<string, boolean> = { ...touched };
    for (const f of s.fields) next[f.key] = true;
    setTouched(next);
  };

  const markAllTouched = () => {
    const next: Record<string, boolean> = { ...touched };
    for (const s of steps) for (const f of s.fields) next[f.key] = true;
    setTouched(next);
  };

  const handleNext = () => {
    if (isReview) return;
    markTouchedForStep(currentStep);
    const hasErrInStep = currentStep.fields.some((f) => issuesByField.get(f.key));
    if (hasErrInStep) return;
    // About to enter the review step → enforce full validation
    const nextIdx = stepIdx + 1;
    if (nextIdx >= steps.length && !validation.valid) {
      markAllTouched();
      return;
    }
    goNext();
  };

  const progressPct = Math.round(((stepIdx + 1) / totalSteps) * 100);
  const currentTitle = isReview ? "Предпросмотр подготовки документа" : currentStep.title;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-white/60">
          <span>Шаг {Math.min(stepIdx + 1, totalSteps)} из {totalSteps}</span>
          <span className="text-white/85 normal-case tracking-normal text-xs">{currentTitle}</span>
          <span>{progressPct}%</span>
        </div>
        <div className="db-progress"><div className="db-progress-bar" style={{ width: `${progressPct}%` }} /></div>
      </div>

      <div className="db-substepper">
        {steps.map((s, i) => {
          const status = i === stepIdx ? "active" : i < stepIdx ? "done" : "idle";
          return (
            <div key={s.id} className={`db-substep ${status === "active" ? "db-substep-active" : status === "done" ? "db-substep-done" : ""}`}>
              <span style={{ fontWeight: 600 }}>{i + 1}</span>
              <span>{s.title}</span>
            </div>
          );
        })}
        <div className={`db-substep ${isReview ? "db-substep-active" : ""}`}>
          <span style={{ fontWeight: 600 }}>{steps.length + 1}</span>
          <span>Предпросмотр</span>
        </div>
      </div>

      {!isReview && missing.length > 0 && stepIdx === steps.length - 1 && (
        <div className="db-warning">
          Для перехода к предпросмотру заполните: {missing.map((m) => m.label).join(", ")}.
        </div>
      )}

      {!isReview && (
        <div className="space-y-5">
          <div>
            <div className="db-section-label">{currentStep.title}</div>
            {currentStep.description && (
              <p className="mt-2 text-sm text-white/70">{currentStep.description}</p>
            )}
          </div>

          <div className="grid gap-4">
            {currentStep.fields.map((f) => {
              const required = f.required || requiredSet.has(f.key);
              const error = touched[f.key] ? issuesByField.get(f.key) : undefined;
              return (
                <FieldRow
                  key={f.key}
                  field={{ ...f, required }}
                  value={state.answers[f.key]}
                  error={error}
                  onChange={(v) => setAnswer(f.key, v)}
                  onBlur={() => setTouched((t) => ({ ...t, [f.key]: true }))}
                />
              );
            })}
          </div>
        </div>
      )}

      {isReview && (
        <ReviewStep
          schema={schema}
          state={state}
          template={template}
          missing={missing}
          onSetMode={setMode}
          onSetInstructions={setInstructions}
          onAddAttachment={addAttachment}
          onRemoveAttachment={removeAttachment}
          answers={state.answers}
        />
      )}

      <div className="flex items-center justify-between pt-2">
        <button type="button" onClick={goPrev} className="db-ghost">
          <ArrowLeft size={14} /> Назад
        </button>
        {!isReview ? (
          <button type="button" onClick={handleNext} className="db-cta">
            Далее <ArrowRight size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSubmit(state)}
            disabled={!validation.valid}
            className="db-cta"
            title={!validation.valid ? "Заполните обязательные поля" : "Сформировать черновик"}
          >
            <Sparkles size={14} /> Сформировать черновик документа
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FieldRow
// ---------------------------------------------------------------------------

function FieldRow({
  field,
  value,
  error,
  onChange,
  onBlur,
}: {
  field: IntakeField;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
  onBlur: () => void;
}) {
  return (
    <div className="db-field">
      <label className="db-field-label">
        {field.label}
        {field.required && <span className="db-required">*</span>}
      </label>
      <FieldInput field={field} value={value} onChange={onChange} onBlur={onBlur} />
      {field.help && !error && <div className="db-field-help">{field.help}</div>}
      {error && <div className="db-field-error">{error}</div>}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  onBlur,
}: {
  field: IntakeField;
  value: unknown;
  onChange: (v: unknown) => void;
  onBlur: () => void;
}) {
  const common = {
    onBlur,
    placeholder: field.placeholder ?? "",
    className: "db-input",
  } as const;

  switch (field.type) {
    case "text":
      return <input type="text" value={asStr(value)} onChange={(e) => onChange(e.target.value)} {...common} />;
    case "email":
      return <input type="email" value={asStr(value)} onChange={(e) => onChange(e.target.value)} {...common} />;
    case "phone":
      return <input type="tel" value={asStr(value)} onChange={(e) => onChange(e.target.value)} {...common} />;
    case "date":
      return <input type="date" value={asStr(value)} onChange={(e) => onChange(e.target.value)} {...common} />;
    case "number":
      return (
        <input
          type="number"
          value={asStr(value)}
          min={field.min}
          max={field.max}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          {...common}
        />
      );
    case "money":
      return (
        <div className="flex gap-2">
          <input
            type="number"
            value={asStr(value)}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            {...common}
          />
          <div className="db-suffix">{field.currency ?? "RUB"}</div>
        </div>
      );
    case "percentage":
      return (
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            max={100}
            value={asStr(value)}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            {...common}
          />
          <div className="db-suffix">%</div>
        </div>
      );
    case "boolean":
      return (
        <div className="flex gap-2">
          <button type="button" className={`db-chip ${value === true ? "db-chip-active" : ""}`} onClick={() => onChange(true)}>Да</button>
          <button type="button" className={`db-chip ${value === false ? "db-chip-active" : ""}`} onClick={() => onChange(false)}>Нет</button>
        </div>
      );
    case "select":
      return (
        <select className="db-select" value={asStr(value)} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}>
          <option value="">— не выбрано —</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    case "multiselect":
    case "clause_options": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (v: string) => {
        if (arr.includes(v)) onChange(arr.filter((x) => x !== v));
        else onChange([...arr, v]);
      };
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((o) => {
            const active = arr.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={`db-chip ${active ? "db-chip-active" : ""}`}
                title={o.description ?? ""}
              >
                {active && <Check size={11} />} {o.label}
              </button>
            );
          })}
        </div>
      );
    }
    case "country":
    case "jurisdiction":
      return (
        <input type="text" value={asStr(value)} onChange={(e) => onChange(e.target.value)} {...common} placeholder={field.placeholder ?? (field.type === "country" ? "Россия / Cyprus / Israel…" : "RU / CY / IL / GE")} />
      );
    case "address":
      return <textarea rows={2} value={asStr(value)} onChange={(e) => onChange(e.target.value)} {...common} />;
    case "party_list":
      return <PartyListInput value={value} onChange={onChange} />;
    case "share_structure":
      return <ShareStructureInput value={value} onChange={onChange} />;
    case "company_data":
      return <CompanyDataInput value={value} onChange={onChange} />;
    case "person_data":
      return <PersonDataInput value={value} onChange={onChange} />;
    case "file_upload":
      return <FileUploadInput value={value} onChange={onChange} />;
    case "textarea":
    default:
      return <textarea rows={4} value={asStr(value)} onChange={(e) => onChange(e.target.value)} {...common} />;
  }
}

// ---------------------------------------------------------------------------
// Complex inputs
// ---------------------------------------------------------------------------

type Party = { role: string; kind: "company" | "person"; name: string; details?: string };

function PartyListInput({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const items = Array.isArray(value) ? (value as Party[]) : [];
  const update = (i: number, patch: Partial<Party>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const add = () => onChange([...items, { role: "", kind: "company", name: "" }]);
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      {items.map((p, i) => (
        <div key={i} className="db-subcard">
          <div className="grid gap-2 md:grid-cols-[1fr_140px_1fr_auto]">
            <input className="db-input" placeholder="Роль (Покупатель, Заказчик…)" value={p.role} onChange={(e) => update(i, { role: e.target.value })} />
            <select className="db-select" value={p.kind} onChange={(e) => update(i, { kind: e.target.value as Party["kind"] })}>
              <option value="company">Юр. лицо</option>
              <option value="person">Физ. лицо</option>
            </select>
            <input className="db-input" placeholder="Наименование" value={p.name} onChange={(e) => update(i, { name: e.target.value })} />
            <button type="button" className="db-ghost" onClick={() => remove(i)} aria-label="Удалить"><Trash2 size={14} /></button>
          </div>
          <textarea className="db-input mt-2" rows={2} placeholder="Реквизиты, адрес, представитель…" value={p.details ?? ""} onChange={(e) => update(i, { details: e.target.value })} />
        </div>
      ))}
      <button type="button" className="db-ghost" onClick={add}><Plus size={14} /> Добавить сторону</button>
    </div>
  );
}

type Shareholder = { name: string; shares: number; class?: string };

function ShareStructureInput({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const items = Array.isArray(value) ? (value as Shareholder[]) : [];
  const total = items.reduce((acc, x) => acc + (Number(x.shares) || 0), 0);
  const update = (i: number, patch: Partial<Shareholder>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const add = () => onChange([...items, { name: "", shares: 0, class: "Ordinary" }]);
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      {items.map((s, i) => (
        <div key={i} className="db-subcard grid gap-2 md:grid-cols-[1fr_120px_140px_auto]">
          <input className="db-input" placeholder="Участник / Shareholder" value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
          <input className="db-input" type="number" placeholder="Доли %" value={s.shares} onChange={(e) => update(i, { shares: Number(e.target.value) })} />
          <input className="db-input" placeholder="Класс акций" value={s.class ?? ""} onChange={(e) => update(i, { class: e.target.value })} />
          <button type="button" className="db-ghost" onClick={() => remove(i)} aria-label="Удалить"><Trash2 size={14} /></button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button type="button" className="db-ghost" onClick={add}><Plus size={14} /> Добавить участника</button>
        <div className="text-xs text-white/60">Итого: <span className={total === 100 ? "text-emerald-300" : "text-amber-300"}>{total}%</span></div>
      </div>
    </div>
  );
}

function CompanyDataInput({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const v = (value as Record<string, string> | null) ?? {};
  const set = (k: string, val: string) => onChange({ ...v, [k]: val });
  return (
    <div className="db-subcard grid gap-2 md:grid-cols-2">
      <input className="db-input" placeholder="Наименование" value={v.name ?? ""} onChange={(e) => set("name", e.target.value)} />
      <input className="db-input" placeholder="Страна регистрации" value={v.country ?? ""} onChange={(e) => set("country", e.target.value)} />
      <input className="db-input" placeholder="Регистрационный номер" value={v.reg_number ?? ""} onChange={(e) => set("reg_number", e.target.value)} />
      <input className="db-input" placeholder="Налоговый номер / VAT" value={v.tax_id ?? ""} onChange={(e) => set("tax_id", e.target.value)} />
      <input className="db-input md:col-span-2" placeholder="Юридический адрес" value={v.address ?? ""} onChange={(e) => set("address", e.target.value)} />
      <input className="db-input" placeholder="Представитель" value={v.representative ?? ""} onChange={(e) => set("representative", e.target.value)} />
      <input className="db-input" placeholder="Должность" value={v.position ?? ""} onChange={(e) => set("position", e.target.value)} />
    </div>
  );
}

function PersonDataInput({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const v = (value as Record<string, string> | null) ?? {};
  const set = (k: string, val: string) => onChange({ ...v, [k]: val });
  return (
    <div className="db-subcard grid gap-2 md:grid-cols-2">
      <input className="db-input" placeholder="ФИО / Full name" value={v.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} />
      <input className="db-input" placeholder="Гражданство" value={v.citizenship ?? ""} onChange={(e) => set("citizenship", e.target.value)} />
      <input className="db-input" placeholder="Документ (паспорт, ID)" value={v.id_document ?? ""} onChange={(e) => set("id_document", e.target.value)} />
      <input className="db-input" placeholder="Номер документа" value={v.id_number ?? ""} onChange={(e) => set("id_number", e.target.value)} />
      <input className="db-input md:col-span-2" placeholder="Адрес регистрации" value={v.address ?? ""} onChange={(e) => set("address", e.target.value)} />
    </div>
  );
}

function FileUploadInput({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const files = Array.isArray(value) ? (value as Array<{ name: string; size?: number }>) : [];
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []).map((f) => ({ name: f.name, size: f.size, mimeType: f.type }));
    onChange([...files, ...list]);
    e.target.value = "";
  };
  const remove = (i: number) => onChange(files.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2">
      <label className="db-uploader">
        <Upload size={14} />
        <span>Выберите файлы</span>
        <input type="file" multiple className="hidden" onChange={onPick} />
      </label>
      {files.length > 0 && (
        <ul className="space-y-1 text-xs text-white/75">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-2 db-subcard py-2">
              <span className="truncate">{f.name}</span>
              <button type="button" className="db-ghost" onClick={() => remove(i)} aria-label="Удалить"><Trash2 size={12} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review step
// ---------------------------------------------------------------------------

function ReviewStep({
  schema,
  state,
  template,
  missing,
  onSetMode,
  onSetInstructions,
  onAddAttachment,
  onRemoveAttachment,
  answers,
}: {
  schema: DocumentIntakeSchema;
  state: IntakeState;
  template: DocumentTemplate;
  missing: IntakeField[];
  onSetMode: (m: IntakeState["generationMode"]) => void;
  onSetInstructions: (s: string) => void;
  onAddAttachment: (a: IntakeAttachment) => void;
  onRemoveAttachment: (id: string) => void;
  answers: IntakeAnswers;
}) {
  const modes: Array<{ id: IntakeState["generationMode"]; title: string; desc: string }> = [
    { id: "standalone", title: "Самостоятельно", desc: "Только данные опросника" },
    { id: "matter_based", title: "На основе дела", desc: "Подтянуть материалы из дела" },
    { id: "hybrid", title: "Гибрид", desc: "Опросник + материалы дела" },
  ];

  const warnings = schema.schema_json?.warnings ?? [];

  const onPickAttachments = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    for (const f of list) {
      onAddAttachment({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: f.name,
        mimeType: f.type,
        size: f.size,
      });
    }
    e.target.value = "";
  };

  return (
    <div className="space-y-5">
      <div className="db-subcard">
        <div className="db-section-label">Предпросмотр подготовки документа</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <PreviewRow label="Шаблон" value={`${template.title}`} hint={template.code} />
          <PreviewRow label="Категория" value={CATEGORY_LABELS[template.category] ?? template.category} hint={template.subcategory ?? undefined} />
          <PreviewRow label="Область права" value={template.practice_area ? (PRACTICE_AREA_LABELS[template.practice_area] ?? template.practice_area) : "—"} />
          <PreviewRow label="Сложность" value={COMPLEXITY_LABELS[template.complexity]} />
          <PreviewRow label="Юрисдикция" value={JURISDICTION_LABELS[state.jurisdiction] ?? state.jurisdiction} />
          <PreviewRow label="Язык" value={LANGUAGE_LABELS[state.language] ?? state.language} />
          <PreviewRow label="Режим генерации" value={modes.find((m) => m.id === state.generationMode)?.title ?? state.generationMode} />
          <PreviewRow label="Файлы" value={state.attachments.length > 0 ? `${state.attachments.length} файл(а/ов)` : "—"} />
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="db-warning">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Важно учесть:</div>
              <ul className="mt-1 list-disc pl-5 space-y-1">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="db-section-label">Режим генерации</div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {modes.map((m) => {
            const active = state.generationMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSetMode(m.id)}
                className={`db-tcard text-left ${active ? "db-tcard-active" : ""}`}
              >
                <div className="text-sm font-medium text-white">{m.title}</div>
                <div className="mt-1 text-xs text-white/60">{m.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="db-section-label">Сводка ответов</div>
        <div className="mt-3 db-subcard">
          {schema.schema_json.steps.flatMap((s) => s.fields).map((f) => {
            const v = answers[f.key];
            return (
              <div key={f.key} className="flex items-start justify-between gap-3 border-b border-white/5 py-2 last:border-0">
                <div className="text-xs uppercase tracking-wider text-white/55">{f.label}</div>
                <div className="text-xs text-white/85 max-w-[60%] text-right break-words">{formatValue(v)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {missing.length > 0 && (
        <div className="db-warning">
          Не заполнены обязательные поля: {missing.map((m) => m.label).join(", ")}.
        </div>
      )}

      <div>
        <div className="db-section-label">Дополнительные материалы</div>
        <div className="mt-3 space-y-2">
          <label className="db-uploader">
            <Upload size={14} />
            <span>Прикрепить файлы</span>
            <input type="file" multiple className="hidden" onChange={onPickAttachments} />
          </label>
          {state.attachments.length > 0 && (
            <ul className="space-y-1 text-xs text-white/75">
              {state.attachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 db-subcard py-2">
                  <span className="truncate">{a.fileName}</span>
                  <button type="button" className="db-ghost" onClick={() => onRemoveAttachment(a.id)} aria-label="Удалить"><Trash2 size={12} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div>
        <div className="db-section-label">Особые указания</div>
        <textarea
          className="db-input mt-3"
          rows={4}
          placeholder="Уточнения для подготовки документа: стиль, акценты, тон, обязательные ссылки…"
          value={state.specialInstructions}
          onChange={(e) => onSetInstructions(e.target.value)}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// utils
// ---------------------------------------------------------------------------

function PreviewRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="db-info">
      <div className="db-info-label">{label}</div>
      <div className="db-info-value">{value || "—"}</div>
      {hint && <div className="mt-1 text-[11px] text-white/50">{hint}</div>}
    </div>
  );
}


function asStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Да" : "Нет";
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    if (typeof v[0] === "string" || typeof v[0] === "number") return v.join(", ");
    return `${v.length} зап.`;
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const parts = Object.entries(obj)
      .filter(([, val]) => val !== "" && val !== null && val !== undefined)
      .map(([k, val]) => `${k}: ${formatValue(val)}`);
    return parts.join("; ") || "—";
  }
  return String(v);
}
