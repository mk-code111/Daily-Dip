/* TBM Footer: menu accordions on phones, wordmark tea-fill, back to top. */
(() => {
  const mq = window.matchMedia('(min-width: 750px)');

  const init = (root) => {
    if (root.dataset.tbmFtInit) return;
    root.dataset.tbmFtInit = '1';

    // menus: always open on tablet/desktop, collapsible on phones
    const accs = [...root.querySelectorAll('[data-tbm-ft-acc]')];
    const sync = () => accs.forEach((d) => { d.open = mq.matches; });
    sync();
    mq.addEventListener?.('change', sync);
    accs.forEach((d) => d.querySelector('summary').addEventListener('click', (e) => {
      if (mq.matches) e.preventDefault();
    }));

    // wordmark fills with tea once it is on screen
    const mark = root.querySelector('[data-tbm-ft-mark]');
    if (mark) {
      if (!('IntersectionObserver' in window)) mark.classList.add('is-in');
      else {
        const io = new IntersectionObserver((es) => es.forEach((e) => {
          if (e.isIntersecting) { mark.classList.add('is-in'); io.disconnect(); }
        }), { threshold: 0.4 });
        io.observe(mark);
      }
    }

    root.querySelector('[data-tbm-ft-top]')?.addEventListener('click', () => {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
      document.querySelector('a[href], button')?.focus({ preventScroll: true });
    });

    // after a newsletter post, bring the card into view
    if (location.hash === '#TbmFooterNews' || /customer_posted=true/.test(location.search)) {
      root.querySelector('.tbm-ft__news')?.scrollIntoView({ block: 'center' });
    }
  };

  const run = () => document.querySelectorAll('.tbm-ft').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  document.addEventListener('shopify:section:load', run);
})();
