import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clipboard, Loader2, Plus, Search, Trash2, Upload } from "lucide-react";
import {
  loadExternalLegalResearchImports,
  saveExternalLegalResearchImports,
  type ExternalLegalResearchImportDraft,
  type ExternalLegalResearchProvider,
} from "@/lib/external-legal-research-staging";
import {
  extractExternalResearchReferences,
  readExternalResearchFile,
  type ExtractedExternalResearchReference,
} from "@/lib/external-legal-research-extractor";
import { buildHumanResearchRequest } from "@/lib/external-research-human-connector";
import { fetchLatestLegalAnalysis } from "@/lib/legal-analysis";

const PROVIDER_LABELS: Record<ExternalLegalResearchProvider, string> = {
  strizh: "Стриж",
  garant: "Гарант",
  consultant: "КонсультантПлюс",
  other: "Другой источник",
  kad: "КАД — ручной импорт",
};

type DraftFields = {
  provider: ExternalLegalResearchProvider;
  answerText: string;
  title: string;
  url: string;
  citation: string;
  documentNumber: string;
  documentDate: string;
  caseNumber: string;
  code: string;
  article: string;
  issueIds: string;
};

const EMPTY_DRAFT: DraftFields = {
  provider: "strizh",
  answerText: "",
  title: "",
  url: "",
  citation: "",
  documentNumber: "",
  documentDate: "",
  caseNumber: "",
  code: "",
  article: "",
  issueIds: "",
};

function issueIds(value: string): string[] {
  return [...new Set(value.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean))].slice(0, 20);
}

function hasReference(draft: DraftFields): boolean {
  return Boolean(
    draft.title.trim() || draft.url.trim() || draft.citation.trim() ||
      draft.documentNumber.trim() || draft.caseNumber.trim(),
  );
}

function inputClass(): string {
  return "db-input h-9 text-xs";
}

function toCandidate(reference: ExtractedExternalResearchReference, researchIssueIds: string[]) {
  return {
    title: reference.title,
    url: reference.url,
    citation: reference.citation,
    document_number: reference.document_number,
    document_date: reference.document_date,
    case_number: reference.case_number,
    code: reference.code,
    article: reference.article,
    research_issue_ids: researchIssueIds,
  };
}

