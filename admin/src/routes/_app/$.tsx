import { createFileRoute, Link } from "@tanstack/react-router";
import { ConstructionIcon } from "lucide-react";
import { EmptyState } from "@/components/domain/empty-state";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/$")({
  component: NotBuilt,
});

function NotBuilt() {
  const { _splat } = Route.useParams();
  return (
    <EmptyState
      icon={ConstructionIcon}
      title="Not built yet"
      description={`/${_splat ?? ""} hasn't moved to the new admin. Use the current admin for now.`}
      action={
        <Button asChild>
          <Link to="/">Back to home</Link>
        </Button>
      }
      className="flex-1"
    />
  );
}
