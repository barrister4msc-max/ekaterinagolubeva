import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getSeoPage,
  listSeoPageLinks,
  type SeoPageRecord,
  type SeoPageLink,
} from "@/lib/seo-pages.functions";
import { ContactCta } from "@/components/contact-cta";
import { ContactChannels } from "@/components/contact-channels";
import { getCategoryForSlug, isSameCategory } from "@/lib/seo-categories";

const SITE_URL = "https://legalpracticelife.ru";

function canonicalHref(page: Pick<SeoPageRecord, "slug" | "canonical_path">) {
  const path = page.canonical_path?.trim() || `/${page.slug}`;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}

export const Route = createFileRoute("/$slug")({
  loader: async ({ params }) => {
    const page = await getSeoPage({ data: { slug: params.slug } });
    if (!page) throw notFound();
    return { page };
  },
  head: ({ loaderData }) => {
    if (!loaderData?.page) return {};
    const p = loaderData.page;
    const url = canonicalHref(p);
    const desc = p.meta_description_ru ?? "";
    const ogTitle = p.og_title ?? p.title_ru;
    const ogDesc = p.og_description ?? desc;
    return {
      meta: [
        { title: p.title_ru },
        { name: "description", content: desc },
        { property: "og:title", content: ogTitle },
        { property: "og:description", content: ogDesc },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
        ...(p.og_image ? [{ property: "og:image", content: p.og_image }] : []),
        ...(p.nofollow ? [{ name: "robots", content: "nofollow" }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: SeoPageComponent,
  notFoundComponent: SeoNotFound,
});

function SeoNotFound() {
  return (
    <div className="container-wide py-24 text-center">
      <h1 className="text-5xl">404</h1>
      <p className="mt-3 text-muted-foreground">Страница не найдена.</p>
      <Link to="/" className="btn-primary mt-6 inline-flex">На главную</Link>
    </div>
  );
}

function renderContent(content: string) {
  const blocks = content.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block, i) => {
    if (block.startsWith("## ")) {
      return <h2 key={i} className="mt-10 text-3xl">{block.slice(3)}</h2>;
    }
    if (block.startsWith("### ")) {
      return <h3 key={i} className="mt-8 text-2xl">{block.slice(4)}</h3>;
    }
    if (/^[-*]\s+/m.test(block)) {
      const items = block.split(/\n/).map((l) => l.replace(/^[-*]\s+/, "").trim()).filter(Boolean);
      return (
        <ul key={i} className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground">
          {items.map((it, k) => <li key={k}>{it}</li>)}
        </ul>
      );
    }
    return <p key={i} className="mt-4 leading-relaxed text-muted-foreground">{block}</p>;
  });
}

function SeoPageComponent() {
  const { page } = Route.useLoaderData() as { page: SeoPageRecord };

  const fetchLinks = useServerFn(listSeoPageLinks);
  const { data: links } = useQuery({
    queryKey: ["seo-page-links"],
    queryFn: () => fetchLinks(),
    staleTime: 5 * 60 * 1000,
  });

  const related: SeoPageLink[] = (() => {
    const all = (links ?? []).filter((l) => l.slug !== page.slug);
    const same = all.filter((l) => isSameCategory(l.slug, page.slug));
    const rest = all.filter((l) => !isSameCategory(l.slug, page.slug));
    return [...same, ...rest].slice(0, 5);
  })();

  const category = getCategoryForSlug(page.slug);
  const breadcrumbTrail: { label: string; href?: string }[] = [
    { label: "Главная", href: "/" },
    ...(category
      ? [{ label: category.label, ...(category.path ? { href: category.path } : {}) }]
      : []),
    { label: page.h1_ru || page.title_ru },
  ];

  const SITE_BASE = SITE_URL;
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbTrail.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      ...(c.href ? { item: `${SITE_BASE}${c.href}` } : {}),
    })),
  };

  const schemaScripts: { type: string; children: string }[] = [
    { type: "application/ld+json", children: JSON.stringify(breadcrumbSchema) },
  ];
  if (page.schema_json && typeof page.schema_json === "object") {
    schemaScripts.push({
      type: "application/ld+json",
      children: JSON.stringify(page.schema_json),
    });
  }
  if (page.faq_json && page.faq_json.length > 0) {
    schemaScripts.push({
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: page.faq_json.map((q) => ({
          "@type": "Question",
          name: q.question,
          acceptedAnswer: { "@type": "Answer", text: q.answer },
        })),
      }),
    });
  }

  return (
    <main>
      {schemaScripts.map((s, i) => (
        <script key={i} type={s.type} dangerouslySetInnerHTML={{ __html: s.children }} />
      ))}

      <section className="border-b border-border bg-secondary/30">
        <div className="container-wide py-20 md:py-28">
          <div className="max-w-3xl">
            <nav aria-label="breadcrumb" className="mb-6 text-xs text-muted-foreground">
              <ol className="flex flex-wrap items-center gap-1.5">
                {breadcrumbTrail.map((c, i) => {
                  const isLast = i === breadcrumbTrail.length - 1;
                  return (
                    <li key={i} className="flex items-center gap-1.5">
                      {c.href && !isLast ? (
                        <a href={c.href} className="hover:text-primary">{c.label}</a>
                      ) : (
                        <span className={isLast ? "text-foreground/70" : ""}>{c.label}</span>
                      )}
                      {!isLast && <span aria-hidden>/</span>}
                    </li>
                  );
                })}
              </ol>
            </nav>
            <h1 className="text-4xl md:text-6xl">{page.h1_ru}</h1>
            {page.meta_description_ru && (
              <p className="mt-6 text-base leading-relaxed text-muted-foreground md:text-lg">
                {page.meta_description_ru}
              </p>
            )}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ContactCta className="btn-primary" label="Разобрать ситуацию" showArrow={false} />
              <ContactChannels variant="ghost" showLabels showEmail={false} />
            </div>
          </div>
        </div>
      </section>

      <section className="container-wide py-16 md:py-24">
        <article className="prose prose-neutral max-w-3xl">
          {renderContent(page.content_ru)}
        </article>
      </section>

      {page.faq_json && page.faq_json.length > 0 && (
        <section className="border-t border-border bg-secondary/20">
          <div className="container-wide py-16 md:py-24">
            <h2 className="text-3xl md:text-4xl">Частые вопросы</h2>
            <div className="mt-8 max-w-3xl space-y-6">
              {page.faq_json.map((qa, i) => (
                <div key={i} className="card-soft">
                  <h3 className="text-lg">{qa.question}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{qa.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="border-t border-border">
          <div className="container-wide py-16 md:py-24">
            <h2 className="text-2xl md:text-3xl">Смотрите также</h2>
            <ul className="mt-8 grid gap-3 md:grid-cols-2">
              {related.map((r) => {
                const href = r.canonical_path?.trim() || `/${r.slug}`;
                const normalized = href.startsWith("/") ? href : `/${href}`;
                return (
                  <li key={r.slug}>
                    <a
                      href={normalized}
                      className="block rounded-md border border-border px-4 py-3 transition hover:border-primary"
                    >
                      <span className="text-base">{r.h1_ru || r.title_ru}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}
    </main>
  );
}