export function ExternalLegalResearchPanel({
  sessionId,
  externalSearchRequired = false,
}: {
  sessionId: string | null;
  externalSearchRequired?: boolean;
}) {
  const [imports, setImports] = useState<ExternalLegalResearchImportDraft[]>([]);
  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [buildingRequest, setBuildingRequest] = useState(false);
  const [humanRequest, setHumanRequest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extractionNotice, setExtractionNotice] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setImports([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadExternalLegalResearchImports(sessionId)
      .then((data) => { if (!cancelled) setImports(data); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId]);

  const candidateCount = useMemo(
    () => imports.reduce((sum, item) => sum + (item.candidates?.length ?? 0) + (item.links?.length ?? 0), 0),
    [imports],
  );

  if (!sessionId) return null;

  const persist = async (next: ExternalLegalResearchImportDraft[]) => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveExternalLegalResearchImports(sessionId, next);
      setImports(saved);
      setSavedAt(new Date().toISOString());
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    const answer = draft.answerText.trim();
    if (!answer && !hasReference(draft)) {
      setError("Добавь ссылку/реквизиты источника или текст ответа research-системы.");
      return;
    }
    const ids = issueIds(draft.issueIds);
    const candidate = hasReference(draft) ? {
      title: draft.title.trim() || null,
      url: draft.url.trim() || null,
      citation: draft.citation.trim() || null,
      document_number: draft.documentNumber.trim() || null,
      document_date: draft.documentDate.trim() || null,
      case_number: draft.caseNumber.trim() || null,
      code: draft.code.trim() || null,
      article: draft.article.trim() || null,
      research_issue_ids: ids,
    } : null;

    if (await persist([...imports, {
      provider: draft.provider,
      answer_text: answer || null,
      candidates: candidate ? [candidate] : [],
      research_issue_ids: ids,
    }])) setDraft(EMPTY_DRAFT);
  };

  const addExtractedReferences = async (
    text: string,
    references: ExtractedExternalResearchReference[],
    warnings: string[],
    sourceLabel: string,
  ) => {
    const ids = issueIds(draft.issueIds);
    if (references.length === 0) {
      setExtractionNotice(
        warnings.includes("no_deterministic_references_found")
          ? `В ${sourceLabel} не найдены однозначные реквизиты. Текст можно сохранить как narrative, но он не станет источником.`
          : `В ${sourceLabel} не найдены ссылки или реквизиты источников.`,
      );
      if (text.trim()) setDraft((current) => ({ ...current, answerText: text.slice(0, 60_000) }));
      return;
    }

    const next: ExternalLegalResearchImportDraft[] = [...imports, {
      provider: draft.provider,
      answer_text: text.trim() || null,
      candidates: references.map((reference) => toCandidate(reference, ids)),
      research_issue_ids: ids,
    }];

    if (await persist(next)) {
      setDraft((current) => ({ ...EMPTY_DRAFT, provider: current.provider }));
      setExtractionNotice(
        `Из ${sourceLabel} извлечено кандидатов: ${references.length}. Они сохранены только как discovery references и будут допущены к использованию лишь после canonical match.`,
      );
    }
  };

  const autoExtract = async () => {
    const text = draft.answerText.trim();
    if (!text) {
      setError("Вставь ответ research-системы, затем запусти автоизвлечение реквизитов.");
      return;
    }
    setExtracting(true);
    setError(null);
    setExtractionNotice(null);
    try {
      const result = extractExternalResearchReferences(text);
      await addExtractedReferences(result.text, result.references, result.warnings, "вставленного текста");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExtracting(false);
    }
  };

  const handleResearchFile = async (file: File | null) => {
    if (!file) return;
    setExtracting(true);
    setError(null);
    setExtractionNotice(null);
    try {
      const result = await readExternalResearchFile(file);
      await addExtractedReferences(result.text, result.references, result.warnings, `файла «${file.name}»`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExtracting(false);
    }
  };

  const buildStrizhRequest = async () => {
    setBuildingRequest(true);
    setError(null);
    try {
      const run = await fetchLatestLegalAnalysis(sessionId);
      const request = buildHumanResearchRequest("strizh", run?.analysis ?? null);
      setHumanRequest(request.prompt);
      if (request.issue_ids.length > 0) {
        setDraft((current) => ({ ...current, provider: "strizh", issueIds: request.issue_ids.join(", ") }));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuildingRequest(false);
    }
  };

  const copyHumanRequest = async () => {
    if (!humanRequest) return;
    try {
      await navigator.clipboard.writeText(humanRequest);
      setExtractionNotice("Запрос для Стриж скопирован. Отправь его в Стриж, затем вставь ответ сюда или загрузи экспортированный файл.");
    } catch {
      setError("Не удалось скопировать автоматически. Выдели текст запроса вручную.");
    }
  };

  const remove = async (index: number) => {
    await persist(imports.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div className={`db-subcard ${externalSearchRequired ? "border-amber-400/30 bg-amber-500/5" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="db-section-label">Внешнее правовое исследование</div>
          <div className="mt-1 text-[11px] text-white/55">Стриж / Гарант / КонсультантПлюс / другой research-инструмент.</div>
        </div>
        <div className="text-[11px] text-white/55">Сохранено ссылок/кандидатов: <span className="text-white/85">{candidateCount}</span></div>
      </div>

      {externalSearchRequired && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-500/10 p-2 text-xs text-amber-100">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Текущий анализ требует дополнительного внешнего поиска. Добавь найденные документы и затем перезапусти AI правовой анализ.
        </div>
      )}

      <div className="mt-3 rounded-md border border-white/10 bg-white/5 p-3 text-[11px] text-white/60">
        Research narrative сам по себе не становится фактом или источником. TXT/MD/HTML/RTF/DOCX читаются локально; PDF/JPG/PNG/WEBP проходят отдельный OCR без записи в документы дела. После OCR извлекаются только явные реквизиты, а непроверенный импорт не попадает в TrustedSource и генерацию.
      </div>

      <div className="mt-3 rounded-md border border-sky-300/20 bg-sky-500/5 p-3">
        <div className="text-xs font-medium text-sky-100">Human Research Connector — Стриж</div>
        <div className="mt-1 text-[11px] text-white/55">
          Публичного документированного API/MCP Стриж не подключаем через догадки. Вместо этого KATI LAWYER формирует запрос из текущих research gaps, Challenge и search-only контекста; ответ возвращается через безопасный импорт ниже.
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="db-ghost" disabled={buildingRequest} onClick={() => void buildStrizhRequest()}>
            {buildingRequest ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Сформировать запрос для Стриж
          </button>
          {humanRequest && (
            <button type="button" className="db-ghost" onClick={() => void copyHumanRequest()}>
              <Clipboard size={13} /> Копировать запрос
            </button>
          )}
        </div>
        {humanRequest && (
          <textarea
            className="db-input mt-2 min-h-[180px] w-full text-[11px]"
            readOnly
            value={humanRequest}
            aria-label="Запрос для Стриж"
          />
        )}
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-white/65"><Loader2 size={13} className="animate-spin" /> Загрузка внешнего исследования…</div>
      ) : (
        <>
          {imports.length > 0 && (
            <div className="mt-3 space-y-2">
              {imports.map((item, index) => (
                <div key={`${item.provider}-${index}`} className="rounded-md border border-white/10 bg-white/5 p-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-white/90">{PROVIDER_LABELS[item.provider]}</div>
                      {(item.candidates ?? []).map((candidate, candidateIndex) => (
                        <div key={candidateIndex} className={candidateIndex > 0 ? "mt-2 border-t border-white/10 pt-2" : "mt-1"}>
                          {candidate.title && <div className="text-white/80">{candidate.title}</div>}
                          {candidate.citation && <div className="text-white/65">{candidate.citation}</div>}
                          {candidate.url && <div className="truncate text-sky-300">{candidate.url}</div>}
                          {(candidate.document_number || candidate.document_date) && <div className="text-white/55">{[candidate.document_number, candidate.document_date].filter(Boolean).join(" · ")}</div>}
                          {candidate.case_number && <div className="text-white/55">Дело: {candidate.case_number}</div>}
                          {(candidate.code || candidate.article) && <div className="text-white/55">{[candidate.code, candidate.article ? `ст. ${candidate.article}` : null].filter(Boolean).join(" ")}</div>}
                        </div>
                      ))}
                      {(item.research_issue_ids?.length ?? 0) > 0 && <div className="mt-1 text-[11px] text-white/45">Issues: {item.research_issue_ids?.join(", ")}</div>}
                      {item.answer_text && <div className="mt-1 text-[11px] text-white/45">Research narrative сохранён в staging, но не используется как источник.</div>}
                    </div>
                    <button type="button" className="db-ghost shrink-0" disabled={saving} onClick={() => void remove(index)} title="Удалить из внешнего исследования"><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <label className="text-[11px] text-white/60">Research-система
              <select className={`${inputClass()} mt-1 w-full`} value={draft.provider} onChange={(e) => setDraft((current) => ({ ...current, provider: e.target.value as ExternalLegalResearchProvider }))}>
                {Object.entries(PROVIDER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-white/60">Название документа
              <input className={`${inputClass()} mt-1 w-full`} value={draft.title} onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value }))} placeholder="Например: Письмо ФНС России…" />
            </label>
            <label className="text-[11px] text-white/60 md:col-span-2">Ссылка
              <input className={`${inputClass()} mt-1 w-full`} value={draft.url} onChange={(e) => setDraft((current) => ({ ...current, url: e.target.value }))} placeholder="https://…" />
            </label>
            <label className="text-[11px] text-white/60 md:col-span-2">Цитата / реквизит источника
              <input className={`${inputClass()} mt-1 w-full`} value={draft.citation} onChange={(e) => setDraft((current) => ({ ...current, citation: e.target.value }))} placeholder="НК РФ ст. 54.1 / Письмо ФНС от … № …" />
            </label>
            <label className="text-[11px] text-white/60">Номер документа
              <input className={`${inputClass()} mt-1 w-full`} value={draft.documentNumber} onChange={(e) => setDraft((current) => ({ ...current, documentNumber: e.target.value }))} placeholder="№ АБ-4-20/1234" />
            </label>
            <label className="text-[11px] text-white/60">Дата документа
              <input type="date" className={`${inputClass()} mt-1 w-full`} value={draft.documentDate} onChange={(e) => setDraft((current) => ({ ...current, documentDate: e.target.value }))} />
            </label>
            <label className="text-[11px] text-white/60">Номер дела
              <input className={`${inputClass()} mt-1 w-full`} value={draft.caseNumber} onChange={(e) => setDraft((current) => ({ ...current, caseNumber: e.target.value }))} placeholder="А40-…" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-white/60">Кодекс
                <input className={`${inputClass()} mt-1 w-full`} value={draft.code} onChange={(e) => setDraft((current) => ({ ...current, code: e.target.value }))} placeholder="НК РФ" />
              </label>
              <label className="text-[11px] text-white/60">Статья
                <input className={`${inputClass()} mt-1 w-full`} value={draft.article} onChange={(e) => setDraft((current) => ({ ...current, article: e.target.value }))} placeholder="54.1" />
              </label>
            </div>
            <label className="text-[11px] text-white/60 md:col-span-2">Research issue IDs
              <input className={`${inputClass()} mt-1 w-full`} value={draft.issueIds} onChange={(e) => setDraft((current) => ({ ...current, issueIds: e.target.value }))} placeholder="issue-1, issue-2" />
            </label>
            <label className="text-[11px] text-white/60 md:col-span-2">Ответ research-системы (необязательно)
              <textarea className="db-input mt-1 min-h-[96px] w-full text-xs" value={draft.answerText} onChange={(e) => setDraft((current) => ({ ...current, answerText: e.target.value }))} placeholder="Вставь ответ Стриж / Гарант / КонсультантПлюс. Можно автоматически извлечь из него явные ссылки и реквизиты." />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="db-ghost" disabled={saving || extracting} onClick={() => void autoExtract()}>
              {extracting ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Автоизвлечь реквизиты
            </button>
            <label className={`db-ghost cursor-pointer ${saving || extracting ? "pointer-events-none opacity-60" : ""}`}>
              <Upload size={13} /> Загрузить research-файл
              <input
                type="file"
                className="hidden"
                accept=".txt,.md,.html,.htm,.rtf,.docx,.pdf,.jpg,.jpeg,.png,.webp,text/plain,text/html,application/rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,image/jpeg,image/png,image/webp"
                disabled={saving || extracting}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  e.currentTarget.value = "";
                  void handleResearchFile(file);
                }}
              />
            </label>
            <span className="text-[10px] text-white/40">TXT · MD · HTML · RTF · DOCX · PDF · JPG · PNG · WEBP · до 10 МБ для OCR</span>
          </div>

          {extractionNotice && <div className="mt-2 rounded-md border border-sky-300/20 bg-sky-500/5 p-2 text-[11px] text-sky-100">{extractionNotice}</div>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="db-cta" disabled={saving || extracting} onClick={() => void add()}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} {saving ? "Сохранение…" : "Добавить к исследованию вручную"}
            </button>
            {savedAt && !saving && <span className="inline-flex items-center gap-1 text-[11px] text-emerald-200"><CheckCircle2 size={12} /> Сохранено {new Date(savedAt).toLocaleTimeString("ru-RU")}</span>}
          </div>
        </>
      )}

      {error && <div className="mt-2 text-xs text-rose-200">{error}</div>}
    </div>
  );
}
