import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Money } from "@/components/domain/format";
import { navGroups, settingsItem } from "@/components/layout/nav";
import { shortcutGroups } from "@/components/layout/shortcuts";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DocPage, DocSection, Example } from "@/design-system/doc";
import { formatMoney } from "@/lib/format";
import { notify } from "@/lib/notify";

const shortcuts = shortcutGroups([...navGroups.flatMap((group) => group.items), settingsItem]);

export const Route = createFileRoute("/design/patterns")({
  component: Patterns,
});

const editing = [
  [
    "Low risk, one field",
    "Donor name, email, newsletter, referral",
    "InlineEdit / Switch",
    "Saves on Enter or toggle; Undo toast for toggles",
  ],
  [
    "Several related fields",
    "Settings, tax unit, matching rule",
    "Form + UnsavedChangesBar",
    "Explicit Save; bar shows while dirty; leaving asks first",
  ],
  [
    "Moves or changes money",
    "Donation amount/date/split, agreement amount, refund",
    "Form + ConfirmDialog",
    "Confirm shows before → after; amount in the button",
  ],
  [
    "Irreversible",
    "Delete donation, merge donors, stop agreement",
    "ConfirmDialog tone=danger",
    "Consequences listed; type the id or amount for merges and refunds",
  ],
];

const optimism = [
  [
    "Optimistic",
    "Toggles and inline edits on the donor (newsletter, name), saved views, review skip",
    "Cheap to revert, no money involved",
  ],
  [
    "Wait for the server",
    "Anything in a ConfirmDialog, registering donations, imports, refunds, distribution changes",
    "The person must know it really happened; show pending state in the button",
  ],
];

const writing = [
  ["Register 500 kr", "Submit", "Buttons say the verb and, for money, the amount"],
  [
    "Stop Kari Nordby's Vipps agreement?",
    "Are you sure?",
    "Confirmations name the action and the object",
  ],
  [
    "Email already belongs to another donor",
    "Error 409",
    "Errors say what is wrong, in the person's terms",
  ],
  [
    "Can't reach the server. Check your connection, then try again.",
    "Network error",
    "…and what to do next",
  ],
  ["No agreements. This donor gives one-off only.", "No data", "Empty states explain the empty"],
  [
    "Agreements",
    "Avtaler / AvtaleGiro-avtaler",
    "English UI; product names (KID, AvtaleGiro, Vipps) stay as they are",
  ],
];

