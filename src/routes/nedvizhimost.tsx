import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle, Send } from "lucide-react";
import interiorImg from "@/assets/real-estate-interior.jpg";
import { ContactCta } from "@/components/contact-cta";

export const Route = createFileRoute("/nedvizhimost")({
  head: () => ({
    meta: [
      { title: "Риэлторское и юридическое сопровождение недвижимости | Екатерина Голубева" },
      { name: "description", content: "Проверка объекта, сопровождение сделки, регистрация права собственности, контроль расчётов. Безопасность и снижение рисков. Москва, МО, дистанционно." },
      { property: "og:title", content: "Риэлторское и юридическое сопровождение недвижимости" },
      { property: "og:description", content: "Сделка проходит спокойно, под контролем и без скрытых рисков." },
    ],
  }),
  component: NedvizhimostPage,
});

const cards = [
  {
    title: "Проверка недвижимости",
    text: "История прав, обременения, аресты, риски оспаривания, банкротство, юридическая чистота объекта.",
  },
  {
    title: "Сопровождение сделки",
    text: "Договор, структура расчётов, переговоры, расписки, Росреестр, контроль всех этапов сделки.",
  },
  {
    title: "Продажа без личного присутствия",
    text: "Дистанционное сопровождение, доверенности, представительство интересов, работа с банками, документы, контроль регистрации.",
  },
  {
    title: "Риэлторское сопровождение",
    text: "Подбор объектов, взаимодействие с агентствами, переговоры, организация просмотров, структура сделки, контроль рисков.",
  },
  {
    title: "Коммерческая недвижимость",
    text: "Офисы, склады, торговые помещения, арендный бизнес, инвестиционная недвижимость, коммерческая аренда.",
  },
  {
    title: "Аресты и ограничения",
    text: "Снятие арестов, работа с приставами, долги, ограничения, освобождение имущества.",
  },
];

function NedvizhimostPage() {
  return (
    <main>
      {/* HERO */}
      <section className="border-b border-border bg-secondary/30">
        <div className="container-wide grid gap-12 py-16 md:grid-cols-12 md:gap-16 md:py-28">
          <div className="md:col-span-7">
            <div className="eyebrow mb-6">Premium Legal Real Estate Advisory</div>
            <h1 className="text-4xl leading-[1.05] md:text-[3.8rem]">
              Риэлторское и юридическое<br />
              сопровождение<br />
              <span className="italic text-primary">недвижимости</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Помогаю безопасно провести сделку с недвижимостью: от проверки объекта
              и переговоров до регистрации права собственности и сопровождения расчётов.
            </p>

            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              <ContactCta className="btn-primary justify-center" label="Разобрать ситуацию" />
              <a href="https://wa.me/79000000000" className="btn-ghost justify-center">
                Написать в WhatsApp <MessageCircle size={16} />
              </a>
              <a href="https://t.me/" className="btn-ghost justify-center">
                Написать в Telegram <Send size={16} />
              </a>
              <a href="#" className="btn-ghost justify-center">
                Написать в MAX <Send size={16} />
              </a>
            </div>
          </div>

          <div className="md:col-span-5">
            <img
              src={interiorImg}
              alt="Premium interior"
              width={1200}
              height={800}
              className="aspect-[3/2] w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* ACCENT SUBTITLE */}
      <section className="container-wide py-16 md:py-20">
        <div className="max-w-3xl">
          <h2 className="text-2xl leading-snug md:text-4xl">
            Главный акцент —{" "}
            <span className="italic text-primary">безопасность сделки</span>, снижение рисков,
            контроль ситуации, сопровождение и защита интересов клиента.
          </h2>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
            Это не агентство недвижимости. Это premium legal real estate advisory — спокойное,
            точное сопровождение вашей сделки от начала до результата.
          </p>
        </div>
      </section>

      {/* CARD GRID */}
      <section className="border-y border-border bg-card">
        <div className="container-wide py-20 md:py-28">
          <div className="eyebrow mb-10">Что входит в сопровождение</div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {cards.map((c, i) => (
              <div key={c.title} className="card-soft">
                <div className="font-display text-2xl text-primary">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="mt-4 text-xl">{c.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* KEY FEELING */}
      <section className="container-wide py-20 md:py-28">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <div className="eyebrow mb-5">Ощущение от работы</div>
            <h2 className="text-3xl md:text-5xl">
              Сделка проходит спокойно,<br />
              <span className="italic text-primary">под контролем</span><br />
              и без скрытых рисков
            </h2>
          </div>
          <div className="md:col-span-7 md:pt-4">
            <ul className="space-y-5">
              {[
                "Проверяю объект до задатка — знаю, во что вступаете.",
                "Контролирую каждый этап: переговоры, документы, регистрация, расчёты.",
                "Работаю с агентствами, банками, Росреестром — вы не тратите время на коммуникации.",
                "Представляю интересы дистанционно, если вы не в России.",
                "Закрываю аресты, ограничения и долги до сделки или в её процессе.",
              ].map((t) => (
                <li key={t} className="flex items-start gap-4 text-base leading-relaxed text-foreground/90">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* STICKY CTA BAR */}
      <section className="sticky bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-md">
        <div className="container-wide flex flex-wrap items-center justify-between gap-4 py-4">
          <p className="text-sm text-muted-foreground">
            Бесплатный первичный разбор ситуации
          </p>
          <div className="flex flex-wrap gap-3">
            <ContactCta className="btn-primary" label="Разобрать ситуацию" />
            <a href="https://wa.me/79000000000" className="btn-ghost">
              WhatsApp <MessageCircle size={14} />
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
