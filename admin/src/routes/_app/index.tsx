import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BuildingIcon, PaletteIcon } from "lucide-react";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { Page, PageHeader, Section } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/auth";
import { appLocale } from "@/lib/locale";
import { useTRPC, type RouterOutputs } from "@/lib/trpc";

type Owner = RouterOutputs["meta"]["owners"][number];

export const Route = createFileRoute("/_app/")({
  component: HomePage,
});

function HomePage() {
  const trpc = useTRPC();
  const { user } = useAuth();
  const owners = useQuery(trpc.meta.owners.queryOptions());

  return (
    <Page>
      <PageHeader
        title="Home"
        eyebrow={appLocale.orgName}
        subtitle={user?.name ? `Signed in as ${user.name}` : undefined}
        actions={
          import.meta.env.DEV && (
            <Button variant="outline" asChild>
              <Link to="/design">
                <PaletteIcon />
                Design system
              </Link>
            </Button>
          )
        }
      />
      <Section
        title="Data owners"
        description="Loaded over tRPC from meta.owners. Proves the API wiring."
        className="max-w-2xl"
      >
        {owners.isPending ? (
          <div className="grid gap-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : owners.isError ? (
          <ErrorState error={owners.error} onRetry={() => void owners.refetch()} />
        ) : owners.data.length === 0 ? (
          <EmptyState icon={BuildingIcon} title="No data owners" compact />
        ) : (
          <OwnersTable owners={owners.data} />
        )}
      </Section>
    </Page>
  );
}

function OwnersTable({ owners }: { owners: Owner[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16 text-right">ID</TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {owners.map((owner) => (
          <TableRow key={owner.id}>
            <TableCell className="num text-right text-muted-foreground">{owner.id}</TableCell>
            <TableCell className="font-semibold">{owner.name}</TableCell>
            <TableCell className="text-right">
              {owner.default && <Badge variant="outline">Default</Badge>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
