import Link from "next/link";
import style from "./DataInfo.module.scss";
import { PortableText } from "@portabletext/react";
import { ProfilePage } from "../../../../pages/dashboard/ProfilePage";

export const DataInfo: React.FC<{ page: ProfilePage }> = ({ page }) => {
  return (
    <section className={style.columnswrapper}>
      <h5>{page.info_title}</h5>
      <div className={style.columns}>
        <section className={style.tax}>
          <strong>{page.tax_subtitle}</strong>
          <PortableText value={page.tax} />

          <Link
            // nosemgrep: typescript.react.security.audit.react-href-var.react-href-var -- the value comes from Sanity, edited only by staff
            href={page.tax_link ?? "/"}
            target={"_blank"}
          >
            {page.read_more_label}→
          </Link>
        </section>
        <section className={style.privacy}>
          <strong>{page.data_subtitle}</strong>
          <PortableText value={page.data} />

          <Link
            // nosemgrep: typescript.react.security.audit.react-href-var.react-href-var -- the value comes from Sanity, edited only by staff
            href={page.data_link ?? "/"}
            target={"_blank"}
          >
            {page.read_more_label}→
          </Link>
        </section>
      </div>
    </section>
  );
};
