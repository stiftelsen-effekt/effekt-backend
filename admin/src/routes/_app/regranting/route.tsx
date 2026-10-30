import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Callout } from "@/components/domain/callout";
import { config } from "@/lib/config";

export const Route = createFileRoute("/_app/regranting")({
  beforeLoad: () => {
    if (!config.features.regranting) throw redirect({ to: "/" });
  },
  component: RegrantingLayout,
});

function RegrantingLayout() {
  if (config.features.regrantingBackfilled) return <Outlet />;
  return (
    <>
      <Callout
        tone="warning"
        title="Past rounds aren't imported yet"
        className="mx-4 mt-4 lg:mx-8 lg:mt-6"
      >
        Balances count every donation ever received as owed, so they aren't real yet. Don't approve
        or pay rounds from these numbers.
      </Callout>
      <Outlet />
    </>
  );
}
