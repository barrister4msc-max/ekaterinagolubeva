import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, SlidersHorizontal, Plus, Users, Clock, CheckCircle2, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/workspace/crm")({
  component: CRMPage,
});

const columns = [
  { id: "new", label: "NEW", dot: "bg-blue-500" },
  { id: "contacted", label: "CONTACTED", dot: "bg-cyan-500" },
  { id: "waiting_documents", label: "WAITING DOCUMENTS", dot: "bg-amber-500" },
  { id: "analysis", label: "ANALYSIS", dot: "bg-violet-500" },
  { id: "offer_sent", label: "OFFER SENT", dot: "bg-blue-600" },
  { id: "in_work", label: "IN WORK", dot: "bg-green-500" },
  { id: "court", label: "COURT", dot: "bg-red-500" },
  { id: "closed", label: "CLOSED", dot: "bg-neutral-400" },
];

const testLeads = [
  { name: "Иван Петров", case: "Проверка квартиры перед покупкой", stage: "new", priority: "urgent", date: "Сегодня" },
  { name: "Мария Соколова", case: "Консультация по мошенничеству", stage: "new", priority: "medium", date: "Сегодня" },
  { name: "Алексей Ким", case: "Взыскание долга с физлица", stage: "new", priority: "low", date: "Вчера" },
  { name: "Ольга Власова", case: "Проверка документов на недвижимость", stage: "contacted", priority: "urgent", date: "Сегодня" },
  { name: "Дмитрий Орлов", case: "Раздел имущества после развода", stage: "contacted", priority: "medium", date: "Вчера" },
  { name: "Елена Смирнова", case: "Оформление наследства", stage: "waiting_documents", priority: "medium", date: "2 дня назад" },
  { name: "Сергей Воронов", case: "Регистрация ООО", stage: "waiting_documents", priority: "low", date: "3 дня назад" },
  { name: "Наталья Зайцева", case: "Трудовой спор с работодателем", stage: "analysis", priority: "urgent", date: "Сегодня" },
  { name: "Максим Григорьев", case: "Проверка договора аренды", stage: "analysis", priority: "low", date: "Вчера" },
  { name: "Юлия Белова", case: "Сопровождение сделки купли-продажи", stage: "offer_sent", priority: "medium", date: "2 дня назад" },
  { name: "Андрей Лебедев", case: "Взыскание ущерба с УК", stage: "in_work", priority: "urgent", date: "Сегодня" },
  { name: "Виктория Морозова", case: "Спор о границах участка", stage: "in_work", priority: "medium", date: "Вчера" },
  { name: "Павел Новиков", case: "Представительство в суде по ДТП", stage: "court", priority: "urgent", date: "3 дня назад" },
  { name: "Татьяна Ларина", case: "Успешное взыскание долга", stage: "closed", priority: "low", date: "5 дней назад" },
  { name: "Роман Иванов", case: "Регистрация товарного знака", stage: "closed", priority: "low", date: "Неделю назад" },
];

function priorityClass(priority: string) {
  if (priority === "urgent") return "bg-red-100 text-red-700";
  if (priority === "medium") return "bg-amber-100 text-amber-700";
  return "bg-green-100 text-green-700";
}

function CRMPage() {
  return (
    <div className="space-y-6 pb-8">
     <div className="
sticky
top-0
z-20
flex
flex-col
gap-6
bg-[oklch(0.97_0.012_75)]
pb-4
pt-2
xl:flex-row
xl:items-start
xl:justify-between
">
        <div>
          <h1 className="font-display text-4xl leading-tight">Legal CRM</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            AI-assisted legal pipeline
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm text-muted-foreground shadow-sm">
            <Search size={16} />
            Поиск...
          </div>

          <button className="flex h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm shadow-sm">
            <SlidersHorizontal size={16} />
            Фильтры
          </button>

          <button className="flex h-11 items-center gap-2 rounded-xl bg-neutral-950 px-5 text-sm text-white shadow-sm">
            <Plus size={16} />
            Добавить лид
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-white/55 p-4 shadow-[0_10px_40px_rgba(0,0,0,0.03)]">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 3xl:grid-cols-4">
          {columns.map((column) => {
            const leads = testLeads.filter((lead) => lead.stage === column.id);

            return (
             <section
  key={column.id}
 className="
min-h-[420px]
rounded-2xl
border
border-border/60
bg-white/70
backdrop-blur
p-4
shadow-[0_4px_24px_rgba(0,0,0,0.03)]
"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${column.dot}`} />
                    <h2 className="text-xs font-semibold uppercase tracking-[0.12em]">
                      {column.label}
                    </h2>
                  </div>

                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                    {leads.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {leads.map((lead) => (
                    <article
                      key={lead.name}
                      className="
group
rounded-2xl
border
border-border/60
bg-white
p-4
shadow-[0_4px_20px_rgba(0,0,0,0.035)]
transition-all
duration-200
hover:-translate-y-1
hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]
"
                    >
                      <h3 className="text-sm font-semibold">{lead.name}</h3>

                      <p className="mt-3 line-clamp-3 text-[13px] leading-5 text-muted-foreground">
                        {lead.case}
                      </p>

                      <div className="mt-4 flex items-center justify-between gap-2">
                        <span className={`rounded-full px-2 py-1 text-[11px] ${priorityClass(lead.priority)}`}>
                          {lead.priority}
                        </span>

                        <span className="text-[11px] text-muted-foreground">
                          {lead.date}
                        </span>
                      </div>
                    </article>
                  ))}

                  <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-xs text-muted-foreground hover:bg-white">
                    <Plus size={14} />
                    Добавить лид
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi icon={Users} value="15" label="Всего лидов" sub="+12% за неделю" />
        <Kpi icon={Clock} value="4" label="В работе" sub="+2 за неделю" />
        <Kpi icon={CheckCircle2} value="8" label="Завершено" sub="+25% за неделю" />
        <Kpi icon={TrendingUp} value="73%" label="Конверсия" sub="+8% за неделю" />
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  value,
  label,
  sub,
}: {
  icon: typeof Users;
  value: string;
  label: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-6 shadow-[0_6px_30px_rgba(0,0,0,0.035)]">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
          <Icon size={22} />
        </div>

        <div>
          <div className="font-display text-3xl">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{label}</div>
        </div>
      </div>

      <div className="mt-4 text-xs text-green-600">{sub}</div>
    </div>
  );
}
