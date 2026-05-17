import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldCheck, FileCheck2, Scale, Building2, Handshake, Globe2,
  KeyRound, ArrowUpRight, MapPin, Send, MessageCircle, Mail,
  Sparkles, Clock, Eye, ShieldHalf, FileText, UserCheck, Lock, User, BookOpen,
} from "lucide-react";
import heroImg from "@/assets/hero-advisor.jpg";
import aboutImg from "@/assets/about-portrait.jpg";
import moscowImg from "@/assets/moscow-architecture.jpg";
import { useSiteSettings, heroSrc, heroSrcSet } from "@/hooks/use-site-settings";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Екатерина Голубева — Premium Legal Real Estate Advisor в Москве" },
      { name: "description", content: "Спокойное сопровождение сделок с недвижимостью, аренды, договоров и судебных споров. Москва, МО и дистанционно по России." },
      { property: "og:title", content: "Екатерина Голубева — Premium Legal Real Estate Advisor" },
      { property: "og:description", content: "Спокойное сопровождение сделок с недвижимостью, аренды, договоров и судебных споров. Trusted Representative in Russia." },
      { property: "og:url", content: "https://example.com/" },
    ],
    links: [{ rel: "canonical", href: "https://example.com/" }],
  }),
  component: HomePage,
});

const trust = [
  { icon: Eye, title: "Прозрачность и удобство", text: "Понятный процесс, ясные сроки и стоимость на каждом этапе." },
  { icon: UserCheck, title: "Индивидуальный подход", text: "Стратегия выстраивается под вашу ситуацию, а не по шаблону." },
  { icon: ShieldHalf, title: "Минимизация рисков", text: "Заранее закрываем уязвимости в сделке, договоре и переписке." },
  { icon: FileText, title: "Точность документов", text: "Каждая формулировка работает на вашу защиту, а не против вас." },
  { icon: Sparkles, title: "Открытость процесса", text: "Вы всегда видите, что происходит, и почему принято такое решение." },
  { icon: Clock, title: "Экономия времени", text: "Беру коммуникации, документооборот и ведение спора на себя." },
];

const services = [
  { to: "/real-estate", icon: Building2, title: "Недвижимость", text: "Проверка квартиры, сопровождение сделки, аресты и ограничения, раздел имущества." },
  { to: "/rental-disputes", icon: KeyRound, title: "Аренда", text: "Споры с арендаторами, возврат залога, выселение, задолженность, порча имущества." },
  { to: "/commercial-rent", icon: Building2, title: "Коммерческая аренда", text: "Сопровождение договоров, спорные условия, расторжение, расчёты, депозит." },
  { to: "/contracts", icon: FileCheck2, title: "Договоры", text: "Проверка и составление договоров, протоколы разногласий, подряд, поставка, услуги." },
  { to: "/litigation", icon: Scale, title: "Судебные споры", text: "Арбитраж, взыскание задолженности, иски, жалобы, ходатайства, представительство." },
  { to: "/representation", icon: Handshake, title: "Представительство", text: "Дистанционное участие в делах по Москве, МО и всей России." },
  { to: "/representation-abroad", icon: Globe2, title: "Клиентам за границей", text: "Сделки, суды, наследство и аренда — без необходимости личного присутствия в России." },
];

const abroad = [
  { title: "Недвижимость и сделки", text: "Продажа квартиры без приезда, проверка покупателя, сопровождение всей сделки дистанционно." },
  { title: "Дистанционные документы", text: "Подготовка, согласование и подписание документов через защищённые каналы и ЭДО." },
  { title: "Судебное представительство", text: "Иски, жалобы, заседания, исполнительное производство — без вашего присутствия." },
  { title: "Доверенности", text: "Подготовка доверенностей с учётом консульской легализации и апостиля." },
  { title: "Наследство", text: "Принятие наследства, оформление прав, споры между наследниками в России." },
  { title: "Аренда и управление недвижимостью", text: "Контроль арендаторов, договоры, депозит, разрешение споров на месте." },
];

