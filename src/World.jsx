import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* Project 49 world: the interactive layer of the site.
   Threshold (doors that open as you scroll), a brass cursor, a progress rail,
   scroll-lit statements, the delivery path and the closing count. */

const reduce = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 0..1 progress of an element through the viewport (sticky scenes) */
function useSceneProgress(ref) {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    let queued = false, last = -1;
    const draw = () => {
      queued = false;
      const el = ref.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const v = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : (r.top < 0 ? 1 : 0);
      /* only re-render when it moves enough to matter, and not at all while off screen */
      if (r.bottom < -50 || r.top > window.innerHeight + 50) { if (last === v) return; }
      if (Math.abs(v - last) < 0.004 && v !== 0 && v !== 1) return;
      last = v; setP(v);
    };
    const on = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
    draw();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, [ref]);
  return p;
}

/* The way in: two plaster doors part as you scroll and the home appears behind them. */
export function Threshold({ children }) {
  const ref = useRef(null);
  const p = useSceneProgress(ref);
  const still = reduce();
  const open = still ? 1 : Math.min(1, p / 0.7);
  const ease = 1 - Math.pow(1 - open, 3);
  return (
    <section className={'threshold' + (still ? ' is-still' : '')} ref={ref} id="home" aria-label="Enter Project 49">
      <div className="threshold-stage" style={{ '--open': ease.toFixed(4), '--p': p.toFixed(4) }}>
        {children}
        {!still && (
          <div className="doors" aria-hidden="true" style={{ visibility: ease >= 0.999 ? 'hidden' : 'visible' }}>
            <div className="door door-l"><span className="door-word">PROJECT</span></div>
            <div className="door door-r"><span className="door-word">49</span></div>
            <div className="door-light" />
            <p className="door-cue">Step inside <i>↓</i></p>
          </div>
        )}
      </div>
    </section>
  );
}

/* A large statement whose words light up one by one as it passes through the screen. */
export function LitStatement({ id, eyebrow, lines, note }) {
  const ref = useRef(null);
  const p = useSceneProgress(ref);
  const words = lines.flatMap((l, li) => l.split(' ').map((w, wi) => ({ w, li, key: li + '-' + wi })));
  const lit = reduce() ? words.length : Math.round(Math.min(1, p / 0.8) * words.length);
  let n = 0;
  return (
    <section className="lit" id={id} ref={ref}>
      <div className="lit-stage">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="lit-text">
          {lines.map((l, li) => (
            <span className={'lit-line' + (li ? ' is-second' : '')} key={li}>
              {l.split(' ').map((w, wi) => { const on = n++ < lit; return <span key={wi} className={'lit-w' + (on ? ' on' : '')}>{w} </span>; })}
            </span>
          ))}
        </h2>
        {note && <p className="lit-note" style={{ opacity: lit >= words.length ? 1 : 0 }}>{note}</p>}
      </div>
    </section>
  );
}

const STEPS = [
  { t: 'Walk the land', d: 'We visit your plot with you: the light, the trees, the way the ground falls.' },
  { t: 'Choose your philosophy', d: 'One of seven design philosophies becomes the starting point for your home.' },
  { t: 'Design, settled upfront', d: 'Plans, materials and costs agreed before the first brick. Fewer late changes.' },
  { t: 'Build, one point of contact', d: 'Design, approvals, construction and finishing. We take care of everything, and you speak to one person throughout.' },
  { t: 'Move in', d: 'A predictable path to the day you get the keys.' },
];

/* Bespoke does not have to mean slow: the path drawn in brass as you scroll. */

