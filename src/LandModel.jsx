import { useEffect, useRef } from 'react';

/* "A model of the land": western Hyderabad drawn as an architect's contour model.
   Brass ridgelines on Deep Moss, the two lakes lying flat and still, the city glowing
   to the east, and a light column rising from each place we build. Canvas 2D, no libraries. */

const B = { latMin: 17.25, latMax: 17.54, lngMin: 78.08, lngMax: 78.50 };
const HX = 1, HZ = (B.latMax - B.latMin) / (B.lngMax - B.lngMin) * HX * 1.05;
const toX = lng => ((lng - B.lngMin) / (B.lngMax - B.lngMin)) * 2 * HX - HX;
const toZ = lat => -(((lat - B.latMin) / (B.latMax - B.latMin)) * 2 * HZ - HZ);

const LAKES = [
  { name: 'Osman Sagar', lat: 17.383, lng: 78.300, r: 0.075, rx: 1.5 },
  { name: 'Himayat Sagar', lat: 17.330, lng: 78.375, r: 0.06, rx: 1.2 },
];
const REFS = [{ name: 'HITEC City', lat: 17.4483, lng: 78.3815 }, { name: 'Financial District', lat: 17.4136, lng: 78.3390 }];

/* small, deterministic value noise */
function hash(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
function noise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) { let s = 0, a = .5, f = 1; for (let k = 0; k < 5; k++) { s += a * noise(x * f, y * f); f *= 2.03; a *= .5; } return s; }

function lakeD(x, z) {
  let m = 9;
  for (const L of LAKES) {
    const dx = (x - toX(L.lng)) / (L.r * L.rx), dz = (z - toZ(L.lat)) / L.r;
    m = Math.min(m, dx * dx + dz * dz + (noise(x * 18, z * 18) - .5) * .5);
  }
  return m;
}
const lakeAt = (x, z) => lakeD(x, z) < 1;
function height(x, z) {
  const ld = lakeD(x, z);
  if (ld < 1) return 0;
  const shore = Math.min(1, (ld - 1) / 2.2), soften = shore * shore * (3 - 2 * shore);
  const edge = Math.min(1, (HX - Math.abs(x)) * 4) * Math.min(1, (HZ - Math.abs(z)) * 4);
  const hills = Math.pow(fbm(x * 2.1 + 7, z * 2.1 + 3), 1.7) * 0.34;
  const rock = fbm(x * 9, z * 9) * 0.018;
  return Math.max(0, (hills + rock - 0.02) * edge * soften);
}

export const inModel = (lat, lng) => lat > B.latMin && lat < B.latMax && lng > B.lngMin && lng < B.lngMax;

