import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BASE_URL = "https://legalpracticelife.ru";

interface SeoPageRow {
  slug: string;
  canonical_path: string | null;
  updated_at: string | null;
  changefreq: string | null;
  priority: number | string | null;
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { data, error } = await (
          supabaseAdmin as never as {
            from: (t: string) => {
              select: (s: string) => {
                eq: (
                  c: string,
                  v: unknown,
                ) => {
                  eq: (c: string, v: unknown) => Promise<{ data: SeoPageRow[] | null; error: unknown }>;
                };
              };
            };
          }
        )
          .from("seo_pages")
          .select("slug,canonical_path,updated_at,changefreq,priority")
          .eq("is_published", true)
          .eq("noindex", false);

        if (error) {
          console.error("[sitemap] error", error);
        }

        const rows: SeoPageRow[] = data ?? [];

        const staticEntries: { path: string; changefreq: string; priority: string }[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/about", changefreq: "monthly", priority: "0.8" },
          { path: "/ekaterina-golubeva", changefreq: "monthly", priority: "0.9" },
          { path: "/real-estate", changefreq: "monthly", priority: "0.8" },
          { path: "/contact", changefreq: "monthly", priority: "0.7" },
          { path: "/reviews", changefreq: "monthly", priority: "0.6" },
          { path: "/privacy", changefreq: "yearly", priority: "0.3" },
          { path: "/terms", changefreq: "yearly", priority: "0.3" },
          { path: "/consent", changefreq: "yearly", priority: "0.3" },
          { path: "/ai-disclaimer", changefreq: "yearly", priority: "0.3" },
          { path: "/arbitrazhnye-spory", changefreq: "monthly", priority: "0.8" },
          { path: "/nedvizhimost", changefreq: "monthly", priority: "0.8" },
          { path: "/litigation", changefreq: "monthly", priority: "0.7" },
        ];

        const urls: string[] = [];

        for (const e of staticEntries) {
          urls.push(
            [
              `  <url>`,
              `    <loc>${BASE_URL}${e.path}</loc>`,
              `    <changefreq>${e.changefreq}</changefreq>`,
              `    <priority>${e.priority}</priority>`,
              `  </url>`,
            ].join("\n"),
          );
        }

        for (const r of rows) {
          const path = (r.canonical_path?.trim() || `/${r.slug}`).replace(/\s+/g, "");
          const loc = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
          const lastmod = r.updated_at ? new Date(r.updated_at).toISOString() : null;
          const changefreq = r.changefreq?.trim() || "weekly";
          const priority = r.priority !== null && r.priority !== undefined ? String(r.priority) : "0.8";
          urls.push(
            [
              `  <url>`,
              `    <loc>${escapeXml(loc)}</loc>`,
              lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
              `    <changefreq>${escapeXml(changefreq)}</changefreq>`,
              `    <priority>${escapeXml(priority)}</priority>`,
              `  </url>`,
            ]
              .filter(Boolean)
              .join("\n"),
          );
        }

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "X-Content-Type-Options": "nosniff",
            "X-Robots-Tag": "noindex",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
