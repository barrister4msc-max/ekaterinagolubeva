import { useSiteSettings, telHref } from "@/hooks/use-site-settings";
import { CONTACT_FALLBACK, pick } from "@/lib/contacts";

/**
 * Legal/YMYL trust block for the footer. Falls back to the canonical practice
 * identity (см. CONTACT_FALLBACK) if site_settings fields are empty, so the
 * footer never renders blank.
 */
export function FooterLegalInfo() {
  const { settings, loaded } = useSiteSettings();
  if (!loaded) return null;

  const legal_form = pick(settings.legal_form, CONTACT_FALLBACK.legal_form);
  const legal_full_name = pick(
    settings.legal_full_name,
    CONTACT_FALLBACK.legal_full_name_long,
  );
  const legal_address = pick(settings.legal_address, CONTACT_FALLBACK.legal_address);
  const contact_email = pick(settings.contact_email, CONTACT_FALLBACK.contact_email);
  const contact_phone = pick(settings.contact_phone, CONTACT_FALLBACK.contact_phone);
  const { legal_inn, legal_ogrnip, site_domain } = settings;

  const tel = telHref(contact_phone) ?? CONTACT_FALLBACK.contact_phone_tel;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LegalService",
    name: `${legal_full_name} — Legal Real Estate Advisor`,
    description:
      "Юридическое сопровождение недвижимости, аренды, договоров и судебных споров в Москве, МО и по России.",
    url: site_domain || "https://legalpracticelife.ru",
    areaServed: ["Москва", "Московская область", "Российская Федерация"],
    email: contact_email,
    telephone: contact_phone,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Москва",
      addressCountry: "RU",
      streetAddress: legal_address,
    },
    founder: {
      "@type": "Person",
      name: legal_full_name,
      jobTitle: "Юрист по недвижимости и судебным спорам",
      telephone: contact_phone,
      email: contact_email,
    },
  };

  return (
    <section
      aria-label="Юридическая информация"
      className="mt-12 border-t border-border pt-8 text-xs leading-relaxed text-muted-foreground"
    >
      <div className="grid gap-6 md:grid-cols-3">
        <div>
          <div className="eyebrow mb-3 text-[10px] text-foreground/70">Реквизиты</div>
          <ul className="space-y-1">
            <li>{legal_form} · {legal_full_name}</li>
            {legal_inn && <li>ИНН: {legal_inn}</li>}
            {legal_ogrnip && <li>ОГРНИП: {legal_ogrnip}</li>}
          </ul>
        </div>

        <div>
          <div className="eyebrow mb-3 text-[10px] text-foreground/70">Контакты</div>
          <ul className="space-y-1">
            <li>
              Телефон:{" "}
              <a href={tel} className="text-foreground/80 hover:text-primary">
                {contact_phone}
              </a>
            </li>
            <li>
              Email:{" "}
              <a href={`mailto:${contact_email}`} className="text-foreground/80 hover:text-primary">
                {contact_email}
              </a>
            </li>
            <li>Адрес: {legal_address}</li>
          </ul>
        </div>

        <div>
          <div className="eyebrow mb-3 text-[10px] text-foreground/70">Документы</div>
          <ul className="space-y-1">
            <li>
              <a href="/privacy" className="text-foreground/80 hover:text-primary">
                Политика конфиденциальности
              </a>
            </li>
            <li>
              <a href="/consent" className="text-foreground/80 hover:text-primary">
                Согласие на обработку персональных данных
              </a>
            </li>
            <li>
              <a href="/ai-disclaimer" className="text-foreground/80 hover:text-primary">
                AI-дисклеймер
              </a>
            </li>
            <li>
              <a href="/terms" className="text-foreground/80 hover:text-primary">
                Оферта / Пользовательское соглашение
              </a>
            </li>
          </ul>
        </div>
      </div>

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
    </section>
  );
}