export default function LandModel({ places, active, onSelect, target }) {
  const canvas = useRef(null), st = useRef({ active, mx: 0, my: 0, target: null, tAt: 0 });
  st.current.active = active;
  if ((target || null) !== st.current.target) { st.current.target = target || null; st.current.tAt = performance.now(); }

  useEffect(() => {
    const cv = canvas.current; if (!cv) return;
    const ctx = cv.getContext('2d');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ROWS = 70, COLS = 150;
    const grid = [];
    for (let r = 0; r < ROWS; r++) {
      const z = -HZ + (2 * HZ * r) / (ROWS - 1), row = [];
      for (let c = 0; c < COLS; c++) { const x = -HX + (2 * HX * c) / (COLS - 1); row.push([x, height(x, z), z, lakeAt(x, z)]); }
      grid.push(row);
    }
    /* city: short towers to the east */
    const towers = [];
    for (let k = 0; k < 420; k++) {
      const x = 0.35 + hash(k, 3) * 0.65, z = -HZ + hash(k, 7) * 2 * HZ;
      const dens = Math.max(0, (x - 0.38) * 2.2) * (0.6 + 0.4 * noise(x * 6, z * 6));
      if (hash(k, 11) < dens && !lakeAt(x, z)) towers.push([x, height(x, z), z, 0.006 + Math.pow(hash(k, 5), 4) * 0.05 * dens]);
    }
    const pins = places.map(p => ({ ...p, x: toX(p.lng), z: toZ(p.lat) })).map(p => ({ ...p, y: height(p.x, p.z) }));
    const refs = REFS.map(p => ({ ...p, x: toX(p.lng), z: toZ(p.lat) }));
    const lakes = LAKES.map(p => ({ ...p, x: toX(p.lng), z: toZ(p.lat) }));

    let W = 0, H = 0, dpr = 1;
    const resize = () => { dpr = Math.min(1.5, window.devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; };
    resize();
    const cam = { tx: -0.05, tz: 0.02, d: 2.7, yaw: 0, pitch: 0.62, cy: 0.58, hit: [] };
    const mobile = () => W < 700;

    const proj = (x, y, z) => {
      const X = x - cam.tx, Z = z - cam.tz, cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
      const X1 = X * cy - Z * sy, Z1 = X * sy + Z * cy;
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      const up = y * cp - Z1 * sp, depth = cam.d - Z1 * cp - y * sp;
      const f = (mobile() ? 1.25 : 1.05) * Math.min(W, H * 1.8) / depth;
      return [W / 2 + X1 * f, H * cam.cy - up * f * 1.6, depth];
    };

    let t0 = performance.now(), raf = 0, visible = true;
    let lastDraw = 0;
    const frame = now => {
      if (!still && now - lastDraw < 30) { if (visible) raf = requestAnimationFrame(frame); return; }
      lastDraw = now;
      const t = (now - t0) / 1000, a = st.current.active;
      const T = st.current.target && inModel(st.current.target.lat, st.current.target.lng) ? st.current.target : null;
      const tg = T ? { x: toX(T.lng), z: toZ(T.lat) } : null;
      if (tg) tg.y = height(tg.x, tg.z);
      const focus = tg ? tg : a != null ? pins[a] : null;
      const goal = tg ? { tx: tg.x, tz: tg.z, d: 1.2 } : focus ? { tx: focus.x, tz: focus.z, d: 1.55 } : { tx: -0.05, tz: 0.02, d: mobile() ? 2.4 : 2.7 };
      const k = still ? 1 : 0.045;
      cam.cy += ((tg ? 0.68 : 0.58) - cam.cy) * k; cam.tx += (goal.tx - cam.tx) * k; cam.tz += (goal.tz - cam.tz) * k; cam.d += (goal.d - cam.d) * k;
      const orbit = tg && !still ? Math.min(1, (now - st.current.tAt) / 2500) * Math.sin((now - st.current.tAt) / 9000) * 0.5 : 0;
      const yawGoal = (still ? 0 : Math.sin(t * 0.06) * 0.16) + st.current.mx * 0.32 + orbit;
      const pitchGoal = (tg ? 0.78 : 0.62) - st.current.my * 0.12;
      cam.yaw += (yawGoal - cam.yaw) * (still ? 1 : 0.05); cam.pitch += (pitchGoal - cam.pitch) * (still ? 1 : 0.05);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0E1712'; ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W * 0.78, H * 0.45, 0, W * 0.78, H * 0.45, W * 0.55);
      glow.addColorStop(0, 'rgba(196,168,120,0.10)'); glow.addColorStop(1, 'rgba(196,168,120,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

      /* rows back to front */
      const order = grid.map((row, r) => [r, proj(row[COLS >> 1][0], 0, row[0][2])[2]]).sort((p, q) => q[1] - p[1]);
      const pinRows = pins.map(p => Math.round(((p.z + HZ) / (2 * HZ)) * (ROWS - 1)));
      const towerRow = towers.map(tw => Math.round(((tw[2] + HZ) / (2 * HZ)) * (ROWS - 1)));
      cam.hit = [];
      for (const [r] of order) {
        const row = grid[r], pts = row.map(([x, y, z]) => proj(x, y, z));
        const fog = Math.max(0.12, Math.min(1, 1.9 - pts[COLS >> 1][2] * 0.42));
        /* occlusion: fill under the ridge */
        ctx.beginPath(); ctx.moveTo(pts[0][0], H + 10);
        for (const p of pts) ctx.lineTo(p[0], p[1]);
        ctx.lineTo(pts[COLS - 1][0], H + 10); ctx.closePath(); ctx.fillStyle = '#0E1712'; ctx.fill();
        /* ridge line: land in brass, water in a cool still tint */
        ctx.lineWidth = 1;
        let seg = null;
        for (let c = 0; c < COLS; c++) {
          const water = row[c][3];
          const near = focus ? Math.max(0, 1 - Math.hypot(row[c][0] - focus.x, row[c][2] - focus.z) / 0.28) : 0;
          const side = Math.min(1, (HX - Math.abs(row[c][0])) * 3.2);
          const lift = Math.min(1, row[c][1] * 6);
          const col = water ? `rgba(120,150,145,${(0.4 * fog * side).toFixed(2)})` : `rgba(196,168,120,${((0.26 + lift * 0.34 + near * 0.5) * fog * side).toFixed(2)})`;
          if (c === 0 || col !== seg) { if (c) ctx.stroke(); ctx.beginPath(); ctx.strokeStyle = col; seg = col; ctx.moveTo(pts[Math.max(0, c - 1)][0], pts[Math.max(0, c - 1)][1]); }
          ctx.lineTo(pts[c][0], pts[c][1]);
        }
        ctx.stroke();
        /* city towers on this row */
        for (let i = 0; i < towers.length; i++) if (towerRow[i] === r) {
          const [x, y, z, h] = towers[i], p0 = proj(x, y, z), p1 = proj(x, y + h, z);
          ctx.strokeStyle = `rgba(239,235,226,${(0.18 * fog).toFixed(3)})`; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
          ctx.fillStyle = `rgba(244,217,168,${(0.8 * fog).toFixed(3)})`; ctx.fillRect(p1[0] - .8, p1[1] - .8, 1.6, 1.6);
        }
        /* light columns on this row */
        pins.forEach((p, i) => {
          if (pinRows[i] !== r) return;
          const on = a === i, h = on ? 0.24 : 0.13, pulse = still ? 0 : (Math.sin(t * 2 + i) + 1) / 2;
          const g = proj(p.x, p.y, p.z), top = proj(p.x, p.y + h, p.z);
          const grad = ctx.createLinearGradient(0, g[1], 0, top[1]);
          grad.addColorStop(0, `rgba(244,217,168,${on ? .95 : .7})`); grad.addColorStop(1, 'rgba(244,217,168,0)');
          ctx.strokeStyle = grad; ctx.lineWidth = on ? 2 : 1.2; ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.lineTo(top[0], top[1]); ctx.stroke(); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(g[0], g[1], 9 + pulse * (on ? 14 : 6), (9 + pulse * (on ? 14 : 6)) * 0.35, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(196,168,120,${(0.55 - pulse * 0.45).toFixed(3)})`; ctx.stroke();
          ctx.beginPath(); ctx.arc(g[0], g[1], on ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fillStyle = '#F4D9A8'; ctx.fill();
          cam.hit.push([i, g[0], g[1], top[0], top[1]]);
        });
      }
      /* the searched address: a tall beacon with rings spreading over the ground */
      if (tg) {
        const age = (now - st.current.tAt) / 1000, rise = still ? 1 : Math.min(1, age / 1.4), e = 1 - Math.pow(1 - rise, 3);
        const g = proj(tg.x, tg.y, tg.z), top = proj(tg.x, tg.y + 0.11 * e, tg.z);
        for (let k = 0; k < 3; k++) {
          const ph = still ? k / 3 : ((age * 0.5 + k / 3) % 1), rr = 6 + ph * 70;
          ctx.beginPath(); ctx.ellipse(g[0], g[1], rr, rr * 0.36, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(244,217,168,${(0.7 * (1 - ph)).toFixed(3)})`; ctx.lineWidth = 1.2; ctx.stroke();
        }
        const grad = ctx.createLinearGradient(0, g[1], 0, top[1]);
        grad.addColorStop(0, 'rgba(255,236,200,1)'); grad.addColorStop(1, 'rgba(244,217,168,0)');
        ctx.strokeStyle = grad; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.lineTo(top[0], top[1]); ctx.stroke(); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(g[0], g[1], 4.5, 0, Math.PI * 2); ctx.fillStyle = '#FFF1D6'; ctx.fill();
        ctx.textAlign = 'center'; ctx.globalAlpha = e;
        ctx.font = '500 12px "DM Sans", system-ui, sans-serif'; ctx.fillStyle = '#C4A878'; ctx.fillText(spaced('YOUR LAND'), top[0], top[1] - 12);
        ctx.font = 'italic 500 18px "Cormorant Garamond", Georgia, serif'; ctx.fillStyle = 'rgba(239,235,226,0.95)'; ctx.fillText(st.current.target.short || '', top[0], top[1] - 32);
        ctx.globalAlpha = 1;
      }
      /* labels on top */
      ctx.textBaseline = 'alphabetic';
      lakes.forEach(L => { const p = proj(L.x, 0, L.z); ctx.font = 'italic 500 15px "Cormorant Garamond", Georgia, serif'; ctx.fillStyle = 'rgba(167,170,158,0.75)'; ctx.textAlign = 'center'; ctx.fillText(L.name, p[0], p[1] + 4); });
      if (!mobile()) refs.forEach(R => { const p = proj(R.x, height(R.x, R.z) + 0.05, R.z); ctx.font = '500 10px "DM Sans", system-ui, sans-serif'; ctx.fillStyle = 'rgba(167,170,158,0.8)'; ctx.textAlign = 'center'; ctx.fillText(R.name.toUpperCase(), p[0], p[1]); });
      pins.forEach((p, i) => {
        const on = a === i, top = proj(p.x, p.y + (on ? 0.24 : 0.13), p.z);
        ctx.textAlign = 'center';
        ctx.font = `500 ${on ? 13 : 11}px "DM Sans", system-ui, sans-serif`;
        ctx.fillStyle = on ? '#C4A878' : 'rgba(239,235,226,0.92)';
        ctx.fillText(spaced(p.name.toUpperCase()), top[0], top[1] - 10);
        if (on) { ctx.font = 'italic 500 17px "Cormorant Garamond", Georgia, serif'; ctx.fillStyle = 'rgba(239,235,226,0.9)'; ctx.fillText(p.note, top[0], top[1] - 30); }
      });
      if (visible && (!still || (tg && (now - st.current.tAt) < 50))) raf = requestAnimationFrame(frame);
    };
    const spaced = s => s.split('').join(' ');

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; cancelAnimationFrame(raf); if (visible) raf = requestAnimationFrame(frame); }, { threshold: 0.01 });
    io.observe(cv);
    const onMove = e => { const r = cv.getBoundingClientRect(); st.current.mx = ((e.clientX - r.left) / r.width - .5) * 2; st.current.my = ((e.clientY - r.top) / r.height - .5) * 2; if (still) raf = requestAnimationFrame(frame); };
    const onLeave = () => { st.current.mx = 0; st.current.my = 0; };
    const onClick = e => {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null, bd = 34;
      for (const [i, gx, gy, tx, ty] of cam.hit) { const d = Math.min(Math.hypot(x - gx, y - gy), Math.hypot(x - tx, y - ty)); if (d < bd) { bd = d; best = i; } }
      onSelect(best === st.current.active ? null : best);
      if (still) raf = requestAnimationFrame(frame);
    };
    cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', onLeave); cv.addEventListener('click', onClick);
    const ro = new ResizeObserver(() => { resize(); raf = requestAnimationFrame(frame); }); ro.observe(cv);
    document.fonts && document.fonts.ready.then(() => { raf = requestAnimationFrame(frame); });
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); cv.removeEventListener('mousemove', onMove); cv.removeEventListener('mouseleave', onLeave); cv.removeEventListener('click', onClick); };
  }, [places]);

  

  return <canvas ref={canvas} className="land-model" role="img" aria-label="A contour model of western Hyderabad showing the places where Project 49 builds" data-cursor="Explore" />;
}
