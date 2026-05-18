import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Mail, Sparkles, ChevronDown } from "lucide-react";
import { AiChatDialog } from "./ai-chat-dialog";

type Props = {
  className?: string;
  label?: string;
};

export function ContactCta({ className = "btn-header", label = "Связаться" }: Props) {
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <>
      <div ref={wrapRef} className="relative inline-flex">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`${className} inline-flex items-center gap-1.5`}
        >
          {label}
          <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
            <Link
              to="/contact"
              onClick={() => setOpen(false)}
              className="flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
            >
              <Mail size={16} className="mt-0.5 text-primary" />
              <div>
                <div className="text-sm font-medium">Оставить заявку</div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  Форма — отвечу лично в течение дня
                </div>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => { setOpen(false); setChatOpen(true); }}
              className="flex w-full items-start gap-3 border-t border-border/60 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
            >
              <Sparkles size={16} className="mt-0.5 text-primary" />
              <div>
                <div className="text-sm font-medium">Спросить ИИ</div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  Быстрый ответ по общему вопросу
                </div>
              </div>
            </button>
          </div>
        )}
      </div>

      <AiChatDialog open={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  );
}
