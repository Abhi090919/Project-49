import { useEffect, useRef, useState } from 'react';
import AREAS from './data/areas';

/* The whole of Hyderabad, drawn in light.
   Every road from OpenStreetMap (public/map/hyderabad.bin, built by tools/build-city.py),
   lakes as dark glass, traffic moving along the highways and the city twinkling.
   WebGL for the city, a 2D layer on top for the beams, rings and names.
   Props: places (the beams where we build), target ({lat,lng,short}), onPick(name) when any light is selected. */

const LAT0 = 17.40, LNG0 = 78.40, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 110574;
const toXY = (lat, lng) => [(lng - LNG0) * KX, (lat - LAT0) * KY];
const BOX = { latMin: 17.18, latMax: 17.62, lngMin: 78.08, lngMax: 78.72 };
export const inModel = (lat, lng) => lat > BOX.latMin && lat < BOX.latMax && lng > BOX.lngMin && lng < BOX.lngMax;

/* every well-known place in the city (src/data/areas.js) is a light you can select */
const MAJOR = new Set(['Charminar', 'Hussain Sagar', 'Hitec City', 'Financial District', 'Gachibowli', 'Jubilee Hills', 'Banjara Hills', 'Secunderabad', 'Golconda', 'Shamshabad Airport', 'Osman Sagar', 'Himayat Sagar', 'Kukatpally', 'Uppal', 'LB Nagar', 'Madhapur', 'Kondapur', 'Miyapur', 'Mehdipatnam', 'Begumpet']);
const SPOTS = Object.keys(AREAS)
  .filter(n => !/^Road No|Metro$|Junction$|Flyover$| Road$|Checkpost$|Mall$|Circle$|X Roads$/.test(n))
  .map(n => { const [la, ln] = AREAS[n]; const [x, y] = toXY(la, ln); return { name: n, x, y, major: MAJOR.has(n), label: n.toUpperCase().split('').join(String.fromCharCode(8202)) }; });

/* ---------- tiny matrix helpers ---------- */
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function lookAt(e, c, up) {
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2]; let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
}
function mul(a, b) {
  const o = new Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
  return o;
}

/* ---------- shaders ---------- */
const COMMON = `
precision highp float;
uniform mat4 uM; uniform vec3 uEye; uniform float uQ; uniform float uTime; uniform vec2 uRes;
varying float vFog;
float fog(vec3 w) { float d = distance(w, uEye); float edge = smoothstep(52000.0, 30000.0, length(w.xy - vec2(-2000.0, -3000.0))); return edge * clamp(1.25 - d / 150000.0, 0.0, 1.0); }
`;
const VS_LINE = COMMON + `
attribute vec2 aP; uniform float uLift;
void main() { vec3 w = vec3(aP * uQ, uLift); vFog = fog(w); gl_Position = uM * vec4(w, 1.0); }`;
const FS_COLOR = `precision highp float; varying float vFog; uniform vec4 uColor;
void main() { gl_FragColor = vec4(uColor.rgb * uColor.a * vFog, 1.0); }`;

/* screen-space ribbons for the big roads: constant width in pixels, soft edges */
const VS_RIBBON = COMMON + `
attribute vec2 aA; attribute vec2 aB; attribute vec2 aC; attribute float aW; varying float vSide;
void main() {
  vec4 ca = uM * vec4(aA, 0.0, 1.0), cb = uM * vec4(aB, 0.0, 1.0);
  vec2 sa = ca.xy / max(ca.w, 1.0) * uRes, sb = cb.xy / max(cb.w, 1.0) * uRes;
  vec2 d = sb - sa; float L = length(d); d = L > 0.0001 ? d / L : vec2(1.0, 0.0);
  vec2 n = vec2(-d.y, d.x);
  vec4 c = aC.x < 0.5 ? ca : cb;
  c.xy += n * aC.y * aW / uRes * c.w;
  vec3 w = vec3(aC.x < 0.5 ? aA : aB, 0.0); vFog = fog(w); vSide = aC.y;
  gl_Position = c;
}`;
const FS_RIBBON = `precision highp float; varying float vFog; varying float vSide; uniform vec4 uColor;
void main() { float a = 1.0 - smoothstep(0.15, 1.0, abs(vSide)); gl_FragColor = vec4(uColor.rgb * uColor.a * a * vFog, 1.0); }`;

