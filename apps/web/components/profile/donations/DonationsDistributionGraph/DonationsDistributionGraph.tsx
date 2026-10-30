import style from "./DonationsDistributionGraph.module.scss";
import { Distribution } from "../../../../models";
import { thousandize } from "../../../../util/formatting";
import { toNumber } from "../../../../util/decimal";

export const DonationsDistributionGraph: React.FC<{ sum: string; distribution: Distribution }> = ({
  sum,
  distribution,
}) => {
  const max = Math.max(
    ...distribution.causeAreas[0].organizations.map((org) => toNumber(org.percentageShare)),
  );
  const organizations = [...distribution.causeAreas[0].organizations].sort(
    (a, b) => toNumber(b.percentageShare) - toNumber(a.percentageShare),
  );

  return (
    <div className={style.wrapper} data-cy="donation-distribution-graph">
      <div className={style.bars}>
        {organizations.map((dist) => (
          <div
            key={dist.name}
            className={style.bar}
            style={{ width: `${(toNumber(dist.percentageShare) / max) * 100}%` }}
            data-cy="donation-distribution-graph-bar"
          >
            <div key={dist.name} className={style.label}>
              <div>{dist.name}</div>
              <div>
                {thousandize(Math.round((toNumber(dist.percentageShare) / 100) * toNumber(sum)))} kr
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
