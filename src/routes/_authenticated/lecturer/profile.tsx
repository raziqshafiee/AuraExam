import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/components/brand/profile-page";
export const Route = createFileRoute("/_authenticated/lecturer/profile")({
  head: () => ({ meta: [{ title: "Profile — Aura" }] }),
  component: ProfilePage,
});
