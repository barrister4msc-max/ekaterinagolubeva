import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin, ShieldCheck, Scale, Building2, FileCheck2, Handshake, Globe2 } from "lucide-react";
import { useSiteSettings, heroSrc } from "@/hooks/use-site-settings";
import { ContactCta } from "@/components/contact-cta";
import { ContactChannels } from "@/components/contact-channels";

const SITE_BASE = "https://ekaterinagolubeva.lovable.app";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "О специалисте — Екатерина Голубева, юрист по недвижимости" },
      {
        name: "description",
        content:
          "Екатерина Голубева — юрист по недвижимости, аренде, договорам и судебным спорам. Москва, Подмосковье, дистанционно по России. Опыт, подход, направления работы.",
      },
      { property: "og:title", content: "О специалисте — Екатерина Голубева" },
      {
        property: "og:description",
        content:
          "Юрист по недвижимости, договорам и судебным спорам. Премиальное сопровождение в Москве, МО и по всей России.",
      },
      { property: "og:type", content: "profile" },
      { property: "og:url", content: `${SITE_BASE}/about` },
    ],
    links: [{ rel: "canonical", href: `${SITE_BASE}/about` }],
  }),
  component: AboutPage,
});

const directions = [
  { icon: Building2, title: "Недвижимость", text: "Проверка квартиры, сопровождение сделки, регистрация прав, споры о собственности." },
  { icon: ShieldCheck, title: "Аренда", text: "Споры, выселение, возврат залога, задолженность, расторжение договора." },
  { icon: FileCheck2, title: "Договоры", text: "Проверка и составление договоров, протоколы разногласий, риск-аудит." },
  { icon: Scale, title: "Судебные споры", text: "Иски, жалобы, представительство в судах общей юрисдикции и арбитраже." },
  { icon: Handshake, title: "Представительство", text: "Дистанционное участие в делах по Москве, МО и всей России." },
  { icon: Globe2, title: "Клиентам за границей", text: "Сделки, наследство и судебные процессы — без необходимости приезда." },
];

const approach = [
  { title: "Слушаю, прежде чем советовать", text: "Сначала факты и документы, потом стратегия. Без давления и шаблонных решений." },
  { title: "Объясняю простыми словами", text: "Юридические риски и шаги — на понятном языке, без давления терминологией." },
  { title: "Действую системно", text: "Каждый шаг продуман: документы, переписка, сроки и финансовая логика сделки." },
  { title: "Берегу ваше время", text: "Коммуникации, документооборот и ведение спора — на мне." },
];

