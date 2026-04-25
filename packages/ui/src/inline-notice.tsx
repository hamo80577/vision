import type { ReactNode } from "react";

import { cn } from "./cn";

type InlineNoticeProps = {
  title: string;
  description?: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "critical";
  className?: string;
};

export function InlineNotice({
  className,
  description,
  title,
  tone = "neutral",
}: InlineNoticeProps) {
  return (
    <div className={cn("ui-inline-notice", className)} data-tone={tone} role="status">
      <p className="ui-inline-notice__title">{title}</p>
      {description ? <p className="ui-inline-notice__description">{description}</p> : null}
    </div>
  );
}
