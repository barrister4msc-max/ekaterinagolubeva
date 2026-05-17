import { createFileRoute } from "@tanstack/react-router";
import { LeadsAdmin } from "@/components/leads-admin";

export const Route = createFileRoute("/workspace/leads")({
  component: LeadsPage,
});

function LeadsPage() {
  return (
    <div className="space-y-8">
      <header>
        <div className="text-[10px] uppercase tracking-[0.28em] text-foreground/60">Заявки</div>
        <h1 className="mt-2 font-display text-4xl">Все обращения</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Структурированные досье клиентов с AI-разбором.
        </p>
      </header>
      <div className="rounded-xl border border-border bg-card p-6 shadow-[0_2px_20px_rgba(0,0,0,0.03)] md:p-8">
        {/* Reuses existing LeadsAdmin component */}
        <div className="-mt-12">
          <LeadsAdmin />
        </div>
      </div>
    </div>
  );
}
