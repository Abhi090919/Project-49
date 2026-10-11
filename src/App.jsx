import { useEffect, useRef, useState } from 'react';
import chapters from './data/chapters';
import CONTACT from './data/contact';
import PLACES from './data/places';
import { Soundscape } from './sound';
import IdeaPreview from './IdeaPreview';
import Cinema from './Cinema';
import LandModel, { inModel } from './LandModel';
import geocode, { suggest, place, distances } from './geocode';
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

function Masthead({ solid, hidden }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const close = e => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <header className={'masthead ' + (solid ? 'is-solid' : '') + (hidden && !menuOpen ? ' is-hidden' : '')}>
        <a className="brand" href="#home"><img src="/marks/elephant-160.png" alt="" /><span>PROJECT 49</span></a>
        <button className={'menu-toggle ' + (menuOpen ? 'is-open' : '')} onClick={() => setMenuOpen(v => !v)}
          aria-expanded={menuOpen} aria-controls="site-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'}>
          <i /><i /><i />
        </button>
      </header>
      <button className={'menu-backdrop ' + (menuOpen ? 'is-open' : '')} onClick={closeMenu} tabIndex={menuOpen ? 0 : -1} aria-label="Close menu" />
      <aside className={'site-menu ' + (menuOpen ? 'is-open' : '')} id="site-menu" aria-hidden={!menuOpen}>
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
        <h1>Same city. Different lives.<br /><em>Why should the homes be the same?</em></h1>
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
  const sv = target && `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${target.lat},${target.lng}`;
  const sat = target && `https://www.google.com/maps/@${target.lat},${target.lng},420a,35y,0h,65t/data=!3m1!1e3`;
  const dist = target ? distances(target.lat, target.lng) : [];
  const tell = () => {
    const el = document.querySelector('#conversation input[name="location"]');
    if (el) { el.value = target.asked || target.full; el.dispatchEvent(new Event('input', { bubbles: true })); }
    document.getElementById('conversation')?.scrollIntoView({ behavior: 'smooth' });
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
          <div className="address-actions">
            <a href={sv} target="_blank" rel="noopener noreferrer" data-cursor="Walk">Street view ↗</a>
            <a href={sat} target="_blank" rel="noopener noreferrer" data-cursor="Fly">3D satellite ↗</a>
            <button type="button" onClick={tell} className="address-tell">Tell us about this land</button>
            <button type="button" onClick={() => setTarget(null)} className="address-clear" aria-label="Clear the search">×</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Places() {
  const [active, setActive] = useState(null), [touched, setTouched] = useState(false), [target, setTarget] = useState(null);
  const wrap = useRef(null);
  /* A slow guided tour of the places until the visitor takes over. */
  useEffect(() => {
    if (touched || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !wrap.current) return;
    let timer = null, i = -1;
    const io = new IntersectionObserver(([e]) => {
      clearInterval(timer);
      if (!e.isIntersecting) return;
      timer = setInterval(() => { i = (i + 1) % (PLACES.pins.length + 1); setActive(i === PLACES.pins.length ? null : i); }, 4200);
    }, { threshold: 0.35 });
    io.observe(wrap.current);
    return () => { clearInterval(timer); io.disconnect(); };
  }, [touched]);
  const pick = i => { setTouched(true); setActive(i); };
  return (
    <section className="places" id="places">
      <div className="section-heading" data-reveal>
        <p className="eyebrow">03 / Where we build</p>
        <h2 data-lines>The green west<br /><em>of Hyderabad.</em></h2>
        <p>Where there is still room for a garden and a tree, and the city is close. Type your plot's address to fly to it, or select a place below.</p>
      </div>
      <div className="places-map land-wrap" ref={wrap} data-reveal>
        <LandModel places={PLACES.pins} active={target ? null : active} target={target} onSelect={i => { setTarget(null); pick(i); }} />
        <AddressSearch target={target} setTarget={setTarget} onFound={() => { setTouched(true); setActive(null); }} />
        <p className="land-hint" aria-hidden="true">Move to tilt · select a light to fly there</p>
      </div>
      <ul className="places-list" data-reveal>
        {PLACES.pins.map((p, i) => (
          <li key={p.name}>
            <button type="button" className={active === i ? 'on' : ''} aria-pressed={active === i} onClick={() => { setTarget(null); pick(active === i ? null : i); }} data-cursor="Fly">
              <em className="places-n">{String(i + 1).padStart(2, '0')}</em>
              <strong>{p.name}</strong><span>{p.note}</span>
            </button>
          </li>
        ))}
      </ul>
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
          <strong>Saketh<br />Bharadwaj</strong>
          <em>Principal Architect</em>
          <p>Shapes every home around your family, your land and the light.</p>
        </div>
        <div className="credit">
          <strong>Divya<br />Dacharla</strong>
          <em>Managing Partner</em>
          <p>Your one point of contact, from the first visit to the day you move in.</p>
        </div>
      </div>
      <p className="credits-note" data-reveal>Our people stay with you personally, from the first conversation to the day you move in.</p>
    </section>
  );
}

function Conversation() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!CONTACT.enabled) return null;
  const wa = CONTACT.whatsapp ? `https://wa.me/${CONTACT.whatsapp.replace(/\D/g, '')}` : null;
  const channel = CONTACT.endpoint || CONTACT.email || wa;

  const submit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (CONTACT.endpoint) {
      setBusy(true);
      try {
        const r = await fetch(CONTACT.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
        if (!r.ok) throw new Error();
        setSent(true);
      } catch { alert('That did not go through. Please write to us directly instead.'); }
      setBusy(false);
    } else if (!CONTACT.email && wa) {
      const ideaLine = data.idea ? `The philosophy I like: ${data.idea}` : 'Not sure which philosophy yet';
      const landLine = data.land === 'own' ? 'I own a plot' : data.land === 'looking' ? 'I am looking for land' : 'No land yet';
      const text = `Hello Project 49,\n\nI am ${data.name}.\n${landLine}${data.location ? ` in ${data.location}` : ''}.\n${ideaLine}.${data.message ? `\n\n${data.message}` : ''}\n\nYou can reach me on ${data.reach}.`;
      window.open(`${wa}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      setSent(true);
    } else {
      const body = `Name: ${data.name}\nPhone / email: ${data.reach}\nLand: ${data.land}\nLocation: ${data.location}\nIdea: ${data.idea}\n\n${data.message}`;
      location.href = `mailto:${CONTACT.email}?subject=${encodeURIComponent('Project 49: my land')}&body=${encodeURIComponent(body)}`;
      setSent(true);
    }
  };

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
          {wa && (CONTACT.endpoint || CONTACT.email) && <a href={wa} target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a>}
          {CONTACT.phone && <a href={`tel:${CONTACT.phone.replace(/\s/g, '')}`}>{CONTACT.phone}</a>}
          {CONTACT.instagram && <a href={`https://instagram.com/${CONTACT.instagram}`} target="_blank" rel="noopener noreferrer">@{CONTACT.instagram}</a>}
        </div>
      </div>
      <div className="conversation-form" data-reveal>
        {channel ? (
          sent ? (
            <p className="sent">Thank you. {CONTACT.endpoint || CONTACT.email ? 'We will call you back within a day.' : 'Your message is ready in WhatsApp; press send and we will call you back within a day.'}</p>
          ) : (
            <form onSubmit={submit}>
              <label>Your name<input name="name" required autoComplete="name" /></label>
              <label>Phone or email<input name="reach" required autoComplete="tel" /></label>
              <label>Do you have land?
                <select name="land" defaultValue="">
                  <option value="">Not yet</option>
                  <option value="own">Yes, I own a plot</option>
                  <option value="looking">I am looking</option>
                </select>
              </label>
              <label>Where is it?<input name="location" autoComplete="address-level2" /></label>
              <label>A philosophy that speaks to you
                <select name="idea" defaultValue="">
                  <option value="">Not sure yet</option>
                  {chapters.map(c => <option key={c.id} value={c.id}>{ideaName(c.id)} · {c.title}</option>)}
                </select>
              </label>
              <label>Anything else<textarea name="message" rows="3" /></label>
              <button type="submit" className="enter-link" disabled={busy}>{busy ? 'Sending…' : (CONTACT.endpoint || CONTACT.email ? 'Start a conversation' : 'Send on WhatsApp')} <span>↗</span></button>
              {!CONTACT.endpoint && !CONTACT.email && wa && <small className="form-alt">Or message us directly on <a href={wa} target="_blank" rel="noopener noreferrer">{CONTACT.whatsapp}</a></small>}
            </form>
          )
        ) : (
          wa
            ? <div className="whatsapp-in"><a className="enter-link" href={wa} target="_blank" rel="noopener noreferrer">Message us on WhatsApp <span>↗</span></a><small>{CONTACT.whatsapp}</small></div>
            : <p className="pending">Enquiries open shortly. Until then, the seven ideas are the best way to get a feel for how we build.</p>
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
        </nav>
        <div className="footer-ideas" aria-hidden="true">
          {chapters.map(c => <span key={c.id}>{ideaName(c.id)}</span>)}
        </div>
      </div>
      {CONTACT.rera && <p className="rera-line">{CONTACT.rera}</p>}
      <div className="footer-end">
        <span>PROJECT 49 · HYDERABAD · {new Date().getFullYear()}</span>
        <a href="#home">Back to the top ↑</a>
      </div>
    </footer>
  );
}

export default function App() {
  const [hover, setHover] = useState(0), [opened, setOpened] = useState(null), [frame, setFrame] = useState(0);
  const [sound, setSound] = useState(false), [volume, setVolume] = useState(.5), [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0), [visited, setVisited] = useState([]), [muted, setMuted] = useState(false);
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
      if (typeof idea === 'string' && idea !== 'HOME') { engine.current.sting(idea); engine.current.theme(idea); }
      if (idea === 'HOME') engine.current.theme(null);
      setSound(true); setMuted(false);
    } catch { setSound(false); }
  };
  const toggleSound = () => { if (sound) { engine.current.suspend(); setSound(false); setMuted(true); } else enable(); };
  const enter = i => {
    if (opened === null) trigger.current = document.activeElement;
    setFrame(0); setProgress(0); setPaused(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    setOpened(i); setHover(i); setVisited(v => [...new Set([...v, i])]);
    if (sound) { engine.current.start(); engine.current.sting(chapters[i].id); engine.current.theme(chapters[i].id); engine.current.scene(chapters[i].id, chapters[i].scenes[0]?.id || ''); }
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
        <Masthead solid={solid} hidden={hideBar} />
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
