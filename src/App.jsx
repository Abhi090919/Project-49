import { useEffect, useRef, useState } from 'react';
import chapters from './data/chapters';
import CONTACT from './data/contact';
import PLACES from './data/places';
import { Soundscape } from './sound';
import IdeaPreview from './IdeaPreview';
import Cinema from './Cinema';
import CityModel, { inModel } from './CityModel';
import geocode, { suggest, place, distances, nearby } from './geocode';
import IntroFilm from './intro/IntroFilm';
import { Threshold, LitStatement, Delivery, Scarcity, Rail, Cursor } from './World';

/* LIGHT -> Light */
const ideaName = id => id.charAt(0) + id.slice(1).toLowerCase();

/* Splits a heading into lines that rise out of a mask, one after another. */
function splitLines(el) {
  if (el.dataset.split) return;
  el.dataset.split = '1';
  const html = el.innerHTML.split(/<br\s*\/?>/i);
  el.innerHTML = html.map((line, i) => `<span class="ln" style="--d:${i * 90}ms"><i>${line}</i></span>`).join('');
}


/* Smooth wheel scrolling (Lenis-style easing, no library). Native scroll position is kept,
   so sticky scenes, anchors and the keyboard all work as normal. */
function useSmoothWheel() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(pointer: fine)').matches) return;
    let target = window.scrollY, cur = target, raf = 0, active = false;
    const max = () => document.documentElement.scrollHeight - window.innerHeight;
    let broken = false, misses = 0;
    const step = () => {
      const before = window.scrollY;
      cur += (target - cur) * 0.11;
      if (Math.abs(target - cur) < 0.4) { cur = target; active = false; }
      window.scrollTo({ top: cur, behavior: 'instant' });
      /* if the browser refuses to move the page, stop smoothing and let normal scrolling work */
      if (Math.abs(target - before) > 20 && Math.abs(window.scrollY - before) < 0.5) { if (++misses > 8) { broken = true; active = false; } } else misses = 0;
      raf = active ? requestAnimationFrame(step) : 0;
    };
    const scrollable = el => {
      for (; el && el !== document.body; el = el.parentElement) {
        const cs = getComputedStyle(el);
        if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2) return true;
      }
      return false;
    };
    const onWheel = e => {
      if (e.ctrlKey || e.defaultPrevented || document.body.style.overflow === 'hidden' || document.documentElement.style.overflow === 'hidden') return;
      if (scrollable(e.target)) return;
      if (broken) return;
      e.preventDefault();
      if (!active) { target = cur = window.scrollY; }
      const d = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
      target = Math.max(0, Math.min(max(), target + d));
      if (!active) { active = true; raf = requestAnimationFrame(step); }
    };
    /* any other kind of scroll (keys, scrollbar, anchor links) takes over */
    const sync = () => { if (!active) target = cur = window.scrollY; };
    const stop = () => { active = false; cancelAnimationFrame(raf); raf = 0; target = cur = window.scrollY; };
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('keydown', stop); window.addEventListener('mousedown', stop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('wheel', onWheel); window.removeEventListener('scroll', sync); window.removeEventListener('keydown', stop); window.removeEventListener('mousedown', stop); };
  }, []);
}

/* One scroll loop for the whole page: gives [data-parallax] elements a slow drift. */
function useParallax() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const els = [...document.querySelectorAll('[data-parallax]')];
    if (!els.length) return;
    let queued = false;
    const draw = () => {
      queued = false;
      const vh = window.innerHeight;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        const centre = (r.top + r.height / 2 - vh / 2) / vh;      // -1 … 1
        el.style.setProperty('--py', `${(centre * (Number(el.dataset.parallax) || 6)).toFixed(2)}%`);
      }
    };
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
    draw();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, []);
}

/* adds .in to every [data-reveal] element as it scrolls into view */
function useReveal() {
  useEffect(() => {
    document.querySelectorAll('[data-lines]').forEach(splitLines);
    const els = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { threshold: 0.04, rootMargin: '0px 0px 6% 0px' });
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, []);
}

/* A full-bleed film loop: plays only while on screen, a still frame for reduced motion. */
function Film({ name, className = '', parallax = 0 }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }, { threshold: 0.05 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <div className={'film ' + className} aria-hidden="true">
      <video ref={ref} src={`/cine/${name}.mp4`} poster={`/cine/${name}.jpg`} muted loop playsInline preload="metadata"
        data-parallax={parallax || undefined} />
      <div className="film-grade" />
    </div>
  );
}

