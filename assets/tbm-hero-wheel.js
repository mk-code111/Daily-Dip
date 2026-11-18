/* TBM · Hero wheel — phone strip engine, video play/pause and theme-editor helpers.
   The desktop wheel turns with pure CSS. */
(() => {
  if (window.TBMHeroWheel) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- phone strip: endless, swipeable, curved ---------- */
  class Strip {
    constructor(el) {
      this.el = el;
      this.track = el.querySelector('.tbm-hw__track');
      this.speed = Number(el.dataset.speed) || 30;
      this.base = [...this.track.children];
      this.holds = new Set();
      this.pos = 0;
      this.vel = 0;
      this.period = 0;
      this.cells = [];
      this.bind();
      this.measure();
    }

    measure() {
      const w = this.el.clientWidth;
      if (!w || !this.base.length) { this.period = 0; return; }
      this.track.querySelectorAll('[data-tbm-hw-clone]').forEach((n) => n.remove());
      const clone = () => {
        const f = document.createDocumentFragment();
        this.base.forEach((n) => {
          const c = n.cloneNode(true);
          c.setAttribute('data-tbm-hw-clone', '');
          c.setAttribute('aria-hidden', 'true');
          c.querySelectorAll('[data-shopify-editor-block]').forEach((b) => b.removeAttribute('data-shopify-editor-block'));
          f.appendChild(c);
        });
        this.track.appendChild(f);
      };
      clone();
      const first = this.base[0];
      const firstClone = this.track.querySelector('[data-tbm-hw-clone]');
      this.period = Math.max(1, firstClone.offsetLeft - first.offsetLeft);
      let guard = 0;
      while (this.track.scrollWidth < this.period * 2 + w + 40 && guard++ < 12) clone();
      this.cells = [...this.track.children].map((c) => ({ el: c, mid: c.offsetLeft + c.offsetWidth / 2 }));
      this.half = w / 2;
      if (!this.ready) { this.pos = this.period; this.ready = true; }
      this.wrap();
      this.apply();
      watchVideos(this.track);
    }

    wrap() {
      if (!this.period) return;
      while (this.pos >= this.period * 2) this.pos -= this.period;
      while (this.pos < this.period) this.pos += this.period;
    }

    apply() {
      this.track.style.transform = `translate3d(${-this.pos}px,0,0)`;
      const h = this.half || 1;
      for (const c of this.cells) {
        const d = (c.mid - this.pos - h) / h; // -1 left edge, 0 centre, 1 right edge
        if (d < -2 || d > 2) continue;
        const k = Math.max(-1.6, Math.min(1.6, d));
        c.el.style.transform = `rotateY(${(-k * 34).toFixed(2)}deg) translateZ(${(-Math.abs(k) * 70).toFixed(1)}px)`;
      }
    }

    hold(k) { this.holds.add(k); }
    release(k, delay = 0) {
      clearTimeout(this['t_' + k]);
      if (delay) this['t_' + k] = setTimeout(() => this.holds.delete(k), delay);
      else this.holds.delete(k);
    }

    tick(dt) {
      if (!this.period || !this.el.offsetParent) return;
      if (this.vel) {
        this.pos += this.vel * dt;
        this.vel *= Math.pow(0.0025, dt);
        if (Math.abs(this.vel) < 8) { this.vel = 0; this.release('fling', 1200); }
      } else if (!reduce.matches && !this.holds.size) {
        this.pos += this.speed * dt;
      } else return;
      this.wrap();
      this.apply();
    }

    bind() {
      const el = this.el;
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
        }
        const target = g.pos - dx;
        this.pos = target;
        this.wrap();
        g.pos += this.pos - target;
        this.apply();
        const dt = (e.timeStamp - g.lt) / 1000;
        if (dt > 0) { g.v = 0.8 * (-(e.clientX - g.lx) / dt) + 0.2 * g.v; g.lx = e.clientX; g.lt = e.timeStamp; }
      });
      const end = (e) => {
        if (!g || (e && e.pointerId !== g.id)) return;
        const dragged = g.mode === 'x';
        const v = e && e.timeStamp - g.lt > 80 ? 0 : Math.max(-2600, Math.min(2600, g.v));
        g = null;
        if (dragged && Math.abs(v) > 60) { this.vel = v; this.hold('fling'); }
        this.release('drag', dragged ? 1200 : 0);
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('lostpointercapture', end);
      el.addEventListener('dragstart', (e) => e.preventDefault());
    }

    showBlock(id) {
      const card = this.el.querySelector(`[data-shopify-editor-block="${id}"]`);
      if (!card || !this.period) return;
      const cell = card.closest('.tbm-hw__cell');
      this.hold('editor');
      this.vel = 0;
      this.pos = cell.offsetLeft + cell.offsetWidth / 2 - this.half;
      this.wrap();
      this.apply();
    }
  }

  /* ---------- videos: only play what is on screen ---------- */
  const vio = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          const v = en.target;
          if (en.isIntersecting && !reduce.matches) {
            if (v.preload === 'none') v.preload = 'auto';
            const p = v.play();
            if (p && p.catch) p.catch(() => {});
          } else v.pause();
        });
      }, { threshold: 0.15 })
    : null;
  function watchVideos(scope) {
    scope.querySelectorAll('video').forEach((v) => {
      v.muted = true;
      v.setAttribute('playsinline', '');
      if (vio && !v.dataset.tbmHwWatched) { v.dataset.tbmHwWatched = '1'; vio.observe(v); }
    });
  }

  /* ---------- section ---------- */
  class Hero {
    constructor(root) {
      this.root = root;
      const strip = root.querySelector('[data-tbm-hw-strip]');
      this.strip = strip ? new Strip(strip) : null;
      this.stage = root.querySelector('[data-tbm-hw-stage]');
      watchVideos(root);
      this.visible = true;
      if ('IntersectionObserver' in window) {
        this.io = new IntersectionObserver(([en]) => { this.visible = en.isIntersecting; });
        this.io.observe(root);
      }
      if ('ResizeObserver' in window && this.strip) {
        let lastW = root.clientWidth;
        let raf;
        this.ro = new ResizeObserver(() => {
          if (Math.abs(root.clientWidth - lastW) < 2) return;
          lastW = root.clientWidth;
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => this.strip.measure());
        });
        this.ro.observe(root);
      }
      const remeasure = () => this.strip && this.strip.measure();
      window.addEventListener('load', remeasure, { once: true });
      this.prev = 0;
      this.loop = this.loop.bind(this);
      this.frame = requestAnimationFrame(this.loop);
    }

    loop(t) {
      const dt = this.prev ? Math.min((t - this.prev) / 1000, 0.05) : 0;
      this.prev = t;
      if (this.strip && this.visible && !document.hidden) this.strip.tick(dt);
      this.frame = requestAnimationFrame(this.loop);
    }

    // Theme editor: turn the wheel so the chosen card sits at the top, and hold it there.
    focusBlock(id) {
      const blocks = [...this.root.querySelectorAll('.tbm-hw__strip .tbm-hw__track > .tbm-hw__cell:not([data-tbm-hw-clone]) [data-shopify-editor-block]')];
      const idx = blocks.findIndex((b) => b.getAttribute('data-shopify-editor-block') === id);
      if (this.strip) this.strip.showBlock(id);
      if (idx < 0 || !this.stage) return;
      const wheel = this.stage.querySelector('.tbm-hw__wheel');
      const slot = this.stage.querySelector(`.tbm-hw__slot[data-i="${idx}"]`);
      if (!wheel || !slot) return;
      const a = parseFloat(getComputedStyle(slot).getPropertyValue('--a')) || 0;
      const dur = parseFloat(getComputedStyle(wheel).animationDuration) || 48;
      const ccw = this.root.querySelector('.tbm-hw--ccw') || this.root.classList.contains('tbm-hw--ccw');
      const t = ccw ? (a / 360) * dur : ((360 - a) % 360 / 360) * dur;
      wheel.style.animationDelay = `${-t}s`;
      wheel.style.animationPlayState = 'paused';
    }

    unfocus() {
      if (this.strip) this.strip.release('editor');
      const wheel = this.stage && this.stage.querySelector('.tbm-hw__wheel');
      if (wheel) wheel.style.animationPlayState = '';
    }

    destroy() {
      cancelAnimationFrame(this.frame);
      this.io && this.io.disconnect();
      this.ro && this.ro.disconnect();
    }
  }

  const all = new Map();
  const init = (scope = document) => {
    scope.querySelectorAll('.tbm-hw').forEach((el) => { if (!all.has(el)) all.set(el, new Hero(el)); });
  };
  window.TBMHeroWheel = { init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init());
  else init();

  document.addEventListener('shopify:section:load', (e) => init(e.target));
  document.addEventListener('shopify:section:unload', (e) => {
    e.target.querySelectorAll('.tbm-hw').forEach((el) => { const h = all.get(el); if (h) { h.destroy(); all.delete(el); } });
  });
  const hero = (e) => { const r = e.target.querySelector('.tbm-hw') || e.target.closest('.tbm-hw'); return r && all.get(r); };
  document.addEventListener('shopify:block:select', (e) => { const h = hero(e); if (h) h.focusBlock(e.detail.blockId); });
  document.addEventListener('shopify:block:deselect', (e) => { const h = hero(e); if (h) h.unfocus(); });
})();
