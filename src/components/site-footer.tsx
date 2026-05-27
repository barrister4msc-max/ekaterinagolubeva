import { Link } from "@tanstack/react-router";
import { FooterLegalInfo } from "./footer-legal-info";
import { useSiteSettings } from "@/hooks/use-site-settings";

export function SiteFooter() {
  const { settings } = useSiteSettings();
  const { contact_whatsapp_url, contact_telegram_url, contact_max_url, contact_email } = settings;
  const hasChannels =
    contact_whatsapp_url || contact_telegram_url || contact_max_url || contact_email;

  return (
    <footer className="mt-32 border-t border-border bg-background">
      <div className="container-wide py-16 md:py-20">
        <div className="grid gap-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="font-display text-2xl">Екатерина Голубева<span className="text-primary">.</span></div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Legal Real Estate Advisor. Спокойное сопровождение
              сложных ситуаций — недвижимость, аренда, договоры, суды.
            </p>
            <p className="mt-6 text-xs uppercase tracking-[0.22em] text-primary">
              Москва · Подольск · МО · По всей России
            </p>
            <div className="mt-6 text-sm">
              <Link to="/about" className="text-foreground/80 hover:text-primary">
                О специалисте
              </Link>
            </div>
          </div>

          <div>
            <div className="eyebrow mb-4">Направления</div>
            <ul className="space-y-2 text-sm">
              <li><Link to="/real-estate" className="text-foreground/80 hover:text-primary">Недвижимость</Link></li>
              <li><Link to="/rental-disputes" className="text-foreground/80 hover:text-primary">Аренда</Link></li>
              <li><Link to="/commercial-rent" className="text-foreground/80 hover:text-primary">Коммерческая аренда</Link></li>
              <li><Link to="/contracts" className="text-foreground/80 hover:text-primary">Договоры</Link></li>
              <li><Link to="/litigation" className="text-foreground/80 hover:text-primary">Судебные споры</Link></li>
              <li><Link to="/representation" className="text-foreground/80 hover:text-primary">Представительство</Link></li>
              <li><Link to="/representation-abroad" className="text-foreground/80 hover:text-primary">Клиентам за границей</Link></li>
            </ul>
          </div>

          <div>
            <div className="eyebrow mb-4">Контакты</div>
            {hasChannels ? (
              <ul className="space-y-2 text-sm">
                {contact_whatsapp_url && (
                  <li><a href={contact_whatsapp_url} target="_blank" rel="noreferrer" className="text-foreground/80 hover:text-primary">WhatsApp</a></li>
                )}
                {contact_telegram_url && (
                  <li><a href={contact_telegram_url} target="_blank" rel="noreferrer" className="text-foreground/80 hover:text-primary">Telegram</a></li>
                )}
                {contact_max_url && (
                  <li><a href={contact_max_url} target="_blank" rel="noreferrer" className="text-foreground/80 hover:text-primary">MAX</a></li>
                )}
                {contact_email && (
                  <li><a href={`mailto:${contact_email}`} className="text-foreground/80 hover:text-primary">Email</a></li>
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                <Link to="/contact" className="hover:text-primary">Связаться через форму</Link>
              </p>
            )}
          </div>
        </div>
        <FooterLegalInfo />

        <div className="hairline mt-12" />
        <div className="mt-6 flex flex-col items-start justify-between gap-2 text-xs text-muted-foreground md:flex-row md:items-center">
          <span>© {new Date().getFullYear()} Екатерина Голубева. Все права защищены.</span>
          <div className="flex items-center gap-4">
            <span>Private Advisor · Trusted Representative in Russia</span>
            <Link
              to="/workspace/login"
              className="text-[11px] uppercase tracking-[0.2em] text-foreground/35 transition hover:text-primary"
            >
              Advisor
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
