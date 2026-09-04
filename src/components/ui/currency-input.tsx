"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Rupiah amount field. Typing "150000000" into a bare number input is where
 * finance data entry goes wrong — one zero too many is invisible. This
 * component shows the thousands-grouped value while typing ("150.000.000")
 * but submits the plain number via the hidden input that carries the real
 * `name`, so server actions receive exactly what they always did and no
 * validation schema changes. Non-numeric keystrokes and pasted separators
 * are stripped before formatting.
 */
export const CurrencyInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "name"> & {
    /** When omitted, nothing is submitted — for fields the parent sends manually. */
    name?: string;
    value?: number | string;
    onChange?: (value: number | null) => void;
  }
>(({ className, name, value, onChange, defaultValue, ...props }, ref) => {
  const toNumber = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const [display, setDisplay] = React.useState(() => {
    const n = toNumber(value ?? defaultValue);
    return n === null ? "" : n.toLocaleString("id-ID");
  });

  // Keep the visible field in sync when the parent resets the value
  // (e.g. dialog reopened with a fresh defaultValue).
  React.useEffect(() => {
    if (value !== undefined) {
      const n = toNumber(value);
      setDisplay(n === null ? "" : n.toLocaleString("id-ID"));
    }
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/[^\d]/g, "");
    const n = digits === "" ? null : Number(digits);
    setDisplay(n === null ? "" : n.toLocaleString("id-ID"));
    onChange?.(n);
  }

  return (
    <>
      {/* The value the form actually submits — plain digits, idempotent
          for existing server validation. Omitted entirely when no name is
          given (parent submits the value itself). */}
      {name ? (
        <input type="hidden" name={name} value={toNumber(value) ?? display.replace(/[^\d]/g, "")} ref={ref} />
      ) : null}
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        onChange={handleChange}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </>
  );
});
CurrencyInput.displayName = "CurrencyInput";
