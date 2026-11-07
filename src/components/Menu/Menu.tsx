import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cn } from "../utils";
import { Button } from "../Button/Button";
import "./Menu.css";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** Shows the item in the error color, for actions that destroy something. */
  danger?: boolean;
  title?: string;
}

interface Props {
  /** Names the open menu for screen readers. */
  label: string;
  /** The button that opens the menu. */
  button: ComponentProps<typeof Button>;
  items: MenuItem[];
  /** Shown above the items, not selectable. */
  heading?: ReactNode;
  className?: string;
}

/** A button that opens a small menu below it, closed by a tap outside or Escape. */
export function Menu({ label, button, items, heading, className }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on a tap outside the menu or on Escape, and focus the first item on open.
  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={cn("menu", open && "open", className)} ref={rootRef}>
      <Button
        {...button}
        ref={buttonRef}
        active={open}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="avatar"
      />
      {open && (
        <div className="menu-panel" role="menu" aria-label={label}>
          {heading && <div className="menu-heading">{heading}</div>}
          {items.map((item) => (
            <Button
              key={item.label}
              variant={item.danger ? "danger" : "ghost"}
              role="menuitem"
              title={item.title}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
