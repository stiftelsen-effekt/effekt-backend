import {
  CopyIcon,
  EllipsisIcon,
  InfoIcon,
  MergeIcon,
  PencilIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Section } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Specimen, SpecimenGrid } from "./specimen";

export function OverlaysSection() {
  return (
    <Section
      title="Overlays"
      description="Dialogs, sheets, menus and toasts share one panel style: border, md radius, overlay shadow."
    >
      <SpecimenGrid>
        <Specimen title="Dialog, sheet, confirmation">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <PencilIcon />
                Edit distribution
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit distribution</DialogTitle>
                <DialogDescription>
                  Changes apply to future donations with this KID.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label htmlFor="dlg-kid">KID</Label>
                <Input id="dlg-kid" className="num" defaultValue="10422781" />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button onClick={() => toast.success("Distribution updated")}>Save</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">
                <SlidersHorizontalIcon />
                Open sheet
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Sheet</SheetTitle>
                <SheetDescription>Side panel for secondary tasks.</SheetDescription>
              </SheetHeader>
              <div className="grid gap-1.5 p-5">
                <Label htmlFor="sheet-note">Note</Label>
                <Input id="sheet-note" />
              </div>
              <SheetFooter>
                <Button className="ml-auto">Apply</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <ConfirmDialog
            destructive
            trigger={
              <Button variant="destructive">
                <Trash2Icon />
                Delete donation
              </Button>
            }
            title="Delete donation #98 214?"
            description="The donation and its receipt record are removed. This can't be undone."
            confirmLabel="Delete donation"
            onConfirm={() =>
              new Promise((resolve) => setTimeout(resolve, 600)).then(() =>
                toast.success("Donation deleted"),
              )
            }
          />
        </Specimen>

        <Specimen title="Menu, popover, tooltip">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                Actions
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-52">
              <DropdownMenuLabel>Donor</DropdownMenuLabel>
              <DropdownMenuItem>
                <PencilIcon />
                Edit
                <DropdownMenuShortcut>E</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <MergeIcon />
                Merge into…
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CopyIcon />
                Copy ID
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked>Trusted</DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">
                <Trash2Icon />
                Delete donor
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">Popover</Button>
            </PopoverTrigger>
            <PopoverContent className="grid gap-2">
              <p className="text-sm font-semibold">Transaction cost</p>
              <p className="text-sm text-muted-foreground">
                Vipps charges 1.75% + 0.75 kr per transaction. Deducted before distribution.
              </p>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="About KID">
                <InfoIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>KID identifies the donor and distribution.</TooltipContent>
          </Tooltip>
        </Specimen>

        <Specimen title="Toasts" description="No emoji. Icon and left rule carry the status.">
          <Button
            variant="outline"
            onClick={() =>
              toast.success("Receipt sent", { description: "To ingrid.hansen@example.org" })
            }
          >
            Success
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast.error("Could not save donor", {
                description: "Email is already used by donor #1042.",
              })
            }
          >
            Error
          </Button>
          <Button variant="outline" onClick={() => toast.warning("3 invalid KIDs in file")}>
            Warning
          </Button>
          <Button
            variant="outline"
            onClick={() => toast.info("Report is processing in the background")}
          >
            Info
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast("Donation deleted", {
                action: { label: "Undo", onClick: () => toast.success("Restored") },
              })
            }
          >
            With action
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast.promise(new Promise((resolve) => setTimeout(resolve, 1500)), {
                loading: "Uploading OCR file…",
                success: "Imported 412 donations",
                error: "Upload failed",
              })
            }
          >
            Promise
          </Button>
        </Specimen>
      </SpecimenGrid>
    </Section>
  );
}
