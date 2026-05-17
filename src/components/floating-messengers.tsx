import { MessageCircle, Send } from "lucide-react";

export function FloatingMessengers() {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3">
      <a
        href="https://wa.me/79000000000"
        target="_blank"
        rel="noreferrer"
        aria-label="WhatsApp"
        className="grid h-12 w-12 place-items-center rounded-full bg-foreground text-background shadow-lg transition hover:bg-primary"
      >
        <MessageCircle size={20} />
      </a>
      <a
        href="https://t.me/"
        target="_blank"
        rel="noreferrer"
        aria-label="Telegram"
        className="grid h-12 w-12 place-items-center rounded-full bg-foreground text-background shadow-lg transition hover:bg-primary"
      >
        <Send size={18} />
      </a>
    </div>
  );
}
