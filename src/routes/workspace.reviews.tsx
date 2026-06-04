import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Trash2, Eye, EyeOff, Plus, X, ExternalLink, Star } from "lucide-react";

export const Route = createFileRoute("/workspace/reviews")({
  head: () => ({
    meta: [
      { title: "Отзывы — Workspace" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReviewsAdmin,
});

type Review = {
  id: string;
  source: string;
  author_name: string | null;
  rating: number | null;
  review_text: string;
  review_date: string | null;
  service_category: string | null;
  external_url: string | null;
  is_published: boolean | null;
  created_at: string | null;
};

type FormState = {
  source: string;
  author_name: string;
  rating: string;
  review_text: string;
  review_date: string;
  service_category: string;
  external_url: string;
  is_published: boolean;
};

const emptyForm: FormState = {
  source: "Avito",
  author_name: "",
  rating: "5",
  review_text: "",
  review_date: "",
  service_category: "",
  external_url: "",
  is_published: true,
};

function reviewToForm(r: Review): FormState {
  return {
    source: r.source ?? "Avito",
    author_name: r.author_name ?? "",
    rating: r.rating != null ? String(r.rating) : "",
    review_text: r.review_text ?? "",
    review_date: r.review_date ?? "",
    service_category: r.service_category ?? "",
    external_url: r.external_url ?? "",
    is_published: r.is_published ?? true,
  };
}

function formToPayload(f: FormState) {
  return {
    source: f.source.trim() || "Avito",
    author_name: f.author_name.trim() || null,
    rating: f.rating ? Number(f.rating) : null,
    review_text: f.review_text.trim(),
    review_date: f.review_date || null,
    service_category: f.service_category.trim() || null,
    external_url: f.external_url.trim() || null,
    is_published: f.is_published,
  };
}

function ReviewsAdmin() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Review | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-external-reviews"],
    queryFn: async (): Promise<Review[]> => {
      const { data, error } = await supabase
        .from("external_reviews")
        .select("*")
        .order("review_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Review[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-external-reviews"] });
    qc.invalidateQueries({ queryKey: ["external-reviews", "published"] });
  };

  const createMut = useMutation({
    mutationFn: async (f: FormState) => {
      const { error } = await supabase.from("external_reviews").insert(formToPayload(f));
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setCreating(false); },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, f }: { id: string; f: FormState }) => {
      const { error } = await supabase.from("external_reviews").update(formToPayload(f)).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setEditing(null); },
  });

  const togglePublishMut = useMutation({
    mutationFn: async (r: Review) => {
      const { error } = await supabase
        .from("external_reviews")
        .update({ is_published: !r.is_published })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("external_reviews").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-foreground/60">Workspace</div>
          <h1 className="mt-1 font-display text-2xl md:text-3xl">Отзывы</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Управление отзывами (источник по умолчанию — Avito).
          </p>
        </div>
        <button onClick={() => { setCreating(true); setEditing(null); }} className="btn-primary">
          <Plus size={14} /> Добавить отзыв
        </button>
      </header>

      {creating && (
        <ReviewForm
          title="Новый отзыв"
          initial={emptyForm}
          onCancel={() => setCreating(false)}
          onSubmit={(f) => createMut.mutate(f)}
          submitting={createMut.isPending}
          error={createMut.error}
        />
      )}

      {editing && (
        <ReviewForm
          title="Редактирование отзыва"
          initial={reviewToForm(editing)}
          onCancel={() => setEditing(null)}
          onSubmit={(f) => updateMut.mutate({ id: editing.id, f })}
          submitting={updateMut.isPending}
          error={updateMut.error}
        />
      )}

      <div className="rounded-lg border border-white/30 bg-white/10 backdrop-blur-sm shadow-[0_2px_20px_rgba(0,0,0,0.03)]">
        {isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Загрузка…</div>
        ) : error ? (
          <div className="p-8 text-sm text-destructive">Ошибка загрузки: {(error as Error).message}</div>
        ) : (data ?? []).length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground">Нет отзывов.</div>
        ) : (
          <ul className="divide-y divide-border">
            {(data ?? []).map((r) => (
              <li key={r.id} className="grid gap-3 p-5 md:grid-cols-[1fr_auto] md:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full border border-border px-2 py-0.5 uppercase tracking-wide">
                      {r.source}
                    </span>
                    {r.is_published ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">Опубликован</span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Скрыт</span>
                    )}
                    {r.rating != null && (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <Star size={12} className="fill-current" />
                        {r.rating}
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      {[r.author_name, r.service_category, r.review_date].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/85 line-clamp-3">
                    {r.review_text}
                  </p>
                  {r.external_url && (
                    <a
                      href={r.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink size={12} /> Источник
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 md:flex-nowrap">
                  <button
                    onClick={() => togglePublishMut.mutate(r)}
                    className="btn-ghost"
                    title={r.is_published ? "Скрыть" : "Показать"}
                  >
                    {r.is_published ? <EyeOff size={14} /> : <Eye size={14} />}
                    {r.is_published ? "Скрыть" : "Показать"}
                  </button>
                  <button
                    onClick={() => { setEditing(r); setCreating(false); }}
                    className="btn-ghost"
                  >
                    <Pencil size={14} /> Изменить
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Удалить отзыв безвозвратно?")) deleteMut.mutate(r.id);
                    }}
                    className="btn-ghost text-destructive hover:text-destructive"
                  >
                    <Trash2 size={14} /> Удалить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ReviewForm({
  title, initial, onCancel, onSubmit, submitting, error,
}: {
  title: string;
  initial: FormState;
  onCancel: () => void;
  onSubmit: (f: FormState) => void;
  submitting: boolean;
  error: unknown;
}) {
  const [f, setF] = useState<FormState>(initial);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.review_text.trim()) return;
    onSubmit(f);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-white/30 bg-white/10 backdrop-blur-sm p-6 shadow-[0_2px_20px_rgba(0,0,0,0.03)]"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">{title}</h2>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X size={16} />
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Field label="Источник">
          <input value={f.source} onChange={(e) => set("source", e.target.value)} className={inputCls} placeholder="Avito" required />
        </Field>
        <Field label="Автор">
          <input value={f.author_name} onChange={(e) => set("author_name", e.target.value)} className={inputCls} placeholder="Имя автора" />
        </Field>
        <Field label="Оценка (0–5)">
          <input
            type="number" min={0} max={5} step="0.1"
            value={f.rating} onChange={(e) => set("rating", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Дата отзыва">
          <input type="date" value={f.review_date} onChange={(e) => set("review_date", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Категория услуги">
          <input value={f.service_category} onChange={(e) => set("service_category", e.target.value)} className={inputCls} placeholder="Недвижимость, договоры…" />
        </Field>
        <Field label="Ссылка на источник">
          <input type="url" value={f.external_url} onChange={(e) => set("external_url", e.target.value)} className={inputCls} placeholder="https://www.avito.ru/…" />
        </Field>
        <Field label="Текст отзыва" className="md:col-span-2">
          <textarea
            required
            value={f.review_text} onChange={(e) => set("review_text", e.target.value)}
            rows={5}
            className={inputCls}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={f.is_published}
            onChange={(e) => set("is_published", e.target.checked)}
          />
          Опубликован (виден на сайте)
        </label>
      </div>

      {error ? (
        <div className="mt-4 text-sm text-destructive">
          {(error as Error).message ?? "Ошибка"}
        </div>
      ) : null}

      <div className="mt-6 flex gap-3">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Сохранение…" : "Сохранить"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          Отмена
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-foreground/60">{label}</span>
      {children}
    </label>
  );
}
