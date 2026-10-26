import { BookmarkIcon, CheckIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPersistentStore } from "@/lib/persistent-store";
import { notify } from "@/lib/notify";
import { strings } from "@/lib/strings";
import type { ListState } from "./list-state";

type SavedView = { name: string; search: Record<string, unknown> };
const viewsStore = createPersistentStore<Record<string, SavedView[]>>("saved-views", {});

function withoutPage(search: Record<string, unknown>) {
  const { page: _page, ...rest } = search;
  return rest;
}

const sameSearch = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  JSON.stringify(Object.entries(withoutPage(a)).sort()) ===
  JSON.stringify(Object.entries(withoutPage(b)).sort());

/**
 * Named filter + sort combinations per list, saved in this browser. Since the URL holds
 * the whole view, sharing a view with a colleague is copying the address.
 */
export function SavedViews({
  // biome-ignore lint/suspicious/noExplicitAny: accepts any list
  list,
}: {
  list: ListState<any, any>;
}) {
  const all = viewsStore.use();
  const views = all[list.id] ?? [];
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const current = views.find((view) => sameSearch(view.search, list.search));

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const view = { name: trimmed, search: withoutPage(list.search) };
    viewsStore.set((state) => ({
      ...state,
      [list.id]: [...(state[list.id] ?? []).filter((v) => v.name !== trimmed), view],
    }));
    setNaming(false);
    setName("");
    notify.success(`Saved view “${trimmed}”`);
  }

  function remove(view: SavedView) {
    viewsStore.set((state) => ({
      ...state,
      [list.id]: (state[list.id] ?? []).filter((v) => v.name !== view.name),
    }));
    notify.undo(`Deleted view “${view.name}”`, () =>
      viewsStore.set((state) => ({ ...state, [list.id]: [...(state[list.id] ?? []), view] })),
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <BookmarkIcon />
            {current ? current.name : strings.list.views}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>{strings.list.views}</DropdownMenuLabel>
          {views.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">{strings.list.noViews}</p>
          )}
          {views.map((view) => (
            <DropdownMenuItem
              key={view.name}
              onSelect={() => list.applySearch(view.search)}
              className="group/view pr-1"
            >
              <CheckIcon className={view === current ? "" : "invisible"} />
              <span className="flex-1 truncate">{view.name}</span>
              <button
                type="button"
                aria-label={`Delete view ${view.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  remove(view);
                }}
                className="grid size-6 place-content-center rounded-xs text-muted-foreground opacity-0 group-hover/view:opacity-100 group-focus/view:opacity-100 hover:bg-hover hover:text-foreground"
              >
                <TrashIcon className="size-3.5" />
              </button>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setNaming(true)}>
            {strings.list.saveView}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={naming} onOpenChange={setNaming}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="view-name">{strings.list.viewName}</Label>
              <Input
                id="view-name"
                autoFocus
                value={name}
                placeholder="e.g. Large gifts this year"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => setNaming(false)}>
                {strings.actions.cancel}
              </Button>
              <Button type="submit" variant="primary" disabled={!name.trim()}>
                {strings.actions.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
