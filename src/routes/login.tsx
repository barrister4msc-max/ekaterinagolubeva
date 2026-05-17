import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: () => <Navigate to="/workspace/login" replace />,
});
