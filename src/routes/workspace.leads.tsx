import { createFileRoute } from "@tanstack/react-router";
import { LeadsAdmin } from "@/components/leads-admin";

export const Route = createFileRoute("/workspace/leads")({
  component: LeadsPage,
});

function LeadsPage() {
  return (
    <div>
      {/* LeadsAdmin renders its own header + table */}
      <div className="-mt-20">
        <LeadsAdmin />
      </div>
    </div>
  );
}
