import Link from "next/link";
import React from "react";
import { ToolTip } from "../../shared/ToolTip/ToolTip";
import styles from "./CustomCheckBox.module.scss";

interface HyperLink {
  text: string;
  url: string;
}

interface CheckBoxProps {
  checked: boolean;
  label?: string;
  mobileLabel?: string;
  showTooltip?: boolean;
  tooltipText?: string;
  hyperlink?: HyperLink;
}

export const CustomCheckBox: React.FC<CheckBoxProps> = ({
  checked,
  label,
  showTooltip,
  tooltipText,
  hyperlink,
}) => (
  <span className={styles.customCheckBoxWrapper}>
    <div className={styles.inputWrapper}>
      <input className={styles.input} type="checkbox" tabIndex={-1} checked={checked} readOnly />
      <span className={styles.checkBox}>
        <span className={`${styles.checkMark} checkmark`}>✓</span>
      </span>

      <div>
        <p className={styles.label}>
          {`${label} `}
          {hyperlink && (
            <Link
              // nosemgrep: typescript.react.security.audit.react-href-var.react-href-var -- the value comes from Sanity, edited only by staff
              href={hyperlink.url}
              target="_blank"
            >
              {`${hyperlink.text} ↗`}
            </Link>
          )}
        </p>
      </div>
    </div>
    <div className={styles.toolTipWrapper}>
      {showTooltip && tooltipText && <ToolTip text={tooltipText} />}
    </div>
  </span>
);
