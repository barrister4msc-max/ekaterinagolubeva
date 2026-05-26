import { useSiteSettings, telHref } from "@/hooks/use-site-settings";

/**
 * Legal/YMYL trust block for the footer. Reads business identity, contacts
 * and address from site_settings (editable by admin in /workspace/settings).
 * Fields that the admin hasn't filled in yet are hidden — no placeholders.
 */
export function FooterLegalInfo() {
  const { settings, loaded } = useSiteSettings();
  if (!loaded) return null;

  const {
    legal_form,
    legal_full_name,
    legal_inn,
    legal_ogrnip,
    legal_address,
    contact_email,
    contact_phone,
    site_domain,
  } = settings;

  const tel = telHref(contact_phone);

  const hasRequisites = legal_form || legal_full_name || legal_inn || legal_ogrnip;
  const hasContacts = contact_email || contact_phone || legal_address;

  // Schema.org payload only for fields that are filled.
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LegalService",
    name: legal_full_name
      ? `${legal_full_name} — Premium Legal Real Estate Advisor`
      : "Екатерина Голубева — Premium Legal Real Estate Advisor",
    description:
      "Юридическое сопровождение недвижимости, аренды, договоров и судебных споров в Москве, МО и по России.",
    url: site_domain || "https://legalpracticelife.ru",
    areaServed: ["Москва", "Московская область", "Российская Федерация"],
    founder: {
      "@type": "Person",
      name: legal_full_name || "Екатерина Голубева",
      jobTitle: "Юрист по недвижимости и судебным спорам",
    },
  };
  if (contact_email) schema.email = contact_email;
  if (contact_phone) schema.telephone = contact_phone;
  if (legal_address) {
    schema.address = {
      "@type": "PostalAddress",
      addressLocality: "Москва",
      streetAddress: legal_address,
      addressCountry: "RU",
    };
  }

  return (
    <section
      aria-label="Юридическая информация"
      className="mt-12 border-t border-border pt-8 text-xs leading-relaxed text-muted-foreground"
    >
      <div className="grid gap-6 md:grid-cols-3">
        {hasRequisites && (
          <div>
            <div className="eyebrow mb-3 text-[10px] text-foreground/70">Реквизиты</div>
            <ul className="space-y-1">
              {(legal_form || legal_full_name) && (
                <li>
                  {[legal_form, legal_full_name].filter(Boolean).join(" · ")}
                </li>
              )}
              {legal_inn && <li>ИНН: {legal_inn}</li>}
              {legal_ogrnip && <li>ОГРНИП: {legal_ogrnip}</li>}
            </ul>
          </div>
        )}

        {hasContacts && (
          <div>
            <div className="eyebrow mb-3 text-[10px] text-foreground/70">Контакты</div>
            <ul className="space-y-1">
              {contact_email && (
                <li>
                  Email:{" "}
                  <a href={`mailto:${contact_email}`} className="text-foreground/80 hover:text-primary">
                    {contact_email}
                  </a>
                </li>
              )}
              {tel && (
                <li>
                  Телефон:{" "}
                  <a href={tel} className="text-foreground/80 hover:text-primary">
                    {contact_phone}
                  </a>
                </li>
              )}
              {legal_address && <li>Адрес: {legal_address}</li>}
            </ul>
          </div>
        )}

        <div>
          <div className="eyebrow mb-3 text-[10px] text-foreground/70">Документы</div>
          <ul className="space-y-1">
            <li>
              <a href="/privacy" className="text-foreground/80 hover:text-primary">
                Политика конфиденциальности
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
