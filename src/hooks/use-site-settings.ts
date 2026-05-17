import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import heroFallback from "@/assets/hero-advisor.jpg";

export interface SiteSettings {
  hero_image_url: string | null;
  hero_object_position_x: number;
  hero_object_position_y: number;
  hero_scale: number;
}

const DEFAULTS: SiteSettings = {
  hero_image_url: null,
  hero_object_position_x: 50,
  hero_object_position_y: 30,
  hero_scale: 1,
};

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("site_settings")
      .select("hero_image_url, hero_object_position_x, hero_object_position_y, hero_scale")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSettings(data as SiteSettings);
        setLoaded(true);
      });
  }, []);

  return { settings, setSettings, loaded };
}

/** Builds a Supabase Image Transform URL for a stored hero image, or returns the bundled fallback. */
export function heroSrc(url: string | null, width?: number): string {
  if (!url) return heroFallback;
  if (!width) return url;
  // Supabase image transformation via render endpoint
  try {
    const u = new URL(url);
    // /storage/v1/object/public/<bucket>/<path>  →  /storage/v1/render/image/public/<bucket>/<path>
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
