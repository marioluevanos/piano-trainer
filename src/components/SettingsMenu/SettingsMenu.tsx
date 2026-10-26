import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../Button/Button";
import { SlidersIcon } from "../Icons/SlidersIcon";
import "./SettingsMenu.css";

/** A sliders button that opens a popover panel holding the less frequently used controls. */
export function SettingsMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on a tap outside the menu or on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="settings" ref={rootRef}>
      <Button
        icon
        active={open}
        onClick={() => setOpen((o) => !o)}
        aria-label="More settings"
        aria-expanded={open}
        title="More settings"
      >
        <SlidersIcon />
      </Button>
      {open && (
        <div className="settings-panel" role="dialog" aria-label="Settings">
          {children}
        </div>
      )}
    </div>
  );
}
