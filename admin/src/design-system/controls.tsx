import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderIcon, PlusIcon, SaveIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Section } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Specimen, SpecimenGrid } from "./specimen";

const organizations = [
  { value: "amf", label: "Against Malaria Foundation", hint: "AMF" },
  { value: "gd", label: "GiveDirectly", hint: "GD" },
  { value: "hki", label: "Helen Keller International", hint: "HKI" },
  { value: "mc", label: "Malaria Consortium", hint: "MC" },
  { value: "nti", label: "New Incentives", hint: "NI" },
  { value: "sci", label: "Unlimit Health", hint: "UH" },
];

export function ButtonsSection() {
  return (
    <Section title="Buttons" description="One button, five variants, three sizes plus icon sizes.">
      <SpecimenGrid>
        <Specimen title="Variants">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">
            <Trash2Icon />
            Delete
          </Button>
          <Button variant="link">Link</Button>
        </Specimen>
        <Specimen title="Sizes and icons">
          <Button size="sm">
            <PlusIcon />
            Small
          </Button>
          <Button size="md">Medium</Button>
          <Button size="lg">
            <UploadIcon />
            Large
          </Button>
          <Button size="icon-sm" variant="outline" aria-label="Add">
            <PlusIcon />
          </Button>
          <Button size="icon" variant="outline" aria-label="Add">
            <PlusIcon />
          </Button>
          <Button size="icon-lg" aria-label="Add">
            <PlusIcon />
          </Button>
        </Specimen>
        <Specimen title="States">
          <Button disabled>Disabled</Button>
          <Button variant="outline" disabled>
            Disabled
          </Button>
          <Button disabled>
            <LoaderIcon className="animate-spin" />
            Saving…
          </Button>
        </Specimen>
      </SpecimenGrid>
    </Section>
  );
}

export function InputsSection() {
  const [org, setOrg] = useState<string | null>("amf");
  const [range, setRange] = useState<DateRange | undefined>({
    from: new Date("2026-09-01"),
    to: new Date("2026-09-30"),
  });
  const [day, setDay] = useState<Date | undefined>(new Date("2026-10-24"));

  return (
    <Section
      title="Inputs"
      description="32px controls, 2px radius, a solid focus ring. Invalid uses destructive border only."
    >
      <SpecimenGrid>
        <Specimen title="Text input" bodyClassName="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ds-name">Name</Label>
            <Input id="ds-name" placeholder="Full name" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ds-amount">Amount</Label>
            <Input id="ds-amount" type="number" defaultValue={1500} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ds-invalid">Email</Label>
            <Input id="ds-invalid" aria-invalid defaultValue="not-an-email" />
            <p className="text-xs text-destructive">Enter a valid email address.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ds-disabled">KID</Label>
            <Input id="ds-disabled" disabled defaultValue="10422781" />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ds-note">Note</Label>
            <Textarea id="ds-note" placeholder="Internal note about this donor…" />
          </div>
        </Specimen>

        <Specimen title="Select and combobox" bodyClassName="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Payment method</Label>
            <Select defaultValue="vipps">
              <SelectTrigger>
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Recurring</SelectLabel>
                  <SelectItem value="avtalegiro">AvtaleGiro</SelectItem>
                  <SelectItem value="vipps">Vipps recurring</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>One-off</SelectLabel>
                  <SelectItem value="bank">Bank transfer</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Organization</Label>
            <Combobox
              options={organizations}
              value={org}
              onValueChange={setOrg}
              placeholder="Pick organization"
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Date range</Label>
            <DateRangePicker value={range} onValueChange={setRange} />
          </div>
        </Specimen>

        <Specimen title="Choice controls" bodyClassName="grid gap-5 sm:grid-cols-3">
          <div className="grid gap-2.5">
            <Label className="font-normal">
              <Checkbox defaultChecked /> Send receipt
            </Label>
            <Label className="font-normal">
              <Checkbox checked="indeterminate" /> Some selected
            </Label>
            <Label className="font-normal">
              <Checkbox /> Anonymous
            </Label>
            <Label className="font-normal">
              <Checkbox disabled /> Disabled
            </Label>
          </div>
          <div className="grid gap-2.5">
            <Label className="font-normal">
              <Switch defaultChecked /> Newsletter
            </Label>
            <Label className="font-normal">
              <Switch /> Trusted donor
            </Label>
            <Label className="font-normal">
              <Switch disabled /> Disabled
            </Label>
          </div>
          <RadioGroup defaultValue="person">
            <Label className="font-normal">
              <RadioGroupItem value="person" /> Person
            </Label>
            <Label className="font-normal">
              <RadioGroupItem value="company" /> Company
            </Label>
            <Label className="font-normal">
              <RadioGroupItem value="none" disabled /> Disabled
            </Label>
          </RadioGroup>
        </Specimen>

        <Specimen title="Calendar" bodyClassName="justify-center p-2">
          <Calendar mode="single" selected={day} onSelect={setDay} defaultMonth={day} />
        </Specimen>
      </SpecimenGrid>
    </Section>
  );
}

const donorSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  email: z.email("Enter a valid email address"),
  ssn: z
    .string()
    .trim()
    .regex(/^(\d{11}|\d{9})$/, "11-digit national ID or 9-digit org. number")
    .or(z.literal("")),
  newsletter: z.boolean(),
});

type DonorForm = z.infer<typeof donorSchema>;

export function FormSection() {
  const form = useForm<DonorForm>({
    resolver: zodResolver(donorSchema),
    defaultValues: { name: "Ingrid Hansen", email: "ingrid@", ssn: "", newsletter: true },
    mode: "onTouched",
  });

  return (
    <Section
      title="Forms"
      description="react-hook-form + zod. Labels above fields, errors below, primary action last."
    >
      <div className="max-w-xl border border-border p-5">
        <Form {...form}>
          <form
            className="grid gap-4"
            onSubmit={form.handleSubmit((values) =>
              toast.success("Donor saved", { description: `${values.name} · ${values.email}` }),
            )}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="ssn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>National ID / org. number</FormLabel>
                  <FormControl>
                    <Input inputMode="numeric" className="num" {...field} />
                  </FormControl>
                  <FormDescription>Optional. Needed for tax deduction reporting.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newsletter"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="font-normal">Subscribed to newsletter</FormLabel>
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => form.reset()}>
                Reset
              </Button>
              <Button type="submit">
                <SaveIcon />
                Save donor
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Section>
  );
}
