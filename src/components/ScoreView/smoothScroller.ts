/**
 * Where the cursor sits in the horizontal layout, as a fraction of the score
 * area's width from the left. Left of center leaves more of what's coming
 * into view.
 */
const CURSOR_ANCHOR = 0.33;

/** Time constant of the ease-out, in ms. Smaller catches up faster. */
const EASE_MS = 140;

/** Jumps farther than this many screen widths (e.g. a loop wrapping back) skip the animation. */
const MAX_ANIMATED_SCREENS = 2;

export interface SmoothScroller {
  /** Eases the area so `el` sits at the cursor anchor. */
  follow(el: Element): void;
  /** Stops any animation and detaches from the area. */
  dispose(): void;
}

/**
 * Horizontal follow for a scrolling area. Each frame closes a fixed share of
 * the remaining distance, so a new target arriving mid-scroll continues from
 * the current speed instead of restarting the way scrollIntoView does. A
 * touch or wheel hands control back to the user.
 */
export function createSmoothScroller(area: HTMLElement): SmoothScroller {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let target = 0;
  let pos = 0;
  let frame = 0;
  let last = 0;

  const step = (now: number) => {
    const dt = Math.min(now - last, 64);
    last = now;
    pos += (target - pos) * (1 - Math.exp(-dt / EASE_MS));
    if (Math.abs(target - pos) < 0.5) pos = target;
    area.scrollLeft = pos;
    frame = pos === target ? 0 : requestAnimationFrame(step);
  };

  const cancel = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  area.addEventListener("touchstart", cancel, { passive: true });
  area.addEventListener("wheel", cancel, { passive: true });

  return {
    follow(el) {
      const max = area.scrollWidth - area.clientWidth;
      const offset =
        el.getBoundingClientRect().left - area.getBoundingClientRect().left;
      target = Math.max(
        0,
        Math.min(
          max,
          area.scrollLeft + offset - area.clientWidth * CURSOR_ANCHOR,
        ),
      );
      if (!frame) pos = area.scrollLeft;
      const far =
        Math.abs(target - pos) > area.clientWidth * MAX_ANIMATED_SCREENS;
      if (far || reducedMotion.matches) {
        cancel();
        pos = target;
        area.scrollLeft = target;
        return;
      }
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(step);
      }
    },
    dispose() {
      cancel();
      area.removeEventListener("touchstart", cancel);
      area.removeEventListener("wheel", cancel);
    },
  };
}
