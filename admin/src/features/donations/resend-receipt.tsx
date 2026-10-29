import { useMutation } from "@tanstack/react-query";
import { MailIcon } from "lucide-react";
import { useState } from "react";
import { Callout } from "@/components/domain/callout";
import { describeError } from "@/components/domain/error-state";
import { useDiscardGuard } from "@/components/domain/unsaved-changes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { strings } from "@/lib/strings";
import { errorCode, useTRPC } from "@/lib/trpc";

const isEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value);

/** Emails the donation receipt again, to the donor or to another address. */
export function ResendReceiptDialog({
  donationId,
  email,
  size,
}: {
  donationId: number;
  /** The donor's email, where the receipt goes by default. */
  email: string;
  size?: "sm" | "md";
}) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState("");
  const [touched, setTouched] = useState(false);
  const resend = useMutation(trpc.donations.resendReceipt.mutationOptions());
  const target = override.trim() || email;
  const invalid = override.trim() !== "" && !isEmail(override.trim());
  const errorInfo = resend.error ? receiptError(resend.error) : null;
  const guard = useDiscardGuard(override.trim() !== "", () => setOpen(false));

  function onOpenChange(next: boolean) {
    if (resend.isPending) return;
    if (!next) return guard.requestClose();
    setOpen(true);
    setOverride("");
    setTouched(false);
    resend.reset();
  }

  async function send() {
    setTouched(true);
    if (invalid) return;
    try {
      await resend.mutateAsync({ id: donationId, email: override.trim() || undefined });
      setOpen(false);
      notify.success("Receipt sent", target);
    } catch {
      // shown in the dialog
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size={size}>
          <MailIcon />
          Resend receipt
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Resend receipt for donation #{donationId}?</DialogTitle>
          <DialogDescription>
            The receipt goes to <strong className="text-foreground">{email}</strong> unless you
            enter another address.
          </DialogDescription>
        </DialogHeader>
        <form
          id={`resend-${donationId}`}
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <Field
            label="Send to another address"
            hint="Optional. The donor's email is not changed."
            error={touched && invalid ? "Enter a valid email address" : undefined}
          >
            <Input
              type="email"
              value={override}
              placeholder={email}
              autoComplete="off"
              onChange={(event) => setOverride(event.target.value)}
            />
          </Field>
        </form>
        {errorInfo && (
          <Callout tone="danger" title={errorInfo.title}>
            {errorInfo.hint}
          </Callout>
        )}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} disabled={resend.isPending}>
            {strings.actions.cancel}
          </Button>
          <Button
            type="submit"
            form={`resend-${donationId}`}
            variant="primary"
            pending={resend.isPending}
          >
            <MailIcon />
            Send receipt
          </Button>
        </DialogFooter>
      </DialogContent>
      {guard.dialog}
    </Dialog>
  );
}

/** The receipt mail failing is the common case; say what it means instead of "Something went wrong". */
export function receiptError(error: unknown): { title: string; hint: string } {
  const message = error instanceof Error ? error.message : "";
  // The API answers BAD_GATEWAY with what the mail service said.
  if (errorCode(error) === "BAD_GATEWAY" || /^Receipt failed/.test(message)) {
    return {
      title: "The receipt wasn't sent",
      hint: `${message.replace(
        /\.$/,
        "",
      )}. The donor got nothing. Check the email address, then try again in a few minutes; if it keeps failing, tell the tech team.`,
    };
  }
  return describeError(error);
}
