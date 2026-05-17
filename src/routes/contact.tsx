import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, MessageCircle, Send, Mail } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Контакты — получить консультацию | Екатерина Голубева" },
      { name: "description", content: "Свяжитесь для бесплатного первичного разбора ситуации. WhatsApp, Telegram, MAX, email." },
      { property: "og:title", content: "Контакты — Legal Advisor" },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <main className="container-wide py-20 md:py-28">
      <div className="grid gap-16 md:grid-cols-12">
        <div className="md:col-span-6">
          <div className="eyebrow mb-5">Контакты</div>
          <h1 className="text-4xl md:text-6xl">
            Расскажите ситуацию —<br/>
            <span className="italic text-primary">я подскажу следующий шаг</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
            Кратко опишите, что произошло. Свяжусь с вами в течение рабочего дня
            для бесплатного первичного разбора. Информация конфиденциальна.
          </p>

          <div className="mt-10 space-y-0">
            {[
              { href: "https://wa.me/79000000000", icon: MessageCircle, label: "WhatsApp" },
              { href: "https://t.me/", icon: Send, label: "Telegram" },
              { href: "#", icon: Send, label: "MAX" },
              { href: "mailto:hello@example.com", icon: Mail, label: "hello@example.com" },
            ].map((x) => (
              <a key={x.label} href={x.href} className="flex items-center justify-between border-t border-border py-5 text-sm hover:text-primary">
                <span className="inline-flex items-center gap-3"><x.icon size={16}/> {x.label}</span>
                <ArrowUpRight size={14}/>
              </a>
            ))}
          </div>
        </div>

        <form
          className="md:col-span-6 card-soft space-y-5"
          onSubmit={(e) => { e.preventDefault(); alert("Спасибо! Я свяжусь с вами."); }}
        >
          <label className="block">
            <span className="eyebrow">Имя</span>
            <input required type="text" placeholder="Как к вам обращаться"
              className="mt-2 w-full border-b border-border bg-transparent py-3 text-base outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="eyebrow">Телефон</span>
            <input required type="tel" placeholder="+7"
              className="mt-2 w-full border-b border-border bg-transparent py-3 text-base outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="eyebrow">Ситуация</span>
            <textarea required rows={5} placeholder="Кратко опишите вопрос"
              className="mt-2 w-full resize-none border-b border-border bg-transparent py-3 text-base outline-none focus:border-primary" />
          </label>
          <button type="submit" className="btn-primary w-full justify-center">
            Получить консультацию <ArrowUpRight size={16}/>
          </button>
          <p className="text-xs text-muted-foreground">
            Нажимая кнопку, вы соглашаетесь с обработкой персональных данных.
          </p>
          <p className="text-xs text-muted-foreground">
            <Link to="/" className="link-underline">Вернуться на главную</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
