import type { ReactNode } from "react";

import { StatusBadge, SurfaceCard } from "@vision/ui";

import styles from "./platform-auth.module.css";

type PlatformAuthShellProps = {
  children: ReactNode;
  footerNote?: string;
  subtitle?: string;
  title: string;
};

export function PlatformAuthShell({
  children,
  footerNote,
  subtitle,
  title,
}: PlatformAuthShellProps) {
  return (
    <main className={styles.page}>
      <div className={styles.frame}>
        <SurfaceCard className={styles.card}>
          <div className={styles.header}>
            <img alt="Vision" className={styles.logo} src="/main_logo.svg" />
            <div className={styles.headerCopy}>
              <h1 className={styles.title}>{title}</h1>
              {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
            </div>
          </div>
          {children}
        </SurfaceCard>
        {footerNote ? (
          <div className={styles.footerBadge}>
            <StatusBadge tone="neutral">{footerNote}</StatusBadge>
          </div>
        ) : null}
      </div>
    </main>
  );
}
