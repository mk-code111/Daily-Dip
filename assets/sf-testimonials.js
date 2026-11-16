/* SF · Testimonials — endless, self-scrolling rows that visitors can swipe or drag. */
(() => {
  if (window.SFTestimonials) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  class Row {
    constructor(el, opts) {
      this.el = el;
      this.track = el.querySelector('.sf-tst__track');
      this.dir = Number(el.dataset.dir) || 1;
      this.speed = opts.speed;
      this.auto = opts.auto;
      this.holds = new Set();
      this.pos = 0;
      this.set = 0;
      this.period = 0;
      this.base = [...this.track.children];
      // Repeats rendered by the theme are decoration: keep one editable copy only.
      const keepFirst = !this.track.querySelector(':scope > .sf-tst__card');
      this.track.querySelectorAll('.sf-tst__rep').forEach((r, i) => {
        if (keepFirst && i === 0) return;
        r.querySelectorAll('a, button').forEach((a) => a.setAttribute('tabindex', '-1'));
        r.querySelectorAll('[data-shopify-editor-block]').forEach((b) => b.removeAttribute('data-shopify-editor-block'));
      });
      this.bind();
      this.measure();
    }

    // Copy the set until the strip is at least one full loop wider than the row.
    measure() {
      const w = this.el.clientWidth;
      if (!w) { this.period = 0; return; }
      this.track.querySelectorAll('[data-sf-tst-clone]').forEach((n) => n.remove());
      const first = this.base[0];
      if (!first) return;
      const clone = () => {
        const frag = document.createDocumentFragment();
        this.base.forEach((n) => {
          const c = n.cloneNode(true);
          c.setAttribute('data-sf-tst-clone', '');
          c.setAttribute('aria-hidden', 'true');
          c.querySelectorAll('a, button').forEach((a) => a.setAttribute('tabindex', '-1'));
          c.querySelectorAll('[data-shopify-editor-block]').forEach((b) => b.removeAttribute('data-shopify-editor-block'));
          frag.appendChild(c);
        });
        this.track.appendChild(frag);
      };
      clone();
      const firstClone = this.track.querySelector('[data-sf-tst-clone]');
      const startOf = (n) => (n.getBoundingClientRect ? (n.firstElementChild && getComputedStyle(n).display === 'contents' ? n.firstElementChild : n) : n);
      const a = startOf(first).getBoundingClientRect().left;
      const b = startOf(firstClone).getBoundingClientRect().left;
      this.period = Math.max(1, b - a);
      let guard = 0;
      while (this.track.scrollWidth < this.period * 2 + w + 40 && guard++ < 10) clone();
      if (!this.set) this.pos = this.period;
      this.set = 1;
      this.wrap();
      this.apply();
    }

    wrap() {
      if (!this.period) return;
      // Stay in the middle loop so a swipe either way never hits an end.
      while (this.pos >= this.period * 2) this.pos -= this.period;
      while (this.pos < this.period) this.pos += this.period;
    }

    apply() {
      this.writing = true;
      this.el.scrollLeft = this.pos;
      this.last = this.el.scrollLeft;
    }

    hold(k) { this.holds.add(k); }
    release(k, delay = 0) {
      clearTimeout(this['t_' + k]);
      if (delay) this['t_' + k] = setTimeout(() => this.holds.delete(k), delay);
      else this.holds.delete(k);
    }

    tick(dt) {
      if (!this.period || !this.el.offsetParent) return;
      if (!this.auto || reduce.matches || this.holds.size) return;
      this.pos += this.dir * this.speed * dt;
      this.wrap();
      this.apply();
    }

    bind() {
      const el = this.el;
      el.addEventListener('mouseenter', () => this.hold('hover'));
      el.addEventListener('mouseleave', () => this.release('hover'));
      el.addEventListener('focusin', () => this.hold('focus'));
      el.addEventListener('focusout', () => this.release('focus'));
      el.addEventListener('touchstart', () => this.hold('touch'), { passive: true });
      el.addEventListener('touchend', () => this.release('touch', 1800), { passive: true });
      el.addEventListener('wheel', () => { this.hold('wheel'); this.release('wheel', 1500); }, { passive: true });

      // Native scrolls (swipe, trackpad, keyboard) move the loop too.
      el.addEventListener('scroll', () => {
        if (Math.abs(el.scrollLeft - this.last) < 2) return;
        this.pos = el.scrollLeft;
        const before = this.pos;
        this.wrap();
        if (this.pos !== before) this.apply();
        else this.last = el.scrollLeft;
      }, { passive: true });

      // Mouse drag on desktop.
      let down = null;
      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        down = { x: e.clientX, pos: this.pos, moved: false };
        this.hold('drag');
      });
      window.addEventListener('pointermove', (e) => {
        if (!down) return;
        const dx = e.clientX - down.x;
        if (!down.moved && Math.abs(dx) > 4) { down.moved = true; el.classList.add('is-drag'); }
        if (!down.moved) return;
        const target = down.pos - dx;
        this.pos = target;
        this.wrap();
        down.pos += this.pos - target;
        this.apply();
      });
      window.addEventListener('pointerup', () => {
        if (!down) return;
        const moved = down.moved;
        down = null;
        this.release('drag', 600);
        if (moved) setTimeout(() => el.classList.remove('is-drag'), 0);
      });
      el.addEventListener('click', (e) => { if (el.classList.contains('is-drag')) e.preventDefault(); }, true);
      el.addEventListener('dragstart', (e) => e.preventDefault());
    }

    showBlock(id) {
      const card = this.el.querySelector(`[data-shopify-editor-block="${id}"]`);
      if (!card || !this.period) return false;
      this.hold('editor');
      const r = this.el.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      this.pos += c.left - r.left - (r.width - c.width) / 2;
      this.wrap();
      this.apply();
      return true;
    }
  }

  class Section {
    constructor(root) {
      this.root = root;
      const opts = { speed: Number(root.dataset.speed) || 35, auto: root.dataset.auto !== 'false' };
      this.rows = [...root.querySelectorAll('.sf-tst__row')].map((r) => new Row(r, opts));
      this.visible = true;
      this.prev = 0;
      if ('ResizeObserver' in window) {
        let raf;
        let lastW = root.clientWidth;
        this.ro = new ResizeObserver(() => {
          if (Math.abs(root.clientWidth - lastW) < 2) return;
          lastW = root.clientWidth;
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => this.rows.forEach((r) => r.measure()));
        });
        this.ro.observe(root);
      }
      if ('IntersectionObserver' in window) {
        this.io = new IntersectionObserver(([en]) => { this.visible = en.isIntersecting; });
        this.io.observe(root);
      }
      // Fonts and images change card widths after first paint.
      window.addEventListener('load', () => this.rows.forEach((r) => r.measure()), { once: true });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.rows.forEach((r) => r.measure()));
      this.loop = this.loop.bind(this);
      this.frame = requestAnimationFrame(this.loop);
    }

    loop(t) {
      const dt = this.prev ? Math.min((t - this.prev) / 1000, 0.05) : 0;
      this.prev = t;
      if (this.visible && !document.hidden) this.rows.forEach((r) => r.tick(dt));
      this.frame = requestAnimationFrame(this.loop);
    }

    destroy() {
      cancelAnimationFrame(this.frame);
      this.ro && this.ro.disconnect();
      this.io && this.io.disconnect();
    }
  }

  const all = new Map();
  const init = (scope = document) => {
    scope.querySelectorAll('[data-sf-tst]').forEach((el) => { if (!all.has(el)) all.set(el, new Section(el)); });
  };
  window.SFTestimonials = { init };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init());
  else init();

  document.addEventListener('shopify:section:load', (e) => init(e.target));
  document.addEventListener('shopify:section:unload', (e) => {
    e.target.querySelectorAll('[data-sf-tst]').forEach((el) => { const s = all.get(el); if (s) { s.destroy(); all.delete(el); } });
  });
  document.addEventListener('shopify:block:select', (e) => {
    const el = e.target.closest('.sf-tst') && e.target.closest('.sf-tst').querySelector('[data-sf-tst]');
    const s = el && all.get(el);
    if (s) s.rows.forEach((r) => r.el.offsetParent && r.showBlock(e.detail.blockId));
  });
  document.addEventListener('shopify:block:deselect', (e) => {
    const el = e.target.closest('.sf-tst') && e.target.closest('.sf-tst').querySelector('[data-sf-tst]');
    const s = el && all.get(el);
    if (s) s.rows.forEach((r) => r.release('editor'));
  });
})();
