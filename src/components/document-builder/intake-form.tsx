import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Copy, FileText, Plus, Trash2, Upload, Sparkles, AlertTriangle, X, Loader2, CircleAlert, CircleCheck, CircleDashed } from "lucide-react";
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
import {
  createOrLoadIntakeSession,
  saveIntakeAnswers,
} from "@/lib/document-intake-storage";
import { supabase } from "@/integrations/supabase/client";
import { LegalAnalysisPanel } from "@/components/document-builder/legal-analysis-panel";
import { SourceReviewCenter } from "@/components/document-builder/source-review-center";
import {
  runGenerationPreflight,
  type PreflightCheck,
  type PreflightResult,
} from "@/lib/document-generation-preflight";

type IntakeContext = {
  matterId?: string | null;
  clientId?: string | null;
  leadId?: string | null;
  documentId?: string | null;
};

type Props = {
  schema: DocumentIntakeSchema;
  state: IntakeState;
  template: DocumentTemplate;
  onChange: (next: IntakeState) => void;
  onSubmit: (state: IntakeState, sessionId?: string | null) => void;
  onBack: () => void;
  availableModes?: Array<IntakeState["generationMode"]>;
  submitting?: boolean;
  intakeContext?: IntakeContext;
  initialSessionId?: string | null;
};

