import { createFileRoute, Link } from "@tanstack/react-router";
import { ConstructionIcon } from "lucide-react";
import { EmptyState } from "@/components/domain/empty-state";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/$")({
  component: NotMigrated,
});

function NotMigrated() {
  const { _splat } = Route.useParams();
  return (
    <Page>
      <EmptyState
        icon={ConstructionIcon}
        title="Not built yet"
        description={`/${
          _splat ?? ""
        } hasn't been moved to the new admin. Use the current admin for now.`}
        action={
          <Button variant="outline" asChild>
            <Link to="/">Back to home</Link>
          </Button>
        }
      />
    </Page>
  );
}
