import type { ReactNode } from "react";

import { cn } from "./cn";

type SurfaceCardProps = {
  children: ReactNode;
  className?: string;
  tone?: "base" | "accent" | "muted";
};

export function SurfaceCard({
  children,
  className,
  tone = "base",
}: SurfaceCardProps) {
  return (
    <section className={cn("ui-card", className)} data-tone={tone}>
      <div className="ui-card__content">{children}</div>
    </section>
  );
}
