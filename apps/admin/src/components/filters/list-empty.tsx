import { InboxIcon, SearchXIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/domain/empty-state";
import { Button } from "@/components/ui/button";
import { strings } from "@/lib/strings";
import type { ListState } from "./list-state";

/**
 * A list's empty state that says why it's empty: with filters or a search applied, "nothing
 * matches" and a way to clear them; without, that there are no records yet.
 *
 *   <DataTable … empty={<ListEmpty list={list} noun="charges" hint="Charges appear when…" />} />
 */
export function ListEmpty({
  list,
  noun,
  hint,
  action,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: accepts any list definition
  list: ListState<any, any>;
  /** Plural, lower case: "charges". */
  noun: string;
  /** Why there are none yet, or what makes them appear. */
  hint?: ReactNode;
  /** Next step when there are none yet. */
  action?: ReactNode;
}) {
  const filtered = list.activeFilterKeys.length > 0 || Boolean(list.filters.q);
  if (filtered) {
    return (
      <EmptyState
        icon={SearchXIcon}
        size="sm"
        title={strings.list.noResults}
        description={strings.list.noResultsHint}
        action={
          <Button size="sm" onClick={list.clearFilters}>
            {strings.actions.clearAll}
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={InboxIcon}
      size="sm"
      title={`No ${noun} yet`}
      description={hint}
      action={action}
    />
  );
}
