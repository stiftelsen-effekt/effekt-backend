import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownToLineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeView, reviewQueueAttention } from "@/features/home/home-view";
import { useOpenReviewCount } from "@/features/review-queue/store";
import { useAuth } from "@/auth";
import { useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_app/")({
  component: HomePage,
});

function greeting(name: string | undefined) {
  const hour = new Date().getHours();
  const part = hour < 10 ? "Good morning" : hour < 17 ? "Hello" : "Good evening";
  return name ? `${part}, ${name.split(" ")[0]}` : part;
}

function HomePage() {
  const trpc = useTRPC();
  const { user } = useAuth();
  const reviewCount = useOpenReviewCount();
  const logs = useQuery(trpc.reports.logs.list.queryOptions({ page: 0, limit: 6 }));

  return (
    <HomeView
      greeting={greeting(user?.name)}
      attention={reviewQueueAttention(reviewCount)}
      recentImports={logs.data?.rows}
      actions={
        <Button variant="primary" asChild>
          <Link to="/$" params={{ _splat: "import" }}>
            <ArrowDownToLineIcon />
            Import payments
          </Link>
        </Button>
      }
    />
  );
}
