import { getClient } from "../../../../../lib/sanity.client";
import { withStaticProps } from "../../../../../util/withStaticProps";
import { Widget, widgetQuery } from "./Widget";
import { WidgetProps } from "../types/WidgetProps";
import { token } from "../../../../../token";
import { PrefilledDistribution } from "../../../../main/layout/WidgetPane/WidgetPane";
import { RecurringDonation } from "../types/Enums";
import { WidgetStoreProvider } from "../store/store";

// An inline widget (DonationWidgetBlock), with a store of its own
export const WidgetWithStore = withStaticProps(
  async ({
    draftMode,
    inline,
    prefilled,
    prefilledSum,
    defaultPaymentType,
  }: {
    draftMode: boolean;
    inline?: boolean;
    prefilled?: PrefilledDistribution;
    prefilledSum?: number;
    defaultPaymentType?: RecurringDonation;
  }) => {
    const result = await getClient(draftMode ? token : undefined).fetch<WidgetProps>(widgetQuery);

    if (!result.methods?.length) {
      throw new Error("No payment methods found");
    }

    return {
      data: {
        result,
        query: widgetQuery,
      },
      inline: inline ?? false,
      prefilled: prefilled ?? null,
      prefilledSum: prefilledSum ?? null,
      defaultPaymentType: defaultPaymentType ?? RecurringDonation.NON_RECURRING,
    };
  },
)(({ data, inline = false, prefilled, defaultPaymentType }) => {
  return (
    <WidgetStoreProvider>
      <Widget
        data={data}
        inline={inline}
        prefilled={prefilled}
        defaultPaymentType={defaultPaymentType}
      />
    </WidgetStoreProvider>
  );
});
