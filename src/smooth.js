/**
 * Inertial smooth scrolling (Lenis).
 *
 * Loaded from a CDN at runtime so nothing has to be installed, and wrapped in
 * a try/catch: if the script cannot be fetched the page simply scrolls the way
 * the browser normally does. Touch devices keep their own momentum, and anyone
 * who asks for reduced motion is left alone.
 *
 * To host it yourself instead: npm install lenis, then change SOURCE to 'lenis'.
 */
const SOURCE = 'https://cdn.jsdelivr.net/npm/lenis@1.1.18/+esm';

let lenis = null;
let stopped = 0;

export async function startSmoothScroll() {
  if (lenis) return lenis;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  if (window.matchMedia('(pointer: coarse)').matches) return null;
  try {
    const mod = await import(/* @vite-ignore */ SOURCE);
    const Lenis = mod.default ?? mod.Lenis;
    if (!Lenis) return null;
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true, syncTouch: false });
    const raf = t => { if (!lenis) return; lenis.raf(t); requestAnimationFrame(raf); };
    // Keyboard users: Lenis owns the scroll position, so the browser's own "scroll the focused
    // element into view" gets overridden. Bring a keyboard-focused element into view ourselves.
    document.addEventListener('focusin', e => {
      const el = e.target;
      if (!lenis || !el || !el.matches || !el.matches(':focus-visible')) return;
      if (el.closest('[role="dialog"], .site-menu, .experience')) return;
      const r = el.getBoundingClientRect();
      if (r.top < 90 || r.bottom > window.innerHeight - 40) lenis.scrollTo(el, { offset: -Math.round(window.innerHeight * 0.3), duration: 0.6 });
    });
    requestAnimationFrame(raf);
    if (stopped) lenis.stop();
    return lenis;
  } catch {
    return null; // offline or blocked — native scrolling, everything still works
  }
}

export function stopSmoothScroll() { lenis?.destroy(); lenis = null; stopped = 0; }

/** Hold the page still while a film is open (reference counted). */
export function lockScroll() { stopped++; lenis?.stop(); }
export function unlockScroll() { stopped = Math.max(0, stopped - 1); if (!stopped) lenis?.start(); }