export function IntakeForm({ schema, state, template, onChange, onSubmit, onBack, availableModes, submitting, intakeContext, initialSessionId }: Props) {
  const steps = schema.schema_json?.steps ?? [];
  const [stepIdx, setStepIdx] = useState(0);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [intakeSessionId, setIntakeSessionId] = useState<string | null>(initialSessionId ?? null);
  useEffect(() => {
    if (initialSessionId && initialSessionId !== intakeSessionId) {
      setIntakeSessionId(initialSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId]);


type SessionDocument = {
  id: string;
  title: string | null;
  file_name: string | null;
  ocr_text_length: number;
  ocr_text: string | null;
  redaction_status: import("@/lib/document-redaction").RedactionStatus | null;
  contains_personal_data: boolean;
  contains_passport_data: boolean;
  contains_bank_data: boolean;
  contains_signature: boolean;
  redaction_notes: string[];
  redacted_text: string | null;
  redaction_quality: import("@/lib/legal-redaction").RedactionQuality | null;
  redaction_stats: import("@/lib/legal-redaction").RedactionStats | null;
  redaction_remaining_entities: import("@/lib/legal-redaction").RemainingEntity[];
};
const [sessionDocuments, setSessionDocuments] = useState<SessionDocument[]>([]);
const [redactionDocId, setRedactionDocId] = useState<string | null>(null);

const [isUploadingDocument, setIsUploadingDocument] = useState(false);

const [isAiFilling, setIsAiFilling] = useState(false);
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
  const ensureSession = async () => {
    const session = await createOrLoadIntakeSession({
      matterId: intakeContext?.matterId ?? null,
      clientId: intakeContext?.clientId ?? null,
      leadId: intakeContext?.leadId ?? null,
      documentId: intakeContext?.documentId ?? null,
      draftKey: intakeSessionId,
      templateCode: state.templateCode,
      jurisdiction: state.jurisdiction,
      language: state.language,
    });
    setIntakeSessionId(session.id);
    await saveIntakeAnswers({
      sessionId: session.id,
      schema,
      answers: state.answers,
      valueSource: "manual",
    });
    return session.id;
  };

  const refreshSessionDocuments = useCallback(async (sid: string | null) => {
    if (!sid) {
      setSessionDocuments([]);
      return;
    }
    const { data, error } = await supabase
      .from("documents")
      .select("id, title, file_name, ocr_text, metadata")
      .filter("metadata->>intake_session_id", "eq", sid)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Failed to load session documents", error);
      return;
    }
    setSessionDocuments(
      (data ?? []).map((d: any) => {
        const meta = (d.metadata ?? {}) as Record<string, unknown>;
        const notes = Array.isArray(meta.redaction_notes)
          ? (meta.redaction_notes as string[])
          : [];
        return {
          id: d.id,
          title: d.title,
          file_name: d.file_name,
          ocr_text: typeof d.ocr_text === "string" ? (d.ocr_text as string) : null,
          ocr_text_length: typeof d.ocr_text === "string" ? d.ocr_text.length : 0,
          redaction_status:
            (meta.redaction_status as import("@/lib/document-redaction").RedactionStatus | null) ??
            null,
          contains_personal_data: Boolean(meta.contains_personal_data),
          contains_passport_data: Boolean(meta.contains_passport_data),
          contains_bank_data: Boolean(meta.contains_bank_data),
          contains_signature: Boolean(meta.contains_signature),
          redaction_notes: notes,
          redacted_text:
            typeof meta.redacted_text === "string" ? (meta.redacted_text as string) : null,
          redaction_quality:
            (meta.redaction_quality as import("@/lib/legal-redaction").RedactionQuality | null) ??
            null,
          redaction_stats:
            (meta.redaction_stats as import("@/lib/legal-redaction").RedactionStats | null) ?? null,
          redaction_remaining_entities: Array.isArray(meta.redaction_remaining_entities)
            ? (meta.redaction_remaining_entities as import("@/lib/legal-redaction").RemainingEntity[])
            : [],
        };
      }),
    );
  }, []);

  useEffect(() => {
    refreshSessionDocuments(intakeSessionId);
  }, [intakeSessionId, refreshSessionDocuments]);

  // Phase C — auto-detect personal data on freshly-OCR-ed documents that have
  // never been screened (no redaction_status in metadata).
  useEffect(() => {
    const needsScan = sessionDocuments.filter(
      (d) => d.ocr_text_length > 30 && d.redaction_status === null,
    );
    if (needsScan.length === 0) return;
    let cancelled = false;
    (async () => {
      const { detectAndPersistRedaction } = await import("@/lib/document-redaction");
      for (const d of needsScan) {
        try {
          await detectAndPersistRedaction(d.id);
        } catch (err) {
          console.warn("[redaction] detect failed", d.id, err);
        }
        if (cancelled) return;
      }
      if (!cancelled) refreshSessionDocuments(intakeSessionId);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionDocuments, intakeSessionId, refreshSessionDocuments]);


  // Phase C0 — preflight readiness check (active only at review step).
  const isReviewActive = stepIdx >= steps.length;
  const preflightQuery = useQuery<PreflightResult>({
    queryKey: ["generation-preflight", intakeSessionId],
    queryFn: () => runGenerationPreflight(intakeSessionId),
    enabled: isReviewActive && !!intakeSessionId,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    refetchInterval: (q) => {
      const data = q.state.data as PreflightResult | undefined;
      if (!data) return false;
      const ocrCheck = data.checks.find((c) => c.id === "ocr");
      return ocrCheck?.status === "pending" ? 5000 : false;
    },
  });




  const handleSaveDraft = async () => {
  try {
    setIsSavingDraft(true);
    await ensureSession();
  } catch (e) {
    console.error("Failed to save intake draft", e);
    alert("Не удалось сохранить опросник");
  } finally {
    setIsSavingDraft(false);
  }
};
  const handleGenerateDraft = async () => {
  try {
    setIsSavingDraft(true);
    const sessionId = await ensureSession();
    onSubmit(state, sessionId);
  } catch (e) {
    console.error("Failed to save intake before generation", e);
    alert("Не удалось сохранить опросник перед генерацией документа");
  } finally {
    setIsSavingDraft(false);
  }
};
  const uploadSingleFile = async (file: File, sessionIdParam: string) => {
    const rawExtension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const extension =
      String(rawExtension || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const storagePath = `builder/${sessionIdParam}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("lead-documents")
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
    if (uploadError) throw uploadError;

    const { data: documentRow, error: documentError } = await supabase
      .from("documents")
      .insert({
        document_type: "builder_upload",
        document_category: "document_builder",
        document_purpose: "intake_auto_fill",
        title: file.name,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        storage_path: storagePath,
        upload_source: "document_builder",
        analysis_status: "uploaded",
        review_status: "pending",
        metadata: {
          intake_session_id: sessionIdParam,
          template_code: state.templateCode,
          jurisdiction: state.jurisdiction,
          language: state.language,
        },
      })
      .select("id")
      .single();
    if (documentError) throw documentError;

    await supabase
      .from("document_intake_sessions")
      .update({ document_id: documentRow.id, updated_at: new Date().toISOString() })
      .eq("id", sessionIdParam);

    const { error: extractError } = await supabase.functions.invoke(
      "extract-document-text",
      { body: { document_id: documentRow.id } },
    );
    if (extractError) throw extractError;

    return documentRow.id as string;
  };

  const handleUploadDocument = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    try {
      setIsUploadingDocument(true);

      const session = await createOrLoadIntakeSession({
        matterId: intakeContext?.matterId ?? null,
        clientId: intakeContext?.clientId ?? null,
        leadId: intakeContext?.leadId ?? null,
        documentId: intakeContext?.documentId ?? null,
        draftKey: intakeSessionId,
        templateCode: state.templateCode,
        jurisdiction: state.jurisdiction,
        language: state.language,
      });
      setIntakeSessionId(session.id);

      for (const file of files) {
        try {
          await uploadSingleFile(file, session.id);
        } catch (err) {
          console.error("Failed to upload file", file.name, err);
          alert(`Не удалось загрузить файл: ${file.name}`);
        }
        await refreshSessionDocuments(session.id);
      }

      try {
        window.dispatchEvent(new CustomEvent("intake-documents-updated"));
      } catch {}
    } catch (e) {
      console.error("Failed to upload documents", e);
      alert("Не удалось загрузить документы");
    } finally {
      setIsUploadingDocument(false);
      event.target.value = "";
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!confirm("Удалить этот документ из комплекта?")) return;
    try {
      const { error } = await supabase.from("documents").delete().eq("id", documentId);
      if (error) throw error;
      await refreshSessionDocuments(intakeSessionId);
      try {
        window.dispatchEvent(new CustomEvent("intake-documents-updated"));
      } catch {}
    } catch (e) {
      console.error("Failed to delete document", e);
      alert("Не удалось удалить документ");
    }
  };

  const handleAiFillFromDocument = async () => {
    if (!intakeSessionId) {
      alert("Сначала загрузите документы");
      return;
    }
    const readyDocs = sessionDocuments.filter((d) => d.ocr_text_length > 50);
    if (readyDocs.length === 0) {
      alert("Нет документов с извлечённым текстом");
      return;
    }

    try {
      setIsAiFilling(true);

      for (const doc of readyDocs) {
        const { error } = await supabase.functions.invoke(
          "document-intake-ai-fill",
          { body: { session_id: intakeSessionId, document_id: doc.id } },
        );
        if (error) {
          console.error("AI fill failed for document", doc.id, error);
        }
      }

      const { data: answers, error: answersError } = await supabase
        .from("document_intake_answers")
        .select("field_name, field_value")
        .eq("session_id", intakeSessionId);
      if (answersError) throw answersError;

      const nextAnswers = { ...state.answers };
      for (const answer of answers ?? []) {
        nextAnswers[answer.field_name as string] = answer.field_value;
      }
      onChange({ ...state, answers: nextAnswers });

      alert("AI заполнил поля из документов. Проверьте значения.");
    } catch (e) {
      console.error("AI fill failed", e);
      alert("Не удалось заполнить поля из документов");
    } finally {
      setIsAiFilling(false);
    }
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
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div>
              <div className="text-sm font-semibold text-white">
                Документы для автозаполнения
              </div>
              <div className="text-xs text-white/60">
                Загрузите PDF/DOCX/TXT/RTF/HTML — AI извлечёт текст и заполнит поля конструктора.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="db-ghost cursor-pointer">
                <Upload size={14} />
                {isUploadingDocument ? "Загрузка…" : "Загрузить документы"}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt,.rtf,.html,.htm,.jpg,.jpeg,.png,.webp"
                  onChange={handleUploadDocument}
                  disabled={isUploadingDocument || isAiFilling}
                />
              </label>

              <button
                type="button"
                className="db-cta"
                onClick={handleAiFillFromDocument}
                disabled={
                  isAiFilling ||
                  sessionDocuments.filter((d) => d.ocr_text_length > 50).length === 0
                }
              >
                <Sparkles size={14} />
                {isAiFilling ? "AI заполняет…" : "AI заполнить поля"}
              </button>

              {sessionDocuments.length > 0 && (
                <span className="text-xs text-white/60">
                  Прикреплено: {sessionDocuments.length}
                </span>
              )}
            </div>

            {sessionDocuments.length > 0 && (
              <ul className="space-y-2">
                {sessionDocuments.map((doc) => {
                  const ready = doc.ocr_text_length > 50;
                  const tone = redactionStatusTone(doc.redaction_status);
                  const showRedactButton =
                    ready &&
                    (doc.redaction_status === "required" ||
                      doc.redaction_status === "rejected" ||
                      (doc.contains_personal_data && doc.redaction_status !== "accepted" && doc.redaction_status !== "suggested"));
                  return (
                    <li
                      key={doc.id}
                      className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 md:flex-row md:items-center"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <FileText size={14} className="text-white/60 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">
                            {doc.title || doc.file_name || doc.id}
                          </div>
                          <div className="text-[11px] text-white/60 flex flex-wrap items-center gap-2">
                            <span>
                              OCR: {doc.ocr_text_length} симв.{" "}
                              {ready ? (
                                <span className="text-emerald-300">— готов</span>
                              ) : (
                                <span className="text-amber-300">— нет текста</span>
                              )}
                            </span>
                            <RedactionBadge
                              status={doc.redaction_status}
                              tone={tone}
                              quality={doc.redaction_quality}
                              coverage={doc.redaction_stats?.coverage_percent ?? null}
                            />
                            {doc.redaction_notes.length > 0 && (
                              <span className="text-white/45 truncate">
                                · {doc.redaction_notes.join(", ")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {showRedactButton && (
                          <button
                            type="button"
                            className="db-ghost"
                            onClick={() => setRedactionDocId(doc.id)}
                            title="Обезличить документ"
                          >
                            Обезличить
                          </button>
                        )}
                        {(doc.redaction_status === "suggested" || doc.redaction_status === "accepted") && (
                          <button
                            type="button"
                            className="db-ghost"
                            onClick={() => setRedactionDocId(doc.id)}
                            title="Посмотреть обезличивание"
                          >
                            {doc.redaction_status === "accepted" ? "Просмотр" : "Проверить"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-white/50 hover:text-red-400 p-1"
                          onClick={() => handleDeleteDocument(doc.id)}
                          title="Удалить"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {redactionDocId && (
            <RedactionDialog
              document={
                sessionDocuments.find((d) => d.id === redactionDocId) ?? null
              }
              onClose={() => setRedactionDocId(null)}
              onChanged={() => refreshSessionDocuments(intakeSessionId)}
            />
          )}



          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <LegalAnalysisPanel sessionId={intakeSessionId} onEnsureSession={ensureSession} />
          </div>

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
          availableModes={availableModes}
          sessionId={intakeSessionId}
          onEnsureSession={ensureSession}
          preflight={preflightQuery.data ?? null}
          preflightLoading={preflightQuery.isFetching}
          preflightError={preflightQuery.error ? String((preflightQuery.error as Error).message ?? preflightQuery.error) : null}
          onRefreshPreflight={() => preflightQuery.refetch()}
        />
      )}

      <div className="flex items-center justify-between pt-2">
        <button type="button" onClick={goPrev} className="db-ghost">
          <ArrowLeft size={14} /> Назад
        </button>
                <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSavingDraft}
            className="db-ghost"
            title={intakeSessionId ? `Черновик: ${intakeSessionId}` : "Сохранить ответы опросника"}
          >
            {isSavingDraft ? "Сохраняю…" : "Сохранить опросник"}
          </button>

          {!isReview ? (
            <button type="button" onClick={handleNext} className="db-cta">
              Далее <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGenerateDraft}
              disabled={
                !validation.valid ||
                submitting ||
                preflightQuery.isFetching ||
                !(preflightQuery.data?.ready ?? false)
              }
              className="db-cta"
              title={
                !validation.valid
                  ? "Заполните обязательные поля"
                  : !preflightQuery.data?.ready
                    ? "Подготовка ещё не завершена — см. блок «Готовность документа»"
                    : "Сформировать документ"
              }
            >
              <Sparkles size={14} /> {submitting ? "Генерация…" : "Сформировать документ"}
            </button>
          )}
        </div>
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
  availableModes,
  sessionId,
  onEnsureSession,
  preflight,
  preflightLoading,
  preflightError,
  onRefreshPreflight,
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
  availableModes?: Array<IntakeState["generationMode"]>;
  sessionId: string | null;
  onEnsureSession: () => Promise<string>;
  preflight: PreflightResult | null;
  preflightLoading: boolean;
  preflightError: string | null;
  onRefreshPreflight: () => void;
}) {

  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);

  const payload = useMemo(() => buildGenerateRequest(template, state, schema), [template, state, schema]);
  const jsonText = useMemo(() => JSON.stringify(payload, null, 2), [payload]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const allModes: Array<{ id: IntakeState["generationMode"]; title: string; desc: string }> = [
    { id: "standalone", title: "Самостоятельно", desc: "Только данные опросника (без материалов дела)" },
    { id: "matter_based", title: "На основе дела", desc: "Подтянуть материалы из дела" },
    { id: "hybrid", title: "Гибрид", desc: "Опросник + материалы дела" },
  ];
  const modes = availableModes && availableModes.length > 0
    ? allModes.filter((m) => availableModes.includes(m.id))
    : allModes;

  const warnings = schema.schema_json?.warnings ?? [];

  // Governing law / dispute resolution sanity check
  const governingLaw = String(answers.governing_law ?? "").toLowerCase();
  const disputeResolution = String(answers.dispute_resolution ?? "").toLowerCase();
  const jurisdictionMap: Record<string, string> = { ru: "russia", cy: "cyprus", il: "israel", ge: "georgia" };
  const expectedLaw = jurisdictionMap[state.jurisdiction.toLowerCase()];
  const lawMismatch = governingLaw && expectedLaw && governingLaw !== expectedLaw && governingLaw !== "other";
  const englishForNonEnglish = governingLaw === "english" && expectedLaw && expectedLaw !== "english";
  const londonMention = /(лондон|london|lcia)/i.test(disputeResolution) && expectedLaw && expectedLaw !== "english";

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
      <PreflightPanel
        preflight={preflight}
        loading={preflightLoading}
        error={preflightError}
        onRefresh={onRefreshPreflight}
      />

      <SourceReviewCenter sessionId={sessionId} />




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

      {(englishForNonEnglish || lawMismatch || londonMention) && (
        <div className="db-warning">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div className="space-y-1">
              <div className="font-medium">Проверьте Governing Law и Dispute Resolution</div>
              {englishForNonEnglish && (
                <div>Вы выбрали <b>English law</b>, при этом юрисдикция компании — <b>{JURISDICTION_LABELS[state.jurisdiction] ?? state.jurisdiction}</b>. По умолчанию это НЕ применяется. Подтвердите осознанный выбор или измените на местное право.</div>
              )}
              {lawMismatch && !englishForNonEnglish && (
                <div>Применимое право (<b>{governingLaw}</b>) не совпадает с юрисдикцией (<b>{state.jurisdiction}</b>). Убедитесь, что это сознательное решение.</div>
              )}
              {londonMention && (
                <div>В разделе «Разрешение споров» упомянуты <b>Лондон / LCIA</b>. Это не дефолт для не-английских компаний — подтвердите или замените на МКАС / локальный арбитраж.</div>
              )}
            </div>
          </div>
        </div>
      )}

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

      <LegalAnalysisPanel sessionId={sessionId} onEnsureSession={onEnsureSession} />


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

      <div>
        <div className="flex items-center justify-between">
          <div className="db-section-label">Payload для Edge Function</div>
          <button
            type="button"
            onClick={() => setShowJson((s) => !s)}
            className="db-ghost"
          >
            {showJson ? "Скрыть JSON" : "Показать JSON запроса"}
          </button>
        </div>
        {showJson && (
          <div className="mt-3 db-json-block">
            <div className="flex items-center justify-between db-json-header">
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/55">generate-legal-document payload</span>
              <button
                type="button"
                onClick={handleCopy}
                className={`db-copy-btn ${copied ? "db-copy-btn-done" : ""}`}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Скопировано" : "Скопировать JSON"}
              </button>
            </div>
            <div className="px-4 pt-3">
              <div className="db-mode-badge">
                <span className="db-mode-badge-label">generation_mode</span>
                <span className="db-mode-badge-value">{state.generationMode}</span>
              </div>
            </div>
            <pre className="db-json-pre">{jsonText}</pre>
          </div>
        )}
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

// ---------------------------------------------------------------------------
// Phase C0 — Preflight readiness panel
// ---------------------------------------------------------------------------

function PreflightPanel({
  preflight,
  loading,
  error,
  onRefresh,
}: {
  preflight: PreflightResult | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const ready = preflight?.ready ?? false;
  const headerColor = !preflight
    ? "rgba(255,255,255,0.55)"
    : ready
      ? "#9be0c4"
      : "#f0b8b8";
  const headerLabel = !preflight
    ? "Готовность документа"
    : ready
      ? "🟢 Документ готов к формированию"
      : "🔴 Готовность документа: генерация невозможна";

  return (
    <div
      className="db-subcard"
      style={{
        borderColor: !preflight
          ? "rgba(255,255,255,0.10)"
          : ready
            ? "rgba(102,187,156,0.40)"
            : "rgba(214,120,120,0.45)",
        background: !preflight
          ? "rgba(8,18,26,0.45)"
          : ready
            ? "rgba(12,40,30,0.40)"
            : "rgba(40,12,16,0.40)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div
          className="text-[11px] uppercase tracking-[0.18em]"
          style={{ color: headerColor }}
        >
          {headerLabel}
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <span className="flex items-center gap-1 text-[11px] text-white/60">
              <Loader2 size={12} className="animate-spin" /> проверка…
            </span>
          )}
          <button type="button" className="db-ghost" onClick={onRefresh} disabled={loading}>
            Обновить
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 db-warning">
          Не удалось выполнить проверку готовности: {error}
        </div>
      )}

      {preflight && (
        <ul className="mt-3 space-y-1.5">
          {preflight.checks.map((c) => (
            <PreflightCheckRow key={c.id} check={c} />
          ))}
        </ul>
      )}

      {preflight && !ready && preflight.blocking_reasons.length > 0 && (
        <div className="mt-3 rounded-md border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">
          <div className="font-medium">Препятствия для генерации:</div>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">
            {preflight.blocking_reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {preflight && preflight.warnings.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          <div className="font-medium">Предупреждения:</div>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">
            {preflight.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          {ready && (
            <div className="mt-2 text-amber-200/80">
              Генерация Draft разрешена. Рекомендуется ручная проверка предупреждений.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PreflightCheckRow({ check }: { check: PreflightCheck }) {
  const Icon =
    check.status === "ok"
      ? CircleCheck
      : check.status === "pending"
        ? Loader2
        : check.status === "warn"
          ? CircleAlert
          : check.status === "fail"
            ? CircleAlert
            : CircleDashed;
  const color =
    check.status === "ok"
      ? "#9be0c4"
      : check.status === "warn"
        ? "#f0d59c"
        : check.status === "pending"
          ? "rgba(255,255,255,0.65)"
          : "#f0b8b8";
  const spin = check.status === "pending" ? "animate-spin" : "";
  return (
    <li className="flex items-start gap-2 text-xs">
      <Icon size={14} className={`mt-0.5 shrink-0 ${spin}`} style={{ color }} />
      <div className="min-w-0">
        <div style={{ color }}>{check.label}</div>
        {check.message && (
          <div className="text-[11px] text-white/55">{check.message}</div>
        )}
      </div>
    </li>
  );
}


// ---------------------------------------------------------------------------
// Phase C — Redaction badge + dialog
// ---------------------------------------------------------------------------

import {
  statusBadgeLabel,
  statusBadgeTone,
  suggestRedaction,
  acceptRedaction,
  rejectRedaction,
  reviewManualEdit,
  type RedactionStatus,
} from "@/lib/document-redaction";
import {
  isAcceptable,
  qualityLabel,
  reviewRedactedText,
  type LegalEntityType,
  type RedactionQuality,
  type RedactionStats,
  type RemainingEntity,
} from "@/lib/legal-redaction";

function redactionStatusTone(
  status: RedactionStatus | null | undefined,
): "neutral" | "warn" | "danger" | "ok" {
  return statusBadgeTone(status);
}

function RedactionBadge({
  status,
  tone,
  quality,
  coverage,
}: {
  status: RedactionStatus | null | undefined;
  tone: "neutral" | "warn" | "danger" | "ok";
  quality?: RedactionQuality | null;
  coverage?: number | null;
}) {
  // If quality says unsafe, force danger tone visually.
  const effectiveTone: typeof tone =
    status === "suggested" && quality === "unsafe"
      ? "danger"
      : status === "suggested" && quality === "warning"
        ? "warn"
        : tone;
  const colors = {
    ok: { bg: "rgba(102,187,156,0.16)", border: "rgba(102,187,156,0.40)", text: "#9be0c4" },
    warn: { bg: "rgba(214,170,90,0.18)", border: "rgba(214,170,90,0.45)", text: "#f0d59c" },
    danger: { bg: "rgba(214,120,120,0.18)", border: "rgba(214,120,120,0.45)", text: "#f0b8b8" },
    neutral: { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.18)", text: "rgba(255,255,255,0.75)" },
  } as const;
  const c = colors[effectiveTone];
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-[1px] text-[10px] tracking-wide"
      style={{ background: c.bg, borderColor: c.border, color: c.text }}
    >
      {statusBadgeLabel(status, { quality: quality ?? null, coverage: coverage ?? null })}
    </span>
  );
}

type RedactionDialogDoc = {
  id: string;
  title: string | null;
  file_name: string | null;
  ocr_text: string | null;
  redacted_text: string | null;
  redaction_status: RedactionStatus | null;
  redaction_notes: string[];
  redaction_quality: RedactionQuality | null;
  redaction_stats: RedactionStats | null;
  redaction_remaining_entities: RemainingEntity[];
};

function RedactionDialog({
  document: doc,
  onClose,
  onChanged,
}: {
  document: RedactionDialogDoc | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editedText, setEditedText] = useState<string>("");
  const [busy, setBusy] = useState<"suggest" | "accept" | "reject" | "review" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // Live review of the in-memory edited text. Falls back to persisted stats.
  const [liveStats, setLiveStats] = useState<RedactionStats | null>(null);
  const [liveRemaining, setLiveRemaining] = useState<RemainingEntity[] | null>(null);
  const [liveQuality, setLiveQuality] = useState<RedactionQuality | null>(null);

  useEffect(() => {
    setEditedText(doc?.redacted_text ?? "");
    setEditing(false);
    setError(null);
    setLiveStats(null);
    setLiveRemaining(null);
    setLiveQuality(null);
  }, [doc?.id, doc?.redacted_text]);

  if (!doc) return null;

  const stats: RedactionStats | null = liveStats ?? doc.redaction_stats;
  const remaining: RemainingEntity[] = liveRemaining ?? doc.redaction_remaining_entities ?? [];
  const quality: RedactionQuality | null = liveQuality ?? doc.redaction_quality;
  const currentText = editing ? editedText : (doc.redacted_text ?? "");
  const acceptCheck = stats
    ? isAcceptable(currentText, stats, remaining, quality ?? "warning")
    : { ok: false, reason: "Сначала выполните обезличивание" };

  const handleSuggest = async () => {
    setBusy("suggest");
    setError(null);
    try {
      const draft = await suggestRedaction(doc.id);
      setEditedText(draft.redacted_text);
      setLiveStats(draft.legal.stats);
      setLiveRemaining(draft.legal.remaining_entities);
      setLiveQuality(draft.legal.quality);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleManualReview = async () => {
    setBusy("review");
    setError(null);
    try {
      const review = await reviewManualEdit(doc.id, editedText);
      setLiveStats(review.stats);
      setLiveRemaining(review.remaining_entities);
      setLiveQuality(review.quality);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // Cheap, debounced-ish in-memory re-review while editing so the user sees
  // coverage update live without DB writes.
  useEffect(() => {
    if (!editing) return;
    const r = reviewRedactedText(editedText, doc.redaction_stats ?? undefined);
    setLiveStats(r.stats);
    setLiveRemaining(r.remaining_entities);
    setLiveQuality(r.quality);
  }, [editedText, editing, doc.redaction_stats]);

  const handleAccept = async () => {
    setBusy("accept");
    setError(null);
    try {
      const { data: userResp } = await supabase.auth.getUser();
      await acceptRedaction(doc.id, {
        editedText: editing ? editedText : undefined,
        userId: userResp.user?.id ?? null,
      });
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    setBusy("reject");
    setError(null);
    try {
      await rejectRedaction(doc.id);
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const hasDraft = (doc.redacted_text ?? "").length > 0 || editedText.length > 0;
  const acceptDisabled = busy !== null || !hasDraft || !acceptCheck.ok;

  const typeRows: LegalEntityType[] = stats
    ? (Object.keys(stats.by_type) as LegalEntityType[]).filter(
        (k) =>
          stats.by_type[k].detected > 0 ||
          stats.by_type[k].replaced > 0 ||
          stats.by_type[k].remaining > 0,
      )
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-white/15 bg-[#0c1a24] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/55">
              Обезличивание документа
            </div>
            <div className="truncate text-sm text-white">
              {doc.title || doc.file_name || doc.id}
            </div>
          </div>
          <button
            type="button"
            className="text-white/55 hover:text-white"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        {doc.redaction_notes.length > 0 && (
          <div className="border-b border-white/10 px-5 py-2 text-[11px] text-amber-200/85">
            Обнаружено: {doc.redaction_notes.join(", ")}
          </div>
        )}

        {/* Stats panel */}
        {stats && (
          <div className="border-b border-white/10 px-5 py-3 space-y-2">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-white/55 uppercase tracking-[0.16em] text-[10px]">
                Статистика обезличивания
              </span>
              <span className="text-white">Coverage: <b>{stats.coverage_percent}%</b></span>
              <span className="text-white/75">Найдено: {stats.detected_total}</span>
              <span className="text-white/75">Заменено: {stats.replaced_total}</span>
              <span className={stats.remaining_total > 0 ? "text-rose-200" : "text-emerald-300"}>
                Осталось: {stats.remaining_total}
              </span>
              {quality && (
                <span className="ml-auto text-white">{qualityLabel(quality)}</span>
              )}
            </div>
            {typeRows.length > 0 && (
              <div className="max-h-32 overflow-auto rounded-md border border-white/10">
                <table className="w-full text-[11px]">
                  <thead className="bg-white/[0.04] text-white/55">
                    <tr>
                      <th className="text-left px-2 py-1">Тип</th>
                      <th className="text-right px-2 py-1">Найдено</th>
                      <th className="text-right px-2 py-1">Заменено</th>
                      <th className="text-right px-2 py-1">Осталось</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeRows.map((t) => (
                      <tr key={t} className="border-t border-white/5 text-white/80">
                        <td className="px-2 py-1">{t}</td>
                        <td className="px-2 py-1 text-right">{stats.by_type[t].detected}</td>
                        <td className="px-2 py-1 text-right">{stats.by_type[t].replaced}</td>
                        <td
                          className={
                            "px-2 py-1 text-right " +
                            (stats.by_type[t].remaining > 0 ? "text-rose-200" : "")
                          }
                        >
                          {stats.by_type[t].remaining}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Remaining entities */}
        {remaining.length > 0 && (
          <div className="border-b border-rose-400/30 bg-rose-500/5 px-5 py-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-rose-200 mb-2">
              Остались возможные данные ({remaining.length})
            </div>
            <div className="max-h-32 overflow-auto space-y-1 text-[11px]">
              {remaining.slice(0, 50).map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-rose-100/90">
                  <span className="rounded border border-rose-300/40 px-1 text-[10px]">
                    {r.type}
                  </span>
                  <span className="text-rose-100/70 text-[10px]">{r.severity}</span>
                  <span className="truncate">{r.text}</span>
                  <span className="ml-auto text-rose-100/50 text-[10px]">{r.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-0 overflow-hidden md:grid-cols-2">
          <div className="overflow-auto border-white/10 p-4 md:border-r">
            <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/55">
              Оригинал OCR
            </div>
            <pre className="whitespace-pre-wrap break-words text-xs text-white/80">
              {doc.ocr_text ?? "—"}
            </pre>
          </div>
          <div className="overflow-auto p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/55">
                Обезличенный текст
              </div>
              <div className="flex items-center gap-2">
                {editing && (
                  <button
                    type="button"
                    className="db-ghost"
                    onClick={handleManualReview}
                    disabled={busy !== null}
                  >
                    {busy === "review" ? "Сохраняю…" : "Сохранить и проверить"}
                  </button>
                )}
                {hasDraft && !editing && (
                  <button
                    type="button"
                    className="db-ghost"
                    onClick={() => setEditing(true)}
                  >
                    Редактировать вручную
                  </button>
                )}
              </div>
            </div>
            {!hasDraft ? (
              <div className="text-xs text-white/55">
                Черновик обезличивания ещё не создан. Нажмите «Обезличить», чтобы сгенерировать.
              </div>
            ) : editing ? (
              <textarea
                className="db-input min-h-[300px] w-full font-mono text-xs"
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
              />
            ) : (
              <pre className="whitespace-pre-wrap break-words text-xs text-white/85">
                {doc.redacted_text}
              </pre>
            )}
          </div>
        </div>

        {error && (
          <div className="border-t border-rose-400/30 bg-rose-500/10 px-5 py-2 text-xs text-rose-100">
            {error}
          </div>
        )}

        {!acceptCheck.ok && hasDraft && (
          <div className="border-t border-amber-400/30 bg-amber-500/10 px-5 py-2 text-xs text-amber-100">
            Требуется дополнительное обезличивание перед принятием. {acceptCheck.reason}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 px-5 py-3">
          <button
            type="button"
            className="db-ghost"
            onClick={handleSuggest}
            disabled={busy !== null}
          >
            {busy === "suggest" ? "Обезличиваю…" : hasDraft ? "Перегенерировать" : "Обезличить"}
          </button>
          <button
            type="button"
            className="db-ghost"
            onClick={handleReject}
            disabled={busy !== null}
          >
            {busy === "reject" ? "Отклоняю…" : "Отклонить"}
          </button>
          <button
            type="button"
            className="db-cta"
            onClick={handleAccept}
            disabled={acceptDisabled}
            title={acceptCheck.ok ? "Принять обезличивание" : (acceptCheck.reason ?? "")}
          >
            {busy === "accept" ? "Принимаю…" : "Принять обезличивание"}
          </button>
        </div>
      </div>
    </div>
  );
}
