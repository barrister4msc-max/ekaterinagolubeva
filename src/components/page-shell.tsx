import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ContactCta } from "./contact-cta";
import { AuthorEntityBlock } from "./author-entity-block";

interface PageShellProps {
  eyebrow: string;
  title: string;
  intro: string;
  children?: ReactNode;
  /** Hide the author/E-E-A-T trust block (default: shown). */
  hideAuthor?: boolean;
}

export function PageShell({ eyebrow, title, intro, children, hideAuthor }: PageShellProps) {
  return (
    <main>
      <section className="border-b border-border bg-secondary/30">
        <div className="container-wide grid gap-10 py-20 md:grid-cols-12 md:py-28">
          <div className="md:col-span-7">
            <div className="eyebrow mb-6">{eyebrow}</div>
            <h1 className="text-4xl md:text-6xl">{title}</h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              {intro}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ContactCta className="btn-primary" label="Разобрать ситуацию" showArrow={false} />
              <a href="https://wa.me/79000000000" className="btn-ghost">Написать в WhatsApp</a>
            </div>
          </div>
        </div>
      </section>
      {children}
      {!hideAuthor && (
        <AuthorEntityBlock articleTitle={title} articleDescription={intro} />
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