const steps = [
  { n: "01", title: "Разбор ситуации", text: "Слушаю, задаю точные вопросы, фиксирую факты и документы." },
  { n: "02", title: "Оценка рисков", text: "Показываю реальные сценарии, цену каждого шага и зону уязвимости." },
  { n: "03", title: "Стратегия действий", text: "Согласуем план: переговоры, документы, претензии, суд." },
  { n: "04", title: "Сопровождение", text: "Веду коммуникации и процесс до результата, держу вас в курсе." },
];

const reviews = [
  { text: "Помогла спокойно выйти из сложной сделки и сохранить депозит. Без эмоций — только результат и понятные шаги.", author: "Анна К.", role: "Покупка квартиры, Москва" },
  { text: "Дистанционно сопроводила продажу квартиры, пока я была за границей. Все документы — вовремя, всё прозрачно.", author: "Мария Л.", role: "Клиент из Лондона" },
  { text: "Споры по аренде коммерческого помещения решили без суда. Чёткие письма, аккуратные переговоры, защищённые интересы.", author: "Дмитрий П.", role: "Собственник, МО" },
];

const geo = ["Москва", "Подольск", "Химки", "Мытищи", "Красногорск", "Одинцово"];

function HomePage() {
  const { settings } = useSiteSettings();
  const url = settings.hero_image_url;
  const posX = settings.hero_object_position_x;
  const posY = settings.hero_object_position_y;
  const scale = settings.hero_scale;
  return (
    <main>
      {/* HERO */}
      <section className="hero-gradient relative -mt-20 border-b border-border md:-mt-24">
        <div className="container-wide relative grid items-center gap-14 pb-10 pt-28 md:grid-cols-12 md:gap-20 md:pb-12 md:pt-32 lg:gap-24 lg:pt-36">
          <div className="relative z-10 order-2 md:order-1 md:col-span-7">
            <div className="eyebrow mb-8 mt-10 md:mt-16">Real Estate · Contracts · Disputes</div>
            <h1 className="max-w-[640px] text-[2.2rem] leading-[1.12] md:text-[3.7rem] md:leading-[1.08]">
              Защита недвижимости,<br/>
              договоров<br/>
              <span className="italic" style={{ color: "#A8895F", fontWeight: 300 }}>
                и судебных интересов
              </span>
            </h1>
            <p className="mt-10 max-w-[600px] text-base leading-[1.75] text-foreground/75 md:text-[1.05rem]">
              Спокойное сопровождение сделок с недвижимостью, аренды,
              договоров и судебных споров в Москве, МО и дистанционно по России.
            </p>
            <div className="mt-12 flex flex-wrap items-center gap-3">
              <Link to="/contact" className="btn-primary">
                Разобрать ситуацию <ArrowUpRight size={16} />
              </Link>
              <a href="https://t.me/" target="_blank" rel="noreferrer" className="btn-ghost btn-ghost--equal">
                <Send size={14}/> Telegram
              </a>
              <a href="#" className="btn-ghost btn-ghost--equal">
                <MessageCircle size={14}/> MAX
              </a>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-4 text-xs text-foreground/55">
              <a href="https://wa.me/79000000000" className="inline-flex items-center gap-2 transition hover:text-primary">
                <MessageCircle size={14}/> WhatsApp
              </a>
              <span className="h-3 w-px bg-foreground/15" />
              <span className="inline-flex items-center gap-2"><MapPin size={14}/> Москва · МО · Россия</span>
            </div>
          </div>

          <div className="relative order-1 md:order-2 md:col-span-5">
            <div
              className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-[24px] md:mx-0 md:ml-auto md:max-w-[420px]"
            >
              <img
                src={url ? heroSrc(url, 900) : heroImg}
                srcSet={url ? heroSrcSet(url) : undefined}
                sizes="(min-width: 768px) 36vw, 85vw"
                alt="Екатерина Голубева — Premium Legal Real Estate Advisor"
                width={900}
                height={1125}
                fetchPriority="high"
                className="aspect-[4/5] w-full rounded-[24px] object-cover"
                style={{
                  objectPosition: `${posX}% ${posY}%`,
                  transform: scale !== 1 ? `scale(${scale})` : undefined,
                  transformOrigin: `${posX}% ${posY}%`,
                }}
              />
              {/* Soft beige fog blending the LEFT edge of the photo into the page */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-1/2"
                style={{
                  background:
                    "linear-gradient(90deg, #F5EEE6 0%, rgba(245,238,230,0.85) 25%, rgba(245,238,230,0.45) 55%, rgba(245,238,230,0) 100%)",
                }}
              />
            </div>
          </div>
        </div>

        {/* VALUE STRIP */}
        <div className="border-t border-border bg-[#E8E2D6]/70">
          <div className="container-wide grid grid-cols-2 gap-y-6 py-7 text-[13px] md:grid-cols-5 md:gap-x-8 md:py-6">
            {[
              { icon: ShieldCheck, t: "Снижение рисков", s: "и защита интересов" },
              { icon: BookOpen, t: "Опыт и глубокая", s: "экспертиза" },
              { icon: User, t: "Индивидуальный", s: "подход" },
              { icon: Clock, t: "Экономия", s: "времени" },
              { icon: Lock, t: "Конфиденциальность", s: "и безопасность" },
            ].map(({ icon: Icon, t, s }) => (
              <div key={t} className="flex items-center gap-3">
                <Icon size={22} className="shrink-0 text-foreground/70" strokeWidth={1.4} />
                <div className="leading-tight">
                  <div className="text-foreground">{t}</div>
                  <div className="text-foreground/70">{s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SERVICES ROW (flat) */}
        <div className="border-t border-border bg-background">
          <div className="container-wide grid grid-cols-2 gap-x-8 gap-y-12 py-16 md:grid-cols-3 md:py-20 lg:grid-cols-6">
            {services.slice(0, 6).map(({ to, icon: Icon, title, text }) => (
              <Link key={to} to={to} className="group flex flex-col">
                <Icon size={28} strokeWidth={1.3} className="text-primary" />
                <h3 className="mt-6 font-display text-xl text-foreground">{title}</h3>
                <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{text}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.22em] text-primary transition group-hover:gap-2">
                  Подробнее <ArrowUpRight size={12} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section className="container-wide py-24 md:py-32">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-4">
            <div className="eyebrow mb-5">Доверие</div>
            <h2 className="text-3xl md:text-5xl">Почему обращаются ко мне</h2>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Здесь не давят и не пугают. Здесь спокойно, точно и по делу
              разбирают вашу ситуацию и снижают риски.
            </p>
          </div>
          <div className="md:col-span-8">
            <div className="grid gap-px overflow-hidden bg-border md:grid-cols-3">
              {trust.map(({ icon: Icon, title, text }) => (
                <div key={title} className="bg-background p-7 transition hover:bg-card">
                  <Icon size={22} className="text-primary" />
                  <h3 className="mt-5 text-lg">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section className="border-y border-border bg-secondary/30">
        <div className="container-wide py-24 md:py-32">
          <div className="flex items-end justify-between gap-8">
            <div>
              <div className="eyebrow mb-5">Направления</div>
              <h2 className="max-w-xl text-3xl md:text-5xl">
                Тихая, точная работа<br/>с вашими интересами
              </h2>
            </div>
            <Link to="/contact" className="hidden md:inline-flex link-underline">
              Получить консультацию <ArrowUpRight size={14} />
            </Link>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {services.map(({ to, icon: Icon, title, text }) => (
              <Link key={to} to={to} className="card-soft group flex flex-col">
                <Icon size={22} className="text-primary" />
                <h3 className="mt-5 text-xl">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{text}</p>
                <span className="mt-6 inline-flex items-center gap-1 text-xs uppercase tracking-[0.18em] text-foreground/70 transition group-hover:text-primary">
                  Подробнее <ArrowUpRight size={12} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section className="container-wide py-24 md:py-32">
        <div className="grid items-center gap-12 md:grid-cols-12 md:gap-20">
          <div className="md:col-span-5">
            <img
              src={aboutImg}
              alt="Подход к работе"
              width={1024}
              height={1024}
              loading="lazy"
              className="aspect-[4/5] w-full object-cover"
            />
          </div>
          <div className="md:col-span-7">
            <div className="eyebrow mb-5">Подход</div>
            <h2 className="text-3xl md:text-5xl">
              Спокойное сопровождение<br/>
              <span className="italic text-primary">сложных ситуаций</span>
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Моя задача — снять с вас тревогу за результат. Я веду переговоры,
              готовлю документы и защищаю интересы так, чтобы у вас оставался
              контроль над ситуацией, а не паника от неизвестности.
            </p>
            <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6">
              {[
                { t: "Защита интересов", d: "Сначала ваш результат, потом всё остальное." },
                { t: "Стратегия", d: "Чёткий план вместо разовых действий." },
                { t: "Понятность", d: "Без юридического шума и неопределённости." },
                { t: "Сопровождение", d: "Я рядом до закрытия вопроса." },
              ].map((x) => (
                <div key={x.t}>
                  <div className="font-display text-xl">{x.t}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{x.d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* RENTAL */}
      <section className="border-y border-border bg-card">
        <div className="container-wide py-24 md:py-32">
          <div className="max-w-2xl">
            <div className="eyebrow mb-5">Аренда</div>
            <h2 className="text-3xl md:text-5xl">Споры по аренде недвижимости</h2>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              Помогаю собственникам и арендаторам выходить из конфликтов без
              лишних эмоций — с защищённым депозитом, расчётами и репутацией.
            </p>
          </div>

          <div className="mt-14 grid gap-10 md:grid-cols-2">
            <div className="border-l border-primary pl-8">
              <div className="font-display text-2xl">Жилая аренда</div>
              <ul className="mt-5 space-y-3 text-sm text-foreground/85">
                <li>· Возврат залога и удержания</li>
                <li>· Споры о порче имущества</li>
                <li>· Выселение арендатора</li>
                <li>· Задолженность по аренде</li>
                <li>· Расторжение договора</li>
              </ul>
            </div>
            <div className="border-l border-primary pl-8">
              <div className="font-display text-2xl">Коммерческая аренда</div>
              <ul className="mt-5 space-y-3 text-sm text-foreground/85">
                <li>· Изменение и пересмотр условий</li>
                <li>· Депозит и обеспечительный платёж</li>
                <li>· Досрочный выход и неустойки</li>
                <li>· Защита от одностороннего расторжения</li>
                <li>· Споры по площадям и услугам</li>
              </ul>
            </div>
          </div>

          <div className="mt-12">
            <Link to="/rental-disputes" className="btn-primary">
              Разобрать ситуацию по аренде <ArrowUpRight size={16}/>
            </Link>
          </div>
        </div>
      </section>

      {/* REPRESENTATION ABROAD */}
      <section className="container-wide py-24 md:py-32">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <div className="eyebrow mb-5">Trusted Representative</div>
            <h2 className="text-3xl md:text-5xl">
              Представительство интересов<br/>
              <span className="italic text-primary">для клиентов за границей</span>
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
              Помогаю решать вопросы недвижимости, аренды, договоров и
              судебных споров в России без необходимости личного присутствия.
            </p>
            <div className="mt-8">
              <Link to="/representation-abroad" className="btn-primary">
                Обсудить ситуацию <ArrowUpRight size={16}/>
              </Link>
            </div>
          </div>
          <div className="md:col-span-7">
            <div className="grid gap-px overflow-hidden bg-border md:grid-cols-2">
              {abroad.map((a) => (
                <div key={a.title} className="bg-background p-7">
                  <h3 className="font-display text-xl">{a.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-y border-border bg-secondary/30">
        <div className="container-wide py-24 md:py-32">
          <div className="eyebrow mb-5">Как мы работаем</div>
          <h2 className="max-w-xl text-3xl md:text-5xl">Четыре шага до спокойствия</h2>

          <div className="mt-14 grid gap-px bg-border md:grid-cols-4">
            {steps.map((s) => (
              <div key={s.n} className="bg-background p-8">
                <div className="font-display text-3xl text-primary">{s.n}</div>
                <h3 className="mt-4 text-xl">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* REVIEWS */}
      <section className="container-wide py-24 md:py-32">
        <div className="eyebrow mb-5">Отзывы</div>
        <h2 className="max-w-xl text-3xl md:text-5xl">Говорят клиенты</h2>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {reviews.map((r) => (
            <figure key={r.author} className="border-t border-border pt-8">
              <blockquote className="font-display text-xl leading-snug text-foreground/90 md:text-2xl">
                «{r.text}»
              </blockquote>
              <figcaption className="mt-6 text-sm">
                <div className="font-medium">{r.author}</div>
                <div className="text-muted-foreground">{r.role}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* GEO */}
      <section className="border-y border-border">
        <div className="grid md:grid-cols-2">
          <div className="bg-foreground p-12 text-background md:p-20">
            <div className="eyebrow mb-5 text-primary">География</div>
            <h2 className="text-3xl md:text-5xl text-background">
              Работаю по Москве,<br/>
              Московской области<br/>
              и дистанционно по России
            </h2>
            <div className="mt-10 flex flex-wrap gap-3">
              {geo.map((g) => (
                <span key={g} className="inline-flex items-center gap-2 border border-background/30 px-4 py-2 text-xs uppercase tracking-[0.18em]">
                  <MapPin size={12} className="text-primary" /> {g}
                </span>
              ))}
            </div>
          </div>
          <div className="relative min-h-[320px] md:min-h-[480px]">
            <img
              src={moscowImg}
              alt="Архитектура Москвы"
              width={1536}
              height={1024}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section className="container-wide py-24 md:py-32" id="contact">
        <div className="grid gap-16 md:grid-cols-12">
          <div className="md:col-span-6">
            <div className="eyebrow mb-5">Контакты</div>
            <h2 className="text-3xl md:text-5xl">
              Расскажите ситуацию —<br/>
              <span className="italic text-primary">я подскажу следующий шаг</span>
            </h2>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
              Кратко опишите, что произошло. Свяжусь с вами в течение рабочего дня
              для бесплатного первичного разбора.
            </p>

            <div className="mt-10 space-y-4">
              <a href="https://wa.me/79000000000" className="flex items-center justify-between border-t border-border py-4 text-sm hover:text-primary">
                <span className="inline-flex items-center gap-3"><MessageCircle size={16}/> WhatsApp</span>
                <ArrowUpRight size={14}/>
              </a>
              <a href="https://t.me/" className="flex items-center justify-between border-t border-border py-4 text-sm hover:text-primary">
                <span className="inline-flex items-center gap-3"><Send size={16}/> Telegram</span>
                <ArrowUpRight size={14}/>
              </a>
              <a href="#" className="flex items-center justify-between border-t border-border py-4 text-sm hover:text-primary">
                <span className="inline-flex items-center gap-3"><Send size={16}/> MAX</span>
                <ArrowUpRight size={14}/>
              </a>
              <a href="mailto:hello@example.com" className="flex items-center justify-between border-y border-border py-4 text-sm hover:text-primary">
                <span className="inline-flex items-center gap-3"><Mail size={16}/> hello@example.com</span>
                <ArrowUpRight size={14}/>
              </a>
            </div>
          </div>

          <div className="md:col-span-6 card-soft flex flex-col justify-between gap-6">
            <div>
              <div className="eyebrow mb-3">AI-помощник</div>
              <p className="text-base leading-relaxed">
                Опишите ситуацию в защищённой форме. AI-помощник задаст
                2–3 уточняющих вопроса и подготовит сводку для разбора.
              </p>
            </div>
            <Link to="/contact" className="btn-primary w-full justify-center">
              Открыть форму обращения <ArrowUpRight size={16}/>
            </Link>
            <p className="text-xs text-muted-foreground">
              Информация конфиденциальна. Свяжусь с вами в течение рабочего дня.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
