import { createFileRoute, Link } from "@tanstack/react-router";
import { MailIcon } from "lucide-react";
import { EmptyState } from "@/components/domain/empty-state";
import { CopyValue } from "@/components/domain/copy-value";
import { DateTime, Money } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import { useRecordParams } from "@/components/panels";
import { DetailPage, DetailPanel } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { donations, donorDonations } from "@/design-system/fake-data";
import { notify } from "@/lib/notify";

/**
 * A small donation page for the panel demos: list rows open it as a panel, its donor link
 * opens the donor demo on top, and that page's donation rows open this again.
 */
export const Route = createFileRoute("/design/donations/$id")({
  component: DonationDemo,
});

function DonationDemo() {
  const { id } = useRecordParams(Route);
  const donation =
    donations.find((d) => String(d.id) === id) ?? donorDonations.find((d) => String(d.id) === id);
  if (!donation)
    return <EmptyState title="No such donation" description={`#${id}`} className="flex-1" />;
  const kid = "kid" in donation ? donation.kid : donation.KID ?? "";

  return (
    <DetailPage
      breadcrumbs={[{ label: "Donations", to: "/design/list" }]}
      title={<Money value={donation.sum} />}
      meta={[
        <CopyValue key="id" value={id} prefix="#" label="donation ID" />,
        <DateTime key="date" value={donation.timestamp} format="datetime" />,
      ]}
      actions={
        <Button onClick={() => notify.success("Receipt sent", donation.email)}>
          <MailIcon />
          Resend receipt
        </Button>
      }
    >
      <DetailPanel title="Donation">
        <PropertyList>
          <Property label="Donor">
            <Link
              to="/design/detail"
              className="rounded-xs font-semibold text-accent hover:underline focus-ring"
            >
              {donation.donor}
            </Link>
          </Property>
          <Property label="Email">{donation.email}</Property>
          <Property label="Method">{donation.paymentMethod}</Property>
          <Property label="Fee">
            <Money value={donation.transactionCost} />
          </Property>
          <Property label="KID">
            <CopyValue value={kid} label="KID" />
          </Property>
        </PropertyList>
      </DetailPanel>
    </DetailPage>
  );
}
