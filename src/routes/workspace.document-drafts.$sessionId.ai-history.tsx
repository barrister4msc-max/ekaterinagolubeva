import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Brain,
  FileWarning,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute(
  "/workspace/document-drafts/$sessionId/ai-history",
)({
  component: AIHistoryPage,
});


function AIHistoryPage() {

  const { sessionId } = Route.useParams();


  const { data: runs, isLoading } = useQuery({
    queryKey: ["ai-history", sessionId],

    queryFn: async () => {

      const { data, error } = await supabase
        .from("document_intake_ai_runs")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", {
          ascending: false,
        });


      if (error) throw error;

      return data;
    },
  });


  if (isLoading) {
    return (
      <div className="p-6">
        Загрузка AI истории...
      </div>
    );
  }


  return (
    <div className="p-6 space-y-6">

      <div className="space-y-3">
  <h1 className="text-3xl font-bold">
    История AI-анализов
  </h1>

  <p className="text-muted-foreground">
    Все проверки документа и рекомендации AI
  </p>

  <Link
    to="/workspace/document-drafts"
    className="inline-flex items-center rounded-md border px-3 py-2 text-sm"
  >
    ← Назад к черновикам
  </Link>
</div>


      {runs?.length === 0 && (
        <div className="border rounded-lg p-6">
          AI-анализы пока отсутствуют
        </div>
      )}


      {runs?.map((run, index) => (

        <div
          key={run.id}
          className="border rounded-xl p-6 space-y-4"
        >

          <div className="flex justify-between">

            <div>

              <h2 className="font-semibold text-xl">
                AI-анализ #{runs.length - index}
              </h2>


              <div className="text-sm opacity-70">
                {new Date(run.created_at)
                  .toLocaleString("ru-RU")}
              </div>

            </div>


            <div className="flex gap-2">

              <BadgeReview
                status={run.review_status}
              />

              <BadgeRisk
                risk={run.hallucination_risk}
              />

            </div>

          </div>



          <div className="grid grid-cols-3 gap-4">

            <InfoCard
              title="Точность"
              value={`${run.legal_accuracy_score ?? "-"} %`}
            />

            <InfoCard
              title="Модель"
              value={run.model_name ?? "Не указана"}
            />


            <InfoCard
              title="Проверка юриста"
              value={
                run.needs_lawyer_review
                  ? "Требуется"
                  : "Не требуется"
              }
            />

          </div>



                    <div className="grid grid-cols-3 gap-4">
            <InfoCard
              title="Проблем"
              value={String(
                Array.isArray(run.problems) ? run.problems.length : 0
              )}
            />

            <InfoCard
              title="Исправлений"
              value={String(
                Array.isArray(run.required_fixes)
                  ? run.required_fixes.length
                  : 0
              )}
            />

            <InfoCard
              title="Рекомендаций"
              value={String(
                Array.isArray(run.recommendations)
                  ? run.recommendations.length
                  : 0
              )}
            />
          </div>

          <Link
            to="/workspace/document-drafts/$sessionId/ai-review"
            params={{
              sessionId,
            }}
            className="inline-flex items-center rounded-md border px-3 py-2 text-sm"
          >
            Открыть AI заключение →
          </Link>

        </div>

      ))}

    </div>
  );
}


function InfoCard({
  title,
  value,
}: {
  title:string;
  value:string;
}) {
  return (
    <div className="border rounded-lg p-3">
      <div className="text-xs opacity-70">
        {title}
      </div>

      <div className="font-semibold">
        {value}
      </div>
    </div>
  );
}



function BadgeReview({
  status,
}: {
  status:string|null;
}) {

  const map = {
    passed: "🟢 AI проверка пройдена",
    needs_revision: "🟡 Требуются исправления",
    failed: "🔴 Критические ошибки",
  };

  return (
    <div className="border rounded px-3 py-1 text-sm">
      {map[status as keyof typeof map] ?? status}
    </div>
  );
}



function BadgeRisk({
  risk,
}: {
  risk:string|null;
}) {

  const map = {
    low: "🟢 Низкий риск",
    medium: "🟡 Средний риск",
    high: "🔴 Высокий риск",
  };


  return (
    <div className="border rounded px-3 py-1 text-sm">
      {map[risk as keyof typeof map] ?? risk}
    </div>
  );
}




