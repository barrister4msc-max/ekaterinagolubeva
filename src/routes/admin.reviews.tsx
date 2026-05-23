import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/reviews")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: () => <Navigate to="/workspace/reviews" replace />,
});
