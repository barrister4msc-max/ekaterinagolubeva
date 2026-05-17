import { createFileRoute } from "@tanstack/react-router";
import { PageShell, BulletSection } from "@/components/page-shell";

export const Route = createFileRoute("/representation-abroad")({
  head: () => ({
    meta: [
      { title: "Представительство для клиентов за границей | Legal Advisor" },
      { name: "description", content: "Сделки, суды, наследство, доверенности и аренда в России без необходимости личного присутствия. Trusted Representative in Russia." },
      { property: "og:title", content: "Представительство интересов для клиентов за границей" },
      { property: "og:description", content: "Trusted Representative in Russia — контроль ситуации на месте." },
    ],
  }),
  component: () => (
    <PageShell
      eyebrow="Trusted Representative in Russia"
      title="Представительство интересов для клиентов за границей"
      intro="Помогаю решать вопросы недвижимости, аренды, договоров и судебных споров в России без вашего личного присутствия. Контроль ситуации остаётся за вами — на месте работаю я."
    >
      <BulletSection
        title="Чем помогаю дистанционно"
        items={[
          { title: "Недвижимость и сделки", text: "Продажа квартиры без приезда, проверка покупателя, сделка от и до." },
          { title: "Дистанционные документы", text: "Подготовка, согласование и подписание через защищённые каналы и ЭДО." },
          { title: "Судебное представительство", text: "Иски, жалобы, заседания, исполнительное производство в РФ." },
          { title: "Доверенности", text: "Подготовка с учётом консульской легализации и апостиля." },
          { title: "Наследство", text: "Принятие наследства и оформление прав в России." },
          { title: "Аренда и управление", text: "Контроль арендаторов, договоры, депозит, разрешение споров." },
        ]}
      />
    </PageShell>
  ),
});
