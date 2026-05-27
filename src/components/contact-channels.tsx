import { MessageCircle, Send, Mail, Phone } from "lucide-react";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { CONTACT_FALLBACK, pick } from "@/lib/contacts";

/**
 * Renders contact-channel rows (Phone / Email / WhatsApp / Telegram / MAX).
 * Phone and Email always render — falling back to canonical practice contacts
 * if site_settings are empty — so the “Контакты” block is never blank.
 * Messenger channels are only shown when the admin has configured them.
 */
export function ContactChannels({
  variant = "ghost",
  className = "",
  showLabels = true,
  showEmail = true,
  showPhone = true,
}: {
  variant?: "ghost" | "minimal";
  className?: string;
  showLabels?: boolean;
  showEmail?: boolean;
  showPhone?: boolean;
}) {
  const { settings, loaded } = useSiteSettings();
  if (!loaded) return null;

  const phone = pick(settings.contact_phone, CONTACT_FALLBACK.contact_phone);
  const email = pick(settings.contact_email, CONTACT_FALLBACK.contact_email);

  const items: { href: string; icon: typeof MessageCircle; label: string }[] = [];

  if (showPhone)
    items.push({ href: CONTACT_FALLBACK.contact_phone_tel, icon: Phone, label: phone });
  if (showEmail) items.push({ href: `mailto:${email}`, icon: Mail, label: email });
  if (settings.contact_whatsapp_url)
    items.push({ href: settings.contact_whatsapp_url, icon: MessageCircle, label: "WhatsApp" });
  if (settings.contact_telegram_url)
    items.push({ href: settings.contact_telegram_url, icon: Send, label: "Telegram" });
  if (settings.contact_max_url)
    items.push({ href: settings.contact_max_url, icon: Send, label: "MAX" });

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
