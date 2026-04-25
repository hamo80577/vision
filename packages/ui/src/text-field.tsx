import type { InputHTMLAttributes } from "react";

import { cn } from "./cn";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
  hint?: string;
  inputClassName?: string;
  label: string;
};

export function TextField({
  className,
  error,
  hint,
  id,
  inputClassName,
  label,
  ...props
}: TextFieldProps) {
  const hintId = id ? `${id}-hint` : undefined;
  const errorId = id ? `${id}-error` : undefined;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <label className={cn("ui-field", className)} htmlFor={id}>
      <span className="ui-field__header">
        <span className="ui-field__label">{label}</span>
        {hint ? (
          <span className="ui-field__hint" id={hintId}>
            {hint}
          </span>
        ) : null}
      </span>
      <input
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? "true" : "false"}
        className={cn("ui-field__control", inputClassName)}
        id={id}
        {...props}
      />
      {error ? (
        <span className="ui-field__error" id={errorId}>
          {error}
        </span>
      ) : null}
    </label>
  );
}
