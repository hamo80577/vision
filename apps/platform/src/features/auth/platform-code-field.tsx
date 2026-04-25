"use client";

import { useMemo, useRef, useState } from "react";

import styles from "./platform-auth.module.css";

type PlatformCodeFieldProps = {
  autoFocus?: boolean;
  error?: string | null;
  hint?: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
};

export function PlatformCodeField({
  autoFocus = false,
  error,
  hint,
  id,
  label,
  onChange,
  value,
}: PlatformCodeFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const digits = useMemo(
    () => Array.from({ length: 6 }, (_, index) => value[index] ?? ""),
    [value],
  );
  const activeIndex = value.length >= 6 ? 5 : value.length;

  return (
    <label className={styles.codeField} htmlFor={id}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        className={styles.codeInput}
        id={id}
        inputMode="numeric"
        maxLength={6}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          onChange(event.target.value.replace(/\D/g, "").slice(0, 6));
        }}
        onFocus={() => setFocused(true)}
        pattern="[0-9]{6}"
        ref={inputRef}
        value={value}
      />
      <div
        aria-hidden="true"
        className={styles.codeSlots}
        onClick={() => inputRef.current?.focus()}
      >
        {digits.map((digit, index) => (
          <span
            className={`${styles.codeSlot}${error ? ` ${styles.codeSlotError}` : ""}`}
            data-active={focused && index === activeIndex && value.length < 6}
            data-filled={digit.length > 0}
            key={`${id}-${index}`}
          >
            {digit}
          </span>
        ))}
      </div>
      {error ? <span className={styles.fieldError}>{error}</span> : null}
      {hint ? <span className={styles.fieldHint}>{hint}</span> : null}
    </label>
  );
}
