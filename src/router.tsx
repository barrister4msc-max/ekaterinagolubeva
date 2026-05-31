import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl">Страница не загрузилась</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Что-то пошло не так. Обновите страницу или вернитесь на главную.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={reset} className="btn-primary">Повторить</button>
          <a href="/" className="btn-ghost">На главную</a>
        </div>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};
