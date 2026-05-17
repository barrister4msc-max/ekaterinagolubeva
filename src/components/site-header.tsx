import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const nav = [
  { to: "/real-estate", label: "Недвижимость" },
  { to: "/rental-disputes", label: "Аренда" },
  { to: "/contracts", label: "Договоры" },
  { to: "/litigation", label: "Суды" },
  { to: "/representation-abroad", label: "За границей" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="container-wide flex h-16 items-center justify-between md:h-20">
        <Link to="/" className="font-display text-lg tracking-tight md:text-xl">
          Екатерина&nbsp;Голубева
          <span className="ml-1 text-primary">.</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
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
          <Link to="/contact" className="btn-primary">
            Связаться
          </Link>
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
        <div className="md:hidden border-t border-border bg-background">
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