function ChangeAmountExample() {
  const [saved, setSaved] = useState(500);
  const [draft, setDraft] = useState("500");
  const next = Number(draft);
  const dirty = next !== saved;
  return (
    <form className="grid w-full max-w-sm gap-3" onSubmit={(event) => event.preventDefault()}>
      <Field label="Monthly amount" hint={`Currently ${formatMoney(saved)}`}>
        <Input
          value={draft}
          inputMode="decimal"
          className="num"
          onChange={(event) => setDraft(event.target.value)}
        />
      </Field>
      <div className="flex gap-2">
        <ConfirmDialog
          title={`Change the monthly amount to ${formatMoney(next)}?`}
          consequences={[
            <>
              <Money value={saved} /> → <Money value={next} className="font-semibold" /> from the
              next charge on the 20th.
            </>,
            "The donor is notified by email.",
          ]}
          confirmLabel={`Change to ${formatMoney(next)}`}
          onConfirm={async () => {
            await new Promise((resolve) => setTimeout(resolve, 500));
            setSaved(next);
            notify.success("Amount changed", `${formatMoney(saved)} → ${formatMoney(next)}`);
          }}
          trigger={
            <Button variant="primary" disabled={!dirty || !(next > 0)}>
              Save amount
            </Button>
          }
        />
        <Button disabled={!dirty} onClick={() => setDraft(String(saved))}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RuleTable({ head, rows, label }: { head: string[]; rows: string[][]; label: string }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table aria-label={label}>
        <TableHeader>
          <TableRow>
            {head.map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row[0]}>
              {row.map((cell, index) => (
                <TableCell
                  key={index}
                  className={
                    index === 0
                      ? "font-semibold whitespace-normal"
                      : "whitespace-normal text-muted-foreground"
                  }
                >
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Patterns() {
  return (
    <DocPage
      title="Patterns"
      intro="How the components combine into behaviour. When a feature page needs one of these situations, use the pattern as written instead of designing a new one."
    >
      <DocSection
        id="find"
        title="Finding things"
        description="Three ways in, from fastest to broadest."
      >
        <ol className="grid gap-4 sm:grid-cols-3">
          <li className="grid content-start gap-1">
            <h3 className="flex items-center gap-2 font-semibold">
              <Kbd>⌘K</Kbd> Search
            </h3>
            <p className="text-sm text-muted-foreground">
              Name, email, donor id, donation id, KID or agr_… id. Jumps straight to the record.
              Also every page and common action.
            </p>
          </li>
          <li className="grid content-start gap-1">
            <h3 className="flex items-center gap-2 font-semibold">
              <Kbd>/</Kbd> List search
            </h3>
            <p className="text-sm text-muted-foreground">
              Narrows the current list. Combine with filter chips; the URL keeps it all.
            </p>
          </li>
          <li className="grid content-start gap-1">
            <h3 className="font-semibold">Saved views</h3>
            <p className="text-sm text-muted-foreground">
              Name a filter combination you use weekly. Share any view by copying the address.
            </p>
          </li>
        </ol>
      </DocSection>

      <DocSection
        id="list-detail"
        title="List → panel → page"
        description="Click, Enter or Space opens the row's own page as a panel over the list; links in it to other records stack another panel on top. Esc or Back closes the top one, clicking a lower edge or the strip of list closes everything above it, and Full page goes to the record's route. ⌘- or middle-click opens it in a new tab. No double-click anywhere."
      >
        <div className="grid gap-2 rounded-md border border-border p-4 text-sm sm:grid-cols-4">
          {[
            ["Click / Enter / Space", "Open as a panel"],
            ["Esc  or Back", "Close the top panel"],
            ["j / k  or ↑ / ↓", "Move between rows"],
            ["x", "Select for bulk actions"],
          ].map(([keys, action]) => (
            <div key={keys} className="grid gap-0.5">
              <span className="font-semibold">{keys}</span>
              <span className="text-muted-foreground">{action}</span>
            </div>
          ))}
        </div>
      </DocSection>

      <DocSection
        id="editing"
        title="Editing, by risk"
        description="The more an edit can cost, the more deliberate the interaction."
      >
        <RuleTable
          label="Editing patterns"
          head={["Risk", "Examples", "Pattern", "Behaviour"]}
          rows={editing}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <Example title="Changing an amount" use="Edit freely, then confirm the before → after.">
            <ChangeAmountExample />
          </Example>
          <Example
            title="Several fields"
            use="See the Settings template: the bar appears only when something changed."
          >
            <Button asChild>
              <a href="/design/settings">Open settings template</a>
            </Button>
          </Example>
        </div>
      </DocSection>

      <DocSection id="optimism" title="Optimistic updates and undo">
        <RuleTable
          label="Optimistic update rules"
          head={["Approach", "Where", "Why"]}
          rows={optimism}
        />
        <p className="max-w-3xl text-sm text-muted-foreground">
          Undo is offered for actions that are cheap to reverse and were done without confirmation
          (skip a review item, toggle newsletter, delete a saved view). If an action needs a
          confirmation, it doesn't get undo, and vice versa.
        </p>
      </DocSection>

      <DocSection id="feedback" title="Feedback">
        <RuleTable
          label="Feedback rules"
          head={["Situation", "Use"]}
          rows={[
            ["An action succeeded", "notify.success: short past tense (“Donor updated”)"],
            ["An action failed inside a dialog", "Keep the dialog open, show a Callout in it"],
            ["An action failed elsewhere", "notify.error(error) — copy comes from describeError"],
            ["A page section failed to load", "ErrorState in place of the content, with Try again"],
            [
              "Something about this record needs attention",
              "Callout at the top of the relevant section",
            ],
            [
              "Work in progress",
              "Button pending state; thin progress bar on refetching tables; skeletons on first load",
            ],
          ]}
        />
      </DocSection>

      <DocSection id="keyboard" title="Keyboard">
        <div className="grid gap-6 sm:grid-cols-3">
          {shortcuts.map((section) => (
            <div key={section.group} className="grid content-start gap-2">
              <h3 className="text-sm font-semibold">{section.group}</h3>
              <ul className="grid gap-1.5 text-sm">
                {section.items.map((item) => (
                  <li key={item.label} className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="flex gap-1">
                      {item.keys.map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DocSection>

      <DocSection id="writing" title="Writing">
        <RuleTable label="Writing examples" head={["Write", "Not", "Because"]} rows={writing} />
      </DocSection>
    </DocPage>
  );
}
