import { type RefObject, useLayoutEffect, useState } from 'react';

/**
 * Whether the element is at least `width` px wide, kept live as it resizes. The first measure runs in a layout
 * effect, before paint, and the observer fires after layout and before paint, so the answer never flashes.
 * An element with no layout (width 0: a test DOM, a hidden page) counts as fitting.
 */
export function useFitsWidth(ref: RefObject<HTMLElement | null>, width: number): boolean {
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const measure = (measured: number) => setFits(measured === 0 || measured >= width);
    measure(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) measure(entry.contentBoxSize[0]?.inlineSize ?? entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, width]);
  return fits;
}
