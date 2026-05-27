import { createFileRoute } from "@tanstack/react-router";
import { PageShell, BulletSection } from "@/components/page-shell";
import { ContactChannels } from "@/components/contact-channels";
import portrait from "@/assets/ekaterina-portrait.jpg";

const SITE_URL = "https://legalpracticelife.ru";
const CANONICAL = `${SITE_URL}/ekaterina-golubeva`;
const IMAGE_URL = `${SITE_URL}/about-portrait.jpg`;

const personSchema = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Екатерина Голубева",
  jobTitle: "Юрист по недвижимости, договорному праву и судебным спорам",
  url: CANONICAL,
  image: IMAGE_URL,
  address: {
    "@type": "PostalAddress",
    addressLocality: "Москва",
    addressCountry: "RU",
  },
  knowsAbout: [
    "Недвижимость",
    "Договорное право",
    "Арбитраж",
    "Наследственные споры",
    "Земельные споры",
  ],
  worksFor: {
    "@type": "LegalService",
    name: "Юридическая практика Екатерины Голубевой",
    url: SITE_URL,
  },
};

const legalServiceSchema = {
  "@context": "https://schema.org",
  "@type": "LegalService",
  name: "Юридическая практика Екатерины Голубевой",
  url: CANONICAL,
  image: IMAGE_URL,
  areaServed: { "@type": "Country", name: "Россия" },
  address: {
    "@type": "PostalAddress",
    addressLocality: "Москва",
    addressCountry: "RU",
  },
  provider: { "@type": "Person", name: "Екатерина Голубева" },
  serviceType: [
    "Сопровождение сделок с недвижимостью",
    "Договорное право",
    "Арбитражные споры",
    "Наследственные споры",
    "Земельные споры",
  ],
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Главная", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Екатерина Голубева", item: CANONICAL },
  ],
};

export const Route = createFileRoute("/ekaterina-golubeva")({
  head: () => ({
    meta: [
      { title: "Екатерина Голубева — юрист по недвижимости, договорам и судебным спорам" },
      {
        name: "description",
        content:
          "Юридическая помощь в Москве: недвижимость, договорное право, арбитраж, наследственные и земельные споры.",
      },
      {
        property: "og:title",
        content: "Екатерина Голубева — юрист по недвижимости, договорам и судебным спорам",
      },
      {
        property: "og:description",
        content:
          "Юридическая помощь в Москве: недвижимость, договорное право, арбитраж, наследственные и земельные споры.",
      },
      { property: "og:url", content: CANONICAL },
      { property: "og:type", content: "profile" },
      { property: "og:image", content: IMAGE_URL },
      { name: "twitter:image", content: IMAGE_URL },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(personSchema) },
      { type: "application/ld+json", children: JSON.stringify(legalServiceSchema) },
      { type: "application/ld+json", children: JSON.stringify(breadcrumbSchema) },
    ],
  }),
  component: EkaterinaGolubevaPage,
});

function EkaterinaGolubevaPage() {
  return (
    <PageShell
      eyebrow="Эксперт практики"
      title="Екатерина Голубева"
      intro="Юрист с практикой в Москве. Веду дела по недвижимости, договорному праву, арбитражным, наследственным и земельным спорам. Помогаю спокойно и по существу."
      breadcrumbs={[{ label: "Екатерина Голубева" }]}
      canonicalPath="/ekaterina-golubeva"
      hideAuthor
    >
      <section className="container-wide grid gap-12 py-16 md:grid-cols-12 md:py-24">
        <div className="md:col-span-5">
          <img
            src={portrait}
            alt="Екатерина Голубева — юрист в Москве"
            className="aspect-[4/5] w-full rounded-md object-cover"
            loading="lazy"
          />
        </div>
        <div className="md:col-span-7">
          <div className="eyebrow mb-3">Специализация</div>
          <ul className="grid gap-2 text-base leading-relaxed text-muted-foreground sm:grid-cols-2">
            <li>— Недвижимость</li>
            <li>— Договорное право</li>
            <li>— Арбитраж</li>
            <li>— Наследственные споры</li>
            <li>— Земельные споры</li>
          </ul>

          <h2 className="mt-10 text-2xl md:text-3xl">О практике</h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Сопровождаю частных клиентов и компании на всех этапах — от консультации
            и проверки документов до судебного представительства. Работаю в Москве,
            МО и дистанционно по России. Для меня важна прозрачность: понятные сроки,
            фиксированный объём работ и ясная позиция по рискам.
          </p>

          <h2 className="mt-10 text-2xl md:text-3xl">Контакты</h2>
          <ContactChannels variant="minimal" className="mt-4 max-w-md" />
        </div>
      </section>

      <BulletSection
        title="С чем помогаю"
        items={[
          { title: "Сделки с недвижимостью", text: "Проверка объекта и продавца, сопровождение купли-продажи, аренды, ипотеки." },
          { title: "Договорное право", text: "Разработка и аудит договоров, защита от рисков, претензионная работа." },
          { title: "Арбитраж", text: "Споры между компаниями и ИП, взыскание задолженности, корпоративные конфликты." },
          { title: "Наследственные споры", text: "Оформление наследства, оспаривание завещаний, споры между наследниками." },
          { title: "Земельные споры", text: "Границы участков, оформление прав, споры с администрацией и соседями." },
          { title: "Судебное представительство", text: "Полное ведение дела в судах общей юрисдикции и арбитраже." },
        ]}
      />
    </PageShell>
  );
}
