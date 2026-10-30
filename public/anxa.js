document.documentElement.classList.add('js');
(function(){
  const hdr=document.querySelector('.hdr');
  const onScroll=()=>{ if(hdr) hdr.classList.toggle('solid', scrollY>40); };
  addEventListener('scroll',onScroll,{passive:true}); onScroll();

  // mobile menu
  const mn=document.querySelector('.mnav');
  document.querySelector('.burger')?.addEventListener('click',()=>mn.classList.add('open'));
  mn?.querySelector('button')?.addEventListener('click',()=>mn.classList.remove('open'));
  mn?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>mn.classList.remove('open')));

  // reveal on scroll (content is visible without JS; this only animates it in)
  const io=new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target);} }),{threshold:.18,rootMargin:'0px 0px -6% 0px'});
  document.querySelectorAll('.rv').forEach(el=>io.observe(el));
  setTimeout(()=>document.querySelectorAll('.rv').forEach(el=>{ if(el.getBoundingClientRect().top<innerHeight) el.classList.add('in'); }),60);

  // videos play only while on screen
  const vio=new IntersectionObserver(es=>es.forEach(e=>{ const v=e.target; if(e.isIntersecting){ v.play().catch(()=>{}); } else v.pause(); }),{threshold:.15});
  document.querySelectorAll('video[data-auto]').forEach(v=>{ v.muted=true; vio.observe(v); });

  // statement: words light up as you read down
  const big=document.querySelector('.statement p.big');
  if(big){
    const words=big.textContent.trim().split(/\s+/);
    big.innerHTML=words.map(w=>'<span>'+w+'</span>').join(' ');
    const spans=[...big.querySelectorAll('span')];
    const light=()=>{ const r=big.getBoundingClientRect(); const p=Math.min(1,Math.max(0,(innerHeight*.85-r.top)/(r.height+innerHeight*.35))); const n=Math.round(p*spans.length); spans.forEach((s,i)=>s.classList.toggle('lit',i<n)); };
    addEventListener('scroll',light,{passive:true}); light();
  }

  // count-up numbers
  const cio=new IntersectionObserver(es=>es.forEach(e=>{ if(!e.isIntersecting) return; const el=e.target, n=+el.dataset.count, sup=el.querySelector('sup'); let s=null;
    const step=ts=>{ s=s||ts; const k=Math.min(1,(ts-s)/1500); el.firstChild.nodeValue=Math.round(n*(1-Math.pow(1-k,3))); if(k<1) requestAnimationFrame(step); };
    requestAnimationFrame(step); cio.unobserve(el); }),{threshold:.6});
  document.querySelectorAll('[data-count]').forEach(el=>cio.observe(el));

  // sector chapters: progress bar + active chip
  const chapters=[...document.querySelectorAll('.chapter')], chips=[...document.querySelectorAll('.idxnav a[href^="#"]')];
  if(chapters.length){
    const upd=()=>{ chapters.forEach((c,i)=>{ const r=c.getBoundingClientRect(); const p=Math.min(1,Math.max(0,(innerHeight-r.top)/(r.height+innerHeight))); const bar=c.querySelector('.bar'); if(bar) bar.style.width=(p*100)+'%'; const on=r.top<innerHeight*.5&&r.bottom>innerHeight*.5; chips[i]?.classList.toggle('on',on); }); };
    addEventListener('scroll',upd,{passive:true}); upd();
  }

  // hero: headline builds up, level gauge follows the tower film
  const b=document.querySelector('.build'); if(b) requestAnimationFrame(()=>setTimeout(()=>{ b.querySelectorAll('.w>span').forEach((s,i)=>s.style.transitionDelay=(i*0.09)+'s'); b.classList.add('up'); },250));
  const hv=document.querySelector('.hero video'), gn=document.querySelector('.gauge .gn'), gm=document.querySelector('.gauge .track i');
  if(hv&&gn){ const tick=()=>{ const d=hv.duration||8, p=(hv.currentTime%d)/d; const lv=Math.min(32,Math.round(p*34)); gn.textContent=String(lv).padStart(2,'0'); gm.style.bottom=(p*100)+'%'; requestAnimationFrame(tick); }; requestAnimationFrame(tick); }

  // blueprint draws itself as you scroll past it
  const bp=document.querySelector('.bp');
  if(bp){ const ds=[...bp.querySelectorAll('.d')]; const draw=()=>{ const r=bp.getBoundingClientRect(); const p=Math.min(1,Math.max(0,(innerHeight-r.top)/(r.height+innerHeight*.35))); ds.forEach((d,i)=>{ const k=Math.min(1,Math.max(0,p*ds.length*0.9-i*0.75)); d.style.strokeDashoffset=1-k; }); }; addEventListener('scroll',draw,{passive:true}); draw(); }

  // drafting crosshair on desktop
  const xh=document.querySelector('.xh');
  if(xh && matchMedia('(pointer:fine)').matches){ const v=xh.querySelector('.xv'), h=xh.querySelector('.xhz'), t=xh.querySelector('span');
    addEventListener('mousemove',e=>{ xh.classList.add('on'); v.style.left=e.clientX+'px'; h.style.top=e.clientY+'px'; t.style.left=(e.clientX+12)+'px'; t.style.top=(e.clientY+12)+'px'; t.textContent='X '+String(Math.round(e.clientX)).padStart(4,'0')+'  Y '+String(Math.round(e.clientY+scrollY)).padStart(5,'0'); },{passive:true});
    document.addEventListener('mouseleave',()=>xh.classList.remove('on')); }
})();

// page loader: the ANXA peak builds while the next page loads
(function(){
  const ld=document.querySelector('.ld'); if(!ld) return;
  const hide=()=>{ ld.classList.remove('on'); ld.classList.add('off'); };
  const minShow=()=>Math.max(0,750-performance.now());
  if(document.readyState==='complete') setTimeout(hide,minShow()); else addEventListener('load',()=>setTimeout(hide,minShow()));
  setTimeout(hide,2600); // never hold a slow connection hostage
  addEventListener('pageshow',e=>{ if(e.persisted) hide(); });
  document.addEventListener('click',e=>{
    const a=e.target.closest('a[href]'); if(!a||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;
    if(a.target==='_blank'||a.hasAttribute('download')||a.dataset.go) return;
    let u; try{ u=new URL(a.href,location.href); }catch(_){ return; }
    if(u.origin!==location.origin||!/^https?:/.test(u.protocol)) return;
    if(u.pathname===location.pathname&&u.search===location.search) return; // same page / anchors
    e.preventDefault();
    ld.classList.remove('off'); void ld.offsetWidth; ld.classList.add('on');
    setTimeout(()=>{ location.href=u.href; },520);
  });
})();
