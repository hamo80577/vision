import type { ReactNode } from "react";

import { cn } from "./cn";

type AppShellProps = {
  children: ReactNode;
  className?: string;
  sidebar: ReactNode;
};

export function AppShell({ children, className, sidebar }: AppShellProps) {
  return (
    <main className={cn("ui-app-shell", className)}>
      <div className="ui-app-shell__grid">
        <aside className="ui-app-shell__sidebar">{sidebar}</aside>
        <section className="ui-app-shell__main">{children}</section>
      </div>
    </main>
  );
}
