import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DownloadIcon, FileXIcon } from "lucide-react";
import { CopyValue } from "@/components/domain/copy-value";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime } from "@/components/domain/format";
import { JsonViewer } from "@/components/domain/json-viewer";
import { DetailPage } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { withoutFile } from "@/features/import-log/model";
import { downloadFile } from "@/lib/download";
import { useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_app/logs/$id")({
  component: ImportLogEntryPage,
});

const breadcrumbs = [{ label: "Import log", to: "/logs" }];

function ImportLogEntryPage() {
  const { id } = Route.useParams();
  const logId = Number(id);
  const trpc = useTRPC();
  const entry = useQuery({
    ...trpc.reports.logs.get.queryOptions({ id: logId }),
    enabled: Number.isInteger(logId) && logId > 0,
  });

  if (entry.error || !(Number.isInteger(logId) && logId > 0)) {
    return (
      <DetailPage breadcrumbs={breadcrumbs} title={`Log #${id}`}>
        <ErrorState
          back={{ to: "/logs", label: "Import log" }}
          error={entry.error ?? new Error("Not a log ID")}
          onRetry={entry.error ? () => void entry.refetch() : undefined}
        />
      </DetailPage>
    );
  }

  if (!entry.data) {
    return (
      <DetailPage breadcrumbs={breadcrumbs} title={<Skeleton className="h-8 w-64" />}>
        <Skeleton className="h-64" />
      </DetailPage>
    );
  }

  const { result, file, filename } = withoutFile(entry.data.result);

  return (
    <DetailPage
      breadcrumbs={breadcrumbs}
      title={entry.data.displayLabel ?? "Unknown source"}
      meta={[
        <CopyValue key="id" value={entry.data.ID} label="log ID" prefix="#" />,
        <DateTime key="time" value={entry.data.timestamp} format="datetime" />,
      ]}
      actions={
        file !== null && (
          <Button
            onClick={() =>
              downloadFile({
                filename: filename ?? `import-log-${entry.data.ID}.txt`,
                contentType: "text/plain",
                content: file,
              })
            }
          >
            <DownloadIcon />
            Download file
          </Button>
        )
      }
    >
      <Tabs defaultValue="result">
        <TabsList>
          <TabsTrigger value="result">Result</TabsTrigger>
          <TabsTrigger value="file">Raw file</TabsTrigger>
        </TabsList>
        <TabsContent value="result">
          <JsonViewer data={result} defaultExpandDepth={2} />
        </TabsContent>
        <TabsContent value="file">
          {file !== null ? (
            <pre
              tabIndex={0}
              aria-label="Raw file"
              className="max-h-[70vh] overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-xs leading-5 focus-ring"
            >
              {file}
            </pre>
          ) : (
            <EmptyState
              icon={FileXIcon}
              size="sm"
              title="No file stored"
              description="This entry is from a scheduled job or an import that didn't keep its file."
              className="rounded-md border border-border"
            />
          )}
        </TabsContent>
      </Tabs>
    </DetailPage>
  );
}
