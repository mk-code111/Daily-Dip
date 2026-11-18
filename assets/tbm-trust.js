/* TBM Trust icons: cards pop in and the tea wave steeps as they scroll into view. */
(() => {
  const init = (root) => {
    if (root.dataset.tbmTrInit) return;
    root.dataset.tbmTrInit = '1';
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const items = root.querySelectorAll('.tbm-tr__item');
    // already on screen (e.g. theme editor reload): show straight away
    if (window.Shopify?.designMode) { items.forEach((i) => i.classList.add('is-in')); return; }
    root.classList.add('is-ready');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { threshold: 0.25, rootMargin: '0px 0px -40px 0px' });
    items.forEach((i) => io.observe(i));
  };
  const run = () => document.querySelectorAll('.tbm-tr').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  document.addEventListener('shopify:section:load', run);
})();
