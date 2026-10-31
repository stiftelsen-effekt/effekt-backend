import { useEffect, useState } from "react";
import { thousandize } from "../../../../util/formatting";

import styles from "./ResultsTeaser.module.scss";
import LinkButton from "../../../shared/components/EffektButton/LinkButton";
import { NavLink } from "../../../shared/components/Navbar/Navbar";
import { publicTrpcFor } from "../../../../lib/trpc/client";

export const ResultsTeaser: React.FC<{
  title: string;
  sumSubtitle?: string;
  donorsSubtitle?: string;
  seeMoreButton?: NavLink;
  locale: string;
}> = ({ sumSubtitle, donorsSubtitle, seeMoreButton, locale }) => {
  const [data, setData] = useState<{
    totalDonationsToRecommendedOrgs: string | number;
    numberOfDonors: string | number;
    lastUpdated: string;
  } | null>(null);

  useEffect(() => {
    // tRPC site.resultsHeadline; on the Danish site the REST link maps it to GET /results/headline
    publicTrpcFor(locale).site.resultsHeadline.query().then(setData).catch(console.error);
  }, [locale]);

  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        <div>
          <span className={styles.headlineNumber} data-cy="results-teaser-sum">
            {thousandize(
              Math.round(parseFloat(String(data?.totalDonationsToRecommendedOrgs ?? "0"))),
              locale,
            )}{" "}
            kr
          </span>
          <span>{sumSubtitle}</span>
        </div>

        <div>
          <span className={styles.headlineNumber} data-cy="results-teaser-donors">
            {thousandize(Number(data?.numberOfDonors ?? 0), locale)}
          </span>
          <span>{donorsSubtitle}</span>
        </div>
        {seeMoreButton && seeMoreButton.slug && (
          <div>
            <LinkButton
              url={"/" + seeMoreButton.slug}
              title={seeMoreButton.title || "See more"}
            ></LinkButton>
          </div>
        )}
      </div>
    </div>
  );
};
