import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute(
  "/workspace/document-drafts/$sessionId/ai-review"
)({
  component: AIReviewPage,
});

function AIReviewPage() {
  const { sessionId } = Route.useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["ai-review", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_intake_ai_runs")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="p-6">Загрузка AI заключения...</div>;
  }

  if (error) {
    return <div className="p-6">Ошибка загрузки AI заключения</div>;
  }

  if (!data) {
    return <div className="p-6">AI-анализ не найден</div>;
  }

  const problems = Array.isArray(data.problems) ? data.problems : [];
  const requiredFixes = Array.isArray(data.required_fixes)
    ? data.required_fixes
    : [];
  const recommendations = Array.isArray(data.recommendations)
    ? data.recommendations
    : [];

  const aiResult = (data.ai_result ?? {}) as Record<string, any>;
  const reasoning = aiResult.reasoning_engine as
    | { selected_strategy_id?: string; considered_positions?: Array<Record<string, any>> }
    | undefined;
  const override = aiResult.lawyer_strategy_override as
    | { strategy_id: string; ai_strategy_id: string | null; selected_at: string; selected_by: string | null; reason: string }
    | null
    | undefined;
  const aiStrategyId = reasoning?.selected_strategy_id ?? null;
  const lawyerStrategyId = override?.strategy_id ?? null;
  const strategiesMatch = !lawyerStrategyId || lawyerStrategyId === aiStrategyId;
  const history = Array.isArray(aiResult.lawyer_strategy_history)
    ? (aiResult.lawyer_strategy_history as Array<{
        changed_at: string;
        changed_by: string | null;
        reason: string;
        previous_strategy_id: string | null;
        new_strategy_id: string | null;
      }>)
    : [];



  return (
    <div className="p-6 space-y-6">
  <h1 className="text-3xl font-bold">AI юридическое заключение</h1>
  <p className="text-muted-foreground">
    Подробное обоснование рисков, проблем и рекомендаций AI.
  </p>

  <Link
    to="/workspace/document-drafts"
    className="inline-flex items-center rounded-md border px-3 py-2 text-sm"
  >
    ← Назад к черновикам
  </Link>


      <section className="rounded-xl border p-5 space-y-3">
        <h2 className="text-xl font-semibold">Итоговая оценка</h2>

        <div className="grid gap-3 md:grid-cols-4">
          <Info title="Статус" value={translateReview(data.review_status)} />
          <Info
            title="Риск галлюцинаций"
            value={translateRisk(data.hallucination_risk)}
          />
          <Info
            title="Точность"
            value={
              data.legal_accuracy_score == null
                ? "—"
                : `${data.legal_accuracy_score}%`
            }
          />
          <Info
            title="Проверка юриста"
            value={data.needs_lawyer_review ? "Требуется" : "Не требуется"}
          />
        </div>
      </section>

      <section className="rounded-xl border p-5 space-y-3">
        <h2 className="text-xl font-semibold">Найденные проблемы</h2>

        {problems.length === 0 ? (
          <p className="text-muted-foreground">Проблемы не найдены.</p>
        ) : (
          <div className="space-y-3">
            {problems.map((p: any, index: number) => (
              <div key={index} className="rounded-lg border p-4 space-y-2">
                <div className="font-semibold">
                  {severityLabel(p.severity)} {p.problem ?? "Проблема"}
                </div>

                {p.text_fragment && (
                  <div className="text-sm opacity-80">
                    <div className="font-medium">Фрагмент:</div>
                    <div>{p.text_fragment}</div>
                  </div>
                )}

                {p.recommendation && (
                  <div className="text-sm">
                    <div className="font-medium">Рекомендация:</div>
                    <div>{p.recommendation}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border p-5 space-y-3">
        <h2 className="text-xl font-semibold">Обязательные исправления</h2>

        {requiredFixes.length === 0 ? (
          <p className="text-muted-foreground">Нет обязательных исправлений.</p>
        ) : (
          <ul className="list-disc pl-6 space-y-1">
            {requiredFixes.map((item, index) => (
              <li key={index}>{String(item)}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border p-5 space-y-3">
        <h2 className="text-xl font-semibold">Рекомендации AI</h2>

        {recommendations.length === 0 ? (
          <p className="text-muted-foreground">Нет рекомендаций.</p>
        ) : (
          <ul className="list-disc pl-6 space-y-1">
            {recommendations.map((item, index) => (
              <li key={index}>{String(item)}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border p-5 space-y-3">
        <h2 className="text-xl font-semibold">Стратегия защиты</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Info title="Стратегия AI" value={aiStrategyId ?? "—"} />
          <Info title="Стратегия юриста" value={lawyerStrategyId ?? "—"} />
          <Info
            title="Совпадение"
            value={
              !lawyerStrategyId
                ? "Юрист не изменял"
                : strategiesMatch
                  ? "Совпадают"
                  : "Различаются"
            }
          />
        </div>
        {override && (
          <div className="text-sm space-y-1">
            {override.reason && (
              <div>
                <span className="font-medium">Причина изменения: </span>
                {override.reason}
              </div>
            )}
            <div className="text-xs opacity-70">
              Выбрано {formatDate(override.selected_at)}
              {override.selected_by ? ` • юрист ${override.selected_by.slice(0, 8)}` : ""}
            </div>
            {!strategiesMatch && (
              <div className="text-amber-600 text-xs">
                Юрист изменил стратегию вручную. При генерации документа используется выбор юриста.
              </div>
            )}
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section className="rounded-xl border p-5 space-y-3">
          <h2 className="text-xl font-semibold">История изменений стратегии</h2>
          <ol className="space-y-2 text-sm">
            {[...history].reverse().map((h, i) => (
              <li key={i} className="rounded-md border p-3">
                <div className="text-xs opacity-70">
                  {formatDate(h.changed_at)}
                  {h.changed_by ? ` • юрист ${h.changed_by.slice(0, 8)}` : ""}
                </div>
                <div className="mt-1">
                  {h.previous_strategy_id ?? "—"} → <span className="font-medium">{h.new_strategy_id ?? "сброшено к AI"}</span>
                </div>
                {h.reason && (
                  <div className="mt-1 opacity-80">
                    <span className="font-medium">Причина: </span>
                    {h.reason}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}



      <section className="rounded-xl border p-5 space-y-3">
        <h2 className="text-xl font-semibold">Технические данные</h2>

        <div className="grid gap-3 md:grid-cols-3">
          <Info title="Модель" value={data.model_name ?? "—"} />
          <Info title="Run type" value={data.run_type ?? "—"} />
          <Info title="Создано" value={formatDate(data.created_at)} />
        </div>
      </section>
    </div>
  );
}


function Info({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs opacity-70">{title}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function translateReview(status: string | null) {
  if (status === "passed") return "AI-проверка пройдена";
  if (status === "needs_revision") return "Требуются исправления";
  if (status === "failed") return "Критические ошибки";
  return status ?? "—";
}

function translateRisk(risk: string | null) {
  if (risk === "low") return "Низкий";
  if (risk === "medium") return "Средний";
  if (risk === "high") return "Высокий";
  return risk ?? "—";
}

function severityLabel(severity: string | null) {
  if (severity === "high") return "🔴 Высокий риск:";
  if (severity === "medium") return "🟡 Средний риск:";
  if (severity === "low") return "🟢 Низкий риск:";
  return "⚪ Риск:";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}
