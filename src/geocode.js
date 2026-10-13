/* Forgiving address search for Hyderabad.
   People type plot numbers, road numbers and typos ("plot 80, road no2, jubliee hills").
   OpenStreetMap does not know plot numbers, so we clean the text, correct well-known
   locality names, then try from the most precise version to the broadest and keep the
   first hit inside Greater Hyderabad. Two free geocoders (no key): Nominatim and Photon. */

import AREAS from './data/areas';

/* every well-known Hyderabad name we can place instantly (src/data/areas.js) */
const AREA = AREAS;
const LOCALITIES = [...Object.keys(AREA).filter(n => !/\d/.test(n)), 'Hyderabad', 'Telangana'];
const km = (a, b) => { const R = 6371, dLat = (b[0] - a[0]) * Math.PI / 180, dLng = (b[1] - a[1]) * Math.PI / 180; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

const lev = (a, b) => {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
};

/* replace misspelt locality names ("jubliee hills" -> "Jubilee Hills") */
function correct(text) {
  let words = text.split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length;) {
    let done = false;
    for (const size of [3, 2, 1]) {
      if (i + size > words.length) continue;
      const chunk = words.slice(i, i + size).join(' ').toLowerCase().replace(/[^a-z ]/g, '');
      if (chunk.length < 5) continue;
      let best = null, bd = 99;
      for (const L of LOCALITIES) {
        if (L.split(' ').length !== size) continue;
        const d = lev(chunk, L.toLowerCase());
        if (d < bd) { bd = d; best = L; }
      }
      const allow = chunk.length >= 9 ? 2 : 1;
      if (best && bd <= allow) { out.push(best); i += size; done = true; break; }
    }
    if (!done) { out.push(words[i]); i++; }
  }
  return out.join(' ');
}

/* take out what maps do not know: plot / house / flat numbers, pin codes */
function clean(raw) {
  let s = ' ' + raw.replace(/[\n\r]+/g, ', ') + ' ';
  s = s.replace(/\b(plot|plots|h\.?\s?no|house\s?no|door\s?no|flat|flat\s?no|apt|survey\s?no|sy\.?\s?no|s\.?\s?no)\.?\s*[#:.-]?\s*[\w/-]+/gi, ' ');
  s = s.replace(/#\s*[\w/-]+/g, ' ');
  s = s.replace(/\b\d{6}\b/g, ' ');                                  // pin code
  s = s.replace(/\b(road|rd)\.?\s*(no|number|num)?\.?\s*(\d+)/gi, 'Road No $3'); // "road no2" -> "Road No 2"
  s = s.replace(/\s*,\s*/g, ', ').replace(/\s{2,}/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '');
  return s;
}

/* precise → broad: whole text, then without the road, then locality pairs, then single localities */
function candidates(raw) {
  const cleaned = correct(clean(raw));
  const list = [cleaned];
  const noRoad = cleaned.replace(/\bRoad No \d+\b/gi, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '');
  list.push(noRoad);
  const found = LOCALITIES.filter(L => L !== 'Hyderabad' && L !== 'Telangana' && new RegExp('\\b' + L + '\\b', 'i').test(cleaned))
    .sort((a, b) => cleaned.toLowerCase().indexOf(a.toLowerCase()) - cleaned.toLowerCase().indexOf(b.toLowerCase()));
  const road = (cleaned.match(/\bRoad No \d+\b/i) || [])[0];
  if (found.length >= 2) list.push(found.join(', '));
  if (road && found.length) list.push(`${road}, ${found[found.length - 1]}`);
  found.forEach(L => list.push(L));
  // finally, the last few words on their own (usually the area)
  const words = noRoad.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  for (let k = Math.min(3, words.length - 1); k >= 1; k--) list.push(words.slice(-k).join(' '));
  const generic = /^(hills?|village|road|colony|nagar|layout|phase|hyderabad|telangana|india|hills hyderabad|road no \d+)$/i;
  return [...new Set(list.map(x => x.trim()).filter(x => x.length > 2 && !generic.test(x) && !/^hills\b/i.test(x)))];
}

const inHyd = (lat, lng) => lat > 16.9 && lat < 17.9 && lng > 77.9 && lng < 78.95;

const uniq = arr => arr.filter((x, i) => x && arr.findIndex(y => y && y.toLowerCase() === x.toLowerCase()) === i);

async function nominatim(q) {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=3&countrycodes=in&viewbox=77.9,17.9,78.95,16.9&bounded=1'
    + '&q='
    + encodeURIComponent(/hyderabad|telangana/i.test(q) ? q : q + ', Hyderabad');
  const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  const j = await r.json();
  const h = j.find(x => inHyd(+x.lat, +x.lon));
  if (!h) return null;
  const A = h.address || {};
  return { lat: +h.lat, lng: +h.lon, area: uniq([A.road, A.neighbourhood, A.suburb, A.city_district, A.village, A.town, A.city || 'Hyderabad']).join(', ') };
}
async function photon(q) {
  const url = 'https://photon.komoot.io/api/?limit=5&lang=en&lat=17.42&lon=78.38&bbox=77.9,16.9,78.95,17.9&q=' + encodeURIComponent(q);
  const r = await fetch(url);
  const j = await r.json();
  const f = (j.features || []).find(x => inHyd(x.geometry.coordinates[1], x.geometry.coordinates[0]));
  if (!f) return null;
  const p = f.properties;
  return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], area: uniq([p.street, p.locality, p.district, p.city || 'Hyderabad']).join(', '), text: [p.name, p.street, p.locality, p.district].join(' ') };
}

const significant = s => s.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3 && !/^(road|hills|nagar|colony|phase|village|hyderabad)$/.test(w));
const title = s => s.replace(/\b([a-z])/g, c => c.toUpperCase());