/* Line icons for the five steps. Drawn with pathLength=1 so they can "draw in" as the step lights up. */
const ICONS = [
  // walk the land: low sun over contour lines
  <><circle pathLength="1" cx="32" cy="20" r="7" /><path pathLength="1" d="M8 40c8-5 16-5 24 0s16 5 24 0" /><path pathLength="1" d="M8 48c8-5 16-5 24 0s16 5 24 0" /><path pathLength="1" d="M14 56c6-3.5 12-3.5 18 0s12 3.5 18 0" /></>,
  // choose a philosophy: seven points on a ring, one chosen
  <><circle pathLength="1" cx="32" cy="32" r="20" />{[0,1,2,3,4,5,6].map(i => { const a = -Math.PI / 2 + i * 2 * Math.PI / 7; return <circle pathLength="1" key={i} className={i === 0 ? 'ic-fill' : ''} cx={(32 + 20 * Math.cos(a)).toFixed(2)} cy={(32 + 20 * Math.sin(a)).toFixed(2)} r={i === 0 ? 4 : 2.2} />; })}<path pathLength="1" d="M32 32V12" /></>,
  // design settled upfront: a plan on a sheet with a set square
  <><rect pathLength="1" x="10" y="12" width="40" height="40" /><path pathLength="1" d="M10 30h18v22M28 30V12M36 52V38h14" /><path pathLength="1" d="M40 8l16 16-16 0z" /></>,
  // one point of contact: many lines meeting at one point
  <><circle pathLength="1" className="ic-fill" cx="32" cy="32" r="4" /><path pathLength="1" d="M32 32L8 12M32 32L56 12M32 32L8 52M32 32L56 52M32 32V6M32 32v26" /><circle pathLength="1" cx="8" cy="12" r="2.4" /><circle pathLength="1" cx="56" cy="12" r="2.4" /><circle pathLength="1" cx="8" cy="52" r="2.4" /><circle pathLength="1" cx="56" cy="52" r="2.4" /><circle pathLength="1" cx="32" cy="6" r="2.4" /><circle pathLength="1" cx="32" cy="58" r="2.4" /></>,
  // move in: a key
  <><circle pathLength="1" cx="20" cy="32" r="10" /><circle pathLength="1" cx="20" cy="32" r="3.5" /><path pathLength="1" d="M30 32h26M48 32v8M54 32v6" /></>,
];

