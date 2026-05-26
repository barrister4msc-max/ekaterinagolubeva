import { useSiteSettings } from "@/hooks/use-site-settings";

interface AuthorEntityBlockProps {
  articleTitle?: string;
  articleDescription?: string;
  dateModified?: string;
}

/**
 * E-E-A-T / YMYL trust block: author entity rendered at the end of a
 * legal service / SEO article page. Emits Person schema, and BlogPosting
 * schema when article meta is provided.
 */
export function AuthorEntityBlock({ articleTitle, articleDescription, dateModified }: AuthorEntityBlockProps) {
  const { settings } = useSiteSettings();
  const name = settings.legal_full_name || "Екатерина Голубева";
  const photo = settings.advisor_photo_url || settings.hero_image_url;
  const baseUrl = settings.site_domain || "https://legalpracticelife.ru";

  return (
    <section
      aria-label="Автор материала"
      className="container-wide py-12 md:py-16"
    >
      <div className="card-soft mx-auto max-w-3xl">
        <div className="eyebrow mb-3">Материал подготовлен</div>
        <div className="flex items-start gap-4">
          {photo ? (
            <img
              src={photo}
              alt={name}
              loading="lazy"
              className="h-16 w-16 shrink-0 rounded-full object-cover"
              style={{ objectPosition: `${settings.hero_object_position_x}% ${settings.hero_object_position_y}%` }}
            />
          ) : (
            <div
              aria-hidden
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-xl text-primary"
            >
              ЕГ
            </div>
          )}
          <div className="flex-1">
            <div className="font-display text-2xl text-foreground">{name}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Юрист по недвижимости и судебным спорам
            </div>
            <p className="mt-3 text-sm leading-relaxed text-foreground/80">
              Веду частную практику в Москве и Подмосковье. Сопровождаю сделки с
              недвижимостью, споры по аренде, договорную работу и судебные процессы —
              спокойно, по существу и с полной ответственностью за результат.
            </p>
            <div className="mt-4">
              <a href="/about" className="text-sm text-primary hover:underline">
                О специалисте →
              </a>
            </div>
          </div>
        </div>
      </div>

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Person",
            name,
            jobTitle: "Юрист по недвижимости и судебным спорам",
            url: `${baseUrl}/about`,
            ...(photo ? { image: photo } : {}),
            worksFor: {
              "@type": "LegalService",
              name: `${name} — Premium Legal Real Estate Advisor`,
            },
            areaServed: ["Москва", "Московская область", "Российская Федерация"],
          }),
        }}
      />

      {articleTitle && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "BlogPosting",
              headline: articleTitle,
              description: articleDescription,
              ...(dateModified ? { dateModified } : {}),
              author: {
                "@type": "Person",
                name,
                jobTitle: "Юрист по недвижимости и судебным спорам",
              },
              publisher: {
                "@type": "LegalService",
                name: `${name} — Premium Legal Real Estate Advisor`,
              },
              inLanguage: "ru-RU",
            }),
          }}
        />
      )}
    </section>
  );
}
