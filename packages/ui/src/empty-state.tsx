import type { ReactNode } from "react";

import { cn } from "./cn";

type EmptyStateProps = {
  action?: ReactNode;
  className?: string;
  description: string;
  eyebrow?: string;
  title: string;
};

export function EmptyState({
  action,
  className,
  description,
  eyebrow,
  title,
}: EmptyStateProps) {
  return (
    <div className={cn("ui-empty-state", className)}>
      {eyebrow ? <p className="ui-empty-state__eyebrow">{eyebrow}</p> : null}
      <h2 className="ui-empty-state__title">{title}</h2>
      <p className="ui-empty-state__description">{description}</p>
      {action ? <div className="ui-empty-state__action">{action}</div> : null}
    </div>
  );
}
