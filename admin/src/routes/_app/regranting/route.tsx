import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { config } from "@/lib/config";

export const Route = createFileRoute("/_app/regranting")({
  beforeLoad: () => {
    if (!config.features.regranting) throw redirect({ to: "/" });
  },
  component: Outlet,
});
