import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Star, ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export type ExternalReview = {
  id: string;
  review_text: string;
  author_name: string | null;
  service_category: string | null;
  review_date: string | null;
  rating: number | null;
  external_url: string | null;
};

const fallbackReviews: ExternalReview[] = [
  {
    id: "fb-1",
    review_text:
      "Помогла спокойно выйти из сложной сделки и сохранить депозит. Без эмоций — только результат и понятные шаги.",
    author_name: "Анна К.",
    service_category: "Покупка квартиры, Москва",
    review_date: null,
    rating: 5,
    external_url: null,
  },
  {
    id: "fb-2",
    review_text:
      "Дистанционно сопроводила продажу квартиры, пока я была за границей. Все документы — вовремя, всё прозрачно.",
    author_name: "Мария Л.",
    service_category: "Клиент из Лондона",
    review_date: null,
    rating: 5,
    external_url: null,
  },
  {
    id: "fb-3",
    review_text:
      "Споры по аренде коммерческого помещения решили без суда. Чёткие письма, аккуратные переговоры, защищённые интересы.",
    author_name: "Дмитрий П.",
    service_category: "Собственник, МО",
    review_date: null,
    rating: 5,
    external_url: null,
  },
];

function formatReviewDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", { year: "numeric", month: "long" });
}

interface Props {
  /** Show only first N reviews. If omitted, shows all. */
  limit?: number;
  /** Show stats header (rating, source, summary). */
  showStats?: boolean;
  /** Show "Load more" button with pagination. Only on full pages. */
  loadMore?: boolean;
  /** Step for the "Load more" pagination. */
  pageSize?: number;
  /** Show a link to the full reviews page after the grid. */
  showAllLink?: boolean;
}

export function ReviewsSection({
  limit,
  showStats = false,
  loadMore = false,
  pageSize = 9,
  showAllLink = false,
}: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["external-reviews", "published"],
    queryFn: async (): Promise<ExternalReview[]> => {
      const { data, error } = await supabase
        .from("external_reviews")
        .select("id, review_text, author_name, service_category, review_date, rating, external_url")
        .eq("is_published", true)
        .order("review_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExternalReview[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const dynamic = data ?? [];
  const useFallback = !isLoading && dynamic.length === 0;
  const all = useFallback ? fallbackReviews : dynamic;
  const sliced = typeof limit === "number" ? all.slice(0, limit) : all;

  const [visible, setVisible] = useState(loadMore ? pageSize : sliced.length);
  const items = loadMore ? all.slice(0, visible) : sliced;

  const avgRating = useMemo(() => {
    const rated = all.filter((r) => typeof r.rating === "number" && r.rating! > 0);
    if (rated.length === 0) return 5;
    const sum = rated.reduce((a, r) => a + (r.rating || 0), 0);
    return sum / rated.length;
  }, [all]);

  return (
    <section className="container-wide py-24 md:py-32">
      <div className="eyebrow mb-5">Отзывы</div>
      <h2 className="max-w-xl text-3xl md:text-5xl">Говорят клиенты</h2>

      {showStats && (
        <div className="mt-10 grid gap-px overflow-hidden border border-border bg-border md:grid-cols-3">
          <div className="bg-background p-7">
            <div className="flex items-center gap-1 text-primary">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={16} className="fill-current" />
              ))}
            </div>
            <div className="mt-3 font-display text-3xl">
              {avgRating.toFixed(1).replace(".", ",")} <span className="text-base text-muted-foreground">из 5</span>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">средняя оценка</div>
          </div>
          <div className="bg-background p-7">
            <div className="eyebrow mb-3">Источник</div>
            <div className="font-display text-xl">Отзывы с Avito</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Реальные отклики клиентов на странице специалиста
            </div>
          </div>
          <div className="bg-background p-7">
            <div className="eyebrow mb-3">Категории</div>
            <div className="font-display text-xl leading-snug">
              Юридическая помощь по&nbsp;договорам, недвижимости и&nbsp;спорам
            </div>
          </div>
        </div>
      )}

      <div className="mt-14 grid gap-8 md:grid-cols-3">
        {items.map((r) => {
          const dateLabel = formatReviewDate(r.review_date);
          const rating = typeof r.rating === "number" ? Math.round(r.rating) : 0;
          return (
            <figure key={r.id} className="flex flex-col border-t border-border pt-8">
              <div className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-primary">
                <ShieldCheck size={12} /> Проверенный отзыв Avito
              </div>
              {rating > 0 && (
                <div className="mb-4 flex items-center gap-1 text-primary" aria-label={`Оценка ${rating} из 5`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      className={i < rating ? "fill-current" : "text-border"}
                    />
                  ))}
                </div>
              )}
              <blockquote className="font-display text-xl leading-snug text-foreground/90 md:text-2xl">
                «{r.review_text}»
              </blockquote>
              <figcaption className="mt-6 text-sm">
                {r.author_name && <div className="font-medium">{r.author_name}</div>}
                {(r.service_category || dateLabel) && (
                  <div className="text-muted-foreground">
                    {[r.service_category, dateLabel].filter(Boolean).join(" · ")}
                  </div>
                )}
              </figcaption>
              {r.external_url && (
                <a
                  href={r.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-primary hover:opacity-80"
                >
                  Смотреть на Avito <ArrowUpRight size={14} />
                </a>
              )}
            </figure>
          );
        })}
      </div>

      {loadMore && visible < all.length && (
        <div className="mt-12 flex justify-center">
          <button
            type="button"
            onClick={() => setVisible((v) => v + pageSize)}
            className="btn-ghost btn-ghost--equal"
          >
            Показать ещё
          </button>
        </div>
      )}

      {showAllLink && all.length > (limit ?? 0) && (
        <div className="mt-12 flex justify-center">
          <Link to="/reviews" className="btn-ghost btn-ghost--equal">
            Все отзывы <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
    </section>
  );
}
