import { cn } from "./cn";

type LoadingSkeletonProps = {
  className?: string;
  rows?: number;
  variant?: "card" | "table";
};

export function LoadingSkeleton({
  className,
  rows = 3,
  variant = "card",
}: LoadingSkeletonProps) {
  return (
    <div className={cn("ui-loading-skeleton", className)} data-variant={variant}>
      {Array.from({ length: rows }, (_, index) => (
        <span className="ui-loading-skeleton__row" key={`${variant}-${index}`} />
      ))}
    </div>
  );
}
