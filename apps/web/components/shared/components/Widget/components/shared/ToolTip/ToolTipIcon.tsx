import styles from "./ToolTip.module.scss";

interface ToolIconProps {
  toggleTooltip: (state: boolean) => void;
  onClick: () => void;
}
export function ToolTipIcon({ toggleTooltip, onClick }: ToolIconProps) {
  return (
    <button
      name="Info om skattefradrag"
      type="button"
      className={styles.iconButton}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") {
          e.currentTarget.focus();
        }
      }}
      // Small timeout to prevent tooltip from closing when clicking on the tooltip link
      onBlur={() => setTimeout(() => toggleTooltip(false), 10)}
      // Slighly longer timeout to make sure the tooltip is not closed when clicking on a second tooltip icon
      onFocus={() => setTimeout(() => toggleTooltip(true), 20)}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") {
          onClick();
        } else {
          if (e.currentTarget === document.activeElement) {
            e.currentTarget.blur();
            e.preventDefault();
          } else {
            e.currentTarget.focus();
            e.preventDefault();
          }
        }
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") {
          e.currentTarget.blur();
        }
      }}
    >
      <div className={styles.innerIcon}>?</div>
    </button>
  );
}
