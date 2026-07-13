import type { KeyboardEvent } from "react";

const focusableSelector = [
  "button:not([disabled]):not([tabindex='-1'])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
].join(", ");

export function trapFocusWithin(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Tab") return;
  const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(focusableSelector)];
  if (!controls.length) return;

  const currentIndex = controls.indexOf(document.activeElement as HTMLElement);
  const nextIndex = event.shiftKey
    ? currentIndex <= 0
      ? controls.length - 1
      : currentIndex - 1
    : (currentIndex + 1) % controls.length;

  event.preventDefault();
  controls[nextIndex]?.focus();
}
