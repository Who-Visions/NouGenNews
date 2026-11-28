/**
 * FLIP + keyed diff — the soul of Shiki Magic Move (Joy of Code,
 * "Animate Code Using TypeScript"), generalized past code blocks:
 * when a list's items carry stable keys, a reorder/insert/remove does
 * not have to hard-cut. Diff the key sets, measure First and Last
 * positions, Invert with a transform, Play to identity. Matched items
 * glide; entered items fade in; exited items fade out.
 */

export interface KeyedDiff {
  moved: string[]; // in both, position may change
  entered: string[]; // only in next
  exited: string[]; // only in prev
}

/** Pure diff of two key orders. Tested. */
export function keyedDiff(prev: string[], next: string[]): KeyedDiff {
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  return {
    moved: next.filter((k) => prevSet.has(k)),
    entered: next.filter((k) => !prevSet.has(k)),
    exited: prev.filter((k) => !nextSet.has(k)),
  };
}

export interface FlipOptions {
  duration?: number; // ms
  easing?: string; // CSS easing, incl. linear(...) spring curves
  fadeEntered?: boolean;
}

/**
 * Animate children of `container` across a DOM mutation.
 * Children are matched across the mutation by their data-key attribute.
 * Uses the Web Animations API — the browser's own engine, so the glide
 * stays smooth while JS is busy (Motion's hardware-acceleration rule).
 */
export function flipChildren(
  container: HTMLElement,
  mutate: () => void,
  opts: FlipOptions = {},
): void {
  const duration = opts.duration ?? 350;
  const easing = opts.easing ?? 'cubic-bezier(0.22, 1, 0.36, 1)';
  const keyed = (root: HTMLElement) =>
    new Map(
      Array.from(root.querySelectorAll<HTMLElement>('[data-key]')).map(
        (el) => [el.dataset.key as string, el] as const,
      ),
    );

  const before = keyed(container);
  const firstRects = new Map(
    Array.from(before.values()).map((el) => [
      el.dataset.key as string,
      el.getBoundingClientRect(),
    ]),
  );

  mutate();

  const after = keyed(container);
  for (const [key, el] of after) {
    const first = firstRects.get(key);
    if (!first) {
      if (opts.fadeEntered ?? true) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing });
      }
      continue;
    }
    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (dx !== 0 || dy !== 0) {
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: 'translate(0px, 0px)' },
        ],
        { duration, easing },
      );
    }
  }
  // Exited elements are already out of the DOM after mutate(); callers
  // that need exit animations keep the node and fade before removal —
  // the diff above (keyedDiff) tells them which keys are leaving.
  void before;
}
