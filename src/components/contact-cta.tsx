import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Mail, Sparkles, ChevronDown, ArrowUpRight } from "lucide-react";
import { AiChatDialog } from "./ai-chat-dialog";

type Props = {
  className?: string;
  label?: string;
  showArrow?: boolean;
};

export function ContactCta({ className = "btn-header", label = "Связаться" }: Props) {
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div ref={wrapRef} className="relative inline-flex">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`${className} inline-flex items-center gap-1.5`}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          {label}
          <ChevronDown size={14} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+10px)] z-50 w-[280px] overflow-hidden rounded-2xl border border-[rgba(184,155,114,0.25)] bg-card/95 p-1.5 shadow-[0_20px_60px_-20px_rgba(47,41,37,0.25),0_8px_24px_-12px_rgba(184,155,114,0.18)] backdrop-blur-xl animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); navigate({ to: "/contact" }); }}
              className="cta-option group"
            >
              <span className="cta-option__icon">
                <Mail size={15} />
              </span>
              <span className="flex-1 text-left">
                <span className="cta-option__title">Оставить заявку</span>
                <span className="cta-option__sub">Форма — отвечу лично в течение дня</span>
              </span>
              <ArrowUpRight size={14} className="cta-option__arrow" />
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); setChatOpen(true); }}
              className="cta-option group"
            >
              <span className="cta-option__icon">
                <Sparkles size={15} />
              </span>
              <span className="flex-1 text-left">
                <span className="cta-option__title">Спросить ИИ</span>
                <span className="cta-option__sub">Быстрый ответ по общему вопросу</span>
              </span>
              <ArrowUpRight size={14} className="cta-option__arrow" />
            </button>
          </div>
        )}
      </div>

      <AiChatDialog open={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  );
}
