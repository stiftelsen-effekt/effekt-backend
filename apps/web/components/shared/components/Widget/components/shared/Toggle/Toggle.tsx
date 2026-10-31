import styles from "./Toggle.module.scss";

export const Toggle: React.FC<{
  active: boolean;
  onChange: (active: boolean) => void;
  dataCy?: string;
}> = ({ active, onChange, dataCy }) => {
  return (
    <button
      onClick={(e) => {
        e.currentTarget.blur();
        onChange(!active);
      }}
      className={active ? `${styles.toggle} ${styles.toggleActive}` : styles.toggle}
      data-cy={dataCy}
    >
      <div className={active ? `${styles.circle} ${styles.circleActive}` : styles.circle} />
    </button>
  );
};
