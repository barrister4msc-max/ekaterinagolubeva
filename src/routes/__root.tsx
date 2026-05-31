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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                const showFallback = () => {
                  const root = document.body;
                  if (!root || root.dataset.safeErrorShown === "true") return;
                  root.dataset.safeErrorShown = "true";
                  root.innerHTML = '<main style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#faf8f5;color:#241f1b;font:15px/1.5 Inter,system-ui,-apple-system,sans-serif"><section style="max-width:420px;text-align:center"><h1 style="margin:0 0 8px;font:400 28px/1.15 Georgia,serif">Страница не загрузилась</h1><p style="margin:0 0 20px;color:#6f6258">Сбой перехвачен. Обновите страницу или вернитесь на главную.</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button onclick="location.reload()" style="border:1px solid #241f1b;background:#241f1b;color:white;padding:10px 16px;border-radius:6px;cursor:pointer">Обновить</button><a href="/" style="border:1px solid #d8d0c7;color:#241f1b;text-decoration:none;padding:10px 16px;border-radius:6px">На главную</a></div></section></main>';
                };
                window.addEventListener("error", showFallback);
                window.addEventListener("unhandledrejection", showFallback);
              })();
            `,
          }}
        />
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
      {!isWorkspace && <SiteHeader />}
      <Outlet />
      {!isWorkspace && <SiteFooter />}
      {!isWorkspace && <FloatingMessengers />}
    </QueryClientProvider>
  );
}
