/* SF Marquee: repeat each ribbon's items until they fill the screen twice, then
   loop seamlessly at a steady speed (px/s). */
(() => {
  const build = (band) => {
    const track = band.querySelector('.sf-mq__track');
    const group = track?.querySelector('.sf-mq__group');
    if (!group || !group.children.length) return;
    track.querySelectorAll('[data-sf-mq-copy]').forEach((el) => el.remove());
    // make one group at least as wide as the band
    if (!group.dataset.base) group.dataset.base = group.innerHTML;
    group.innerHTML = group.dataset.base;
    const need = band.offsetWidth;
    let guard = 0;
    while (group.scrollWidth < need && guard++ < 20) group.insertAdjacentHTML('beforeend', group.dataset.base);
    // second identical half for the seamless loop
    const copy = group.cloneNode(true);
    copy.setAttribute('data-sf-mq-copy', '');
    copy.setAttribute('aria-hidden', 'true');
    copy.querySelectorAll('a').forEach((a) => a.setAttribute('tabindex', '-1'));
    track.appendChild(copy);
    const speed = Math.max(10, Number(band.dataset.speed) || 70);
    band.style.setProperty('--sf-mq-dur', `${(group.scrollWidth / speed).toFixed(1)}s`);
  };

  const init = (root = document) => {
    root.querySelectorAll('[data-sf-mq]').forEach((band) => {
      build(band);
      if (band._ro || !('ResizeObserver' in window)) return;
      let w = band.offsetWidth;
      band._ro = new ResizeObserver(() => {
        if (Math.abs(band.offsetWidth - w) < 40) return;
        w = band.offsetWidth; build(band);
      });
      band._ro.observe(band);
      document.fonts?.ready.then(() => build(band));
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init()); else init();
  document.addEventListener('shopify:section:load', (e) => init(e.target));
})();
