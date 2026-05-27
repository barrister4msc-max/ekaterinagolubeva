/**
 * Minimal YMYL / E-E-A-T trust block.
 * Used on SEO pages, the expert profile and the contact page to reinforce
 * authorship and real-world identity signals. Intentionally not a CTA —
 * just a quiet, consistent legal identity strip.
 */
export function TrustBlock({ className = "" }: { className?: string }) {
  return (
    <aside
      aria-label="Юридическая информация"
      className={`mt-16 border-t border-border pt-8 text-xs leading-relaxed text-muted-foreground ${className}`}
    >
      <div className="mx-auto max-w-3xl space-y-1">
        <div className="text-foreground/80">
          Екатерина Голубева — частная юридическая практика.
        </div>
        <div>Москва, Россия · Самозанятая</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <a href="tel:+79950995898" className="hover:text-primary">
            +7 (995) 099-58-98
          </a>
          <a href="mailto:legallife2026@yandex.ru" className="hover:text-primary">
            legallife2026@yandex.ru
          </a>
        </div>
      </div>
    </aside>
  );
}
