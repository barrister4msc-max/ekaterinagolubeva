import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { seedAdminFn } from "@/lib/seed-admin.functions";

export const Route = createFileRoute("/workspace/seed")({
  component: SeedPage,
});

function SeedPage() {
  const fn = useServerFn(seedAdminFn);
  const [out, setOut] = useState("");
  const run = async () => {
    try {
      const r = await fn({ data: { email: "get4you28@gmail.com", secret: "lovable-seed-2026" } });
      setOut(JSON.stringify(r));
    } catch (e: any) {
      setOut("ERR: " + (e?.message ?? String(e)));
    }
  };
  return (
    <div className="p-8">
      <button onClick={run} className="px-4 py-2 bg-primary text-primary-foreground rounded">Seed admin</button>
      <pre className="mt-4">{out}</pre>
    </div>
  );
}