/* points: city lights that twinkle, and traffic */
const VS_POINT = COMMON + `
attribute vec2 aP; attribute float aS; uniform float uSize; uniform float uTwinkle; uniform float uScale; varying float vA;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 w = vec3(aP * uScale, 0.0); vFog = fog(w);
  float r = h(aP);
  vA = mix(1.0, 0.55 + 0.45 * sin(uTime * (0.6 + r * 2.2) + r * 40.0), uTwinkle) * (0.55 + 0.45 * r) * aS;
  vec4 c = uM * vec4(w, 1.0); gl_Position = c;
  gl_PointSize = uSize * (0.8 + r * 0.6) * clamp(26000.0 / c.w, 0.6, 2.4);
}`;
const FS_POINT = `precision highp float; varying float vFog; varying float vA; uniform vec4 uColor;
void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float a = exp(-dot(q, q) * 3.2); gl_FragColor = vec4(uColor.rgb * uColor.a * a * vA * vFog, 1.0); }`;

/* water: dark glass with a slow shimmer */
const VS_WATER = COMMON + `attribute vec2 aP; varying vec2 vW;
void main() { vec3 w = vec3(aP * uQ, 0.0); vW = w.xy; vFog = fog(w); gl_Position = uM * vec4(w, 1.0); }`;
const FS_WATER = `precision highp float; varying float vFog; varying vec2 vW; uniform float uTime;
void main() {
  float s = sin(vW.x * 0.0021 + uTime * 0.5) * sin(vW.y * 0.0017 - uTime * 0.37) + sin((vW.x + vW.y) * 0.0009 + uTime * 0.21);
  vec3 col = vec3(0.03, 0.07, 0.075) + vec3(0.02, 0.035, 0.03) * smoothstep(0.9, 1.9, s);
  gl_FragColor = vec4(col * vFog, 1.0);
}`;

/* the ground: a faint warm glow where the city is */
const VS_GROUND = COMMON + `attribute vec2 aP; varying vec2 vW;
void main() { vec3 w = vec3(aP, -2.0); vW = w.xy; vFog = fog(w); gl_Position = uM * vec4(w, 1.0); }`;
const FS_GROUND = `precision highp float; varying float vFog; varying vec2 vW;
void main() { float r = length(vW - vec2(6000.0, -2000.0)); vec3 c = mix(vec3(0.075, 0.068, 0.05), vec3(0.04, 0.05, 0.043), smoothstep(0.0, 34000.0, r)); gl_FragColor = vec4(c * (0.35 + 0.65 * vFog), 1.0); }`;

function program(gl, vs, fs) {
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, a = {};
  const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < nu; i++) { const n = gl.getActiveUniform(p, i).name; u[n] = gl.getUniformLocation(p, n); }
  const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); for (let i = 0; i < na; i++) { const n = gl.getActiveAttrib(p, i).name; a[n] = gl.getAttribLocation(p, n); }
  return { p, u, a };
}

/* ---------- data: hyderabad.bin ---------- */
async function loadCity() {
  const buf = await fetch('/map/hyderabad.bin').then(r => { if (!r.ok) throw new Error('map'); return r.arrayBuffer(); });
  const hlen = new DataView(buf).getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hlen)));
  const layers = {};
  for (const L of head.layers) {
    layers[L.name] = { ...L, lens: L.nPolys ? new Uint32Array(buf, L.oLens, L.nPolys) : null, pts: new Int16Array(buf, L.oPts, L.nPts * 2) };
  }
  return { q: head.q, layers };
}

