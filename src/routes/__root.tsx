import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { FloatingMessengers } from "@/components/floating-messengers";

function PreviewErrorFallback({ error }: { error?: unknown }) {
  console.error(error);
  const message = error instanceof Error ? error.message : "Неизвестная ошибка приложения";
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl">Превью не загрузилось</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Что-то пошло не так при отображении страницы. Обновите превью или вернитесь на главную.
        </p>
        <p className="mt-4 break-words rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          {message}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => window.location.reload()} className="btn-primary">
            Перезагрузить
          </button>
          <a href="/" className="btn-ghost">На главную</a>
        </div>
      </div>
    </main>
  );
}

class GlobalPreviewErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: unknown | null }
> {
  state = { error: null };

  private handleError = (event: ErrorEvent) => {
    event.preventDefault();
    this.setState({ error: event.error ?? event.message });
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    event.preventDefault();
    this.setState({ error: event.reason });
  };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidMount() {
    window.addEventListener("error", this.handleError);
    window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener("error", this.handleError);
    window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (this.state.error) return <PreviewErrorFallback error={this.state.error} />;
    return this.props.children;
  }
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl">404</h1>
        <h2 className="mt-4 text-xl">Страница не найдена</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Возможно, страница была перемещена или ещё не создана.
        </p>
        <div className="mt-6">
          <Link to="/" className="btn-primary">На главную</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl">Страница не загрузилась</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Что-то пошло не так. Попробуйте обновить страницу.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="btn-primary"
          >
            Повторить
          </button>
          <a href="/" className="btn-ghost">На главную</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Legal Advisor — Legal Real Estate Advisor в Москве" },
      { name: "description", content: "Спокойное юридическое сопровождение недвижимости, аренды, договоров и судебных споров в Москве, МО и дистанционно по России." },
      { name: "author", content: "Legal Advisor" },
      { name: "yandex-verification", content: "925f786bea446022" },
      { property: "og:site_name", content: "Legal Advisor" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: "Legal Advisor — Legal Real Estate Advisor в Москве" },
      { name: "twitter:title", content: "Legal Advisor — Legal Real Estate Advisor в Москве" },
      { property: "og:description", content: "Спокойное юридическое сопровождение недвижимости, аренды, договоров и судебных споров в Москве, МО и дистанционно по России." },
      { name: "twitter:description", content: "Спокойное юридическое сопровождение недвижимости, аренды, договоров и судебных споров в Москве, МО и дистанционно по России." },
      { property: "og:image", content: "https://legalpracticelife.ru/about-portrait.jpg" },
      { name: "twitter:image", content: "https://legalpracticelife.ru/about-portrait.jpg" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=Inter:wght@300;400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const location = useLocation();
  const isWorkspace = location.pathname.startsWith("/workspace");
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalPreviewErrorBoundary>
        {!isWorkspace && <SiteHeader />}
        <Outlet />
        {!isWorkspace && <SiteFooter />}
        {!isWorkspace && <FloatingMessengers />}
      </GlobalPreviewErrorBoundary>
    </QueryClientProvider>
  );
}