function Masthead({ solid, hidden, sound, onSound }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const close = e => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  const closeMenu = () => setMenuOpen(false);
  // keyboard users: focus moves into the menu when it opens and back to the button when it closes
  const toggleRef = useRef(null), menuRef = useRef(null), wasOpen = useRef(false);
  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector('.menu-close')?.focus();
    else if (wasOpen.current) toggleRef.current?.focus();
    wasOpen.current = menuOpen;
  }, [menuOpen]);

  return (
    <>
      <header className={'masthead ' + (solid ? 'is-solid' : '') + (hidden && !menuOpen ? ' is-hidden' : '')}>
        <a className="brand" href="#home"><img src="/marks/elephant-160.png" alt="" /><span>PROJECT 49</span></a>
        <button type="button" className="sound-btn" aria-pressed={sound} onClick={onSound} aria-label={sound ? 'Sound on, turn off' : 'Sound off, turn on'} data-cursor={sound ? 'Mute' : 'Listen'}>
          <span className="sound-bars" aria-hidden="true"><i /><i /><i /><i /></span><span className="sound-txt">Sound</span>
        </button>
        <button ref={toggleRef} className={'menu-toggle ' + (menuOpen ? 'is-open' : '')} onClick={() => setMenuOpen(v => !v)}
          aria-expanded={menuOpen} aria-controls="site-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'}>
          <i /><i /><i />
        </button>
      </header>
      <button className={'menu-backdrop ' + (menuOpen ? 'is-open' : '')} onClick={closeMenu} tabIndex={menuOpen ? 0 : -1} aria-label="Close menu" />
      <aside ref={menuRef} className={'site-menu ' + (menuOpen ? 'is-open' : '')} id="site-menu" aria-hidden={!menuOpen} {...(menuOpen ? {} : { inert: '' })}>
        <button className="menu-close" onClick={closeMenu} aria-label="Close menu"><i /><i /></button>
        <p className="eyebrow">Project 49 · Hyderabad</p>
        <nav aria-label="Menu">
          <a href="#idea" onClick={closeMenu}><span>01</span>The idea</a>
          <a href="#ideas" onClick={closeMenu}><span>02</span>Design philosophies</a>
          <a href="#delivery" onClick={closeMenu}><span>·</span>How we work</a>
          <a href="#places" onClick={closeMenu}><span>03</span>Where we build</a>
          <a href="#people" onClick={closeMenu}><span>04</span>The people</a>
          <a href="#conversation" onClick={closeMenu}><span>05</span>Talk to us</a>
        </nav>
        <a className="menu-commission" href="#conversation" onClick={closeMenu}>Start a conversation <span>↗</span></a>
        <p className="menu-location">Hyderabad, India</p>
      </aside>
    </>
  );
}

function Opening() {
  return (
    <Threshold>
    <div className="cine cine-hero">
      <Film name="atrium" parallax={5} />
      <div className="cine-letterbox" aria-hidden="true" />
      <div className="cine-hero-copy">
        <p className="eyebrow">Project 49 · Hyderabad</p>
        <h1>Same city.<br />Different lives.<br /><em>Why should the homes be the same?</em></h1>
        <p className="cine-hero-line">Built around a family. Not around a floor plan.</p>
        <div className="opening-actions">
          <a className="enter-link" href="#idea" data-cursor="Begin">Begin <span>↓</span></a>
          <a className="enter-link quiet" href="#conversation" data-cursor="Talk">Tell us about your land <span>↗</span></a>
        </div>
      </div>
      <div className="opening-bottom">
        <span>49 homes · 7 ideas</span>
        <a href="#idea">Scroll <i>↓</i></a>
        <span>Hyderabad</span>
      </div>
    </div>
    </Threshold>
  );
}

const CHAPTERS = [
  { n: '01', film: 'land', title: ['It begins', 'with your land.'], line: 'Every great home starts with its ground. We walk it with you first: the light, the trees, the way the ground falls.' },
  { n: '02', film: 'idea', title: ['Then,', 'a philosophy.'], line: 'You choose the philosophy your home grows from: light, air, art, roots, earth, silence or future. Then it is drawn exclusively for your land and your family alone.' },
  { n: '03', film: 'home', title: ['And finally,', 'your home.'], line: 'We design it, build it and hand you the keys. A home that is yours alone, and stays one of one.' },
];

function Idea() {
  return (
    <section className="chapters" id="idea" aria-label="How a Project 49 home begins">
      {CHAPTERS.map(c => (
        <div className="chapter-hold" key={c.n}>
          <article className="cine chapter">
            <Film name={c.film} parallax={4} />
            <div className="cine-letterbox" aria-hidden="true" />
            <div className="chapter-copy" data-reveal>
              <span className="chapter-n">{c.n}</span>
              <h2 data-lines>{c.title[0]}<br /><em>{c.title[1]}</em></h2>
              <p>{c.line}</p>
            </div>
          </article>
        </div>
      ))}
    </section>
  );
}