/* polylines -> GL_LINES pairs (Int16 quantised) */
function linePairs(L) {
  let segs = 0; for (const n of L.lens) segs += n - 1;
  const out = new Int16Array(segs * 4); let o = 0, k = 0;
  for (const n of L.lens) {
    for (let i = 0; i < n - 1; i++) { const a = (k + i) * 2, b = (k + i + 1) * 2; out[o++] = L.pts[a]; out[o++] = L.pts[a + 1]; out[o++] = L.pts[b]; out[o++] = L.pts[b + 1]; }
    k += n;
  }
  return out;
}
/* polylines -> ribbon vertices: A(2) B(2) C(2) W(1), metres */
function ribbons(L, q, width) {
  let segs = 0; for (const n of L.lens) segs += n - 1;
  const out = new Float32Array(segs * 6 * 7); let o = 0, k = 0;
  const C = [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]];
  for (const n of L.lens) {
    for (let i = 0; i < n - 1; i++) {
      const ax = L.pts[(k + i) * 2] * q, ay = L.pts[(k + i) * 2 + 1] * q, bx = L.pts[(k + i + 1) * 2] * q, by = L.pts[(k + i + 1) * 2 + 1] * q;
      for (const c of C) { out[o++] = ax; out[o++] = ay; out[o++] = bx; out[o++] = by; out[o++] = c[0]; out[o++] = c[1]; out[o++] = width; }
    }
    k += n;
  }
  return out;
}
/* long routes for traffic: cumulative lengths so a car can travel the whole road */
function routes(L, q, minLen) {
  const R = []; let k = 0;
  for (const n of L.lens) {
    if (n > 2) {
      const xs = new Float32Array(n), ys = new Float32Array(n), cum = new Float32Array(n);
      for (let i = 0; i < n; i++) { xs[i] = L.pts[(k + i) * 2] * q; ys[i] = L.pts[(k + i) * 2 + 1] * q; if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]); }
      if (cum[n - 1] > minLen) R.push({ xs, ys, cum, len: cum[n - 1] });
    }
    k += n;
  }
  return R;
}
function along(r, d) {
  let lo = 0, hi = r.cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.cum[m] < d) lo = m; else hi = m; }
  const t = (d - r.cum[lo]) / Math.max(1e-3, r.cum[hi] - r.cum[lo]);
  return [r.xs[lo] + (r.xs[hi] - r.xs[lo]) * t, r.ys[lo] + (r.ys[hi] - r.ys[lo]) * t];
}

