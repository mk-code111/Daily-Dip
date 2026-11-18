/* TBM product-page extras: reveal-on-scroll, steeping timer, ingredient flip cards. */
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const reveal = (el) => {
    if (el.dataset.tbmRev) return;
    el.dataset.tbmRev = '1';
    if (reduced || !('IntersectionObserver' in window)) return;
    el.classList.add('is-ready');
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { el.classList.add('is-in'); io.disconnect(); }
    }), { threshold: 0.25 });
    io.observe(el);
  };

  /* ---------- steeping timer ---------- */
  const timer = (box) => {
    if (box.dataset.tbmReady) return;
    box.dataset.tbmReady = '1';
    const total = Math.max(30, Number(box.dataset.tbmSteep) || 240);
    const clock = box.querySelector('[data-tbm-steep-clock]');
    const btn = box.querySelector('[data-tbm-steep-btn]');
    const done = box.querySelector('[data-tbm-steep-done]');
    let left = total; let t = null;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const paint = () => {
      clock.textContent = fmt(left);
      box.style.setProperty('--fill', (0.15 + 0.85 * (1 - left / total)).toFixed(3));
    };
    const stop = () => { clearInterval(t); t = null; box.classList.remove('is-running'); };
    const finish = () => {
      stop(); box.classList.add('is-done'); done.hidden = false;
      btn.textContent = btn.dataset.labelAgain;
      try { navigator.vibrate?.([120, 60, 120]); } catch (_) {}
    };
    btn.addEventListener('click', () => {
      if (box.classList.contains('is-done')) {
        left = total; box.classList.remove('is-done'); done.hidden = true; paint();
      }
      if (t) { stop(); btn.textContent = btn.dataset.labelStart; return; }
      box.classList.add('is-running');
      btn.textContent = btn.dataset.labelPause;
      t = setInterval(() => { left -= 1; paint(); if (left <= 0) finish(); }, 1000);
    });
    paint();
  };

  /* ---------- ingredient flip cards ---------- */
  const flip = (grid) => {
    if (grid.dataset.tbmFlip) return;
    grid.dataset.tbmFlip = '1';
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('[data-tbm-ig-card]');
      if (!card) return;
      // on hover devices the card already flips on hover; a click keeps it turned
      card.setAttribute('aria-pressed', String(card.getAttribute('aria-pressed') !== 'true'));
    });
  };

  const init = () => {
    document.querySelectorAll('.tbm-br__steps, [data-tbm-ig]').forEach(reveal);
    document.querySelectorAll('[data-tbm-steep]').forEach(timer);
    document.querySelectorAll('[data-tbm-ig]').forEach(flip);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  document.addEventListener('shopify:section:load', init);
})();
