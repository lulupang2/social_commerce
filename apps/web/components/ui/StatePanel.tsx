import type { ReactNode } from 'react';
import styles from './StatePanel.module.css';

interface StatePanelProps {
  icon?: ReactNode;
  title?: string;
  description: string;
  actions?: ReactNode;
  role?: 'status' | 'alert';
}

/** Shared presentation for empty, loading, and access/error states. */
export function StatePanel({ icon, title, description, actions, role }: StatePanelProps) {
  return (
    <div className={styles.panel} role={role}>
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {title ? <h2 className={styles.title}>{title}</h2> : null}
      <p className={styles.description}>{description}</p>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
