import type { ReactNode } from "react";

import { cn } from "./cn";

type DefinitionGridItem = {
  label: string;
  value: ReactNode;
};

type DefinitionGridProps = {
  className?: string;
  columns?: 2 | 3;
  items: DefinitionGridItem[];
};

export function DefinitionGrid({
  className,
  columns = 2,
  items,
}: DefinitionGridProps) {
  return (
    <dl className={cn("ui-definition-grid", className)} data-columns={columns}>
      {items.map((item) => (
        <div className="ui-definition-grid__item" key={item.label}>
          <dt className="ui-definition-grid__label">{item.label}</dt>
          <dd className="ui-definition-grid__value">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
