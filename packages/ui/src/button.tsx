import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "./cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  leadingIcon?: ReactNode;
  size?: "md" | "lg";
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({
  busy = false,
  children,
  className,
  disabled,
  leadingIcon,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn("ui-button", className)}
      data-size={size}
      data-variant={variant}
      disabled={disabled || busy}
      type={type}
      {...props}
    >
      {busy ? <span aria-hidden="true" className="ui-button__spinner" /> : leadingIcon}
      <span>{children}</span>
    </button>
  );
}