/* a single still moment between chapters */
function Interlude() {
  return (
    <section className="cine interlude" aria-label="Interlude">
      <Film name="reading" parallax={3} />
      <div className="cine-letterbox" aria-hidden="true" />
      <blockquote data-reveal>
        <p data-lines>A home is not finished<br /><em>the day it is built.</em></p>
        <cite>Project 49</cite>
      </blockquote>
    </section>
  );
}

function Ideas({ hover, setHover, enter, opened, visited }) {
  const c = chapters[hover];
  return (
    <section className="ideas-section" id="ideas">
      <div className="section-heading" data-reveal>
        <p className="eyebrow">02 / Seven design philosophies</p>
        <h2 data-lines>Seven ways to live.<br /><em>Which one feels like you?</em></h2>
        <p>Each philosophy is a way of living in a home, not a fixed plan. Yours is shaped around your land, your family and the way you want to live.</p>
      </div>
      <div className="ideas-composition">
        <div className="idea-preview" data-reveal>
          <IdeaPreview chapter={c} hidden={opened !== null} />
          <div className="preview-shade" />
          <span className="preview-number">{c.number}</span>
          <div className="preview-caption" key={c.id}>
            <p>{c.tags}</p>
            <p className="preview-whisper">{c.whisper}</p>
            <h3>{c.title}</h3>
            <button onClick={() => enter(hover)} data-cursor="Explore">Explore {ideaName(c.id)} <span>↗</span></button>
          </div>
        </div>
        <div className="idea-list" data-reveal>
          {chapters.map((ch, i) => (
            <button key={ch.id} className={'idea-row ' + (hover === i ? 'selected' : '')}
              onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => enter(i)} data-cursor="Explore">
              <span className="idea-number">{ch.number}</span>
              <span className="idea-name">{ideaName(ch.id)}</span>
              <span className="idea-detail">{ch.title}</span>
              <span className="idea-arrow">{visited.includes(i) ? '◦' : '↗'}</span>
            </button>
          ))}
          <p className="list-note">Explore a philosophy to see how it comes to life.</p>
        </div>
      </div>
    </section>
  );
}

/* Find an address: geocoded with OpenStreetMap (no key), flown to on the land model,
   with Google Street View and a 3D satellite view one click away. */
const POPULAR = ['Jubilee Hills', 'Banjara Hills', 'Kokapet', 'Narsingi', 'Gandipet', 'Financial District', 'Tellapur', 'Moinabad'];

