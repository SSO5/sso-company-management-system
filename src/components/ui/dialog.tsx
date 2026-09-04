"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight, dependency-free modal (no Radix required to keep the
 * dependency surface small). Controlled component: parent owns `open`.
 *
 * Accessibility contract (previously missing — added in the UX audit pass):
 * - focus moves INTO the dialog on open and is RESTORED to the trigger
 *   element on close (keyboard users otherwise get dropped at <body>);
 * - clicking the backdrop closes, matching what mouse users expect;
 * - body scroll locks while open so the page behind doesn't scroll;
 * - the dialog is labelled by its title via aria-labelledby, and the close
 *   button speaks the app language ("Tutup").
 *
 * DialogTrigger replaces the old `<span onClick>` wrapper pattern: it clones
 * the trigger element and injects the open handler, so the trigger keeps its
 * real <button> semantics (keyboard-focusable, announced correctly) instead
 * of becoming a dead <span> for anyone not using a mouse.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const restoreFocusTo = React.useRef<Element | null>(null);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    if (open) {
      restoreFocusTo.current = document.activeElement;
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
      // Focus the first focusable inside the panel (close button, then any
      // form field) so Tab starts where the eye already is.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (focusables?.[0] ?? panelRef.current)?.focus();
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      (restoreFocusTo.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-16"
      onMouseDown={(e) => {
        // Only a press that STARTS on the backdrop counts — clicks inside
        // the panel that end on the backdrop must not close it.
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "mood-card w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-lg focus:outline-none",
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 id="dialog-title" className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Accessible replacement for `<span onClick={() => setOpen(true)}>{trigger}</span>`.
 * Clones the passed element (expected to be a Button or Link) and adds the
 * open handler — keyboard and screen-reader users get a real control.
 */
export function DialogTrigger({
  trigger,
  onClick,
}: {
  trigger: React.ReactElement<{ onClick?: React.MouseEventHandler }>;
  onClick: () => void;
}) {
  return React.cloneElement(trigger, { onClick: () => onClick() });
}
