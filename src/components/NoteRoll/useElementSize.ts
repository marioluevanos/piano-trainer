import { useEffect, useState, type RefObject } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/** The element's content box in CSS pixels, kept current as it is resized. */
export function useElementSize(
  ref: RefObject<HTMLElement | null>,
): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) =>
        s.width === width && s.height === height ? s : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