function AddressSearch({ target, setTarget, onFound }) {
  const [q, setQ] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const [open, setOpen] = useState(false), [hi, setHi] = useState(-1);
  const list = q.trim().length >= 2 ? suggest(q) : [];
  const choose = name => {
    const hit = place(name); if (!hit) return;
    setQ(name); setOpen(false); setHi(-1); setErr(''); setTarget(hit); onFound();
  };
  const go = async e => {
    e.preventDefault();
    if (open && hi >= 0 && list[hi]) { choose(list[hi].name); return; }
    const query = q.trim(); if (!query) return;
    setOpen(false); setBusy(true); setErr('');
    try {
      const hit = await geocode(query);
      if (!hit) { setErr('We could not place that one. Try the area or village name, for example "Kokapet" or "Jubilee Hills".'); setTarget(null); }
      else { setTarget(hit); onFound(); }
    } catch { setErr('Search is not available right now. Tell us the address below and we will come and see it.'); }
    setBusy(false);
  };
  const keys = e => {
    if (!open || !list.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => (h + 1) % list.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => (h <= 0 ? list.length : h) - 1); }
    else if (e.key === 'Escape') setOpen(false);
  };
  const [locating, setLocating] = useState(false);
  useEffect(() => { if (target?.fromMap) { setQ(target.short); setErr(''); setOpen(false); } }, [target]);
  const share = (hit, scroll) => {
    const d = distances(hit.lat, hit.lng)[0];
    window.dispatchEvent(new CustomEvent('p49:land', { detail: { location: hit.asked || hit.short || hit.full, dist: d ? `${d.km} km to ${d.name}` : '', scroll } }));
  };
  useEffect(() => { if (target) share(target, false); }, [target]);
  const locate = () => {
    if (!navigator.geolocation) { setErr('Your browser does not share location. Type the area instead.'); return; }
    setLocating(true); setErr('');
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords; setLocating(false);
      const near = nearby(lat, lng, 1, 25)[0];
      if (!near) { setErr('You seem to be outside Hyderabad. Type the area of your land instead.'); return; }
      const label = 'Near ' + near.name;
      setQ(label); setTarget({ lat, lng, short: label, full: `Where you are now · ${near.km} km from ${near.name}`, approx: false, asked: label }); onFound();
    }, () => { setLocating(false); setErr('We could not get your location. Type the area of your land instead.'); }, { enableHighAccuracy: true, timeout: 9000 });
  };
  const sv = target && `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${target.lat},${target.lng}`;
  const sat = target && `https://www.google.com/maps/@${target.lat},${target.lng},420a,35y,0h,65t/data=!3m1!1e3`;
  const dist = target ? distances(target.lat, target.lng) : [];
  const near = target ? nearby(target.lat, target.lng, 4, 6, target.short) : [];
  const tell = () => {
    share(target, true);
    const el = document.getElementById('conversation');
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: 'smooth' });
  };
  return (
    <div className="address">
      <form className={'address-form' + (open && (list.length || !q) ? ' is-open' : '')} onSubmit={go} role="search" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setTimeout(() => setOpen(false), 120); }}>
        <label className="sr-only" htmlFor="addr">Your plot's address or area</label>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5" /></svg>
        <input id="addr" value={q} onChange={e => { setQ(e.target.value); setOpen(true); setHi(-1); }} onFocus={() => setOpen(true)} onKeyDown={keys}
          placeholder="Type your plot's address, area or village" autoComplete="off" role="combobox" aria-expanded={open} aria-controls="addr-list" aria-autocomplete="list" />
        <button type="submit" disabled={busy} data-cursor="Find">{busy ? 'Finding…' : 'Find my land'}</button>
        {open && list.length > 0 && (
          <ul className="address-suggest" id="addr-list" role="listbox">
            {list.map((s, i) => (
              <li key={s.name} role="option" aria-selected={i === hi}>
                <button type="button" className={i === hi ? 'on' : ''} onMouseDown={e => e.preventDefault()} onClick={() => choose(s.name)}>
                  <span>{s.name}</span><em>{distances(s.lat, s.lng)[0] ? `${distances(s.lat, s.lng)[0].km} km to ${distances(s.lat, s.lng)[0].name}` : 'Hyderabad'}</em>
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && !q && (
          <div className="address-popular">
            <button type="button" className="address-locate" onMouseDown={e => e.preventDefault()} onClick={() => { setOpen(false); locate(); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="7.5" /></svg>{locating ? 'Finding you…' : 'I am standing on my land'}
            </button>
            <span>Popular</span>
            {POPULAR.map(n => <button type="button" key={n} onMouseDown={e => e.preventDefault()} onClick={() => choose(n)}>{n}</button>)}
          </div>
        )}
      </form>
      {err && <p className="address-err">{err}</p>}
      {target && (
        <div className="address-card" key={target.full + target.lat}>
          <p className="eyebrow">Your land</p>
          <h3>{target.short}</h3>
          <p className="address-full">{target.full}</p>
          {dist.length > 0 && (
            <ul className="address-dist">
              {dist.map(d => <li key={d.name}><strong>{d.km}</strong> km<span>to {d.name}</span></li>)}
            </ul>
          )}
          {target.approx && <p className="address-note">Showing the closest match on the map. We will find your exact plot together on our first visit.</p>}
          {!inModel(target.lat, target.lng) && <p className="address-note">This is beyond the part of the city our model shows. We still come and see land there.</p>}
          {near.length > 0 && (
            <div className="address-near">
              <span>Close by</span>
              {near.map(n => <button type="button" key={n.name} onClick={() => choose(n.name)} data-cursor="Fly">{n.name}<em>{n.km} km</em></button>)}
            </div>
          )}
          <button type="button" onClick={tell} className="address-tell" data-cursor="Talk">This is my land. Start a conversation <span>→</span></button>
          <div className="address-actions">
            <a href={sv} target="_blank" rel="noopener noreferrer" data-cursor="Walk">Street view ↗</a>
            <a href={sat} target="_blank" rel="noopener noreferrer" data-cursor="Fly">3D satellite ↗</a>
            <button type="button" onClick={() => setTarget(null)} className="address-clear" aria-label="Clear the search">×</button>
          </div>
          <p className="address-linked">Added to your note below.</p>
        </div>
      )}
    </div>
  );
}

function Places() {
  const [target, setTarget] = useState(null);
  /* any light on the map opens the same card as a search */
  const pick = name => {
    if (!name) { setTarget(null); return; }
    const pin = PLACES.pins.find(p => p.name === name);
    const hit = place(name) || (pin && { lat: pin.lat, lng: pin.lng, short: pin.name, full: pin.name + ', Hyderabad', approx: false, asked: pin.name });
    if (hit) setTarget({ ...hit, fromMap: true });
  };
  return (
    <section className="places" id="places">
      <div className="section-heading" data-reveal>
        <p className="eyebrow">03 / Where we build</p>
        <h2 data-lines>The green west<br /><em>of Hyderabad.</em></h2>
        <p>Where there is still room for a garden and a tree, and the city is close. Type your plot's address to fly to it, or select any place on the map.</p>
      </div>
      <div className="places-map land-wrap" data-reveal>
        <CityModel places={PLACES.pins} target={target} onPick={pick} />
        <AddressSearch target={target} setTarget={setTarget} onFound={() => {}} />
        <p className="land-hint" aria-hidden="true">Drag to turn the city · select any light</p>
      </div>
    </section>
  );
}

function People() {
  return (
    <section className="cine credits" id="people">
      <Film name="table" parallax={3} />
      <div className="cine-letterbox" aria-hidden="true" />
      <p className="eyebrow" data-reveal>04 / The people</p>
      <div className="credits-row" data-reveal>
        <div className="credit">
          <span className="credit-studio">Envisioned by</span>
          <strong>Saketh<br />Bharadwaj</strong>
        </div>
        <div className="credit">
          <span className="credit-studio">Brought to life by</span>
          <strong>Divya<br />Dacharla</strong>
        </div>
      </div>
      <p className="credits-note" data-reveal>Our people stay with you personally, from the first conversation to the day you move in.</p>
    </section>
  );
}

/* The composer (from Project 11:59): a few taps write a private note, which opens in WhatsApp.
   "Find my land" fills the land part in for the visitor (event: p49:land). */
const LAND = [['own', 'We own land', 'We already own the land'], ['finding', 'We’re finding land', 'We are finding land'], ['deciding', 'Still deciding', 'We are still deciding on land']];
const PEOPLE = [['the two of us', 'The two of us'], ['our children', 'Our children'], ['our parents', 'Our parents'], ['grandchildren, one day', 'Generations to come'], ['guests, often', 'Guests, often']];
// Sheet "Map" column (max 120 chars): a Google Maps link for the place they typed, plus the map distance when they used "Find my land".
const mapCell = (where, dist) => {
  const w = where.trim(), d = dist ? ` (${dist})` : '';
  if (!w) return dist || '';
  const url = q => `https://maps.google.com/?q=${encodeURIComponent(q)}`;
  const full = url(/hyderabad/i.test(w) ? w : `${w}, Hyderabad`);
  if ((full + d).length <= 120) return full + d;
  if (full.length <= 120) return full;
  return url(w.split(',')[0]).slice(0, 120);
};
const listJoin = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

function Chips({ options, value, onChange, single, label }) {
  const on = v => (single ? value === v : value.includes(v));
  const flip = v => single ? onChange(value === v ? '' : v) : onChange(on(v) ? value.filter(x => x !== v) : [...value, v]);
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map(([v, t]) => <button key={v} type="button" aria-pressed={on(v)} onClick={() => flip(v)}>{t}</button>)}
    </div>
  );
}

function Conversation() {
  const [land, setLand] = useState(''), [where, setWhere] = useState(''), [mapped, setMapped] = useState(null);
  const [people, setPeople] = useState([]), [idea, setIdea] = useState(''), [dream, setDream] = useState(''), [name, setName] = useState(''), [phone, setPhone] = useState(''), [trap, setTrap] = useState('');
  const [sent, setSent] = useState(false), [flash, setFlash] = useState(false);
  useEffect(() => {
    const onLand = e => {
      const d = e.detail || {};
      setWhere(d.location || ''); setMapped(d); setLand(l => l || 'own');
      if (d.scroll) { setFlash(true); setTimeout(() => setFlash(false), 1800); }
    };
    window.addEventListener('p49:land', onLand);
    return () => window.removeEventListener('p49:land', onLand);
  }, []);
  if (!CONTACT.enabled) return null;
  const wa = CONTACT.whatsapp ? `https://wa.me/${CONTACT.whatsapp.replace(/\D/g, '')}` : null;

  const lines = ['Hello Project 49,'];
  if (name.trim()) lines.push(`I’m ${name.trim()}.`);
  if (phone.trim()) lines.push(`You can reach me on ${phone.trim()}.`);
  const landLine = LAND.find(x => x[0] === land)?.[2];
  if (landLine || where.trim()) lines.push(`${landLine || 'Our land'}${where.trim() ? `, in ${where.trim()}` : ''}.`);
  if (people.length) lines.push(`The home is for ${listJoin(people)}.`);
  if (idea) lines.push(idea === 'EXPLORING' ? 'We’re still exploring which philosophy feels like home.' : `The philosophy that feels like home: ${ideaName(idea)}.`);
  if (dream.trim()) lines.push(`What we imagine: ${dream.trim()}`);
  if (lines.length === 1 || lines.length === 1 + (name.trim() ? 1 : 0) + (phone.trim() ? 1 : 0)) lines.push('We’d like to begin a private conversation about our home.');
  const note = lines.join('\n');
  // Every note is also kept in the Project 49 > Website Leads sheet (Google Apps Script web app),
  // so nothing is lost if the visitor never presses send in WhatsApp.
  const save = () => {
    if (!CONTACT.endpoint) return;
    const data = {
      name: name.trim(), phone: phone.trim(), land: LAND.find(x => x[0] === land)?.[1] || '', where: where.trim(),
      map: mapCell(where, mapped && mapped.location === where ? mapped.dist : ''),
      people: listJoin(people),
      idea: idea ? (idea === 'EXPLORING' ? 'Still exploring' : ideaName(idea)) : '', dream: dream.trim(), note, website: trap,
    };
    try {
      fetch(CONTACT.endpoint, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) }).catch(() => {});
    } catch (_) { /* never block the conversation */ }
  };
  const href = wa ? `${wa}?text=${encodeURIComponent(note)}` : CONTACT.email ? `mailto:${CONTACT.email}?subject=${encodeURIComponent('Project 49: our home')}&body=${encodeURIComponent(note)}` : null;

  return (
    <section className="cine conversation" id="conversation">
      <Film name="bluehour" className="film-deep" />
      <div className="conversation-copy" data-reveal>
        <p className="eyebrow">05 / {CONTACT.eyebrow}</p>
        <h2 data-lines>{CONTACT.line}</h2>
        <p>{CONTACT.note}</p>
        <ol className="promise">
          <li><span>01</span>We call you back within a day.</li>
          <li><span>02</span>We come and walk the land with you.</li>
          <li><span>03</span>One person stays with you, start to finish.</li>
        </ol>
        <div className="private-links">
          {CONTACT.name && <span>{CONTACT.name}</span>}
          {CONTACT.email && <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>}
          {CONTACT.phone && <a href={`tel:${CONTACT.phone.replace(/\s/g, '')}`}>{CONTACT.phone}</a>}
          {CONTACT.instagram && <a href={`https://instagram.com/${CONTACT.instagram}`} target="_blank" rel="noopener noreferrer">@{CONTACT.instagram}</a>}
        </div>
      </div>
      <div className="conversation-form" data-reveal>
        {href ? (
          <form className="composer" onSubmit={e => e.preventDefault()} noValidate>
            <fieldset>
              <legend>The land</legend>
              <Chips label="The land" single options={LAND.map(([v, t]) => [v, t])} value={land} onChange={setLand} />
            </fieldset>
            <label className={'field field-where' + (flash ? ' is-flash' : '')}>
              <span>Where is it?</span>
              <input name="location" value={where} onChange={e => { setWhere(e.target.value); setMapped(null); }} placeholder="Area, village or the plot’s address" autoComplete="address-level2" />
              {mapped && mapped.location === where
                ? <small className="where-mapped"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></svg>Placed on our map{mapped.dist ? ` · ${mapped.dist}` : ''} <a href="#places">see it ↑</a></small>
                : <small className="where-mapped is-hint"><a href="#places">Or find it on our map ↑</a></small>}
            </label>
            <fieldset>
              <legend>Who will call it home</legend>
              <Chips label="Who will call it home" options={PEOPLE} value={people} onChange={setPeople} />
            </fieldset>
            <fieldset>
              <legend>The philosophy that feels like home</legend>
              <Chips label="The philosophy" single options={[...chapters.map(c => [c.id, ideaName(c.id)]), ['EXPLORING', 'Still exploring']]} value={idea} onChange={setIdea} />
            </fieldset>
            <label className="field">
              <span>In a sentence, the home you imagine</span>
              <textarea rows="2" value={dream} onChange={e => setDream(e.target.value)} placeholder="Morning light in the kitchen, parents close by, a garden the children grow up in…" />
            </label>
            <label className="field field--half">
              <span>Your name</span>
              <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Optional" />
            </label>
            <label className="field field--half">
              <span>Your phone</span>
              <input type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" placeholder="So we can call you back" />
            </label>
            <input className="hp-field" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={trap} onChange={e => setTrap(e.target.value)} />
            <div className="note" aria-live="polite">
              <span className="note-label">Your note</span>
              <p>{note}</p>
            </div>
            <div className="composer-foot">
              <a className="btn-solid" href={href} target="_blank" rel="noopener noreferrer" data-cursor="Begin" onClick={() => { save(); setSent(true); }}>Begin a private conversation <span>↗</span></a>
              <small>{sent ? (CONTACT.endpoint ? 'We have your note. Press send in WhatsApp too, and we will call you back within a day.' : 'Your note is ready in WhatsApp. Press send there and we will call you back within a day.') : CONTACT.endpoint ? 'Keeps your note with us privately and opens WhatsApp with it.' : wa ? 'Opens WhatsApp with your note. Nothing is sent until you choose to.' : 'Opens your email with the note written out.'}</small>
            </div>
          </form>
        ) : (
          <p className="pending">Enquiries open shortly. Until then, the seven ideas are the best way to get a feel for how we build.</p>
        )}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer id="collaboration">
      <div className="footer-grid">
        <div>
          <a className="footer-brand" href="#home" aria-label="Project 49, back to the top">
            <img src="/marks/elephant-mark.png" alt="" width="480" height="322" />
            <i className="footer-rule" aria-hidden="true" />
            <span>PROJECT 49</span>
          </a>
        </div>
        <nav className="footer-nav" aria-label="Sections">
          <a href="#idea">The idea</a>
          <a href="#ideas">Design philosophies</a>
          <a href="#places">Where we build</a>
          <a href="#people">The people</a>
          <a href="#conversation">Start a conversation</a>
          <a href="/about/">About ANXA Infra · FAQ</a>
          <a href="/">Go to ANXA Infra →</a>
        </nav>
        <div className="footer-ideas" aria-hidden="true">
          {chapters.map(c => <span key={c.id}>{ideaName(c.id)}</span>)}
        </div>
      </div>
      <a className="to-anxa" href="/" aria-label="Go to ANXA Infra">
        <span className="ta-k">A real estate venture by</span>
        <span className="ta-n">ANXA INFRA</span>
        <span className="ta-d">Construction &amp; infrastructure services across India: commercial buildings, industrial plants, data centres and railways.</span>
        <span className="ta-go">Go to ANXA <i aria-hidden="true">→</i></span>
      </a>
      {CONTACT.rera && <p className="rera-line">{CONTACT.rera}</p>}
      <div className="footer-end">
        <span>ANXA INFRA · PROJECT 49 · HYDERABAD · {new Date().getFullYear()}</span>
        <a href="#home">Back to the top ↑</a>
      </div>
    </footer>
  );
}

