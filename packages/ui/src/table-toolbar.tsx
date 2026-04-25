import type { ReactNode } from "react";

import { cn } from "./cn";

type TableToolbarProps = {
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
  description?: string;
  title?: string;
};

export function TableToolbar({
  actions,
  children,
  className,
  description,
  title,
}: TableToolbarProps) {
  return (
    <div className={cn("ui-table-toolbar", className)}>
      {title || description ? (
        <div className="ui-table-toolbar__copy">
          {title ? <h2 className="ui-table-toolbar__title">{title}</h2> : null}
          {description ? <p className="ui-table-toolbar__description">{description}</p> : null}
        </div>
      ) : null}
      <div className="ui-table-toolbar__controls">
        {children}
        {actions}
      </div>
    </div>
  );
}
