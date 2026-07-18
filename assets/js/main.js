/* ============================================================================
   大轩巴 — main.js
   Optimized, dependency-free interactions.
   - Strict light / dark theme (no "system" — per spec)
   - Sticky nav state, mobile drawer
   - Gentle magnetic micro-interaction (pointer devices only)
   - Scroll reveal via IntersectionObserver
   - FAQ accordion, tabs, toast, count-up, back-to-top
   No decorative canvas / particles — keep it calm and fast.
   ========================================================================== */
(function () {
  'use strict';

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse  = window.matchMedia('(pointer: coarse)').matches;
  const root = document.documentElement;

  /* ----------------------------------------------------------------------
     THEME — light / dark only, persisted
  ---------------------------------------------------------------------- */
  const THEME_KEY = 'dxb-theme';
  const themeBtn = $('#themeSwitch');

  function setTheme(mode) {
    root.setAttribute('data-theme', mode);
    if (themeBtn) themeBtn.setAttribute('aria-pressed', String(mode === 'dark'));
  }

  let theme = localStorage.getItem(THEME_KEY);
  if (theme !== 'light' && theme !== 'dark') theme = 'light'; // default: light
  setTheme(theme);

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      theme = (root.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
      setTheme(theme);
      localStorage.setItem(THEME_KEY, theme);
      toast(theme === 'dark' ? '已切换到深色' : '已切换到浅色');
    });
  }

  /* ----------------------------------------------------------------------
     NAV — scroll state + mobile drawer
  ---------------------------------------------------------------------- */
  const header = $('#siteHeader');
  const onScroll = () => {
    if (header) header.classList.toggle('site-header--scrolled', window.scrollY > 12);
    const toTop = $('#toTop');
    if (toTop) toTop.classList.toggle('show', window.scrollY > 600);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const burger = $('#navBurger');
  const mobileMenu = $('#mobileMenu');
  if (burger && mobileMenu) {
    const toggle = (open) => {
      mobileMenu.classList.toggle('open', open);
      document.body.classList.toggle('no-scroll', open);
      burger.setAttribute('aria-expanded', String(open));
    };
    burger.addEventListener('click', () => toggle(!mobileMenu.classList.contains('open')));
    $$('a', mobileMenu).forEach(a => a.addEventListener('click', () => toggle(false)));
  }

  /* ----------------------------------------------------------------------
     MAGNETIC (gentle, pointer only) — wrap target in .magnetic
  ---------------------------------------------------------------------- */
  function bindMagnetic(wrap) {
    if (wrap.dataset.mag) return;
    wrap.dataset.mag = '1';
    if (reduced || coarse) return;
    const target = wrap.firstElementChild || wrap;
    const strength = parseFloat(wrap.dataset.strength || '0.25');
    let raf = null, tx = 0, ty = 0, cx = 0, cy = 0;
    const move = (e) => {
      const r = wrap.getBoundingClientRect();
      const mx = e.clientX - (r.left + r.width / 2);
      const my = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(mx, my) > 140) { tx = 0; ty = 0; } else { tx = mx * strength; ty = my * strength; }
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const loop = () => {
      cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2;
      target.style.transform = `translate(${cx.toFixed(2)}px, ${cy.toFixed(2)}px)`;
      if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) raf = requestAnimationFrame(loop);
      else { raf = null; target.style.transform = `translate(${tx}px, ${ty}px)`; }
    };
    wrap.addEventListener('mousemove', move);
    wrap.addEventListener('mouseleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(loop); });
  }
  $$('.magnetic').forEach(bindMagnetic);

  /* ----------------------------------------------------------------------
     SPOTLIGHT on product cards (subtle radial highlight)
  ---------------------------------------------------------------------- */
  function bindSpotlight(card) {
    if (card.dataset.spot) return;
    card.dataset.spot = '1';
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }
  $$('.product-card').forEach(bindSpotlight);

  /* ----------------------------------------------------------------------
     SCROLL REVEAL
  ---------------------------------------------------------------------- */
  const revealEls = $$('.reveal');
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }

  /* ----------------------------------------------------------------------
     FAQ ACCORDION
  ---------------------------------------------------------------------- */
  $$('.accordion__item').forEach(item => {
    const q = $('.accordion__q', item);
    const a = $('.accordion__a', item);
    if (!q || !a) return;
    q.addEventListener('click', () => {
      const open = item.classList.toggle('open');
      q.setAttribute('aria-expanded', String(open));
      a.style.maxHeight = open ? a.scrollHeight + 'px' : '0px';
    });
  });

  /* ----------------------------------------------------------------------
     TABS
  ---------------------------------------------------------------------- */
  $$('[data-tabs]').forEach(root2 => {
    const tabs = $$('[role="tab"]', root2);
    const panels = $$('.tab-panel', root2);
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.setAttribute('aria-selected', String(t === tab)));
        const id = tab.getAttribute('aria-controls');
        panels.forEach(p => p.classList.toggle('active', p.id === id));
      });
    });
  });

  /* ----------------------------------------------------------------------
     SEGMENTED / SUBNAV active state (visual only)
  ---------------------------------------------------------------------- */
  $$('.segmented').forEach(group => {
    $$('button', group).forEach(btn => btn.addEventListener('click', () => {
      $$('button', group).forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
    }));
  });

  /* ----------------------------------------------------------------------
     BACK TO TOP
  ---------------------------------------------------------------------- */
  const toTop = $('#toTop');
  if (toTop) toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }));

  /* ----------------------------------------------------------------------
     COUNT-UP (data-count)
  ---------------------------------------------------------------------- */
  const counters = $$('[data-count]');
  if (counters.length && 'IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const el = en.target;
        const target = parseFloat(el.dataset.count);
        const suffix = el.dataset.suffix || '';
        const decimals = (el.dataset.count.split('.')[1] || '').length;
        const dur = 1300, t0 = performance.now();
        const tick = (now) => {
          const p = Math.min(1, (now - t0) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = (target * eased).toFixed(decimals) + suffix;
          if (p < 1) requestAnimationFrame(tick); else el.textContent = target.toFixed(decimals) + suffix;
        };
        requestAnimationFrame(tick);
        io.unobserve(el);
      });
    }, { threshold: 0.5 });
    counters.forEach(el => io.observe(el));
  } else {
    counters.forEach(el => { el.textContent = parseFloat(el.dataset.count) + (el.dataset.suffix || ''); });
  }

  /* ----------------------------------------------------------------------
     TOAST
  ---------------------------------------------------------------------- */
  let toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; document.body.appendChild(toastEl); }
    const tick = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    toastEl.innerHTML = tick + '<span>' + msg + '</span>';
    requestAnimationFrame(() => toastEl.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2000);
  }
  window.dxbToast = toast;

  /* ----------------------------------------------------------------------
     Re-bind dynamic nodes injected after load (e.g. download cards)
  ---------------------------------------------------------------------- */
  function bindDynamic() {
    $$('.magnetic').forEach(bindMagnetic);
    $$('.product-card').forEach(bindSpotlight);
    const rev = $$('.reveal:not(.in)');
    if ('IntersectionObserver' in window && !reduced) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { threshold: 0.12 });
      rev.forEach(el => io.observe(el));
    } else { rev.forEach(el => el.classList.add('in')); }
  }
  document.addEventListener('dxb:cards-rendered', bindDynamic);

  /* ----------------------------------------------------------------------
     SMOOTH ANCHOR scrolling (respects reduced motion)
  ---------------------------------------------------------------------- */
  $$('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    });
  });

})();
