import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { Callout } from "@/components/domain/callout";
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
import { useTRPC } from "@/lib/trpc";
import { emailMessage, ssnMessage, toFormErrors, type FormErrors } from "./form-errors";

/** What the ssn field accepts, for the hint. */
export const ssnHint = "Fødselsnummer (11 digits) or organization number (9 digits)";

type Fields = "email" | "name" | "ssn";

/** Create donor: email and name, and a tax unit when an ssn is given. Opens the new donor. */
export function CreateDonorDialog({ trigger }: { trigger: ReactNode }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ email: "", name: "", ssn: "" });
  const [errors, setErrors] = useState<FormErrors<Fields>>({ fields: {} });

  const create = useMutation(
    trpc.donors.create.mutationOptions({
      onSuccess: async (donor) => {
        await queryClient.invalidateQueries({ queryKey: trpc.donors.list.pathKey() });
        notify.success("Donor created", `${donor.name} · #${donor.id}`);
        setOpen(false);
        void navigate({ to: "/donors/$id", params: { id: String(donor.id) } });
      },
      onError: (error) => setErrors(toFormErrors(error, { ssn: ssnMessage, email: emailMessage })),
    }),
  );

  function onOpenChange(next: boolean) {
    if (create.isPending) return;
    setOpen(next);
    if (next) {
      setValues({ email: "", name: "", ssn: "" });
      setErrors({ fields: {} });
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const missing: Partial<Record<Fields, string>> = {};
    if (!values.email.trim()) missing.email = "Enter the donor's email";
    if (!values.name.trim()) missing.name = "Enter the donor's name";
    if (Object.keys(missing).length) return setErrors({ fields: missing });
    setErrors({ fields: {} });
    create.mutate({
      email: values.email.trim(),
      name: values.name.trim(),
      ssn: values.ssn.trim() || undefined,
    });
  }

  const set = (field: Fields) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create donor</DialogTitle>
          <DialogDescription>
            For donors who give outside the website, e.g. by bank transfer.
          </DialogDescription>
        </DialogHeader>
        <form id="create-donor" className="grid gap-4" onSubmit={submit} noValidate>
          <Field label="Email" error={errors.fields.email} required>
            <Input type="email" value={values.email} onChange={set("email")} autoFocus />
          </Field>
          <Field label="Name" error={errors.fields.name} required>
            <Input value={values.name} onChange={set("name")} autoComplete="off" />
          </Field>
          <Field
            label="Tax ID"
            hint={`${ssnHint}. Optional; creates a tax unit in the donor's name.`}
            error={errors.fields.ssn}
          >
            <Input
              value={values.ssn}
              onChange={set("ssn")}
              inputMode="numeric"
              autoComplete="off"
              className="num"
            />
          </Field>
          {errors.form && (
            <Callout tone="danger" title={errors.form.title}>
              {errors.form.hint}
            </Callout>
          )}
        </form>
        <DialogFooter>
          <Button disabled={create.isPending} onClick={() => onOpenChange(false)}>
            {strings.actions.cancel}
          </Button>
          <Button type="submit" form="create-donor" variant="primary" pending={create.isPending}>
            Create donor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
