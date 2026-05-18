import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/seed-admin")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: SeedPage,
});

function SeedPage() {
  const [out, setOut] = useState("");
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/public/seed-admin?secret=lovable-seed-2026&email=get4you28@gmail.com`);
      setOut(`${r.status} ${await r.text()}`);
    } catch (e: any) {
      setOut("ERR: " + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="p-10">
      <h1 className="text-xl mb-4">Seed admin: get4you28@gmail.com</h1>
      <button onClick={run} disabled={loading} className="px-4 py-2 bg-primary text-primary-foreground rounded">
        {loading ? "..." : "Run"}
      </button>
      <pre className="mt-4 whitespace-pre-wrap text-sm">{out}</pre>
    </div>
  );
}
