import { useEffect, useRef, useState } from 'react';
import { mountGate } from './ideasGate';
import { FILM_CAPTIONS } from './filmCaptions';
import './ideas-gate.css';

/* The first screen of the website is the Ideas Gate: PROJECT 49 and the seven ideas, four above and
   three below. It is the exact last frame of the opening film (What Holds).

   First visit: a quiet invitation -> "Begin" plays the film full-screen with sound -> the film ends
   on the gate, the film layer lifts away and the identical frame underneath is now the live website.
   It stays as the top screen of the site (every later visit and refresh lands on it directly).
   Clicking an idea opens that idea; the rest of the website continues below when you scroll. */

// One picture, three voiceovers. English is always the default; the visitor can switch before or during the film.
const FILMS = { en: '/film/p49-what-holds.mp4', te: '/film/p49-what-holds-te.mp4', hi: '/film/p49-what-holds-hi.mp4' };
const LANGS = [['en', 'English'], ['te', 'తెలుగు'], ['hi', 'हिंदी']];
const GATE_STARTS_AT = 51.58;          // second of the film where the Ideas Gate begins
const SEEN_KEY = 'p49-intro-seen';
const CC_KEY = 'p49-film-captions';     // remembers if a visitor turned captions off

function captionsOn() {
  try { return localStorage.getItem(CC_KEY) !== 'off'; } catch { return true; }
}
const SHADE_UNTIL = 51.54;               // the end card and the gate stay clean
const captionAt = t => FILM_CAPTIONS.findIndex(([s, e]) => t >= s && t < e);

function firstOverlay() {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has('intro')) return 'invite';                 // ?intro always replays the film
    if (q.has('nointro')) return null;
    return sessionStorage.getItem(SEEN_KEY) ? null : 'invite';
  } catch { return 'invite'; }
}