export default function CityModel({ places = [], onPick, target }) {
  const wrap = useRef(null), glc = useRef(null), ovc = useRef(null);
  const st = useRef({ target, places, onPick });
  st.current.target = target; st.current.places = places; st.current.onPick = onPick;
  const [state, setState] = useState('idle'); // idle | loading | ready | fallback
  const api = useRef({});

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    let started = false;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && !started) { started = true; start(); } }, { rootMargin: '600px 0px' });
    io.observe(el);
    let raf = 0, visible = false, dead = false, cleanup = () => {};
    const vis = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf && api.current.frame) raf = requestAnimationFrame(api.current.frame); }, { threshold: 0 });
    vis.observe(el);

    async function start() {
      setState('loading');
      let city;
      try { city = await loadCity(); } catch { if (!dead) setState('fallback'); return; }
      if (dead) return;
      const canvas = glc.current, ov = ovc.current, ctx = ov.getContext('2d');
      const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
      if (!gl) { setState('fallback'); return; }
      const q = city.q, Ls = city.layers;
      let P;
      try {
        P = { line: program(gl, VS_LINE, FS_COLOR), rib: program(gl, VS_RIBBON, FS_RIBBON), pt: program(gl, VS_POINT, FS_POINT), water: program(gl, VS_WATER, FS_WATER), ground: program(gl, VS_GROUND, FS_GROUND) };
      } catch (e) { console.warn(e); setState('fallback'); return; }
      const buf = data => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };

      /* geometry */
      const G = {};
      const lineLayer = (name, color, lift = 0) => { const L = Ls[name]; if (!L) return; const d = linePairs(L); G[name] = { b: buf(d), n: d.length / 2, color, lift }; };
      lineLayer('resi', [0.78, 0.6, 0.36, 0.13]);
      lineLayer('tertiary', [0.86, 0.68, 0.42, 0.32]);
      lineLayer('rail', [0.55, 0.62, 0.66, 0.35]);
      lineLayer('river', [0.3, 0.55, 0.55, 0.55]);
      lineLayer('waterEdge', [0.4, 0.62, 0.58, 0.5], 1);
      const ribLayer = (name, width, color) => { const L = Ls[name]; if (!L) return; const d = ribbons(L, q, width * (window.innerWidth < 700 ? 0.7 : 1)); G['r_' + name] = { b: buf(d), n: d.length / 7, color }; };
      ribLayer('secondary', 1.5, [0.92, 0.74, 0.46, 0.45]);
      ribLayer('primary', 2.0, [0.98, 0.78, 0.48, 0.52]);
      ribLayer('trunk', 2.6, [1.0, 0.82, 0.52, 0.6]);
      ribLayer('runway', 2.6, [0.95, 0.86, 0.68, 0.5]);
      if (Ls.water) G.water = { b: buf(Ls.water.pts), n: Ls.water.nPts };
      if (Ls.lights) G.lights = { b: buf(Ls.lights.pts), n: Ls.lights.nPts, s: buf(new Float32Array(Ls.lights.nPts).fill(1)) };
      const groundQuad = buf(new Float32Array([-90000, -90000, 90000, -90000, 90000, 90000, -90000, -90000, 90000, 90000, -90000, 90000]));

      /* traffic: cars running the length of the big roads */
      const R = [...(Ls.trunk ? routes(Ls.trunk, q, 3000) : []), ...(Ls.primary ? routes(Ls.primary, q, 2500) : [])];
      const small = window.innerWidth < 700;
      const NCAR = R.length ? (small ? 900 : 2200) : 0;
      const cars = Array.from({ length: NCAR }, () => { const r = R[(Math.random() * R.length) | 0]; return { r, d: Math.random() * r.len, v: (12 + Math.random() * 22) * (Math.random() < 0.5 ? -1 : 1) }; });
      const carPos = new Float32Array(NCAR * 2), carS = new Float32Array(NCAR).fill(1);
      const carBuf = gl.createBuffer(), carSBuf = buf(carS);

      /* camera */
      const C = { tx: 600, ty: 1500, dist: 64000, pitch: 0.92, yaw: -0.35 }, goal = { ...C };
      const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
      let drag = null, lastSel = undefined, lastTarget = undefined, t0 = performance.now(), last = t0, idle = 0;
      let W = 0, H = 0, dpr = 1, M = null, eye = [0, 0, 0];

      const resize = () => {
        dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
        W = el.clientWidth; H = el.clientHeight;
        for (const c of [canvas, ov]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; }
      };
      resize();
      const ro = new ResizeObserver(resize); ro.observe(el);

      const project = (x, y, z = 0) => {
        const v = [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[3] * x + M[7] * y + M[11] * z + M[15]];
        if (v[2] <= 1) return null;
        return [(v[0] / v[2] * 0.5 + 0.5) * W, (1 - (v[1] / v[2] * 0.5 + 0.5)) * H, v[2]];
      };

      const homeDist = () => (W / Math.max(1, H) < 0.8 ? 98000 : W / Math.max(1, H) < 1.3 ? 76000 : 58000);
      const aim = () => {
        const s = st.current;
        if (s.target && inModel(s.target.lat, s.target.lng)) { const [x, y] = toXY(s.target.lat, s.target.lng); Object.assign(goal, { tx: x, ty: y, dist: 7200, pitch: 1.02 }); }
        else Object.assign(goal, { tx: 600, ty: 1500, dist: homeDist(), pitch: 0.92 });
      };

      function drawLines(g) {
        const p = P.line; gl.useProgram(p.p); setCommon(p);
        gl.uniform1f(p.u.uLift, g.lift || 0); gl.uniform4fv(p.u.uColor, g.color);
        gl.bindBuffer(gl.ARRAY_BUFFER, g.b); gl.enableVertexAttribArray(p.a.aP); gl.vertexAttribPointer(p.a.aP, 2, gl.SHORT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, g.n);
      }
      function drawRibbon(g) {
        const p = P.rib; gl.useProgram(p.p); setCommon(p); gl.uniform4fv(p.u.uColor, g.color);
        gl.bindBuffer(gl.ARRAY_BUFFER, g.b);
        const S = 28; gl.enableVertexAttribArray(p.a.aA); gl.vertexAttribPointer(p.a.aA, 2, gl.FLOAT, false, S, 0);
        gl.enableVertexAttribArray(p.a.aB); gl.vertexAttribPointer(p.a.aB, 2, gl.FLOAT, false, S, 8);
        gl.enableVertexAttribArray(p.a.aC); gl.vertexAttribPointer(p.a.aC, 2, gl.FLOAT, false, S, 16);
        gl.enableVertexAttribArray(p.a.aW); gl.vertexAttribPointer(p.a.aW, 1, gl.FLOAT, false, S, 24);
        gl.drawArrays(gl.TRIANGLES, 0, g.n);
        for (const k of ['aA', 'aB', 'aC', 'aW']) gl.disableVertexAttribArray(p.a[k]);
      }
      function drawPoints(b, sb, n, type, scale, size, color, twinkle) {
        const p = P.pt; gl.useProgram(p.p); setCommon(p);
        gl.uniform1f(p.u.uScale, scale); gl.uniform1f(p.u.uSize, size * dpr); gl.uniform4fv(p.u.uColor, color); gl.uniform1f(p.u.uTwinkle, twinkle);
        gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(p.a.aP); gl.vertexAttribPointer(p.a.aP, 2, type, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, sb); gl.enableVertexAttribArray(p.a.aS); gl.vertexAttribPointer(p.a.aS, 1, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.POINTS, 0, n);
        gl.disableVertexAttribArray(p.a.aS);
      }
      let time = 0;
      function setCommon(p) {
        gl.uniformMatrix4fv(p.u.uM, false, M); gl.uniform3fv(p.u.uEye, eye); if (p.u.uQ) gl.uniform1f(p.u.uQ, q);
        if (p.u.uTime) gl.uniform1f(p.u.uTime, time); if (p.u.uRes) gl.uniform2f(p.u.uRes, W * dpr / 2, H * dpr / 2);
      }

      function frame(now) {
        raf = 0; if (dead) return;
        const dt = Math.min(0.05, (now - last) / 1000); last = now; time = (now - t0) / 1000;
        const s = st.current;
        if (s.target !== lastTarget || lastSel === undefined) { lastSel = 0; lastTarget = s.target; aim(); }
        /* drift, follow the pointer a little, settle into the goal */
        if (!drag) { idle += dt; goal.yaw += dt * (s.target ? 0.05 : 0.018); }
        mouse.sx += (mouse.x - mouse.sx) * 0.05; mouse.sy += (mouse.y - mouse.sy) * 0.05;
        const k = 1 - Math.pow(0.0015, dt);
        C.tx += (goal.tx - C.tx) * k; C.ty += (goal.ty - C.ty) * k; C.dist *= Math.pow(goal.dist / C.dist, k);
        C.pitch += (goal.pitch - C.pitch) * k; C.yaw += (goal.yaw - C.yaw) * k;
        const yaw = C.yaw + mouse.sx * 0.12, pitch = Math.min(1.25, Math.max(0.45, C.pitch + mouse.sy * 0.06));
        eye = [C.tx + Math.sin(yaw) * Math.sin(pitch) * C.dist, C.ty - Math.cos(yaw) * Math.sin(pitch) * C.dist, Math.cos(pitch) * C.dist];
        M = mul(perspective(0.72, W / H, Math.max(50, C.dist * 0.05), C.dist * 6), lookAt(eye, [C.tx, C.ty, 0], [0, 0, 1]));

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.043, 0.058, 0.05, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
        { const p = P.ground; gl.useProgram(p.p); setCommon(p); gl.bindBuffer(gl.ARRAY_BUFFER, groundQuad); gl.enableVertexAttribArray(p.a.aP); gl.vertexAttribPointer(p.a.aP, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, 6); }
        if (G.water) { const p = P.water; gl.useProgram(p.p); setCommon(p); gl.bindBuffer(gl.ARRAY_BUFFER, G.water.b); gl.enableVertexAttribArray(p.a.aP); gl.vertexAttribPointer(p.a.aP, 2, gl.SHORT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, G.water.n); }
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        for (const n of ['waterEdge', 'river', 'resi', 'tertiary', 'rail']) if (G[n]) drawLines(G[n]);
        for (const n of ['r_secondary', 'r_primary', 'r_trunk', 'r_runway']) if (G[n]) drawRibbon(G[n]);
        if (G.lights) drawPoints(G.lights.b, G.lights.s, G.lights.n, gl.SHORT, q, 2.6, [1.0, 0.78, 0.45, 0.55], 1);
        if (NCAR) {
          for (let i = 0; i < NCAR; i++) { const c = cars[i]; c.d += c.v * dt * 18; if (c.d > c.r.len) c.d -= c.r.len; if (c.d < 0) c.d += c.r.len; const [x, y] = along(c.r, c.d); carPos[i * 2] = x; carPos[i * 2 + 1] = y; }
          gl.bindBuffer(gl.ARRAY_BUFFER, carBuf); gl.bufferData(gl.ARRAY_BUFFER, carPos, gl.DYNAMIC_DRAW);
          drawPoints(carBuf, carSBuf, NCAR, gl.FLOAT, 1, 3.4, [1.0, 0.93, 0.78, 0.95], 0);
        }
        overlay(now);
        if (visible) raf = requestAnimationFrame(frame);
      }

      /* beams, rings and names */
      const hits = [];
      let hover = null;
      function overlay(now) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        const s = st.current, t = now / 1000; hits.length = 0; const taken = [];
        const free = (x0, y0, x1, y1) => { if (taken.some(b => x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1])) return false; taken.push([x0, y0, x1, y1]); return true; };
        const tgt = s.target && inModel(s.target.lat, s.target.lng) ? s.target : null;
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        /* your land */
        if (tgt) {
          const [x, y] = toXY(tgt.lat, tgt.lng), g = project(x, y, 0), top = project(x, y, 1100);
          if (g && top) {
            for (let k = 0; k < 3; k++) { const ph = ((t * 0.45 + k / 3) % 1); ring(x, y, 150 + ph * 1400, (1 - ph) * 0.9, '255,232,186'); }
            const grad = ctx.createLinearGradient(g[0], g[1], top[0], top[1]); grad.addColorStop(0, 'rgba(255,240,210,1)'); grad.addColorStop(1, 'rgba(255,220,160,0)');
            ctx.strokeStyle = grad; ctx.lineWidth = 3; ctx.shadowColor = 'rgba(255,214,150,.9)'; ctx.shadowBlur = 18;
            ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.lineTo(top[0], top[1]); ctx.stroke(); ctx.shadowBlur = 0;
            ctx.beginPath(); ctx.arc(g[0], g[1], 5, 0, 7); ctx.fillStyle = '#fff6e2'; ctx.fill();
            ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(8,10,9,.9)';
            ctx.font = '600 11px "DM Sans", system-ui, sans-serif'; ctx.lineWidth = 3.4; ctx.strokeText('YOUR LAND', top[0], top[1] - 24); ctx.fillStyle = '#e8c486';
            ctx.fillText('YOUR LAND', top[0], top[1] - 24);
            ctx.font = 'italic 500 20px "Cormorant Garamond", Georgia, serif'; ctx.lineWidth = 4; ctx.strokeText(tgt.short || '', top[0], top[1] - 2); ctx.fillStyle = '#fbf3e3';
            ctx.fillText(tgt.short || '', top[0], top[1] - 2);
            const w = Math.max(90, ctx.measureText(tgt.short || '').width) / 2 + 8; free(top[0] - w, top[1] - 40, top[0] + w, top[1] + 6);
            taken.push([g[0] - 12, g[1] - 12, g[0] + 12, g[1] + 12]);
          }
        }
        /* where we build: beams */
        const pnames = new Set();
        s.places.forEach((pl, i) => {
          pnames.add(pl.name);
          const [x, y] = toXY(pl.lat, pl.lng), g = project(x, y, 0); if (!g) return;
          const isT = tgt && tgt.short === pl.name, hov = hover === pl.name;
          const h = 1400 * Math.max(0.6, C.dist / 40000), top = project(x, y, h); if (!top) return;
          if (!isT) {
            const grad = ctx.createLinearGradient(g[0], g[1], top[0], top[1]);
            grad.addColorStop(0, hov ? 'rgba(255,226,170,.95)' : 'rgba(232,196,132,.75)'); grad.addColorStop(1, 'rgba(232,196,132,0)');
            ctx.strokeStyle = grad; ctx.lineWidth = hov ? 2.2 : 1.4; ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
            ring(x, y, 500 * Math.max(0.5, C.dist / 40000) * (1 + 0.25 * Math.sin(t * 2 + i)), 0.45);
            ctx.font = `${hov ? 600 : 500} 11.5px "DM Sans", system-ui, sans-serif`;
            const lab = pl.name.toUpperCase().split('').join(String.fromCharCode(8202)), w = ctx.measureText(lab).width / 2 + 4;
            if (free(top[0] - w, top[1] - 20, top[0] + w, top[1] - 2) || hov) { ctx.lineJoin = 'round'; ctx.lineWidth = 3.4; ctx.strokeStyle = 'rgba(8,10,9,.85)'; ctx.strokeText(lab, top[0], top[1] - 8); ctx.fillStyle = hov ? '#f3e2bd' : 'rgba(236,226,206,.95)'; ctx.fillText(lab, top[0], top[1] - 8); }
          }
          ctx.beginPath(); ctx.arc(g[0], g[1], 3, 0, 7); ctx.fillStyle = '#ffe9bf'; ctx.fill();
          hits.push({ name: pl.name, x: g[0], y: g[1], tx: top[0], ty: top[1] - 10, r: 34 });
        });
        /* every other place: a small light, named where there is room (major places first, then nearest the centre) */
        const vis = [];
        for (const sp of SPOTS) {
          if (pnames.has(sp.name)) continue;
          const p = project(sp.x, sp.y, 0); if (!p || p[0] < -20 || p[0] > W + 20 || p[1] < -20 || p[1] > H + 20) continue;
          const fade = Math.max(0, Math.min(1, 1.35 - p[2] / 100000));
          const hov = hover === sp.name;
          ctx.beginPath(); ctx.arc(p[0], p[1], hov ? 3.4 : 2, 0, 7); ctx.fillStyle = hov ? '#fff1d2' : `rgba(240,214,160,${0.55 * fade + 0.2})`; ctx.fill();
          if (hov) { ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, 7); ctx.strokeStyle = 'rgba(240,214,160,.6)'; ctx.lineWidth = 1; ctx.stroke(); }
          vis.push({ sp, p, fade, hov, d: Math.hypot(p[0] - W / 2, p[1] - H / 2) });
          hits.push({ name: sp.name, x: p[0], y: p[1], tx: p[0], ty: p[1] - 10, r: 16 });
        }
        vis.sort((a, b) => (b.hov - a.hov) || (b.sp.major - a.sp.major) || a.d - b.d);
        const close = C.dist < 22000;
        for (const v of vis) {
          if (!v.hov && !v.sp.major && !close && C.dist > 40000) continue;
          ctx.font = `${v.hov ? 600 : 500} ${v.sp.major ? 10.5 : 9.5}px "DM Sans", system-ui, sans-serif`;
          const w = ctx.measureText(v.sp.label).width / 2 + 3, x = v.p[0], y = v.p[1] - 8;
          if (!free(x - w, y - 11, x + w, y + 3) && !v.hov) continue;
          const a = v.hov ? 1 : (v.sp.major ? 0.78 : 0.6) * v.fade * (tgt ? 0.7 : 1);
          ctx.lineJoin = 'round'; ctx.lineWidth = 3.2; ctx.strokeStyle = `rgba(8,10,9,${Math.min(0.9, a + 0.2)})`; ctx.strokeText(v.sp.label, x, y);
          ctx.fillStyle = v.hov ? '#fbf0d8' : `rgba(226,216,196,${a})`;
          ctx.fillText(v.sp.label, x, y);
        }
      }
      function ring(x, y, r, a, rgb = '232,196,132') {
        ctx.beginPath(); let first = true;
        for (let k = 0; k <= 40; k++) { const an = k / 40 * Math.PI * 2, p = project(x + Math.cos(an) * r, y + Math.sin(an) * r, 0); if (!p) { first = true; continue; } if (first) { ctx.moveTo(p[0], p[1]); first = false; } else ctx.lineTo(p[0], p[1]); }
        ctx.strokeStyle = `rgba(${rgb},${Math.max(0, a)})`; ctx.lineWidth = 1.2; ctx.stroke();
      }

      /* interaction: drag to turn and tilt, buttons to zoom, select a light to fly there */
      const pos = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      const nearest = (x, y) => {
        let best = null, bd = 1e9;
        for (const h of hits) { const dd = Math.min(Math.hypot(h.x - x, h.y - y), Math.hypot(h.tx - x, h.ty - y)); if (dd < h.r && dd < bd) { bd = dd; best = h.name; } }
        return best;
      };
      const onMove = e => {
        const [x, y] = pos(e); mouse.x = (x / W - 0.5) * 2; mouse.y = (y / H - 0.5) * 2;
        if (drag && drag.touch) { if (Math.hypot(x - drag.x, y - drag.y) > 8) drag.moved = true; return; }
        if (drag) { goal.yaw = drag.yaw - (x - drag.x) / W * 3.2; goal.pitch = Math.min(1.25, Math.max(0.45, drag.pitch - (y - drag.y) / H * 1.4)); if (Math.hypot(x - drag.x, y - drag.y) > 6) drag.moved = true; }
        else { hover = nearest(x, y); el.style.cursor = hover ? 'pointer' : 'grab'; }
      };
      const onDown = e => { if (e.target.closest('button, a')) return; const [x, y] = pos(e); drag = { x, y, yaw: goal.yaw, pitch: goal.pitch, moved: false, touch: e.pointerType === 'touch' }; if (!drag.touch) el.setPointerCapture?.(e.pointerId); };
      const onUp = e => {
        const d = drag; drag = null; if (!d || d.moved) return;
        const [x, y] = pos(e); const name = nearest(x, y);
        if (name) { hover = name; st.current.onPick?.(name); }
      };
      const onLeave = () => { mouse.x = 0; mouse.y = 0; hover = null; };
      el.addEventListener('pointermove', onMove); el.addEventListener('pointerdown', onDown); el.addEventListener('pointerup', onUp); el.addEventListener('pointerleave', onLeave);
      api.current.zoom = f => { goal.dist = Math.min(90000, Math.max(2500, goal.dist * f)); };
      api.current.reset = () => { st.current.onPick?.(null); Object.assign(goal, { tx: 600, ty: 1500, dist: homeDist(), pitch: 0.92 }); };
      api.current.frame = frame;
      cleanup = () => { ro.disconnect(); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp); el.removeEventListener('pointerleave', onLeave); const lose = gl.getExtension('WEBGL_lose_context'); lose && lose.loseContext(); };
      setState('ready');
      if (visible) raf = requestAnimationFrame(frame);
    }
    return () => { dead = true; io.disconnect(); vis.disconnect(); cancelAnimationFrame(raf); cleanup(); };
  }, []);

  return (
    <div className="city" ref={wrap} data-state={state}>
      <canvas ref={glc} className="city-gl" aria-hidden="true" />
      <canvas ref={ovc} className="city-ov" aria-hidden="true" />
      {state !== 'ready' && state !== 'fallback' && <p className="city-loading">Drawing Hyderabad…</p>}
      {state === 'fallback' && <img className="city-fallback" src="/city-hyderabad.jpg" alt="" />}
      {state === 'ready' && (
        <div className="city-zoom">
          <button type="button" onClick={() => api.current.zoom(0.62)} aria-label="Closer">+</button>
          <button type="button" onClick={() => api.current.zoom(1.6)} aria-label="Further">−</button>
          <button type="button" onClick={() => api.current.reset()} aria-label="The whole city" className="city-all">All</button>
        </div>
      )}
      <a className="city-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>
      <span className="sr-only">A live map of Hyderabad drawn in light. Our places: {places.map(p => p.name).join(', ')}.</span>
    </div>
  );
}
