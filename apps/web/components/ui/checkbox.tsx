"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

type CheckedState = boolean | "indeterminate";
type CheckboxProps = Omit<React.ComponentProps<"input">, "checked" | "type"> & {
  checked?: CheckedState;
  onCheckedChange?: (checked: boolean) => void;
};

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, defaultChecked, onChange, onCheckedChange, disabled, ...props }, forwardedRef) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const [internalChecked, setInternalChecked] = React.useState(Boolean(defaultChecked));
    const currentChecked = checked === undefined ? internalChecked : checked;
    const state =
      currentChecked === "indeterminate" ? "indeterminate" : currentChecked ? "checked" : "unchecked";

    React.useEffect(() => {
      if (inputRef.current) inputRef.current.indeterminate = currentChecked === "indeterminate";
    }, [currentChecked]);

    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    return (
      <span
        data-slot="checkbox"
        data-state={state}
        data-disabled={disabled ? "true" : undefined}
        className={cn(
          "relative inline-grid size-[1.125rem] shrink-0 place-items-center rounded-[0.3rem] border border-input bg-card text-primary-foreground shadow-xs transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring/50 has-focus-visible:ring-offset-1 has-focus-visible:ring-offset-background data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[disabled=true]:opacity-50",
          className,
        )}
      >
        <input
          ref={setRefs}
          type="checkbox"
          checked={checked === "indeterminate" ? false : checked}
          defaultChecked={checked === undefined ? defaultChecked : undefined}
          disabled={disabled}
          aria-checked={currentChecked === "indeterminate" ? "mixed" : currentChecked}
          className="absolute inset-0 size-full cursor-pointer appearance-none rounded-[inherit] outline-none disabled:cursor-not-allowed"
          onChange={(event) => {
            if (checked === undefined) setInternalChecked(event.currentTarget.checked);
            onChange?.(event);
            onCheckedChange?.(event.currentTarget.checked);
          }}
          {...props}
        />
        {currentChecked === "indeterminate" ? (
          <Minus className="pointer-events-none size-3.5" strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <Check
            className={cn("pointer-events-none size-3.5 opacity-0", currentChecked && "opacity-100")}
            strokeWidth={2.5}
            aria-hidden="true"
          />
        )}
      </span>
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox, type CheckedState };
