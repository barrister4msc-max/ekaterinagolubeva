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
      { title: "Legal Advisor — Premium Legal Real Estate Advisor в Москве" },
      { name: "description", content: "Спокойное юридическое сопровождение недвижимости, аренды, договоров и судебных споров в Москве, МО и дистанционно по России." },
      { name: "author", content: "Legal Advisor" },
      { property: "og:site_name", content: "Legal Advisor" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: "Legal Advisor — Premium Legal Real Estate Advisor в Москве" },
      { name: "twitter:title", content: "Legal Advisor — Premium Legal Real Estate Advisor в Москве" },
      { property: "og:description", content: "Спокойное юридическое сопровождение недвижимости, аренды, договоров и судебных споров в Москве, МО и дистанционно по России." },
      { name: "twitter:description", content: "Спокойное юридическое сопровождение недвижимости, аренды, договоров и судебных споров в Москве, МО и дистанционно по России." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/38278110-5fc0-49c8-a56d-fd6c00749661/id-preview-846f4bfd--0172752e-9cee-4e4a-ad5c-82ad0cbd7785.lovable.app-1779049069059.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/38278110-5fc0-49c8-a56d-fd6c00749661/id-preview-846f4bfd--0172752e-9cee-4e4a-ad5c-82ad0cbd7785.lovable.app-1779049069059.png" },
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
      {!isWorkspace && <SiteHeader />}
      <Outlet />
      {!isWorkspace && <SiteFooter />}
      {!isWorkspace && <FloatingMessengers />}
    </QueryClientProvider>
  );
}
