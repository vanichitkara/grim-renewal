/**
 * Horizontal card carousel: a scrolling row plus previous/next arrow buttons.
 * The pure helpers are tested; initCarousel only wires them to the page.
 */

export interface Edges { atStart: boolean; atEnd: boolean }

/** Which arrows should be off: at the far left, at the far right. */
export function edgeState(scrollLeft: number, clientWidth: number, scrollWidth: number): Edges {
  return {
    atStart: scrollLeft <= 1,
    atEnd: scrollLeft + clientWidth >= scrollWidth - 1,
  };
}

/** Where to scroll for one arrow press. Clamped to the real scroll range. */
export function scrollTarget(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
  dir: 1 | -1,
  step: number,
): number {
  const max = Math.max(0, scrollWidth - clientWidth);
  return Math.min(max, Math.max(0, scrollLeft + dir * step));
}

export function initCarousel(root: HTMLElement | null): void {
  if (!root) return;
  const track = root.querySelector<HTMLElement>('[data-track]');
  const prev = root.querySelector<HTMLButtonElement>('[data-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-next]');
  if (!track || !prev || !next) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function sync(): void {
    const e = edgeState(track!.scrollLeft, track!.clientWidth, track!.scrollWidth);
    prev!.disabled = e.atStart;
    next!.disabled = e.atEnd;
  }

  function go(dir: 1 | -1): void {
    const card = track!.querySelector<HTMLElement>('li');
    const gap = parseFloat(getComputedStyle(track!).columnGap || '0') || 0;
    const step = card ? card.getBoundingClientRect().width + gap : track!.clientWidth * 0.8;
    track!.scrollTo({
      left: scrollTarget(track!.scrollLeft, track!.clientWidth, track!.scrollWidth, dir, step),
      behavior: reduced ? 'auto' : 'smooth',
    });
  }

  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  track.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  sync();
}