/* Returns { lat, lng, short, full, approx } or null.
   short: what the visitor asked for (cleaned, plot numbers kept out); full: where we placed the light. */
export async function geocode(raw) {
  const tries = candidates(raw).slice(0, 6);
  const asked = title(correct(clean(raw)));
  const areas = Object.keys(AREA).filter(L => new RegExp('\\b' + L + '\\b', 'i').test(asked))
    .sort((a, b) => asked.toLowerCase().indexOf(a.toLowerCase()) - asked.toLowerCase().indexOf(b.toLowerCase()));
  const anchor = areas.length ? AREA[areas[areas.length - 1]] : null;  // usually the wider area, typed last
  const near = hit => !anchor || km(anchor, [hit.lat, hit.lng]) < 5;    // a hit far from the named area is a wrong match
  const pack = (hit, i, label) => ({ lat: hit.lat, lng: hit.lng, short: i === 0 ? asked : (label || title(tries[i].includes(',') || areas.length < 2 ? tries[i] : areas.filter(L => tries[i].toLowerCase().includes(L.toLowerCase())).join(', ') || tries[i])), full: hit.area, approx: i > 0, asked });
  for (let i = 0; i < tries.length; i++) {
    const q = tries[i];
    /* a plain area name: we know where it is */
    const known = Object.keys(AREA).find(L => L.toLowerCase() === q.toLowerCase());
    if (known) return pack({ lat: AREA[known][0], lng: AREA[known][1], area: known + ', Hyderabad' }, i, known);
    try {
      const hit = await nominatim(q);
      if (hit && near(hit)) return pack(hit, i);
    } catch { /* OpenStreetMap busy: Photon below */ }
    try {
      const hit = await photon(q);
      if (hit && near(hit)) { const want = significant(q), got = hit.text.toLowerCase(); if (!want.length || want.some(w => got.includes(w))) return pack(hit, i); }
    } catch { /* next candidate */ }
  }
  /* last resort: the closest well-known name to what was typed */
  const guess = suggest(raw, 1)[0] || suggest(asked.split(' ').slice(-2).join(' '), 1)[0];
  if (guess) return { lat: guess.lat, lng: guess.lng, short: guess.name, full: guess.name + ', Hyderabad', approx: true, asked };
  return null;
}

/* ---------- suggestions as the visitor types ---------- */
const norm = t => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const NAMES = Object.keys(AREA).map(n => ({ n, k: norm(n) }));
export function suggest(text, limit = 6) {
  const q = norm(text.split(',').pop() || text);
  if (q.length < 2) return [];
  const scored = [];
  for (const { n, k } of NAMES) {
    let sc = 99;
    if (k.startsWith(q)) sc = 0;
    else if (k.split(' ').some(w => w.startsWith(q))) sc = 1;
    else if (k.includes(q)) sc = 2;
    else if (q.length >= 4) { const d = lev(q, k.slice(0, q.length)); if (d <= (q.length >= 5 ? 2 : 1)) sc = 3 + d; }
    if (sc < 99) scored.push([sc, k.length, n]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return scored.slice(0, limit).map(([, , n]) => ({ name: n, lat: AREA[n][0], lng: AREA[n][1] }));
}
export const place = name => AREA[name] ? { lat: AREA[name][0], lng: AREA[name][1], short: name, full: name + ', Hyderabad', approx: false, asked: name } : null;

/* how far the land is from the places a family cares about (straight-line, rounded) */
const LANDMARKS = [['HITEC City', [17.4483, 78.3815]], ['Financial District', [17.4136, 78.3390]], ['Jubilee Hills', [17.4308, 78.4103]], ['the airport', [17.2403, 78.4294]]];
export function distances(lat, lng) {
  return LANDMARKS.map(([name, p]) => ({ name, km: km([lat, lng], p) }))
    .filter(x => x.km > 1.2).map(x => ({ name: x.name, km: x.km < 10 ? Math.round(x.km * 2) / 2 : Math.round(x.km) }));
}

/* well-known places close to a point, nearest first (for "nearby" chips and "use my location") */
export function nearby(lat, lng, limit = 4, maxKm = 6, exclude = '') {
  return Object.keys(AREA).filter(n => n !== exclude && !/^Road No|Road$|Metro$|Junction$|Flyover$/.test(n))
    .map(n => ({ name: n, lat: AREA[n][0], lng: AREA[n][1], km: km([lat, lng], AREA[n]) }))
    .filter(x => x.km <= maxKm && x.km > 0.25).sort((a, b) => a.km - b.km).slice(0, limit)
    .map(x => ({ ...x, km: x.km < 10 ? Math.round(x.km * 2) / 2 : Math.round(x.km) }));
}

export default geocode;
