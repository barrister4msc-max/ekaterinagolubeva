import { createFileRoute, Link } from "@tanstack/react-router";

const SITE_BASE = "https://ekaterinagolubeva.lovable.app";

export const Route = createFileRoute("/ai-disclaimer")({
  head: () => ({
    meta: [
      { title: "AI-дисклеймер — Екатерина Голубева" },
      {
        name: "description",
        content:
          "Условия использования AI-ассистента на сайте: предварительный анализ обращения, ограничения, защита данных.",
      },
      { property: "og:title", content: "AI-дисклеймер" },
      { property: "og:url", content: `${SITE_BASE}/ai-disclaimer` },
    ],
    links: [{ rel: "canonical", href: `${SITE_BASE}/ai-disclaimer` }],
  }),
  component: AiDisclaimerPage,
});

function AiDisclaimerPage() {
  return (
    <main>
      <section className="border-b border-border bg-secondary/30">
        <div className="container-wide py-16 md:py-24">
          <nav aria-label="breadcrumb" className="mb-6 text-xs text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li><Link to="/" className="hover:text-primary">Главная</Link></li>
              <li aria-hidden>/</li>
              <li className="text-foreground/70">AI-дисклеймер</li>
            </ol>
          </nav>
          <div className="eyebrow mb-4">Документы</div>
          <h1 className="text-3xl md:text-5xl">AI-дисклеймер</h1>
        </div>
      </section>

      <article className="container-wide max-w-3xl py-16 md:py-24 space-y-6 text-sm leading-relaxed text-foreground/85">
        <section>
          <h2 className="font-display text-xl text-foreground">Назначение AI-ассистента</h2>
          <p className="mt-3">
            AI-ассистент используется для предварительной структуризации
            обращения: классификации темы, формирования уточняющих вопросов и
            подготовки краткой сводки для юриста. AI не выносит юридических
            заключений и не принимает решений вместо специалиста.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">Ограничения</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>ответы AI носят информационный характер;</li>
            <li>AI-ассистент не заменяет индивидуальную юридическую консультацию;</li>
            <li>не следует полагаться на ответы AI при принятии юридически значимых решений;</li>
            <li>для разбора конкретной ситуации необходима консультация юриста.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">Обработка данных</h2>
          <p className="mt-3">
            Текст обращения передаётся поставщику AI-сервиса исключительно для
            выполнения запроса. Данные не используются для обучения моделей.
            Подробнее см.{" "}
            <Link to="/privacy" className="text-primary hover:underline">Политику конфиденциальности</Link>
            {" "}и{" "}
            <Link to="/consent" className="text-primary hover:underline">Согласие на обработку</Link>.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">Отказ от AI-обработки</h2>
          <p className="mt-3">
            Если вы не хотите использовать AI-ассистент, свяжитесь напрямую
            через мессенджеры или электронную почту на странице{" "}
            <Link to="/contact" className="text-primary hover:underline">«Контакты»</Link>.
          </p>
        </section>
      </article>
    </main>
  );
}
