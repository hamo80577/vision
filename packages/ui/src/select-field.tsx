import type { SelectHTMLAttributes } from "react";

import { cn } from "./cn";

type SelectOption = {
  label: string;
  value: string;
};

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  error?: string;
  hint?: string;
  label: string;
  options: SelectOption[];
};

export function SelectField({
  className,
  error,
  hint,
  id,
  label,
  options,
  ...props
}: SelectFieldProps) {
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
      <select
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? "true" : "false"}
        className="ui-field__control ui-select-field__control"
        id={id}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <span className="ui-field__error" id={errorId}>
          {error}
        </span>
      ) : null}
    </label>
  );
}
