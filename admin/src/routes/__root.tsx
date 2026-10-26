import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { EmptyState } from "@/components/domain/empty-state";
import { Button } from "@/components/ui/button";
import type { RouterContext } from "@/router";
import { MapPinOffIcon } from "lucide-react";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: () => (
    <EmptyState
      icon={MapPinOffIcon}
      title="Page not found"
      description="The address doesn't match any page."
      action={
        <Button variant="outline" asChild>
          <Link to="/">Go home</Link>
        </Button>
      }
    />
  ),
});
