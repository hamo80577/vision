import type { ReactNode } from "react";

import { cn } from "./cn";

type StatusBadgeProps = {
  children: ReactNode;
  className?: string;
  tone?: "neutral" | "positive" | "warning" | "critical";
};

export function StatusBadge({
  children,
  className,
  tone = "neutral",
}: StatusBadgeProps) {
  return (
    <span className={cn("ui-status-badge", className)} data-tone={tone}>
      {children}
    </span>
  );
}
