import { cn } from "./cn";

type SwitchFieldProps = {
  checked: boolean;
  className?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
  label: string;
  name?: string;
  onCheckedChange: (checked: boolean) => void;
};

export function SwitchField({
  checked,
  className,
  description,
  disabled = false,
  id,
  label,
  name,
  onCheckedChange,
}: SwitchFieldProps) {
  return (
    <label className={cn("ui-switch-field", className)} data-disabled={disabled ? "true" : "false"}>
      <span className="ui-switch-field__copy">
        <span className="ui-switch-field__label">{label}</span>
        {description ? (
          <span className="ui-switch-field__description">{description}</span>
        ) : null}
      </span>
      <span className="ui-switch-field__control">
        <input
          checked={checked}
          disabled={disabled}
          id={id}
          name={name}
          onChange={(event) => onCheckedChange(event.target.checked)}
          type="checkbox"
        />
        <span className="ui-switch-field__track" />
      </span>
    </label>
  );
}
