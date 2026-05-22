import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";


export interface SeoPageFaqItem {
  question: string;
  answer: string;
}

export type SeoSchemaJson = Json;

export interface SeoPageRecord {
  slug: string;
  canonical_path: string | null;
  title_ru: string;
  meta_description_ru: string | null;
  h1_ru: string;
  content_ru: string;
  faq_json: SeoPageFaqItem[];
  schema_json: SeoSchemaJson;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  noindex: boolean;
  nofollow: boolean;
}


export interface SeoPageLink {
  slug: string;
  canonical_path: string | null;
  title_ru: string;
  h1_ru: string;
}

const SLUG_SCHEMA = z
  .object({ slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/i) })
  .transform((v) => ({ slug: v.slug.toLowerCase() }));

export const getSeoPage = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => SLUG_SCHEMA.parse(input))
  .handler(async ({ data }): Promise<SeoPageRecord | null> => {
    const { data: row, error } = await (supabaseAdmin as never as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (
            c: string,
            v: unknown,
          ) => {
            eq: (
              c: string,
              v: unknown,
            ) => {
              eq: (
                c: string,
                v: unknown,
              ) => {
                maybeSingle: () => Promise<{ data: SeoPageRecord | null; error: unknown }>;
              };
            };
          };
        };
      };
    })
      .from("seo_pages")
      .select(
        "slug,canonical_path,title_ru,meta_description_ru,h1_ru,content_ru,faq_json,schema_json,og_title,og_description,og_image,noindex,nofollow",
      )
      .eq("slug", data.slug)
      .eq("is_published", true)
      .eq("noindex", false)
      .maybeSingle();

    if (error) {
      console.error("[seo-pages] getSeoPage error", error);
      return null;
    }
    return row ?? null;
  });

export const listSeoPageLinks = createServerFn({ method: "GET" })
  .handler(async (): Promise<SeoPageLink[]> => {
    const { data, error } = await (supabaseAdmin as never as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (
            c: string,
            v: unknown,
          ) => {
            eq: (
              c: string,
              v: unknown,
            ) => {
              order: (
                c: string,
                o: { ascending: boolean },
              ) => {
                limit: (n: number) => Promise<{ data: SeoPageLink[] | null; error: unknown }>;
              };
            };
          };
        };
      };
    })
      .from("seo_pages")
      .select("slug,canonical_path,title_ru,h1_ru")
      .eq("is_published", true)
      .eq("noindex", false)
      .order("sort_order", { ascending: true })
      .limit(50);

    if (error) {
      console.error("[seo-pages] listSeoPageLinks error", error);
      return [];
    }
    return data ?? [];
  });
