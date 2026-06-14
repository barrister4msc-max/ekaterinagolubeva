import { createFileRoute } from "@tanstack/react-router";
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

      <div>
        <h1 className="text-3xl font-bold">
          История AI-анализов
        </h1>

        <p className="text-muted-foreground">
          Все проверки документа и рекомендации AI
        </p>
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



          <JsonSection
            title="Проблемы"
            data={run.problems}
          />


          <JsonSection
            title="Обязательные исправления"
            data={run.required_fixes}
          />


          <JsonSection
            title="Рекомендации AI"
            data={run.recommendations}
          />


          <JsonSection
            title="Источники"
            data={run.used_sources}
          />

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



function JsonSection({
  title,
  data,
}: {
  title:string;
  data:any;
}) {


  if (!data) return null;


  return (

    <div>

      <h3 className="font-semibold mb-2">
        {title}
      </h3>


      <pre
        className="
          text-sm
          p-4
          rounded-lg
          overflow-auto
          bg-muted
        "
      >
        {JSON.stringify(
          data,
          null,
          2
        )}
      </pre>


    </div>

  );
}
