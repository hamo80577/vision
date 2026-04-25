import { cn } from "./cn";

type CheckboxOption = {
  checked: boolean;
  description?: string;
  disabled?: boolean;
  label: string;
  value: string;
};

type CheckboxGroupProps = {
  className?: string;
  hint?: string;
  label: string;
  name?: string;
  onChange: (value: string, checked: boolean) => void;
  options: CheckboxOption[];
};

export function CheckboxGroup({
  className,
  hint,
  label,
  name,
  onChange,
  options,
}: CheckboxGroupProps) {
  return (
    <fieldset className={cn("ui-checkbox-group", className)}>
      <legend className="ui-checkbox-group__legend">{label}</legend>
      {hint ? <p className="ui-checkbox-group__hint">{hint}</p> : null}
      <div className="ui-checkbox-group__options">
        {options.map((option) => (
          <label
            className="ui-checkbox-group__option"
            data-disabled={option.disabled ? "true" : "false"}
            key={option.value}
          >
            <span className="ui-checkbox-group__control">
              <input
                checked={option.checked}
                disabled={option.disabled}
                name={name}
                onChange={(event) => onChange(option.value, event.target.checked)}
                type="checkbox"
                value={option.value}
              />
              <span className="ui-checkbox-group__checkmark" />
            </span>
            <span className="ui-checkbox-group__copy">
              <span className="ui-checkbox-group__label">{option.label}</span>
              {option.description ? (
                <span className="ui-checkbox-group__description">{option.description}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
