/* SF product-page extras: reveal-on-scroll, steeping timer, ingredient flip cards. */
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const reveal = (el) => {
    if (el.dataset.sfRev) return;
    el.dataset.sfRev = '1';
    if (reduced || !('IntersectionObserver' in window)) return;
    el.classList.add('is-ready');
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { el.classList.add('is-in'); io.disconnect(); }
    }), { threshold: 0.25 });
    io.observe(el);
  };

  /* ---------- steeping timer ---------- */
  const timer = (box) => {
    if (box.dataset.sfReady) return;
    box.dataset.sfReady = '1';
    const total = Math.max(30, Number(box.dataset.sfSteep) || 240);
    const clock = box.querySelector('[data-sf-steep-clock]');
    const btn = box.querySelector('[data-sf-steep-btn]');
    const done = box.querySelector('[data-sf-steep-done]');
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
    if (grid.dataset.sfFlip) return;
    grid.dataset.sfFlip = '1';
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('[data-sf-ig-card]');
      if (!card) return;
      // on hover devices the card already flips on hover; a click keeps it turned
      card.setAttribute('aria-pressed', String(card.getAttribute('aria-pressed') !== 'true'));
    });
  };

  const init = () => {
    document.querySelectorAll('.sf-br__steps, [data-sf-ig]').forEach(reveal);
    document.querySelectorAll('[data-sf-steep]').forEach(timer);
    document.querySelectorAll('[data-sf-ig]').forEach(flip);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  document.addEventListener('shopify:section:load', init);
})();
