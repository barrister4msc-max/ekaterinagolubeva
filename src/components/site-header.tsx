import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { ContactCta } from "./contact-cta";

const nav = [
  { to: "/real-estate", label: "Недвижимость" },
  { to: "/rental-disputes", label: "Аренда" },
  { to: "/contracts", label: "Договоры" },
  { to: "/litigation", label: "Суды" },
  { to: "/representation-abroad", label: "За границей" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-all duration-500 ${
        scrolled
          ? "shadow-[0_8px_30px_rgba(0,0,0,0.04)]"
          : ""
      }`}
      style={
        scrolled
          ? {
              backgroundColor: "rgba(245,241,235,0.72)",
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
            }
          : { backgroundColor: "transparent" }
      }
    >
      <div className="container-wide flex h-20 items-center justify-between md:h-24">
        <Link to="/" className="flex flex-col">
          <span
            className="text-[9px] uppercase tracking-[0.28em] md:text-[10px]"
            style={{ color: "#B89B72", lineHeight: 1.4 }}
          >
            Premium Legal Real Estate Advisor
          </span>
          <span className="mt-1.5 font-display text-lg leading-[1.1] text-foreground md:text-xl">
            Екатерина Голубева
          </span>
        </Link>

        <nav className="hidden items-center gap-9 md:flex">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="text-[13px] tracking-wide text-foreground/75 transition-colors hover:text-primary"
              activeProps={{ className: "text-primary" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block">
          <ContactCta />
        </div>

        <button
          aria-label="Меню"
          className="md:hidden p-2"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-border bg-background/95 backdrop-blur-xl">
          <div className="container-wide flex flex-col py-4">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="py-3 text-sm text-foreground/80"
              >
                {n.label}
              </Link>
            ))}
            <Link to="/contact" onClick={() => setOpen(false)} className="btn-primary mt-3 justify-center">
              Связаться
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