export default function IntroFilm({ onEnterIdea }) {
  const [overlay, setOverlay] = useState(firstOverlay); // 'invite' | 'film' | null
  const [muted, setMuted] = useState(false);
  const [lang, setLang] = useState('en');
  const [cc, setCc] = useState(captionsOn);
  const [cue, setCue] = useState(-1);                    // index of the caption on screen, -1 = none
  const [shade, setShade] = useState(false);
  const [leaving, setLeaving] = useState(false);          // film fading into the gate             // soft dark fade under the captions, picture only
  const heroRef = useRef(null), gateEl = useRef(null), gate = useRef(null), videoRef = useRef(null);
  const overlayRef = useRef(overlay); overlayRef.current = overlay;

  const markSeen = () => { try { sessionStorage.setItem(SEEN_KEY, '1'); } catch {} };

  // The gate is built once and stays as the top screen of the site.
  useEffect(() => {
    if (!gateEl.current) return;
    gate.current = mountGate(gateEl.current, {
      onSelect: i => { if (overlayRef.current) endFilm(); onEnterIdea && onEnterIdea(i); },
      showEnter: false,                                   // no button: the ideas are the way in, the site continues below
    });
    if (!overlayRef.current) gate.current.finish();       // returning visitor: the frame is simply there
    return () => { gate.current?.destroy(); gate.current = null; };
  }, []);

  // While the film layer is up, the page does not scroll and sits at the very top.
  useEffect(() => {
    if (!overlay) return;
    window.scrollTo(0, 0);
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [overlay]);

  // Captions follow the film frame by frame (timeupdate is too coarse for clean fades).
  useEffect(() => {
    if (overlay !== 'film') { setCue(-1); setShade(false); return; }
    let raf = 0, last = -2, lastShade = null;
    const tick = () => {
      const v = videoRef.current;
      const t = v ? v.currentTime : 0;
      const i = v ? captionAt(t) : -1;
      if (i !== last) { last = i; setCue(i); }
      const sh = t < SHADE_UNTIL;
      if (sh !== lastShade) { lastShade = sh; setShade(sh); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [overlay]);

  // Hide the small site header while the gate is on screen (the gate carries the mark itself).
  useEffect(() => {
    const el = heroRef.current; if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => document.body.classList.toggle('p49-at-gate', e.intersectionRatio > 0.35), { threshold: [0, 0.35, 0.7, 1] });
    io.observe(el);
    return () => { io.disconnect(); document.body.classList.remove('p49-at-gate'); };
  }, []);

  // Lift the film layer away; the identical gate frame underneath becomes the live website.
  const endFilm = () => {
    markSeen();
    videoRef.current?.pause();
    window.scrollTo(0, 0);
    setOverlay(null);
  };

  // "Begin": play inside the click so the browser allows sound.
  const begin = () => {
    const v = videoRef.current;
    setOverlay('film');
    if (!v) return;
    v.muted = false; setMuted(false);
    v.play().catch(() => { v.muted = true; setMuted(true); v.play().catch(() => {}); });
  };

  const onEnded = () => {
    gate.current?.finish();
    setLeaving(true);                                     // dissolve the film into the gate
    setTimeout(() => { setLeaving(false); endFilm(); }, 900);
  };

  // Skip: the gate animates in live from wherever the film was.
  const skip = () => {
    const v = videoRef.current;
    const t = v ? v.currentTime - GATE_STARTS_AT : -1;
    if (t > 0) { gate.current?.render(t); gate.current?.play(t); } else gate.current?.play(0);
    endFilm();
  };

  // Film cannot load or play: go straight to the gate.
  const onError = () => { if (overlayRef.current) { gate.current?.play(0); endFilm(); } };

  const toggleSound = () => {
    const v = videoRef.current; if (!v) return;
    v.muted = !v.muted; setMuted(v.muted);
    if (v.paused) v.play().catch(() => {});
  };

  // Switch the voiceover without losing the moment: same picture, so resume at the same second.
  const chooseLang = l => {
    if (l === lang) return;
    const v = videoRef.current;
    const t = v ? v.currentTime : 0, playing = v ? !v.paused : false;
    setLang(l);
    if (!v) return;
    const resume = () => {
      v.removeEventListener('loadedmetadata', resume);
      try { v.currentTime = t; } catch {}
      if (playing) v.play().catch(() => {});
    };
    v.addEventListener('loadedmetadata', resume);
  };

  const langSwitch = cls => (
    <div className={'p49-lang ' + cls} role="group" aria-label="Film language">
      <span className="p49-lang-label" aria-hidden="true">Translate</span>
      {LANGS.map(([k, t]) => (
        <button key={k} type="button" lang={k} aria-pressed={lang === k} onClick={() => chooseLang(k)}>{t}</button>
      ))}
    </div>
  );

  const toggleCaptions = () => setCc(on => {
    try { localStorage.setItem(CC_KEY, on ? 'off' : 'on'); } catch {}
    return !on;
  });

  return (
    <>
      <section className="p49-gate-hero" id="start" ref={heroRef} aria-label="Project 49 - choose a philosophy">
        <div ref={gateEl} />
      </section>

      {overlay && (
        <div className={'p49-intro-film' + (leaving ? ' is-leaving' : '')}>
          <video ref={videoRef} src={FILMS[lang]} playsInline preload="auto" style={{ opacity: overlay === 'film' ? 1 : 0 }}
            onEnded={onEnded} onError={onError} />
          {overlay === 'film' && (
            <>
              {/* Same 16:9 box as the picture (object-fit: contain), so captions always sit inside the frame */}
              <div className={'p49-film-frame' + (cc && shade && FILM_CAPTIONS.length > 0 ? ' is-shaded' : '')} aria-hidden="true">
                <div className="p49-film-shade" />
                <div className="p49-film-captions">
                  {cc && cue >= 0 && <p key={cue} className="p49-film-caption">{FILM_CAPTIONS[cue][2]}</p>}
                </div>
              </div>
              <button className="p49-intro-skip p49-intro-sound" onClick={toggleSound}>{muted ? 'Sound on' : 'Sound off'}</button>
              {FILM_CAPTIONS.length > 0 && <button className="p49-intro-skip p49-intro-cc" onClick={toggleCaptions} aria-pressed={cc}>{cc ? 'Captions off' : 'Captions on'}</button>}
              <button className="p49-intro-skip" onClick={skip}>Skip film</button>
              {langSwitch('p49-lang--film')}
            </>
          )}
        </div>
      )}

      {overlay === 'invite' && (
        <div className="p49-intro-invite" role="dialog" aria-label="Project 49 film">
          <img className="p49-invite-mark" src="/marks/elephant.png" alt="" />
          <p className="p49-invite-title">PROJECT 49</p>
          <span className="p49-invite-rule" />
          <button className="p49-invite-begin" onClick={begin} autoFocus>
            <span className="p49-invite-play" aria-hidden="true" />Begin
          </button>
          <p className="p49-invite-note">A short film · best with sound</p>
          {langSwitch('p49-lang--invite')}
          <button className="p49-invite-skip" onClick={() => { gate.current?.play(0); endFilm(); }}>Skip the film</button>
        </div>
      )}
    </>
  );
}
