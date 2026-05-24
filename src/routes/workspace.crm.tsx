import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/workspace/crm")({
  component: CRMPage,
});

const columns = [
  "new",
  "contacted",
  "waiting_documents",
  "analysis",
  "offer_sent",
  "in_work",
  "court",
  "closed",
];

function CRMPage() {
  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">
          Legal CRM
        </h1>

        <p className="text-muted-foreground mt-2">
          AI-assisted legal pipeline
        </p>
      </div>

      <div className="grid grid-cols-8 gap-4 overflow-x-auto">
        {columns.map((column) => (
          <div
            key={column}
            className="rounded-2xl border bg-card p-4 min-h-[600px]"
          >
            <div className="mb-4">
              <h2 className="text-sm uppercase tracking-wide text-muted-foreground">
                {column.replaceAll("_", " ")}
              </h2>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border bg-background p-3">
                <div className="font-medium">
                  Тестовый лид
                </div>

                <div className="text-sm text-muted-foreground mt-1">
                  Проверка квартиры
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs rounded-full bg-red-100 px-2 py-1">
                    urgent
                  </span>

                  <span className="text-xs text-muted-foreground">
                    today
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
