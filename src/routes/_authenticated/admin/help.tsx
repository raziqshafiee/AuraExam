import { createFileRoute } from "@tanstack/react-router";
import { HelpPage } from "@/components/brand/help-page";

export const Route = createFileRoute("/_authenticated/admin/help")({
  head: () => ({ meta: [{ title: "Help Center — Aura" }] }),
  component: () => <HelpPage role="admin" />,
});
