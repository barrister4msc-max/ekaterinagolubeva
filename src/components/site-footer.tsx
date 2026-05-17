import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="mt-32 border-t border-border bg-background">
      <div className="container-wide py-16 md:py-20">
        <div className="grid gap-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="font-display text-2xl">Legal Advisor<span className="text-primary">.</span></div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Premium Legal Real Estate Advisor. Спокойное сопровождение
              сложных ситуаций — недвижимость, аренда, договоры, суды.
            </p>
            <p className="mt-6 text-xs uppercase tracking-[0.22em] text-primary">
              Москва · Подольск · МО · По всей России
            </p>
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
            <ul className="space-y-2 text-sm">
              <li><a href="https://wa.me/79000000000" className="text-foreground/80 hover:text-primary">WhatsApp</a></li>
              <li><a href="https://t.me/" className="text-foreground/80 hover:text-primary">Telegram</a></li>
              <li><a href="#" className="text-foreground/80 hover:text-primary">MAX</a></li>
              <li><a href="mailto:hello@example.com" className="text-foreground/80 hover:text-primary">Email</a></li>
            </ul>
          </div>
        </div>

        <div className="hairline mt-12" />
        <div className="mt-6 flex flex-col items-start justify-between gap-2 text-xs text-muted-foreground md:flex-row md:items-center">
          <span>© {new Date().getFullYear()} Legal Advisor. Все права защищены.</span>
          <span>Premium Private Advisor · Trusted Representative in Russia</span>
        </div>
      </div>
    </footer>
  );
}