export default function App() {
  const [hover, setHover] = useState(0), [opened, setOpened] = useState(null), [frame, setFrame] = useState(0);
  const [sound, setSound] = useState(false), [volume, setVolume] = useState(.5), [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0), [visited, setVisited] = useState([]), [muted, setMuted] = useState(() => { try { return localStorage.getItem('p49-sound') === 'off'; } catch { return false; } });
  const [solid, setSolid] = useState(false), [hideBar, setHideBar] = useState(false);
  const engine = useRef(null), trigger = useRef(null);
  const chapter = opened === null ? null : chapters[opened], scene = chapter?.scenes[frame];

  useReveal();
  useParallax();
  useSmoothWheel();
  useEffect(() => { engine.current = new Soundscape(); return () => engine.current.dispose(); }, []);
  useEffect(() => { if (sound) engine.current.scene(chapter?.id || 'HOME', scene?.id || ''); }, [sound, chapter, scene]);
  useEffect(() => {
    /* Clear over the hero; solid once the hero has gone; tucks away while you read
       downwards and comes back the moment you scroll up. */
    let last = window.scrollY, queued = false;
    const draw = () => {
      queued = false;
      const y = window.scrollY, hero = document.getElementById('home');
      const heroEnd = hero ? hero.offsetTop + hero.offsetHeight - 90 : window.innerHeight;
      setSolid(y > heroEnd);
      if (Math.abs(y - last) > 6) { setHideBar(y > last && y > heroEnd - window.innerHeight * 0.6); last = y; }
    };
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
    draw(); window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const enable = async (idea, film) => {
    try {
      await engine.current.start(); engine.current.volume(volume);
      typeof idea === 'string' ? engine.current.scene(idea, film || '') : engine.current.scene(chapter?.id || 'HOME', scene?.id || '');
      if (idea === 'HOME') engine.current.theme(null);
      setSound(true); setMuted(false);
    } catch { setSound(false); }
  };
  const remember = on => { try { localStorage.setItem('p49-sound', on ? 'on' : 'off'); } catch {} };
  const toggleSound = () => { if (sound) { engine.current.suspend(); setSound(false); setMuted(true); remember(false); } else { remember(true); enable(); } };
  /* The score starts with the visitor's first touch once the opening film is over (browsers need a gesture),
     unless they turned sound off before. Any film playing with its own sound pauses the score. */
  const soundRef = useRef(sound); soundRef.current = sound;
  const mutedRef = useRef(muted); mutedRef.current = muted;
  useEffect(() => {
    const filmUp = () => document.querySelector('.p49-intro-film, .p49-intro-invite');
    const first = () => {
      if (soundRef.current || mutedRef.current || filmUp()) return;
      enable('HOME'); window.removeEventListener('pointerdown', first, true); window.removeEventListener('keydown', first, true);
    };
    window.addEventListener('pointerdown', first, true); window.addEventListener('keydown', first, true);
    const playing = e => { const v = e.target; if (v.tagName === 'VIDEO' && !v.muted && soundRef.current) engine.current.suspend(); };
    const stopped = e => { const v = e.target; if (v.tagName === 'VIDEO' && !v.muted && soundRef.current) engine.current.start(); };
    document.addEventListener('play', playing, true); document.addEventListener('pause', stopped, true); document.addEventListener('ended', stopped, true);
    return () => {
      window.removeEventListener('pointerdown', first, true); window.removeEventListener('keydown', first, true);
      document.removeEventListener('play', playing, true); document.removeEventListener('pause', stopped, true); document.removeEventListener('ended', stopped, true);
    };
  }, []);
  const enter = i => {
    if (opened === null) trigger.current = document.activeElement;
    setFrame(0); setProgress(0); setPaused(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    setOpened(i); setHover(i); setVisited(v => [...new Set([...v, i])]);
    if (sound) { engine.current.start(); engine.current.scene('HOME'); }
    else if (!muted) enable(chapters[i].id, chapters[i].scenes[0]?.id);
  };
  const leave = () => { setOpened(null); if (sound) { engine.current.start(); engine.current.theme(null); engine.current.scene('HOME'); } requestAnimationFrame(() => trigger.current?.focus()); };
  const advance = () => { setProgress(0); setFrame(n => (n + 1) % chapter.scenes.length); if (sound && chapter.id === 'SILENCE') engine.current.scene('SILENCE'); };
  const back = () => { setProgress(0); setFrame(n => (n - 1 + chapter.scenes.length) % chapter.scenes.length); };
  const pause = () => { setPaused(!paused); if (sound) { if (!paused) engine.current.suspend(); else engine.current.start(); } };

  useEffect(() => { if (!chapter) return; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, [opened]);
  useEffect(() => {
    if (!scene || scene.video || paused) return;
    const start = Date.now(), timer = setInterval(() => { const p = (Date.now() - start) / 10000; setProgress(p); if (p >= 1) { clearInterval(timer); advance(); } }, 100);
    return () => clearInterval(timer);
  }, [scene, paused]);
  useEffect(() => {
    const visibility = () => { if (document.hidden) engine.current.suspend(); else if (sound && !paused) engine.current.start(); };
    document.addEventListener('visibilitychange', visibility); return () => document.removeEventListener('visibilitychange', visibility);
  }, [sound, paused]);

  return (
    <>
      <div className="site-shell" inert={chapter ? true : undefined}>
        <Masthead solid={solid} hidden={hideBar} sound={sound} onSound={toggleSound} />
        <Rail />
        <Cursor />
        <main>
          <IntroFilm onEnterIdea={enter} />
          <Opening />
          <Idea />
          <LitStatement id="belief" eyebrow="What we believe" lines={['Luxury should be personal.', 'The philosophy may repeat. The architecture never does.']} note="Built around a family. Not around a floor plan." />
          <Ideas hover={hover} setHover={setHover} enter={enter} opened={opened} visited={visited} />
          <Delivery />
          <Interlude />
          <Places />
          <People />
          <Scarcity />
          <Conversation />
        </main>
        <Footer />
      </div>
      {chapter && (
        <Cinema chapter={chapter} scene={scene} frame={frame} opened={opened} paused={paused} progress={progress}
          sound={sound} volume={volume} setVolume={v => { setVolume(v); engine.current.volume(v); }}
          onProgress={setProgress} onAdvance={advance} onBack={back} onLeave={leave} onPause={pause}
          onSound={toggleSound} onEnable={enable} onSelect={i => { setFrame(i); setProgress(0); }} onNext={() => enter((opened + 1) % 7)} />
      )}
    </>
  );
}
