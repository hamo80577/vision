import type { ReactNode } from "react";

import { cn } from "./cn";

type ActionBarProps = {
  children: ReactNode;
  className?: string;
  align?: "start" | "between" | "end";
};

export function ActionBar({ align = "between", children, className }: ActionBarProps) {
  return (
    <div className={cn("ui-action-bar", className)} data-align={align}>
      {children}
    </div>
  );
}
