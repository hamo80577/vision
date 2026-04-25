"use client";

import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AppShell } from "@vision/ui";

import type { PlatformAuthSession } from "../../lib/platform-auth";
import styles from "./platform-shell.module.css";

type PlatformShellProps = {
  auth: PlatformAuthSession;
  children: ReactNode;
};

type NavItem = {
  href: string;
  icon: string;
  label: string;
  match: (pathname: string) => boolean;
};

const navigation: NavItem[] = [
  {
    href: "/tenants",
    label: "Tenants",
    icon: "▦",
    match: (pathname) => pathname.startsWith("/tenants"),
  },
];

function initialsFromIdentifier(identifier: string): string {
  const pieces = identifier.split(/[@._-]/).filter(Boolean);

  return (pieces[0]?.slice(0, 1) ?? "P").toUpperCase();
}

export function PlatformShell({ auth, children }: PlatformShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  function toggleSidebar() {
    setCollapsed((current) => !current);
  }

  async function handleLogout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoggingOut(true);

    try {
      const csrfToken = document.cookie
        .split("; ")
        .find((entry) => entry.startsWith("vision_auth_csrf="))
        ?.split("=")[1];

      await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrfToken ? { "x-vision-csrf-token": decodeURIComponent(csrfToken) } : {}),
        },
        body: JSON.stringify({}),
      });
    } finally {
      window.location.assign("/login");
    }
  }

  const navigationId = "platform-sidebar-navigation";

  const sidebar = (
    <aside
      aria-label="Platform sidebar"
      className={styles.sidebar}
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className={styles.sidebarTop}>
        <div className={styles.brandBlock}>
          <div className={styles.brandMark}>
            <img alt="Vision" src="/favicon.svg" />
          </div>
          <div className={styles.brandCopy}>
            <p className={styles.brandTitle}>Vision</p>
            <p className={styles.brandSubtitle}>Enterprise Admin</p>
          </div>
          <button
            aria-controls={navigationId}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Open sidebar" : "Close sidebar"}
            className={styles.sidebarToggle}
            onClick={toggleSidebar}
            type="button"
          >
            <span aria-hidden="true">{collapsed ? "+" : "-"}</span>
          </button>
        </div>

        <nav aria-label="Platform navigation" className={styles.nav} id={navigationId}>
          {navigation.map((item) => (
            <Link
              className={styles.navItem}
              data-active={item.match(pathname) ? "true" : "false"}
              href={item.href}
              key={item.href}
            >
              <span aria-hidden="true" className={styles.navIcon}>
                {item.icon}
              </span>
              <span className={styles.navItemTitle}>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className={styles.sidebarFooter}>
        <div className={styles.sessionBlock}>
          <div className={styles.avatar}>{initialsFromIdentifier(auth.subject.loginIdentifier)}</div>
          <div className={styles.sessionCopy}>
            <p className={styles.sessionValue}>{auth.subject.loginIdentifier}</p>
            <p className={styles.sessionRole}>Platform admin</p>
          </div>
          <form className={styles.logoutForm} onSubmit={handleLogout}>
            <button className={styles.logoutButton} disabled={loggingOut} type="submit">
              {loggingOut ? "Logging out" : "Logout"}
            </button>
          </form>
        </div>
      </div>
    </aside>
  );

  return (
    <AppShell className={collapsed ? styles.shellCollapsed : styles.shell} sidebar={sidebar}>
      <div className={styles.content}>
        <header className={styles.topBar}>
          <div className={styles.topBarSpacer} />
          <div className={styles.topBarMeta}>
            <div className={styles.topBarAvatar}>{initialsFromIdentifier(auth.subject.loginIdentifier)}</div>
          </div>
        </header>
        <div className={styles.pageContent}>{children}</div>
      </div>
    </AppShell>
  );
}
