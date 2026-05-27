import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Check, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TrustBlock } from "@/components/trust-block";

export const Route = createFileRoute("/podbor-nedvizhimosti")({
  head: () => ({
    meta: [
      { title: "AI-подбор недвижимости — Екатерина Голубева" },
      {
        name: "description",
        content:
          "Оставьте заявку на подбор квартиры, дома, коммерческого помещения или участка. Юридическая проверка и AI-анализ объектов.",
      },
      { property: "og:title", content: "AI-подбор недвижимости — Екатерина Голубева" },
    ],
  }),
  component: PodborPage,
});

const PROPERTY_TYPES = [
  { value: "apartment", label: "Квартира" },
  { value: "commercial", label: "Коммерческое помещение" },
  { value: "house", label: "Дом" },
  { value: "land", label: "Земельный участок" },
];

const GOALS = [
  { value: "living", label: "Проживание" },
  { value: "investment", label: "Инвестиция" },
  { value: "rent", label: "Аренда" },
  { value: "business", label: "Бизнес" },
];

function PodborPage() {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    client_name: "",
    phone: "",
    contact_method: "",
    property_type: "apartment",
    budget_min: "",
    budget_max: "",
    districts: "",
    area_min: "",
    area_max: "",
    goal: "living",
    client_comment: "",
  });

  function upd<K extends keyof typeof form>(k: K, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.client_name.trim() || !form.phone.trim()) {
      setErr("Укажите имя и телефон.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        client_name: form.client_name.trim().slice(0, 200),
        phone: form.phone.trim().slice(0, 50),
        contact_method: form.contact_method.trim() || null,
        property_type: form.property_type,
        budget_min: form.budget_min ? Number(form.budget_min) : null,
        budget_max: form.budget_max ? Number(form.budget_max) : null,
        districts: form.districts
          ? form.districts.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        area_min: form.area_min ? Number(form.area_min) : null,
        area_max: form.area_max ? Number(form.area_max) : null,
        goal: form.goal,
        client_comment: form.client_comment.trim() || null,
        status: "new",
      };
      const { error } = await supabase.from("property_search_requests").insert(payload);
      if (error) throw error;
      setDone(true);
    } catch (e: unknown) {
      console.error(e);
      setErr("Не удалось отправить заявку. Попробуйте ещё раз или напишите напрямую.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="bg-[oklch(0.97_0.012_75)]">
      <section className="container-wide py-16 md:py-24">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-foreground/60">
            <Building2 size={14} /> AI-подбор недвижимости
          </div>
          <h1 className="font-display text-3xl md:text-5xl leading-tight">
            Подбор объекта с юридической проверкой
          </h1>
          <p className="mt-4 max-w-2xl text-foreground/70">
            Расскажите, что ищете. Екатерина изучит запрос, подберёт варианты и проведёт первичную
            правовую оценку каждого объекта.
          </p>

          {done ? (
            <div className="mt-10 rounded-lg border border-border bg-card p-8 shadow-[0_2px_30px_rgba(0,0,0,0.04)]">
              <div className="flex items-center gap-3 text-primary">
                <Check size={20} />
                <span className="font-medium">Заявка принята</span>
              </div>
              <p className="mt-3 text-foreground/75">
                Екатерина свяжется с вами после первичного анализа.
              </p>
              <Link to="/" className="btn-ghost mt-6 inline-flex">
                На главную
              </Link>
            </div>
          ) : (
            <form
              onSubmit={onSubmit}
              className="mt-10 rounded-lg border border-border bg-card p-6 md:p-8 shadow-[0_2px_30px_rgba(0,0,0,0.04)] space-y-5"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Имя *">
                  <input
                    className="form-input"
                    value={form.client_name}
                    onChange={(e) => upd("client_name", e.target.value)}
                    required
                    maxLength={200}
                  />
                </Field>
                <Field label="Телефон *">
                  <input
                    className="form-input"
                    value={form.phone}
                    onChange={(e) => upd("phone", e.target.value)}
                    required
                    maxLength={50}
                  />
                </Field>
              </div>

              <Field label="Telegram / WhatsApp">
                <input
                  className="form-input"
                  value={form.contact_method}
                  onChange={(e) => upd("contact_method", e.target.value)}
                  placeholder="@username или ссылка"
                  maxLength={200}
                />
              </Field>

              <Field label="Тип объекта">
                <select
                  className="form-input"
                  value={form.property_type}
                  onChange={(e) => upd("property_type", e.target.value)}
                >
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Бюджет от, ₽">
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    value={form.budget_min}
                    onChange={(e) => upd("budget_min", e.target.value)}
                  />
                </Field>
                <Field label="Бюджет до, ₽">
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    value={form.budget_max}
                    onChange={(e) => upd("budget_max", e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Районы / локации">
                <input
                  className="form-input"
                  value={form.districts}
                  onChange={(e) => upd("districts", e.target.value)}
                  placeholder="Например: Хамовники, Пресненский (через запятую)"
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Площадь от, м²">
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    value={form.area_min}
                    onChange={(e) => upd("area_min", e.target.value)}
                  />
                </Field>
                <Field label="Площадь до, м²">
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    value={form.area_max}
                    onChange={(e) => upd("area_max", e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Цель покупки">
                <select
                  className="form-input"
                  value={form.goal}
                  onChange={(e) => upd("goal", e.target.value)}
                >
                  {GOALS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Комментарий">
                <textarea
                  className="form-input min-h-[100px]"
                  value={form.client_comment}
                  onChange={(e) => upd("client_comment", e.target.value)}
                  maxLength={2000}
                  placeholder="Что важно учесть при подборе"
                />
              </Field>

              {err && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {err}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary inline-flex w-full justify-center md:w-auto"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                Отправить заявку
              </button>
            </form>
          )}

          <div className="mt-12">
            <TrustBlock />
          </div>
        </div>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs uppercase tracking-wider text-foreground/60">{label}</div>
      {children}
    </label>
  );
}
