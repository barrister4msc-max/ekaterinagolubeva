import { createFileRoute, Link } from "@tanstack/react-router";

const SITE_BASE = "https://legalpracticelife.ru";

export const Route = createFileRoute("/consent")({
  head: () => ({
    meta: [
      { title: "Согласие на обработку персональных данных — Екатерина Голубева" },
      {
        name: "description",
        content:
          "Текст согласия на обработку персональных данных в соответствии со ст. 9 Федерального закона № 152-ФЗ.",
      },
      { property: "og:title", content: "Согласие на обработку персональных данных" },
      { property: "og:url", content: `${SITE_BASE}/consent` },
    ],
    links: [{ rel: "canonical", href: `${SITE_BASE}/consent` }],
  }),
  component: ConsentPage,
});

function ConsentPage() {
  return (
    <main>
      <section className="border-b border-border bg-secondary/30">
        <div className="container-wide py-16 md:py-24">
          <nav aria-label="breadcrumb" className="mb-6 text-xs text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li><Link to="/" className="hover:text-primary">Главная</Link></li>
              <li aria-hidden>/</li>
              <li className="text-foreground/70">Согласие на обработку персональных данных</li>
            </ol>
          </nav>
          <div className="eyebrow mb-4">Документы</div>
          <h1 className="text-3xl md:text-5xl">Согласие на обработку персональных данных</h1>
          <p className="mt-4 text-xs text-muted-foreground">Редакция от 25 мая 2026 г. (версия 2026-05)</p>
        </div>
      </section>

      <article className="container-wide max-w-3xl py-16 md:py-24 space-y-6 text-sm leading-relaxed text-foreground/85">
        <p>
          В соответствии со статьёй 9 Федерального закона от 27.07.2006 № 152-ФЗ
          «О персональных данных», направляя обращение через сайт, пользователь
          даёт согласие на обработку своих персональных данных.
        </p>

        <section>
          <h2 className="font-display text-xl text-foreground">Полный текст согласия</h2>
          <p className="mt-3">
            «Я даю согласие на обработку персональных данных, подтверждаю
            ознакомление с{" "}
            <Link to="/privacy" className="text-primary hover:underline">
              Политикой обработки персональных данных
            </Link>
            {" "}и соглашаюсь на использование AI-ассистента для предварительного
            анализа обращения. AI-ассистент не заменяет индивидуальную
            юридическую консультацию».
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">Состав данных</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>имя и форма обращения;</li>
            <li>номер телефона, email, идентификатор мессенджера;</li>
            <li>текст обращения и приложенные материалы;</li>
            <li>технические данные: IP, user-agent, UTM-метки, URL страницы.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">Действия с данными</h2>
          <p className="mt-3">
            Сбор, запись, систематизация, накопление, хранение, уточнение,
            извлечение, использование, передача обслуживающим сервисам
            (хостинг, CRM, AI-сервис для структуризации), блокирование,
            удаление и уничтожение.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">AI-обработка</h2>
          <p className="mt-3">
            Текст обращения может передаваться AI-сервису исключительно для
            предварительной классификации и формирования уточняющих вопросов.
            Подробнее — на странице{" "}
            <Link to="/ai-disclaimer" className="text-primary hover:underline">/ai-disclaimer</Link>.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">Срок и отзыв согласия</h2>
          <p className="mt-3">
            Согласие действует до момента его отзыва. Отозвать согласие можно,
            направив запрос через страницу{" "}
            <Link to="/contact" className="text-primary hover:underline">«Контакты»</Link>.
            После отзыва Оператор прекращает обработку и обеспечивает удаление
            данных в сроки, установленные законом.
          </p>
        </section>
      </article>
    </main>
  );
}
