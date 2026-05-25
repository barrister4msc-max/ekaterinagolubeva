import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ContactCta } from "./contact-cta";
import { AuthorEntityBlock } from "./author-entity-block";
import { ContactChannels } from "./contact-channels";

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

interface PageShellProps {
  eyebrow: string;
  title: string;
  intro: string;
  children?: ReactNode;
  hideAuthor?: boolean;
  /** Optional breadcrumb trail — root "Главная" is prepended automatically. */
  breadcrumbs?: BreadcrumbItem[];
  /** Optional FAQ section rendered above the author block. */
  faq?: FaqItem[];
  /** Date page was last updated (ISO or human format) — shown as "Обновлено: ...". */
  dateModified?: string;
  /** Canonical base path of the page, used in BreadcrumbList schema. */
  canonicalPath?: string;
}

const SITE_BASE = "https://ekaterinagolubeva.lovable.app";

function formatDate(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" });
}

export function PageShell({
  eyebrow,
  title,
  intro,
  children,
  hideAuthor,
  breadcrumbs,
  faq,
  dateModified,
  canonicalPath,
}: PageShellProps) {
  const trail: BreadcrumbItem[] = [{ label: "Главная", to: "/" }, ...(breadcrumbs ?? [])];
  const dateLabel = formatDate(dateModified);

  // BreadcrumbList schema only when we have at least one custom crumb beyond home.
  const breadcrumbSchema =
    trail.length > 1
      ? {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: trail.map((c, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: c.label,
            ...(c.to ? { item: `${SITE_BASE}${c.to}` } : {}),
          })),
        }
      : null;

  const faqSchema =
    faq && faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faq.map((q) => ({
            "@type": "Question",
            name: q.question,
            acceptedAnswer: { "@type": "Answer", text: q.answer },
          })),
        }
      : null;

  return (
    <main>
      <section className="border-b border-border bg-secondary/30">
        <div className="container-wide grid gap-10 py-20 md:grid-cols-12 md:py-28">
          <div className="md:col-span-7">
            {trail.length > 1 && (
              <nav aria-label="breadcrumb" className="mb-6 text-xs text-muted-foreground">
                <ol className="flex flex-wrap items-center gap-1.5">
                  {trail.map((c, i) => {
                    const isLast = i === trail.length - 1;
                    return (
                      <li key={i} className="flex items-center gap-1.5">
                        {c.to && !isLast ? (
                          <Link to={c.to} className="hover:text-primary">{c.label}</Link>
                        ) : (
                          <span className={isLast ? "text-foreground/70" : ""}>{c.label}</span>
                        )}
                        {!isLast && <span aria-hidden>/</span>}
                      </li>
                    );
                  })}
                </ol>
              </nav>
            )}
            <div className="eyebrow mb-6">{eyebrow}</div>
            <h1 className="text-4xl md:text-6xl">{title}</h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              {intro}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ContactCta className="btn-primary" label="Разобрать ситуацию" showArrow={false} />
              <ContactChannels variant="ghost" showLabels />
            </div>
            {dateLabel && (
              <p className="mt-6 text-xs text-muted-foreground">
                Обновлено: <time dateTime={dateModified}>{dateLabel}</time>
              </p>
            )}
          </div>
        </div>
      </section>

      {children}

      {faq && faq.length > 0 && (
        <section className="border-t border-border bg-secondary/20">
          <div className="container-wide py-16 md:py-24">
            <h2 className="text-3xl md:text-4xl">Частые вопросы</h2>
            <div className="mt-8 max-w-3xl space-y-6">
              {faq.map((q, i) => (
                <div key={i} className="border-t border-border pt-6">
                  <h3 className="font-display text-lg">{q.question}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{q.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {!hideAuthor && (
        <AuthorEntityBlock
          articleTitle={title}
          articleDescription={intro}
          dateModified={dateModified}
        />
      )}

      {breadcrumbSchema && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        />
      )}
      {faqSchema && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}
      {canonicalPath && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebPage",
              url: `${SITE_BASE}${canonicalPath}`,
              name: title,
              description: intro,
              inLanguage: "ru-RU",
            }),
          }}
        />
      )}
    </main>
  );
}

interface BulletSectionProps {
  title: string;
  items: { title: string; text?: string }[];
}

export function BulletSection({ title, items }: BulletSectionProps) {
  return (
    <section className="container-wide py-20 md:py-28">
      <h2 className="max-w-2xl text-3xl md:text-4xl">{title}</h2>
      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {items.map((it, i) => (
          <div key={it.title} className="card-soft">
            <div className="font-display text-2xl text-primary">{String(i + 1).padStart(2, "0")}</div>
            <h3 className="mt-3 text-lg">{it.title}</h3>
            {it.text && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{it.text}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
