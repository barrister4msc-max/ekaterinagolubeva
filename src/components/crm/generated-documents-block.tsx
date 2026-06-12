import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FilePlus, FileText, Trash2, Pencil, ExternalLink, ChevronDown, ShieldAlert, Sparkles, Wand2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type AICandidate = {
  title?: string;
  document_type?: string;
  why_needed?: string;
  readiness?: string;
  missing_inputs?: string[];
  recommended_strategy?: string;
  priority?: string;
};

const READINESS_LABEL: Record<string, string> = {
  ready: "готов",
  partial: "частично",
  not_ready: "не готов",
};

const PRIORITY_TONE: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-neutral-100 text-neutral-700",
};

const READINESS_TONE: Record<string, string> = {
  ready: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  not_ready: "bg-red-100 text-red-700",
};

function normalize(s: string | undefined | null): string {
  return (s || "").toLowerCase().replace(/[^a-zа-я0-9]+/gi, " ").trim();
}

function findTemplateForCandidate(
  candidate: AICandidate,
  templates: Template[],
): Template | null {
  const candTitle = normalize(candidate.title);
  const candType = normalize(candidate.document_type);
  const needles = [candType, candTitle].filter(Boolean);
  if (needles.length === 0) return null;

  // 1. exact match on template_key or title
  for (const t of templates) {
    const tKey = normalize(t.template_key);
    const tTitle = normalize(t.title);
    const tCat = normalize(t.category);
    if (needles.some((n) => n === tKey || n === tTitle)) return t;
    if (needles.some((n) => n && (tKey.includes(n) || n.includes(tKey)))) return t;
    if (needles.some((n) => n && (tTitle.includes(n) || n.includes(tTitle)))) return t;
    if (candType && tCat && (tCat.includes(candType) || candType.includes(tCat))) return t;
  }
  return null;
}

