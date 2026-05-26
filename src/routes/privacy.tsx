import { createFileRoute, Link } from "@tanstack/react-router";
import { useSiteSettings } from "@/hooks/use-site-settings";

const SITE_BASE = "https://legalpracticelife.ru";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Политика конфиденциальности — Екатерина Голубева" },
      {
        name: "description",
        content:
          "Политика конфиденциальности и согласие на обработку персональных данных при использовании сайта Екатерины Голубевой.",
      },
      { property: "og:title", content: "Политика конфиденциальности" },
      { property: "og:url", content: `${SITE_BASE}/privacy` },
    ],
    links: [{ rel: "canonical", href: `${SITE_BASE}/privacy` }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
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
              <li className="text-foreground/70">Политика конфиденциальности</li>
            </ol>
          </nav>
          <div className="eyebrow mb-4">Документы</div>
          <h1 className="text-3xl md:text-5xl">Политика конфиденциальности</h1>
          <p className="mt-4 text-xs text-muted-foreground">
            Редакция от 25 мая 2026 г.
          </p>
        </div>
      </section>

      <article className="container-wide max-w-3xl py-16 md:py-24 space-y-8 text-sm leading-relaxed text-foreground/85">
        <section>
          <h2 className="font-display text-xl text-foreground">1. Оператор персональных данных</h2>
          <p className="mt-3">
            Оператор персональных данных — {operator} (далее — «Оператор»).
            Сайт расположен по адресу {SITE_BASE}.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">2. Какие данные мы обрабатываем</h2>
          <p className="mt-3">
            При обращении через форму на сайте, мессенджеры или электронную почту мы можем получать:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>имя или то, как вы предпочитаете, чтобы к вам обращались;</li>
            <li>контактные данные: номер телефона, email, мессенджер;</li>
            <li>сведения о вашей ситуации, изложенные вами добровольно;</li>
            <li>технические данные: IP-адрес, user-agent, параметры визита (UTM);</li>
            <li>файлы, которые вы прикладываете к обращению.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">3. Цели обработки</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>связаться с вами по существу обращения;</li>
            <li>предоставить юридическую консультацию или сопровождение;</li>
            <li>исполнить обязательства, возникающие из договора оказания услуг;</li>
            <li>соблюдать требования законодательства РФ.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">4. Правовые основания</h2>
          <p className="mt-3">
            Обработка персональных данных осуществляется в соответствии с{" "}
            <a
              href="https://www.consultant.ru/document/cons_doc_LAW_61801/"
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary hover:underline"
            >
              Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных»
            </a>
            , в частности:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>
              <a
                href="https://www.consultant.ru/document/cons_doc_LAW_61801/dc0b9959ca27fba1add9a97f0ae4a81af29efc9d/"
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary hover:underline"
              >
                ст. 5 152-ФЗ
              </a>{" "}
              — принципы обработки персональных данных;
            </li>
            <li>
              <a
                href="https://www.consultant.ru/document/cons_doc_LAW_61801/dde34a3ce702894aa97e632e7b1ee36259fdec46/"
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary hover:underline"
              >
                ст. 9 152-ФЗ
              </a>{" "}
              — согласие субъекта персональных данных на их обработку;
            </li>
            <li>
              <a
                href="https://www.consultant.ru/document/cons_doc_LAW_61801/c80b0b8ea2cda85a73c4f7ac17f88a82b9d33564/"
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary hover:underline"
              >
                ст. 18.1 152-ФЗ
              </a>{" "}
              — меры, направленные на обеспечение выполнения оператором обязанностей,
              в том числе политика обработки персональных данных.
            </li>
          </ul>
          <p className="mt-3">
            Обработка также может осуществляться для исполнения договора, стороной
            которого является субъект персональных данных.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">5. Согласие на обработку</h2>
          <p className="mt-3">
            Отправляя форму на сайте или иным образом передавая Оператору
            свои персональные данные, вы подтверждаете, что ознакомились
            с настоящей Политикой и даёте согласие на обработку указанных
            данных в перечисленных выше целях, включая хранение, систематизацию,
            уточнение, использование, передачу обслуживающим сервисам
            (хостинг, CRM, мессенджеры) и удаление.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">6. AI-помощник и автоматическая обработка</h2>
          <p className="mt-3">
            Сайт может использовать AI-помощник для предварительной структуризации
            вашего обращения. Текст обращения может передаваться поставщику AI-сервиса
            исключительно для обработки запроса и не используется для обучения моделей.
            Вы можете отказаться от использования AI-помощника и связаться через
            мессенджеры или электронную почту.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">7. Хранение и защита</h2>
          <p className="mt-3">
            Персональные данные хранятся на защищённой инфраструктуре с
            ограниченным кругом доступа. Срок хранения — не дольше, чем
            требуется для целей обработки или установлено законом.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">8. Ваши права</h2>
          <p className="mt-3">
            Вы вправе получить информацию о своих данных, потребовать их
            уточнения, блокирования или удаления, а также отозвать согласие.
            Для этого направьте запрос через форму на странице «Контакты».
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-foreground">9. Контакты для обращений</h2>
          <p className="mt-3">
            Связаться с Оператором по вопросам обработки персональных данных
            можно через страницу{" "}
            <Link to="/contact" className="text-primary hover:underline">«Контакты»</Link>.
          </p>
        </section>
      </article>
    </main>
  );
}