function AboutPage() {
  const { settings } = useSiteSettings();
  const photo = settings.advisor_photo_url || settings.hero_image_url;
  const name = settings.legal_full_name || "Екатерина Голубева";

  return (
    <main>
      <section className="border-b border-border bg-secondary/30">
        <div className="container-wide grid gap-12 py-20 md:grid-cols-12 md:py-28">
          <div className="md:col-span-7">
            <nav aria-label="breadcrumb" className="mb-6 text-xs text-muted-foreground">
              <ol className="flex flex-wrap items-center gap-1.5">
                <li><Link to="/" className="hover:text-primary">Главная</Link></li>
                <li aria-hidden>/</li>
                <li className="text-foreground/70">О специалисте</li>
              </ol>
            </nav>
            <div className="eyebrow mb-6">О специалисте</div>
            <h1 className="text-4xl md:text-6xl">{name}</h1>
            <p className="mt-5 text-base uppercase tracking-[0.18em] text-primary">
              Юрист по недвижимости и судебным спорам
            </p>
            <p className="mt-8 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Веду частную практику в Москве и Подмосковье. Сопровождаю сделки с
              недвижимостью, споры по аренде, договорную работу и судебные процессы —
              спокойно, по существу и с полной ответственностью за результат.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ContactCta className="btn-primary" label="Разобрать ситуацию" showArrow={false} />
              <ContactChannels variant="ghost" showLabels />
            </div>
            <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin size={14} /> Москва · Московская область · Дистанционно по России
            </div>
          </div>

          <div className="md:col-span-5">
            <div className="relative mx-auto w-full max-w-[420px] overflow-hidden rounded-[24px]">
              {photo ? (
                <img
                  src={heroSrc(photo, 900)}
                  alt={name}
                  className="aspect-[4/5] w-full rounded-[24px] object-cover"
                  style={{
                    objectPosition: `${settings.hero_object_position_x}% ${settings.hero_object_position_y}%`,
                  }}
                />
              ) : (
                <div className="grid aspect-[4/5] w-full place-items-center rounded-[24px] bg-secondary/60 font-display text-5xl text-primary/70">
                  ЕГ
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* EXPERIENCE / SPECIALIZATION */}
      <section className="container-wide py-20 md:py-28">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <div className="eyebrow mb-4">Специализация</div>
            <h2 className="text-3xl md:text-4xl">
              Недвижимость,<br />
              <span className="italic text-primary">договоры и судебные споры</span>
            </h2>
          </div>
          <div className="md:col-span-7 space-y-5 text-base leading-relaxed text-foreground/80">
            <p>
              Многолетняя практика по гражданским, жилищным и арбитражным делам.
              Сопровождаю как простые сделки купли-продажи, так и сложные споры
              с участием банков, застройщиков, наследников и государственных органов.
            </p>
            <p>
              Работаю и с физическими, и с юридическими лицами. Помогаю клиентам,
              находящимся за границей, дистанционно вести сделки, наследственные дела
              и судебные процессы в России.
            </p>
            <p>
              Подход — спокойный, аналитический и предельно практичный.
              Главная цель — защитить ваши интересы и сохранить ваше время.
            </p>
          </div>
        </div>
      </section>

      {/* DIRECTIONS */}
      <section className="border-y border-border bg-secondary/20">
        <div className="container-wide py-20 md:py-28">
          <div className="eyebrow mb-4">Направления работы</div>
          <h2 className="text-3xl md:text-4xl">Чем я занимаюсь</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {directions.map((d) => (
              <div key={d.title} className="card-soft">
                <d.icon size={20} className="text-primary" />
                <h3 className="mt-4 text-lg">{d.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* APPROACH */}
      <section className="container-wide py-20 md:py-28">
        <div className="eyebrow mb-4">Подход</div>
        <h2 className="text-3xl md:text-4xl">Как я работаю</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {approach.map((a, i) => (
            <div key={a.title} className="card-soft">
              <div className="font-display text-2xl text-primary">{String(i + 1).padStart(2, "0")}</div>
              <h3 className="mt-3 text-lg">{a.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* GEOGRAPHY + CONTACTS */}
      <section className="border-t border-border bg-secondary/20">
        <div className="container-wide grid gap-12 py-20 md:grid-cols-2 md:py-28">
          <div>
            <div className="eyebrow mb-4">География</div>
            <h2 className="text-3xl md:text-4xl">Москва, МО и дистанционно по&nbsp;России</h2>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
              Личные встречи — в Москве и Подмосковье. Документы, переговоры и
              судебное сопровождение — для клиентов из любого региона России и из-за рубежа.
            </p>
          </div>
          <div>
            <div className="eyebrow mb-4">Контакты</div>
            <h2 className="text-3xl md:text-4xl">Как связаться</h2>
            <div className="mt-6">
              <ContactChannels variant="minimal" className="space-y-0" />
            </div>
            <div className="mt-8">
              <ContactCta className="btn-primary" label="Оставить обращение" showArrow={false} />
            </div>
          </div>
        </div>
      </section>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Person",
            name,
            jobTitle: "Юрист по недвижимости и судебным спорам",
            url: `${SITE_BASE}/about`,
            ...(photo ? { image: photo } : {}),
            knowsAbout: [
              "Недвижимость",
              "Аренда",
              "Договорное право",
              "Судебные споры",
              "Арбитраж",
              "Наследственное право",
            ],
            areaServed: ["Москва", "Московская область", "Российская Федерация"],
            worksFor: {
              "@type": "LegalService",
              name: `${name} — Premium Legal Real Estate Advisor`,
              areaServed: ["Москва", "Московская область", "Российская Федерация"],
              url: SITE_BASE,
            },
          }),
        }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Главная", item: `${SITE_BASE}/` },
              { "@type": "ListItem", position: 2, name: "О специалисте", item: `${SITE_BASE}/about` },
            ],
          }),
        }}
      />
    </main>
  );
}
