/* PROJECT 49 — Ideas Gate
   One timeline drives both the last 12 seconds of the film (rendered frame by frame)
   and the live first screen of the website, so the two end on the identical frame.

   mountGate(el, { onSelect, onEnter }) builds the stage inside `el` and returns
   { render(t), play(), finish(), destroy() }. t is seconds from 0 to GATE_DURATION. */

export const GATE_DURATION = 11.8;

// Same order as src/data/chapters.js: four on top, three below.
export const GATE_IDEAS = [
  { id: 'LIGHT', name: 'Light' },
  { id: 'AIR', name: 'Air' },
  { id: 'ART', name: 'Art' },
  { id: 'ROOTS', name: 'Roots' },
  { id: 'EARTH', name: 'Earth' },
  { id: 'SILENCE', name: 'Silence' },
  { id: 'FUTURE', name: 'Future' },
].map((d, i) => ({ ...d, num: String(i + 1).padStart(2, '0'), index: i }));

const TITLE = 'PROJECT 49';
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = x => 1 - Math.pow(1 - clamp(x), 3);              // ease-out cubic
const prog = (t, start, dur) => ease((t - start) / dur);

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function mountGate(root, { onSelect, onEnter, mark = '/marks/elephant.png', showEnter = true } = {}) {
  root.classList.add('p49-gate');
  const stage = h('div', 'p49-gate-stage');
  stage.append(h('div', 'p49-gate-grain'));

  const markEl = h('img', 'p49-gate-mark'); markEl.src = mark; markEl.alt = '';
  const title = h('h1', 'p49-gate-title'); title.setAttribute('aria-label', 'Project 49');
  const letters = [...TITLE].map(ch => { const s = h('span', '', ch === ' ' ? ' ' : ch); s.setAttribute('aria-hidden', 'true'); title.append(s); return s; });
  const rule = h('div', 'p49-gate-rule');
  const tagline = h('p', 'p49-gate-tagline', 'One of one.');

  const list = h('div', 'p49-gate-ideas'); list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'The seven design philosophies');
  const items = [];
  [[0, 1, 2, 3], [4, 5, 6]].forEach(row => {
    const r = h('div', 'p49-gate-row');
    row.forEach(i => {
      const d = GATE_IDEAS[i];
      const b = h('button', 'p49-gate-idea'); b.type = 'button';
      b.setAttribute('aria-label', `Explore ${d.name}`);
      b.append(h('span', 'p49-gate-num', d.num), h('span', 'p49-gate-name', d.name));
      b.addEventListener('click', () => onSelect && onSelect(d.index, d));
      r.append(b); items[i] = b;
    });
    list.append(r);
  });
  const hint = h('p', 'p49-gate-hint', 'Choose a philosophy to explore');
  stage.append(markEl, title, rule, tagline, list, hint);
  root.append(stage);

  let enter = null;
  if (showEnter) {
    enter = h('button', 'p49-gate-enter', 'Enter the site ↓'); enter.type = 'button';
    enter.addEventListener('click', () => onEnter && onEnter());
    root.append(enter);
  }

  // Scale the 1920×1080 stage to fit (contain), exactly like the film with object-fit: contain.
  const fit = () => {
    const s = Math.min(root.clientWidth / 1920, root.clientHeight / 1080) || 1;
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  };
  fit();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  ro ? ro.observe(root) : window.addEventListener('resize', fit);

  const set = (el, o, y = 0, blur = 0) => {
    el.style.opacity = o.toFixed(3);
    el.style.transform = (el === markEl ? 'translateX(-50%) ' : '') + `translateY(${y.toFixed(2)}px)`;
    el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
  };

  // Order matches the film: the seven ideas arrive first, then PROJECT 49 rises into place
  // exactly when the voice says "Project 49" (card time + 0.13 s = gate time).
  function render(t) {
    items.forEach((b, i) => { const p = prog(t, 1.13 + i * 0.95, 1.6); set(b, p, 22 * (1 - p), 8 * (1 - p)); });
    const m = prog(t, 8.08, 1.4); set(markEl, m, 36 * (1 - m), 5 * (1 - m));
    title.style.letterSpacing = '0.22em'; title.style.textIndent = '0.22em';
    letters.forEach((s, i) => { const p = prog(t, 8.28 + i * 0.05, 1.1); set(s, p, 60 * (1 - p), 10 * (1 - p)); });
    const r = prog(t, 9.43, 1.0); rule.style.width = (260 * r).toFixed(1) + 'px'; rule.style.opacity = r.toFixed(3);
    const g = prog(t, 10.13, 0.9); set(tagline, g, 14 * (1 - g), 4 * (1 - g));
    const k = prog(t, 10.73, 0.9); set(hint, k, 6 * (1 - k));
  }

  let raf = 0;
  function finish() {
    cancelAnimationFrame(raf); render(GATE_DURATION);
    root.classList.add('is-live');
  }
  function play(from = 0) {
    cancelAnimationFrame(raf);
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return finish();
    const t0 = performance.now() - from * 1000;
    const tick = now => { const t = (now - t0) / 1000; render(t); if (t < GATE_DURATION) raf = requestAnimationFrame(tick); else finish(); };
    raf = requestAnimationFrame(tick);
  }
  function destroy() { cancelAnimationFrame(raf); ro && ro.disconnect(); root.innerHTML = ''; root.classList.remove('p49-gate', 'is-live'); }

  render(0);
  return { render, play, finish, destroy, items };
}
