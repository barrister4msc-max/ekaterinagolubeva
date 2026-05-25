import { MessageCircle, Send, Mail } from "lucide-react";
import { useSiteSettings } from "@/hooks/use-site-settings";

/**
 * Renders contact-channel buttons (WhatsApp / Telegram / MAX / Email) for
 * channels the admin has configured. Empty channels are skipped — no
 * placeholder links. Variant controls visual style; layout is responsive grid.
 */
export function ContactChannels({
  variant = "ghost",
  className = "",
  showLabels = true,
  showEmail = true,
}: {
  variant?: "ghost" | "minimal";
  className?: string;
  showLabels?: boolean;
  showEmail?: boolean;
}) {
  const { settings, loaded } = useSiteSettings();
  if (!loaded) return null;

  const items: { href: string; icon: typeof MessageCircle; label: string }[] = [];
  if (settings.contact_whatsapp_url)
    items.push({ href: settings.contact_whatsapp_url, icon: MessageCircle, label: "WhatsApp" });
  if (settings.contact_telegram_url)
    items.push({ href: settings.contact_telegram_url, icon: Send, label: "Telegram" });
  if (settings.contact_max_url)
    items.push({ href: settings.contact_max_url, icon: Send, label: "MAX" });
  if (showEmail && settings.contact_email)
    items.push({
      href: `mailto:${settings.contact_email}`,
      icon: Mail,
      label: settings.contact_email,
    });

  if (items.length === 0) return null;

  if (variant === "minimal") {
    return (
      <div className={className}>
        {items.map((x) => (
          <a
            key={x.label}
            href={x.href}
            target={x.href.startsWith("http") ? "_blank" : undefined}
            rel="noreferrer"
            className="flex items-center justify-between border-t border-border py-4 text-sm hover:text-primary"
          >
            <span className="inline-flex items-center gap-3">
              <x.icon size={16} /> {x.label}
            </span>
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className={className || "flex flex-wrap gap-3"}>
      {items.map((x) => (
        <a
          key={x.label}
          href={x.href}
          target={x.href.startsWith("http") ? "_blank" : undefined}
          rel="noreferrer"
          className="btn-ghost btn-ghost--equal"
        >
          <x.icon size={14} /> {showLabels ? x.label : ""}
        </a>
      ))}
    </div>
  );
}
