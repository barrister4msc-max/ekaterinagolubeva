import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import heroFallback from "@/assets/hero-advisor.jpg";

export interface SiteSettings {
  hero_image_url: string | null;
  hero_object_position_x: number;
  hero_object_position_y: number;
  hero_scale: number;
  // Legal
  legal_form: string | null;
  legal_full_name: string | null;
  legal_inn: string | null;
  legal_ogrnip: string | null;
  legal_address: string | null;
  // Contacts
  contact_email: string | null;
  contact_phone: string | null;
  contact_telegram_url: string | null;
  contact_whatsapp_url: string | null;
  contact_max_url: string | null;
  // Misc
  site_domain: string | null;
  advisor_photo_url: string | null;
}

const DEFAULTS: SiteSettings = {
  hero_image_url: null,
  hero_object_position_x: 50,
  hero_object_position_y: 30,
  hero_scale: 1,
  legal_form: null,
  legal_full_name: null,
  legal_inn: null,
  legal_ogrnip: null,
  legal_address: null,
  contact_email: null,
  contact_phone: null,
  contact_telegram_url: null,
  contact_whatsapp_url: null,
  contact_max_url: null,
  site_domain: null,
  advisor_photo_url: null,
};

const ALL_COLUMNS =
  "hero_image_url, hero_object_position_x, hero_object_position_y, hero_scale, legal_form, legal_full_name, legal_inn, legal_ogrnip, legal_address, contact_email, contact_phone, contact_telegram_url, contact_whatsapp_url, contact_max_url, site_domain, advisor_photo_url";

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("site_settings")
      .select(ALL_COLUMNS)
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSettings({ ...DEFAULTS, ...(data as Partial<SiteSettings>) });
        setLoaded(true);
      });
  }, []);

  return { settings, setSettings, loaded };
}

/** Phone formatted for tel: links — strips non-digits. */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

/** Builds a Supabase Image Transform URL for a stored hero image, or returns the bundled fallback. */
export function heroSrc(url: string | null, width?: number): string {
  if (!url) return heroFallback;
  if (!width) return url;
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace("/object/public/", "/render/image/public/");
    u.searchParams.set("width", String(width));
    u.searchParams.set("quality", "82");
    u.searchParams.set("resize", "cover");
    return u.toString();
  } catch {
    return url;
  }
}

export function heroSrcSet(url: string | null): string {
  if (!url) return "";
  return [480, 768, 1080, 1440, 1920]
    .map((w) => `${heroSrc(url, w)} ${w}w`)
    .join(", ");
}
