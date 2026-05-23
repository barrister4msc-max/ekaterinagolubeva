import { createFileRoute } from "@tanstack/react-router";
import { ReviewsSection } from "@/components/reviews-section";

export const Route = createFileRoute("/reviews")({
  head: () => ({
    meta: [
      { title: "Отзывы клиентов — Екатерина Голубева" },
      {
        name: "description",
        content:
          "Реальные отзывы клиентов о юридическом сопровождении сделок с недвижимостью, договорами и судебными спорами. Источник — Avito.",
      },
      { property: "og:title", content: "Отзывы клиентов — Екатерина Голубева" },
      {
        property: "og:description",
        content: "Отзывы с Avito о работе по договорам, недвижимости и спорам.",
      },
      { property: "og:url", content: "https://4upro.ai/reviews" },
    ],
    links: [{ rel: "canonical", href: "https://4upro.ai/reviews" }],
  }),
  component: ReviewsPage,
});

function ReviewsPage() {
  return (
    <main>
      <section className="container-wide pt-28 pb-4 md:pt-32">
        <div className="eyebrow mb-5">Отзывы</div>
        <h1 className="max-w-3xl text-3xl md:text-5xl">
          Что говорят клиенты о работе
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Все опубликованные отзывы клиентов. Источник — страница специалиста на Avito.
        </p>
      </section>
      <ReviewsSection showStats loadMore pageSize={9} />
    </main>
  );
}