export function Delivery() {
  const ref = useRef(null);
  const p = useSceneProgress(ref);
  const prog = reduce() ? 1 : Math.min(1, Math.max(0, (p - 0.08) / 0.8));
  const active = Math.min(STEPS.length - 1, Math.floor(prog * STEPS.length));
  return (
    <section className="delivery" id="delivery" ref={ref} aria-labelledby="delivery-h">
      <div className="delivery-stage">
        <div className="delivery-head">
          <p className="eyebrow">How we work</p>
          <h2 id="delivery-h">Bespoke does not have to mean slow.</h2>
          <p>Clarity upfront, fewer late changes, and a more predictable path to move-in.</p>
        </div>
        <ol className="path" style={{ '--prog': prog.toFixed(4) }}>
          <span className="path-line" aria-hidden="true"><i /></span>
          {STEPS.map((s, i) => (
            <li key={s.t} className={i <= active ? 'on' : ''}>
              <span className="path-dot" aria-hidden="true" />
              <svg className="path-icon" viewBox="0 0 64 64" aria-hidden="true">{ICONS[i]}</svg>
              <span className="path-n">{String(i + 1).padStart(2, '0')}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* 49 homes. 7 ideas. No repetition. — the numbers count up once, the line settles. */
export function Scarcity() {
  const ref = useRef(null);
  const [n, setN] = useState(reduce() ? [49, 7] : [0, 0]);
  useEffect(() => {
    if (reduce() || !ref.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = now => {
        const k = Math.min(1, (now - t0) / 1800), q = 1 - Math.pow(1 - k, 3);
        setN([Math.round(49 * q), Math.round(7 * q)]);
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <section className="scarcity" ref={ref} aria-label="49 homes. 7 ideas. No repetition.">
      <div className="scarcity-row" aria-hidden="true">
        <div><strong>{n[0]}</strong><span>homes</span></div>
        <div><strong>{n[1]}</strong><span>ideas</span></div>
        <div><strong>0</strong><span>repetition</span></div>
      </div>
      <p className="scarcity-line">49 homes. 7 ideas. No repetition.</p>
    </section>
  );
}

/* A thin brass line across the top and a rail of the chapters down the right side. */
const RAIL = [['home', 'Enter'], ['idea', 'The idea'], ['belief', 'Belief'], ['ideas', 'Design philosophies'], ['delivery', 'How we work'], ['places', 'Where we build'], ['people', 'The people'], ['conversation', 'Talk to us']];
export function Rail() {
  const [pct, setPct] = useState(0), [cur, setCur] = useState('home');
  useEffect(() => {
    let queued = false;
    const draw = () => {
      queued = false;
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setPct(h > 0 ? window.scrollY / h : 0);
      let c = 'home';
      for (const [id] of RAIL) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < window.innerHeight * 0.45) c = id; }
      setCur(c);
    };
    const on = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
    draw(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <>
      <div className="progress-line" style={{ transform: `scaleX(${pct.toFixed(4)})` }} aria-hidden="true" />
      <nav className="rail" aria-label="Chapters">
        {RAIL.map(([id, label], i) => (
          <a key={id} href={'#' + id} className={cur === id ? 'on' : ''} data-cursor="Go">
            <span className="rail-label">{label}</span>
            <span className="rail-tick" aria-hidden="true" />
            <span className="visually-hidden">{String(i).padStart(2, '0')}</span>
          </a>
        ))}
      </nav>
    </>
  );
}

/* A brass ring that follows the pointer, grows over anything you can open and names it. */
export function Cursor() {
  const ring = useRef(null), dot = useRef(null), text = useRef(null);
  const [host, setHost] = useState(null);
  useEffect(() => {
    if (reduce() || !window.matchMedia('(pointer: fine)').matches) return;
    const el = document.createElement('div'); el.className = 'cursor-layer'; el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el); setHost(el);
    return () => { el.remove(); };
  }, []);
  useEffect(() => {
    if (!host) return;
    const root = document.documentElement; root.classList.add('has-cursor');
    let x = -100, y = -100, rx = x, ry = y, raf = 0, last = '', lastOn = false, idle = 0;
    const SEL = 'a, button, [data-cursor], select, input, textarea, label, [role="button"], .pin';
    const place = () => {
      // ring follows closely (no long trailing lag); dot is exact
      rx += (x - rx) * 0.5; ry += (y - ry) * 0.5;
      if (Math.abs(x - rx) < 0.1 && Math.abs(y - ry) < 0.1) { rx = x; ry = y; }
      if (ring.current) ring.current.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      if (rx !== x || ry !== y) raf = requestAnimationFrame(place); else raf = 0;
    };
    const move = e => {
      x = e.clientX; y = e.clientY;
      root.classList.add('cursor-moved');
      if (dot.current) dot.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      if (!raf) raf = requestAnimationFrame(place);
      hover(e.target);
    };
    /* what is under the pointer; also re-checked on scroll, when the page moves under a still mouse */
    const hover = target => {
      const t = target && target.closest ? target.closest(SEL) : null;
      const typing = !!(t && t.matches('input, textarea, select'));
      root.classList.toggle('cursor-text', typing);
      const lab = t && !typing ? (t.getAttribute('data-cursor') || '') : '';
      if (!!t !== lastOn || lab !== last) {
        lastOn = !!t; last = lab;
        if (ring.current) { ring.current.classList.toggle('on', lastOn && !typing); ring.current.classList.toggle('labelled', !!lab); }
        if (text.current) text.current.textContent = lab;
      }
      const mag = target && target.closest && target.closest('.enter-link, .btn-solid, .preview-caption button');
      document.querySelectorAll('.is-magnet').forEach(m => { if (m !== mag) { m.classList.remove('is-magnet'); m.style.transform = ''; } });
      if (mag) {
        const r = mag.getBoundingClientRect();
        mag.classList.add('is-magnet'); mag.style.transform = `translate(${((x - (r.left + r.width / 2)) * 0.12).toFixed(1)}px, ${((y - (r.top + r.height / 2)) * 0.18).toFixed(1)}px)`;
      }
    };
    let sTick = 0;
    const onScroll = () => { if (sTick) return; sTick = requestAnimationFrame(() => { sTick = 0; if (x >= 0) hover(document.elementFromPoint(x, y)); }); };
    const down = () => root.classList.add('cursor-down'), up = () => root.classList.remove('cursor-down');
    const leave = () => root.classList.remove('cursor-moved');
    window.addEventListener('pointermove', move, { passive: true }); window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('pointerdown', down); window.addEventListener('pointerup', up);
    document.addEventListener('mouseleave', leave);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', move); window.removeEventListener('scroll', onScroll, { capture: true }); window.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); document.removeEventListener('mouseleave', leave); root.classList.remove('has-cursor', 'cursor-moved', 'cursor-text', 'cursor-down'); };
  }, [host]);
  if (!host) return null;
  return createPortal(
    <>
      <div className="cursor-ring" ref={ring}><span ref={text} /></div>
      <div className="cursor-dot" ref={dot} />
    </>, host);
}
