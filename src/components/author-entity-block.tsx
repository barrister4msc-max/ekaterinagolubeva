import { Link } from "@tanstack/react-router";

interface AuthorEntityBlockProps {
  /** Title of the article for BlogPosting schema. Optional. */
  articleTitle?: string;
  /** Short description for BlogPosting schema. Optional. */
  articleDescription?: string;
}

/**
 * E-E-A-T / YMYL trust block: author entity displayed at the end of a
 * legal service / SEO article page, just before the CTA section.
 * Emits Person schema, and BlogPosting schema when article meta is provided.
 */
export function AuthorEntityBlock({ articleTitle, articleDescription }: AuthorEntityBlockProps) {
  return (
    <section
      aria-label="Автор материала"
      className="container-wide py-12 md:py-16"
    >
      <div className="card-soft mx-auto max-w-3xl">
        <div className="eyebrow mb-3">Материал подготовлен</div>
        <div className="flex items-start gap-4">
          <div
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-xl text-primary"
          >
            ЕГ
          </div>
          <div className="flex-1">
            <div className="font-display text-2xl text-foreground">Екатерина Голубева</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Юрист по недвижимости и судебным спорам
            </div>
            <p className="mt-3 text-sm leading-relaxed text-foreground/80">
              Веду частную практику в Москве и Подмосковье. Сопровождаю сделки с
              недвижимостью, споры по аренде, договорную работу и судебные процессы —
              спокойно, по существу и с полной ответственностью за результат.
            </p>
            <div className="mt-4">
              <Link to="/" hash="advisor" className="text-sm text-primary hover:underline">
                О специалисте →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Schema.org: Person (author) */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Person",
            name: "Екатерина Голубева",
            jobTitle: "Юрист по недвижимости и судебным спорам",
            url: "https://ekaterinagolubeva.lovable.app",
            worksFor: {
              "@type": "LegalService",
              name: "Екатерина Голубева — Premium Legal Real Estate Advisor",
            },
            areaServed: ["Москва", "Московская область", "Российская Федерация"],
          }),
        }}
      />

      {/* Schema.org: BlogPosting / Article when article meta is provided */}
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
              author: {
                "@type": "Person",
                name: "Екатерина Голубева",
                jobTitle: "Юрист по недвижимости и судебным спорам",
              },
              publisher: {
                "@type": "LegalService",
                name: "Екатерина Голубева — Premium Legal Real Estate Advisor",
              },
              inLanguage: "ru-RU",
            }),
          }}
        />
      )}
    </section>
  );
}
