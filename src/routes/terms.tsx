import { createFileRoute, Link } from "@tanstack/react-router";
import { useSiteSettings } from "@/hooks/use-site-settings";

const SITE_BASE = "https://legalpracticelife.ru";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Оферта и пользовательское соглашение — Екатерина Голубева" },
      {
        name: "description",
        content:
          "Пользовательское соглашение и публичная оферта сайта Екатерины Голубевой. Юридический дисклеймер.",
      },
      { property: "og:title", content: "Оферта и пользовательское соглашение" },
      { property: "og:url", content: `${SITE_BASE}/terms` },
    ],
    links: [{ rel: "canonical", href: `${SITE_BASE}/terms` }],
  }),
  component: TermsPage,
});

function TermsPage() {
  const { settings } = useSiteSettings();
  const operator = [settings.legal_form, settings.legal_full_name].filter(Boolean).join(" · ") ||
    "Самозанятый · Голубева Екатерина Александровна";

  return (
    <main>
      <section className="border-b border-border bg-secondary/30">
        <div className="container-wide py-16 md:py-24">
          <nav aria-label="breadcrumb" className="mb-6 text-xs text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li><Link to="/" className="hover:text-primary">Главная</Link></li>
              <li aria-hidden>/</li>
              <li className="text-foreground/70">Оферта и соглашение</li>
            </ol>
          </nav>
          <div className="eyebrow mb-4">Документы</div>
          <h1 className="text-3xl md:text-5xl">Оферта и пользовательское соглашение</h1>
          <p className="mt-4 text-xs text-muted-foreground">
            Редакция от 25 мая 2026 г.
          </p>
        </div>
      </section>

      <article className="container-wide max-w-3xl py-16 md:py-24 space-y-8 text-sm leading-relaxed text-foreground/85">
        <section>
          <h2 className="font-display text-xl text-foreground">1. Стороны</h2>
          <p className="mt-3">
            Настоящее соглашение заключается между {operator} (далее — «Исполнитель»)
            и любым физическим или юридическим лицом, использующим сайт {SITE_BASE} (далее — «Клиент»).
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">2. Предмет</h2>
          <p className="mt-3">
            Исполнитель оказывает Клиенту юридические услуги по консультированию,
            подготовке документов, сопровождению сделок и судебному представительству
            в объёме, согласованном сторонами отдельно по каждому обращению.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">3. Использование сайта</h2>
          <p className="mt-3">
            Сайт {SITE_BASE} предоставляет информацию о направлениях практики,
            форму обращения и каналы связи. Использование сайта означает согласие
            с настоящим соглашением и{" "}
            <Link to="/privacy" className="text-primary hover:underline">Политикой конфиденциальности</Link>.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">4. Стоимость и порядок оплаты</h2>
          <p className="mt-3">
            Стоимость услуг определяется индивидуально по каждой ситуации
            и фиксируется в отдельном соглашении или счёте до начала работ.
            Первичный разбор обращения предоставляется бесплатно.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">5. Ответственность сторон</h2>
          <p className="mt-3">
            Исполнитель действует разумно и добросовестно, но не гарантирует
            конкретный результат судебного или административного разбирательства,
            поскольку он зависит от обстоятельств дела, действий третьих лиц
            и решений уполномоченных органов.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">6. Юридический дисклеймер</h2>
          <p className="mt-3">
            Материалы сайта носят информационный характер и не являются
            юридической консультацией по конкретному делу. Применимость
            тех или иных норм к вашей ситуации определяется только после
            индивидуального разбора. Сайт не является публичной офертой
            по смыслу ст. 437 ГК РФ, если это прямо не указано в соответствующем разделе.
          </p>
          <p className="mt-3">
            Информация о сторонних законах, решениях и практике актуальна
            на дату публикации и может измениться. Перед принятием решения
            проконсультируйтесь со специалистом.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">7. Конфиденциальность</h2>
          <p className="mt-3">
            Сведения, переданные Клиентом, обрабатываются в режиме конфиденциальности
            и не передаются третьим лицам без согласия Клиента, за исключением случаев,
            предусмотренных законом.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">8. Применимое право</h2>
          <p className="mt-3">
            К отношениям сторон применяется законодательство Российской Федерации.
            Споры разрешаются в досудебном порядке, при недостижении соглашения —
            в суде по месту нахождения Исполнителя.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">9. Контакты</h2>
          <p className="mt-3">
            Связаться с Исполнителем можно через страницу{" "}
            <Link to="/contact" className="text-primary hover:underline">«Контакты»</Link>.
          </p>
        </section>
      </article>
    </main>
  );
}