type Template = {
  id: string;
  template_key: string;
  category: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

type GeneratedDoc = {
  id: string;
  title: string;
  category: string | null;
  status: string;
  content: string | null;
  template_key: string;
  created_at: string;
  metadata?: any;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Черновик",
  in_review: "На проверке",
  final: "Готов",
};

export function GeneratedDocumentsBlock({
  leadId,
  crmLeadId,
  userId,
  matterId,
}: {
  leadId: string;
  crmLeadId: string | null;
  userId: string | null;
  matterId?: string | null;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [docs, setDocs] = useState<GeneratedDoc[]>([]);
  const [aiCandidates, setAiCandidates] = useState<AICandidate[]>([]);
  const [creating, setCreating] = useState(false);
  const [aiCreating, setAiCreating] = useState(false);
  const [resolvedMatterId, setResolvedMatterId] = useState<string | null>(matterId ?? null);
  const [editing, setEditing] = useState<GeneratedDoc | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [improvingId, setImprovingId] = useState<string | null>(null);
  const loadTemplates = useCallback(async () => {
    const { data, error } = await supabase
      .from("document_templates")
      .select("*")
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) {
      console.error("loadTemplates", error);
      return;
    }
    setTemplates((data as Template[]) || []);
  }, []);

  const loadDocs = useCallback(async () => {
    const orFilters: string[] = [];
    if (leadId) orFilters.push(`lead_id.eq.${leadId}`);
    if (resolvedMatterId) {
      orFilters.push(`matter_id.eq.${resolvedMatterId}`);
      orFilters.push(`metadata->>matter_id.eq.${resolvedMatterId}`);
    }
    let query = supabase
      .from("generated_legal_documents")
      .select("id,title,category,status,content,template_key,created_at,metadata")
      .order("created_at", { ascending: false });
    if (orFilters.length > 0) {
      query = query.or(orFilters.join(","));
    } else {
      setDocs([]);
      return;
    }
    const { data, error } = await query;
    if (error) {
      console.error("loadGeneratedDocs", error);
      return;
    }
    const seen = new Set<string>();
    const unique = ((data as GeneratedDoc[]) || []).filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
    setDocs(unique);
  }, [leadId, resolvedMatterId]);

  const loadStrategy = useCallback(async () => {
    let mid = matterId ?? null;
    if (!mid) {
      const { data: m } = await supabase
        .from("legal_matters")
        .select("id")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      mid = (m as { id: string } | null)?.id ?? null;
    }
    setResolvedMatterId(mid);
    if (!mid) {
      setAiCandidates([]);
      return;
    }
    const { data, error } = await supabase
      .from("lawyer_matter_strategy")
      .select("metadata")
      .eq("matter_id", mid)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("loadStrategy", error);
      return;
    }
    const meta = (data as { metadata: any } | null)?.metadata;
    const cands = Array.isArray(meta?.document_generation_candidates)
      ? (meta.document_generation_candidates as AICandidate[])
      : [];
    setAiCandidates(cands);
  }, [leadId, matterId]);

  useEffect(() => {
    loadTemplates();
    loadDocs();
    loadStrategy();
  }, [loadTemplates, loadDocs, loadStrategy]);

  const grouped = useMemo(() => {
    const map = new Map<string, Template[]>();
    for (const t of templates) {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    }
    return Array.from(map.entries());
  }, [templates]);

  const createFromTemplate = async (tpl: Template) => {
    if (creating) return;
    if (
      !confirm(
        "Перед формированием документа убедитесь, что все ключевые источники в юридическом заключении подтверждены локальной базой или прошли внешнюю проверку и одобрены администратором.\n\nНеподтверждённые нормы, судебная практика и письма ФНС/Минфина не должны использоваться как установленный факт.\n\nПродолжить формирование документа?",
      )
    ) {
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("generated_legal_documents")
        .insert({
          lead_id: leadId,
          crm_lead_id: crmLeadId,
          template_id: tpl.id,
          template_key: tpl.template_key,
          category: tpl.category,
          title: tpl.title,
          status: "draft",
          content: "",
          created_by: userId,
          metadata: { source: "crm_documents_tab" },
        })
        .select("id,title,category,status,content,template_key,created_at")
        .single();
      if (error) throw error;

      await supabase.from("lead_events").insert({
        lead_id: leadId,
        type: "generated_document_created",
        message: `Создан черновик документа: ${tpl.title}`,
        created_by: userId,
      });

      setDocs((prev) => [data as GeneratedDoc, ...prev]);
      toast.success("Черновик создан");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Не удалось создать документ");
    } finally {
      setCreating(false);
    }
  };

  const invokeAIGeneration = async (candidate: AICandidate, force_preliminary: boolean) => {
    if (aiCreating) return;
    if (!resolvedMatterId) {
      toast.error("Для AI-генерации нужно дело (matter). Создайте дело по этому лиду.");
      return;
    }
    setAiCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-legal-document", {
        body: {
          matter_id: resolvedMatterId,
          document_type: candidate.document_type,
          document_title: candidate.title,
          selected_strategy: candidate.recommended_strategy,
          force_preliminary,
        },
      });
      if (error) {
        // supabase-js wraps non-2xx as FunctionsHttpError; try to get response body
        const ctx: any = (error as any).context;
        let status: number | undefined;
        let payload: any = null;
        try {
          status = ctx?.status;
          if (ctx && typeof ctx.json === "function") payload = await ctx.json();
          else if (ctx && typeof ctx.text === "function") payload = JSON.parse(await ctx.text());
        } catch { /* ignore */ }
        if (status === 422) {
          const msg = payload?.message || "Документ пока не готов к формированию.";
          if (confirm(`${msg}\n\nСформировать только предварительный черновик?`)) {
            setAiCreating(false);
            return invokeAIGeneration(candidate, true);
          }
          return;
        }
        throw new Error(payload?.message || error.message || "Ошибка AI-генерации");
      }
      await loadDocs();
      toast.success("AI-документ создан");
      const newId = (data as any)?.document_id || (data as any)?.id;
      if (newId) {
        const { data: doc } = await supabase
          .from("generated_legal_documents")
          .select("id,title,category,status,content,template_key,created_at,metadata")
          .eq("id", newId)
          .maybeSingle();
        if (doc) {
          setEditing(doc as GeneratedDoc);
          setEditTitle((doc as GeneratedDoc).title);
          setEditContent((doc as GeneratedDoc).content || "");
        }
      }
    } catch (e: any) {
      console.error("generate-legal-document", e);
      toast.error(e?.message || "Не удалось создать AI-документ");
    } finally {
      setAiCreating(false);
    }
  };

  const handleAICandidate = (candidate: AICandidate) => {
    const force_preliminary = candidate.readiness !== "ready";
    if (candidate.readiness === "not_ready") {
      const missing = (candidate.missing_inputs || []).filter(Boolean).join("; ") || "—";
      if (
        !confirm(
          `Документ пока не готов к формированию. Не хватает: ${missing}. Сформировать предварительный черновик?`,
        )
      ) {
        return;
      }
    }
    invokeAIGeneration(candidate, force_preliminary);
  };

  const deleteDoc = async (doc: GeneratedDoc) => {
    if (!confirm(`Удалить документ «${doc.title}»?`)) return;
    const { error } = await supabase
      .from("generated_legal_documents")
      .delete()
      .eq("id", doc.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    toast.success("Удалено");
  };

  const openEdit = (doc: GeneratedDoc) => {
    setEditing(doc);
    setEditTitle(doc.title);
    setEditContent(doc.content || "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase
      .from("generated_legal_documents")
      .update({ title: editTitle, content: editContent })
      .eq("id", editing.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDocs((prev) =>
      prev.map((d) => (d.id === editing.id ? { ...d, title: editTitle, content: editContent } : d)),
    );
    toast.success("Сохранено");
    setEditing(null);
  };
const reviewDocument = async (doc: GeneratedDoc) => {
  try {
    setReviewingId(doc.id);

    const { data, error } = await supabase.functions.invoke(
      "review-generated-legal-document",
      {
        body: {
          document_id: doc.id,
        },
      },
    );

    if (error) throw error;

    await loadDocs();

    toast.success(
      `AI проверка завершена: ${data.review.overall_score}/100`,
    );
  } catch (error: any) {
    console.error(error);

    toast.error(
      error.message || "Ошибка AI проверки",
    );
  } finally {
    setReviewingId(null);
  }
};

const improveDocument = async (doc: GeneratedDoc) => {
  try {
    setImprovingId(doc.id);

    const { data, error } = await supabase.functions.invoke(
      "improve-generated-legal-document",
      {
        body: {
          document_id: doc.id,
        },
      },
    );

    if (error) throw error;

    await loadDocs();

    toast.success("Создана улучшенная версия документа");

    const newId = (data as any)?.improved_document_id;
    if (newId) {
      const { data: newDoc } = await supabase
        .from("generated_legal_documents")
        .select("id,title,category,status,content,template_key,created_at,metadata")
        .eq("id", newId)
        .maybeSingle();
      if (newDoc) {
        setEditing(newDoc as GeneratedDoc);
        setEditTitle((newDoc as GeneratedDoc).title);
        setEditContent((newDoc as GeneratedDoc).content || "");
      }
    }
  } catch (error: any) {
    console.error(error);
    toast.error(error.message || "Ошибка исправления документа");
  } finally {
    setImprovingId(null);
  }
};
  return (
    <section className="mt-6 rounded-3xl border bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText size={17} />
          <h3 className="font-medium">Сформированные документы</h3>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={creating || templates.length === 0}
              className="flex items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              <FilePlus size={14} />
              Сформировать документ
              <ChevronDown size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[70vh] w-96 overflow-y-auto">
            {aiCandidates.length > 0 && (
              <>
                <DropdownMenuLabel className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-violet-700">
                  <Sparkles size={12} /> Рекомендовано AI
                </DropdownMenuLabel>
                {aiCandidates.map((c, i) => (
                  <DropdownMenuItem
                    key={`ai-${i}`}
                    onSelect={(e) => {
                      e.preventDefault();
                      handleAICandidate(c);
                    }}
                    className="flex flex-col items-start gap-1"
                  >
                    <div className="flex w-full flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{c.title || c.document_type || "Документ"}</span>
                      {c.readiness && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${READINESS_TONE[c.readiness] || "bg-neutral-100 text-neutral-700"}`}>
                          {READINESS_LABEL[c.readiness] || c.readiness}
                        </span>
                      )}
                      {c.priority && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${PRIORITY_TONE[c.priority] || "bg-neutral-100 text-neutral-700"}`}>
                          {c.priority}
                        </span>
                      )}
                    </div>
                    {(c.document_type || c.recommended_strategy) && (
                      <span className="text-[11px] text-muted-foreground">
                        {[c.document_type, c.recommended_strategy].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </>
            )}
            {grouped.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">Нет шаблонов</div>
            ) : (
              grouped.map(([category, items], idx) => (
                <div key={category}>
                  {idx > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                    {category}
                  </DropdownMenuLabel>
                  {items.map((tpl) => (
                    <DropdownMenuItem
                      key={tpl.id}
                      onSelect={(e) => {
                        e.preventDefault();
                        createFromTemplate(tpl);
                      }}
                      className="flex flex-col items-start gap-0.5"
                    >
                      <span className="text-sm">{tpl.title}</span>
                      {tpl.description && (
                        <span className="text-xs text-muted-foreground">{tpl.description}</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </div>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <ShieldAlert size={14} className="mt-0.5" />
        <div>
          Документ можно формировать только на основе подтверждённых источников: <b>official_verified</b>,{" "}
          <b>verified_local_source</b> или <b>externally_verified</b>, а также фактов из загруженных клиентом документов.
          Если по ключевому вопросу источник не подтверждён — сначала откройте вкладку «Нормы права», классифицируйте
          источники и одобрите внешние через раздел «База знаний». Неподтверждённые нормы, судебная практика, письма
          ФНС/Минфина не должны попадать в финальный документ как установленный факт.
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {docs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Сформированных документов пока нет
          </div>
        ) : (
          docs.map((doc) => (
            <div key={doc.id} className="rounded-2xl border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{doc.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {doc.category && (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5">{doc.category}</span>
                    )}
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                      {STATUS_LABEL[doc.status] || doc.status}
                    </span>
                    {doc.metadata?.strategy_document_alignment?.generation_mode === "preliminary" && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                        Предварительный черновик
                      </span>
                    )}
                    <span>{new Date(doc.created_at).toLocaleString("ru-RU")}</span>
                    {doc.metadata?.review && (
  <>
    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-purple-800">
      AI: {doc.metadata.review.overall_score}/100
    </span>

    <span
      className={`rounded-full px-2 py-0.5 ${
        doc.metadata.review.ready_for_client
          ? "bg-green-100 text-green-700"
          : "bg-amber-100 text-amber-800"
      }`}
    >
      {doc.metadata.review.ready_for_client
        ? "Готов клиенту"
        : "Требует проверки юриста"}
    </span>
  </>
)}
                  </div>
                                    {Array.isArray(doc.metadata?.missing_inputs) && doc.metadata.missing_inputs.length > 0 && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <div className="font-medium">Не хватает данных</div>
                      <ul className="mt-1 list-disc pl-4">
                        {doc.metadata.missing_inputs.map((m: string, i: number) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {doc.metadata?.review?.problems?.length > 0 && (
                    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                      <div className="font-medium">Замечания AI</div>
                      <ul className="mt-1 list-disc pl-4">
                        {doc.metadata.review.problems.map((p: any, i: number) => (
                          <li key={i}>
                            [{p.severity}] {p.problem}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(doc)}
                    className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-neutral-50"
                  >
                    <ExternalLink size={12} /> Открыть
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(doc)}
                    className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-neutral-50"
                  >
                    <Pencil size={12} /> Редактировать
                  </button>
                  <button
                    type="button"
                    disabled={reviewingId === doc.id}
                    onClick={() => reviewDocument(doc)}
                    className="flex items-center gap-1 rounded-lg border border-purple-200 px-3 py-1.5 text-xs text-purple-700 hover:bg-purple-50 disabled:opacity-60"
                  >
                    <ShieldAlert size={12} />
                    {reviewingId === doc.id ? "Проверка..." : "AI проверка"}
                  </button>

                  {doc.metadata?.review?.problems?.length > 0 && (
                    <button
                      type="button"
                      disabled={improvingId === doc.id}
                      onClick={() => improveDocument(doc)}
                      className="flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                    >
                      <Wand2 size={12} />
                      {improvingId === doc.id ? "Исправляет..." : "Исправить AI"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => deleteDoc(doc)}
                    className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={12} /> Удалить
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b p-4">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full bg-transparent text-base font-medium outline-none"
              />
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="ml-3 rounded-lg border px-3 py-1 text-sm hover:bg-neutral-50"
              >
                Закрыть
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="Текст документа (AI-генерация будет подключена позже)…"
                className="h-[55vh] w-full resize-none rounded-xl border bg-white p-3 text-sm outline-none focus:border-blue-300"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t p-4">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-neutral-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="rounded-lg bg-neutral-950 px-4 py-2 text-sm text-white"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
