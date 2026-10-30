import React from "react";
import styles from "./HTMLEmbed.module.scss";

export const HTMLEmbed: React.FC<{
  code: string;
  grayscale?: boolean;
  fullwidth?: boolean;
}> = ({ code, grayscale, fullwidth }) => {
  const classNames = [styles.wrapper];
  if (grayscale) classNames.push(styles.grayscale);
  if (fullwidth) classNames.push(styles.fullwidth);

  return (
    <div
      className={classNames.join(" ")}
      // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml -- embedding staff-authored HTML from Sanity is this block's purpose
      dangerouslySetInnerHTML={{ __html: code }}
    ></div>
  );
};
