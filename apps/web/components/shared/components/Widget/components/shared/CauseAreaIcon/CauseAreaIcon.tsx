import styles from "./CauseAreaIcon.module.scss";

const iconClassById: Record<number, string> = {
  1: styles.globalHealth,
  2: styles.animalWelfare,
  3: styles.futureGenerations,
  4: styles.operations,
  5: styles.other,
};

/** The cause area's icon, or an empty icon-sized box for a cause area without one */
export const CauseAreaIcon: React.FC<{ id: number }> = ({ id }) => (
  <div className={[styles.icon, iconClassById[id]].filter(Boolean).join(" ")} />
);

export const getCauseAreaIconById = (id: number) => <CauseAreaIcon id={id} />;

export const MultipleCauseAreaIcon: React.FC = () => (
  <div className={`${styles.icon} ${styles.multiple}`} />
);
