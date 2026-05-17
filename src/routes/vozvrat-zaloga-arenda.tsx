import { createFileRoute } from "@tanstack/react-router";
import { PageShell, BulletSection } from "@/components/page-shell";

export const Route = createFileRoute("/vozvrat-zaloga-arenda")({
  head: () => ({
    meta: [
      { title: "Возврат залога по аренде | Legal Advisor" },
      { name: "description", content: "Возврат обеспечительного платежа по договору аренды: претензия, переговоры, взыскание через суд." },
    ],
  }),
  component: () => (
    <PageShell
      eyebrow="Возврат залога"
      title="Возврат залога по аренде"
      intro="Помогаю арендатору вернуть депозит, если собственник удерживает его без оснований. И помогаю собственнику корректно удержать — если основания есть."
    >
      <BulletSection
        title="Что делаем"
        items={[
          { title: "Анализ договора", text: "Условия возврата и основания удержания." },
          { title: "Состояние имущества", text: "Сверка с актом приёма-передачи." },
          { title: "Претензия", text: "Досудебное требование о возврате." },
          { title: "Переговоры", text: "Спокойное урегулирование без эскалации." },
          { title: "Иск в суд", text: "Взыскание депозита и процентов." },
          { title: "Исполнение", text: "Получение средств через приставов." },
        ]}
      />
    </PageShell>
  ),
});
