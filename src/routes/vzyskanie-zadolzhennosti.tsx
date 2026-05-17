import { createFileRoute } from "@tanstack/react-router";
import { PageShell, BulletSection } from "@/components/page-shell";

export const Route = createFileRoute("/vzyskanie-zadolzhennosti")({
  head: () => ({
    meta: [
      { title: "Взыскание задолженности | Legal Advisor" },
      { name: "description", content: "Взыскание долгов: претензия, иск, исполнительное производство, работа с приставами, арест счетов и имущества." },
    ],
  }),
  component: () => (
    <PageShell
      eyebrow="Взыскание задолженности"
      title="Взыскание задолженности"
      intro="Возвращаю деньги по договорам, расписками и обязательствам. Веду дело от первой претензии до фактического поступления средств на ваш счёт."
    >
      <BulletSection
        title="Как работаем"
        items={[
          { title: "Анализ долга", text: "Документы, сроки, перспектива взыскания." },
          { title: "Претензия", text: "Досудебная работа и переговоры." },
          { title: "Иск", text: "Подача иска в суд общей юрисдикции или арбитраж." },
          { title: "Судебное решение", text: "Получение решения и исполнительного листа." },
          { title: "Приставы", text: "Контроль исполнительного производства." },
          { title: "Аресты", text: "Аресты счетов, имущества, ограничение выезда." },
        ]}
      />
    </PageShell>
  ),
});
