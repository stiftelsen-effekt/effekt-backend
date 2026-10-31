import React, { useContext } from "react";
import { WidgetTooltipContext } from "../../Widget";
import { ToolTipIcon } from "./ToolTipIcon";
import styles from "./ToolTip.module.scss";

export const ToolTip: React.FC<{ text: string; linkUrl?: string }> = ({ text, linkUrl }) => {
  const [, setTooltip] = useContext(WidgetTooltipContext);
  return (
    <div className={styles.wrapper}>
      <ToolTipIcon
        toggleTooltip={(state: boolean) =>
          state ? setTooltip({ text, link: linkUrl }) : setTooltip(null)
        }
        onClick={() => linkUrl && window.open(linkUrl, "_blank")}
      />
    </div>
  );
};
