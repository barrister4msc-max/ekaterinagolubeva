import { Link } from "@tanstack/react-router";

/**
 * Legal/YMYL trust block for the footer.
 * Displays formal business identity (ИП/ИНН), contacts, address and
 * required legal document links. Placeholders are clearly marked so the
 * site owner can replace them with real data without touching layout.
 */
export function FooterLegalInfo() {
  return (
    <section
      aria-label="Юридическая информация"
      className="mt-12 border-t border-border pt-8 text-xs leading-relaxed text-muted-foreground"
    >
      <div className="grid gap-6 md:grid-cols-3">
        <div>
          <div className="eyebrow mb-3 text-[10px] text-foreground/70">Реквизиты</div>
          <ul className="space-y-1">
            <li>ИП Голубева Екатерина <span className="text-foreground/50">[указать форму]</span></li>
            <li>ИНН: <span className="text-foreground/50">[указать ИНН]</span></li>
            <li>ОГРНИП: <span className="text-foreground/50">[указать]</span></li>
          </ul>
        </div>

        <div>
          <div className="eyebrow mb-3 text-[10px] text-foreground/70">Контакты</div>
          <ul className="space-y-1">
            <li>
              Email:{" "}
              <a href="mailto:hello@example.com" className="text-foreground/80 hover:text-primary">
                hello@example.com
              </a>
            </li>
            <li>
              Телефон:{" "}
              <a href="tel:+79000000000" className="text-foreground/80 hover:text-primary">
                +7 (900) 000-00-00
              </a>
            </li>
            <li>Адрес: г. Москва, <span className="text-foreground/50">[указать адрес]</span></li>
          </ul>
        </div>

        <div>
          <div className="eyebrow mb-3 text-[10px] text-foreground/70">Документы</div>
          <ul className="space-y-1">
            <li>
              <Link to="/privacy" className="text-foreground/80 hover:text-primary">
                Политика конфиденциальности
              </Link>
            </li>
            <li>
              <Link to="/terms" className="text-foreground/80 hover:text-primary">
                Оферта / Пользовательское соглашение
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Schema.org: LegalService — sitewide org identity */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LegalService",
            name: "Екатерина Голубева — Premium Legal Real Estate Advisor",
            description:
              "Юридическое сопровождение недвижимости, аренды, договоров и судебных споров в Москве, МО и по России.",
            url: "https://ekaterinagolubeva.lovable.app",
            telephone: "+7-900-000-00-00",
            email: "hello@example.com",
            areaServed: ["Москва", "Московская область", "Российская Федерация"],
            address: {
              "@type": "PostalAddress",
              addressLocality: "Москва",
              addressCountry: "RU",
            },
            founder: {
              "@type": "Person",
              name: "Екатерина Голубева",
              jobTitle: "Юрист по недвижимости и судебным спорам",
            },
          }),
        }}
      />
    </section>
  );
}
