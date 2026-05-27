import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileText, PenLine, ChevronDown, ArrowUpRight } from "lucide-react";
import { AiChatDialog } from "./ai-chat-dialog";

type Props = {
  className?: string;
  label?: string;
  showArrow?: boolean;
};

export function ContactCta({ className = "btn-header", label = "Связаться", showArrow = true }: Props) {
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
          {showArrow && (
            <ChevronDown size={14} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
          )}
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+12px)] z-50 w-[320px] overflow-hidden rounded-[14px] border border-[rgba(184,155,114,0.22)] bg-[#FBF7F0] p-2 shadow-[0_30px_80px_-30px_rgba(75,45,25,0.28),0_10px_28px_-14px_rgba(184,155,114,0.22)] backdrop-blur-xl animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); navigate({ to: "/contact" }); }}
              className="cta-option group"
            >
              <span className="cta-option__icon">
                <FileText size={15} strokeWidth={1.25} />
              </span>
              <span className="flex-1 text-left">
                <span className="cta-option__title">Оставить заявку</span>
                <span className="cta-option__sub">Екатерина лично ознакомится с ситуацией и предложит следующий шаг</span>
              </span>
              <ArrowUpRight size={14} strokeWidth={1.25} className="cta-option__arrow" />
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); setChatOpen(true); }}
              className="cta-option group"
            >
              <span className="cta-option__icon">
                <PenLine size={15} strokeWidth={1.25} />
              </span>
              <span className="flex-1 text-left">
                <span className="cta-option__title">Подготовить обращение</span>
                <span className="cta-option__sub">Поможем структурировать и сформулировать ситуацию, чтобы сэкономить ваше время</span>
              </span>
              <ArrowUpRight size={14} strokeWidth={1.25} className="cta-option__arrow" />
            </button>
          </div>
        )}
      </div>

      <AiChatDialog open={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  );
}
