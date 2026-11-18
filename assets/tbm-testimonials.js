/* TBM · Testimonials — endless, self-scrolling rows that visitors can swipe or drag. */
(() => {
  if (window.SFTestimonials) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  class Row {
    constructor(el, opts) {
      this.el = el;
      this.track = el.querySelector('.tbm-tst__track');
      this.dir = Number(el.dataset.dir) || 1;
      this.speed = opts.speed;
      this.auto = opts.auto;
      this.holds = new Set();
      this.pos = 0;
      this.vel = 0;
      this.set = 0;
      this.period = 0;
      this.base = [...this.track.children];
      // Repeats rendered by the theme are decoration: keep one editable copy only.
      const keepFirst = !this.track.querySelector(':scope > .tbm-tst__card');
      this.track.querySelectorAll('.tbm-tst__rep').forEach((r, i) => {
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
      this.track.querySelectorAll('[data-tbm-tst-clone]').forEach((n) => n.remove());
      const first = this.base[0];
      if (!first) return;
      const clone = () => {
        const frag = document.createDocumentFragment();
        this.base.forEach((n) => {
          const c = n.cloneNode(true);
          c.setAttribute('data-tbm-tst-clone', '');
          c.setAttribute('aria-hidden', 'true');
          c.querySelectorAll('a, button').forEach((a) => a.setAttribute('tabindex', '-1'));
          c.querySelectorAll('[data-shopify-editor-block]').forEach((b) => b.removeAttribute('data-shopify-editor-block'));
          frag.appendChild(c);
        });
        this.track.appendChild(frag);
      };
      clone();
      const firstClone = this.track.querySelector('[data-tbm-tst-clone]');
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
      // Stay in the middle loop so a swipe either way never reaches an end.
      while (this.pos >= this.period * 2) this.pos -= this.period;
      while (this.pos < this.period) this.pos += this.period;
    }

    apply() {
      this.track.style.transform = `translate3d(${-this.pos}px, 0, 0)`;
    }

    hold(k) { this.holds.add(k); }
    release(k, delay = 0) {
      clearTimeout(this['t_' + k]);
      if (delay) this['t_' + k] = setTimeout(() => this.holds.delete(k), delay);
      else this.holds.delete(k);
    }

    tick(dt) {
      if (!this.period || !this.el.offsetParent) return;
      // momentum after a swipe
      if (this.vel) {
        this.pos += this.vel * dt;
        this.vel *= Math.pow(0.0025, dt); // friction
        if (Math.abs(this.vel) < 8) { this.vel = 0; this.release('fling', 1200); }
        this.wrap();
        this.apply();
        return;
      }
      if (!this.auto || reduce.matches || this.holds.size) return;
      this.pos += this.dir * this.speed * dt;
      this.wrap();
      this.apply();
    }

    bind() {
      const el = this.el;
      el.addEventListener('mouseenter', () => this.hold('hover'));
      el.addEventListener('mouseleave', () => this.release('hover'));
      el.addEventListener('focusin', (e) => {
        this.hold('focus');
        const card = e.target.closest('.tbm-tst__card');
        if (!card || !this.period) return;
        const r = el.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        if (c.left < r.left || c.right > r.right) {
          this.pos += c.left - r.left - (r.width - c.width) / 2;
          this.wrap();
          this.apply();
        }
        el.scrollLeft = 0; // focus can nudge an overflow:hidden box
      });
      el.addEventListener('focusout', () => this.release('focus'));

      // One gesture model for touch, pen and mouse. Sideways = we move the strip;
      // up/down = we let the page scroll (touch-action: pan-y).
      let g = null;
      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        this.vel = 0;
        g = { id: e.pointerId, x: e.clientX, y: e.clientY, pos: this.pos, mode: null, lx: e.clientX, lt: e.timeStamp, v: 0 };
        this.hold('drag');
      });
      el.addEventListener('pointermove', (e) => {
        if (!g || e.pointerId !== g.id) return;
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        if (!g.mode) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          g.mode = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
          if (g.mode === 'y') { g = null; this.release('drag', 600); return; }
          try { el.setPointerCapture(e.pointerId); } catch (_) {}
          el.classList.add('is-drag');
        }
        const target = g.pos - dx;
        this.pos = target;
        this.wrap();
        g.pos += this.pos - target; // keep finger and strip locked across the wrap
        this.apply();
        const dt = (e.timeStamp - g.lt) / 1000;
        if (dt > 0) { g.v = 0.8 * (-(e.clientX - g.lx) / dt) + 0.2 * g.v; g.lx = e.clientX; g.lt = e.timeStamp; }
      });
      const end = (e) => {
        if (!g || (e && e.pointerId !== g.id)) return;
        const dragged = g.mode === 'x';
        const idle = e ? (e.timeStamp - g.lt) : 0;
        const v = idle > 80 ? 0 : Math.max(-2600, Math.min(2600, g.v));
        g = null;
        if (dragged) {
          setTimeout(() => el.classList.remove('is-drag'), 0);
          if (Math.abs(v) > 60) { this.vel = v; this.hold('fling'); }
        }
        this.release('drag', dragged ? 1200 : 0);
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('lostpointercapture', end);
      el.addEventListener('click', (e) => { if (el.classList.contains('is-drag')) { e.preventDefault(); e.stopPropagation(); } }, true);
      el.addEventListener('dragstart', (e) => e.preventDefault());

      // Trackpad / shift+wheel sideways scrolling.
      el.addEventListener('wheel', (e) => {
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
        if (!d) return;
        e.preventDefault();
        this.vel = 0;
        this.pos += d;
        this.wrap();
        this.apply();
        this.hold('wheel');
        this.release('wheel', 1500);
      }, { passive: false });
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
      this.rows = [...root.querySelectorAll('.tbm-tst__row')].map((r) => new Row(r, opts));
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
    scope.querySelectorAll('[data-tbm-tst]').forEach((el) => { if (!all.has(el)) all.set(el, new Section(el)); });
  };
  window.SFTestimonials = { init };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init());
  else init();

  document.addEventListener('shopify:section:load', (e) => init(e.target));
  document.addEventListener('shopify:section:unload', (e) => {
    e.target.querySelectorAll('[data-tbm-tst]').forEach((el) => { const s = all.get(el); if (s) { s.destroy(); all.delete(el); } });
  });
  document.addEventListener('shopify:block:select', (e) => {
    const el = e.target.closest('.tbm-tst') && e.target.closest('.tbm-tst').querySelector('[data-tbm-tst]');
    const s = el && all.get(el);
    if (s) s.rows.forEach((r) => r.el.offsetParent && r.showBlock(e.detail.blockId));
  });
  document.addEventListener('shopify:block:deselect', (e) => {
    const el = e.target.closest('.tbm-tst') && e.target.closest('.tbm-tst').querySelector('[data-tbm-tst]');
    const s = el && all.get(el);
    if (s) s.rows.forEach((r) => r.release('editor'));
  });
})();
