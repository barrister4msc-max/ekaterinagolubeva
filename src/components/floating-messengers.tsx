import { MessageCircle, Send } from "lucide-react";
import { useSiteSettings } from "@/hooks/use-site-settings";

export function FloatingMessengers() {
  const { settings, loaded } = useSiteSettings();
  if (!loaded) return null;

  const wa = settings.contact_whatsapp_url;
  const tg = settings.contact_telegram_url;
  if (!wa && !tg) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3">
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noreferrer"
          aria-label="WhatsApp"
          className="grid h-12 w-12 place-items-center rounded-full bg-foreground text-background shadow-lg transition hover:bg-primary"
        >
          <MessageCircle size={20} />
        </a>
      )}
      {tg && (
        <a
          href={tg}
          target="_blank"
          rel="noreferrer"
          aria-label="Telegram"
          className="grid h-12 w-12 place-items-center rounded-full bg-foreground text-background shadow-lg transition hover:bg-primary"
        >
          <Send size={18} />
        </a>
      )}
    </div>
  );
}
