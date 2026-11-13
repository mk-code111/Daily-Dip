/* SF product cards + carousel. Needs window.SfCart from sf-pdp.js (loaded first). */
(() => {
  if (customElements.get('sf-carousel')) return;

  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mod = (a, n) => ((a % n) + n) % n;

  /* ---------------- Product card ---------------- */
  class SfProductCard extends HTMLElement {
    connectedCallback() {
      if (this._ready) return;
      this._ready = true;
      this.imgs = [...this.querySelectorAll('[data-sf-pc-img]')];
      this.imgIndex = Math.max(0, this.imgs.findIndex((el) => el.classList.contains('is-active')));
      this.addEventListener('click', (e) => this.onClick(e));
      this.addEventListener('keydown', (e) => this.onKey(e));
    }

    onClick(e) {
      const step = e.target.closest('[data-sf-pc-step]');
      if (step) { e.preventDefault(); this.showImage(this.imgIndex + Number(step.dataset.sfPcStep)); return; }
      const pack = e.target.closest('[data-sf-pc-variant]');
      if (pack) { e.preventDefault(); this.select(pack); return; }
      const add = e.target.closest('[data-sf-pc-add]');
      if (add) { e.preventDefault(); this.add(add); }
    }

    onKey(e) {
      const pack = e.target.closest('[data-sf-pc-variant]');
      if (!pack || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const packs = [...this.querySelectorAll('[data-sf-pc-variant]')];
      const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
      const next = packs[mod(packs.indexOf(pack) + dir, packs.length)];
      next.focus();
      this.select(next);
    }

    showImage(i) {
      if (this.imgs.length < 2) return;
      this.imgIndex = mod(i, this.imgs.length);
      this.imgs.forEach((el, k) => {
        const on = k === this.imgIndex;
        el.classList.toggle('is-active', on);
        if (on) { el.removeAttribute('aria-hidden'); el.removeAttribute('tabindex'); }
        else { el.setAttribute('aria-hidden', 'true'); el.setAttribute('tabindex', '-1'); }
      });
    }

    select(pack) {
      this.querySelectorAll('[data-sf-pc-variant]').forEach((b) => b.setAttribute('aria-checked', String(b === pack)));
      const d = pack.dataset;
      const price = this.querySelector('[data-sf-pc-price]');
      if (price) price.textContent = d.price;
      const was = this.querySelector('[data-sf-pc-compare]');
      if (was) { was.textContent = d.compare || ''; was.hidden = !d.compare; }
      const off = this.querySelector('[data-sf-pc-off]');
      if (off) { off.textContent = '-' + d.off + '%'; off.hidden = !(Number(d.off) > 0); }
      const btn = this.querySelector('[data-sf-pc-add]');
      if (btn) {
        btn.dataset.sfPcAdd = d.sfPcVariant;
        const ok = d.available === 'true';
        btn.disabled = !ok;
        btn.textContent = ok ? btn.dataset.label : btn.dataset.soldout;
      }
      if (d.img !== '' && d.img != null) this.showImage(Number(d.img));
    }

    async add(btn) {
      if (btn.disabled) return;
      const id = Number(btn.dataset.sfPcAdd);
      btn.setAttribute('aria-busy', 'true');
      try {
        if (!window.SfCart) throw new Error('Cart not ready');
        await window.SfCart.add([{ id, quantity: 1 }]);
        btn.textContent = 'Added ✓';
        btn.classList.remove('is-added'); void btn.offsetWidth; btn.classList.add('is-added');
        window.SfCart.open();
        setTimeout(() => { btn.textContent = btn.dataset.label; }, 1600);
      } catch (err) {
        btn.textContent = err.message || 'Try again';
        setTimeout(() => { btn.textContent = btn.dataset.label; }, 2500);
      } finally {
        btn.removeAttribute('aria-busy');
      }
    }
  }
  if (!customElements.get('sf-product-card')) customElements.define('sf-product-card', SfProductCard);

  /* ---------------- Carousel ----------------
     Moves one card per step. Infinite loop: a full set of cloned slides sits
     before and after the real ones; after each move the track jumps (without
     animation) back into the real set. */
  class SfCarousel extends HTMLElement {
    connectedCallback() {
      if (this._ready) return;
      this._ready = true;
      this.track = this.querySelector('[data-sf-car-track]');
      this.viewport = this.querySelector('.sf-car__viewport');
      this.navEls = [...this.querySelectorAll('[data-sf-car-prev], [data-sf-car-next], [data-sf-car-dots]')];
      this.dotsEl = this.querySelector('[data-sf-car-dots]');
      this.real = [...this.track.children];
      this.n = this.real.length;
      this.index = 0;
      this.wantLoop = this.dataset.loop === 'true';
      this.autoplay = this.dataset.autoplay === 'true' && !reduceMotion;
      this.speed = Math.max(1500, Number(this.dataset.speed) || 4000);
      this.pause = new Set();

      this.querySelector('[data-sf-car-prev]')?.addEventListener('click', () => this.go(this.index - 1, true));
      this.querySelector('[data-sf-car-next]')?.addEventListener('click', () => this.go(this.index + 1, true));
      this.track.addEventListener('transitionend', (e) => { if (e.target === this.track) this.settle(); });
      this.addEventListener('keydown', (e) => {
        if (e.target.closest('input, textarea, select, [role="radio"]')) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.go(this.index - 1, true); }
        if (e.key === 'ArrowRight') { e.preventDefault(); this.go(this.index + 1, true); }
      });

      // pause autoplay while the shopper is interacting or can't see it
      this.addEventListener('mouseenter', () => this.hold('hover'));
      this.addEventListener('mouseleave', () => this.release('hover'));
      this.addEventListener('focusin', () => this.hold('focus'));
      this.addEventListener('focusout', (e) => { if (!this.contains(e.relatedTarget)) this.release('focus'); });
      this._vis = () => (document.hidden ? this.hold('hidden') : this.release('hidden'));
      document.addEventListener('visibilitychange', this._vis);
      if ('IntersectionObserver' in window) {
        this.hold('offscreen');
        this.io = new IntersectionObserver(([en]) => (en.isIntersecting ? this.release('offscreen') : this.hold('offscreen')), { threshold: 0.25 });
        this.io.observe(this);
      }

      this.initDrag();
      this.build();
      this.ro = new ResizeObserver(() => {
        const per = this.readPer();
        if (per !== this.per) this.build();
        else this.place(false);
        this.alignArrows();
      });
      this.ro.observe(this.viewport);
    }

    disconnectedCallback() {
      clearTimeout(this.timer);
      this.ro?.disconnect();
      this.io?.disconnect();
      document.removeEventListener('visibilitychange', this._vis);
    }

    readPer() {
      // may be fractional (1.5 = one card plus half of the next peeking in)
      return Math.max(1, parseFloat(getComputedStyle(this).getPropertyValue('--sf-per')) || 1);
    }

    build() {
      this.per = this.readPer();
      this.track.querySelectorAll('[data-sf-clone]').forEach((c) => c.remove());
      // with looping on, it can also scroll when the cards exactly fill the row
      this.canMove = this.n > this.per || (this.wantLoop && this.n > 1 && this.n >= Math.floor(this.per));
      this.loop = this.wantLoop && this.canMove;
      if (this.loop) {
        const mk = (s) => {
          const c = s.cloneNode(true);
          c.dataset.sfClone = '';
          c.setAttribute('aria-hidden', 'true');
          c.querySelectorAll('a, button, input, [tabindex]').forEach((el) => el.setAttribute('tabindex', '-1'));
          return c;
        };
        this.track.prepend(...this.real.map(mk));
        this.track.append(...this.real.map(mk));
      }
      this.offset = this.loop ? this.n : 0;
      this.maxIndex = this.loop ? this.n - 1 : Math.max(0, Math.ceil(this.n - this.per));
      this.index = this.loop ? mod(this.index, this.n) : Math.min(this.index, this.maxIndex);
      this.navEls.forEach((el) => { el.hidden = !this.canMove; });
      this.buildDots();
      this.place(false);
      this.alignArrows();
      this.schedule();
    }

    // phones use this to centre the side arrows on the product image (CSS decides)
    alignArrows() {
      const stage = this.querySelector('.sf-car__stage');
      const media = this.track.querySelector('.sf-car__slide:not([data-sf-clone]) .sf-pc__media');
      if (!stage || !media) return;
      const s = stage.getBoundingClientRect(), m = media.getBoundingClientRect();
      this.style.setProperty('--sf-arrow-y', Math.round(m.top - s.top + m.height / 2) + 'px');
    }

    buildDots() {
      if (!this.dotsEl) return;
      const count = this.canMove ? this.maxIndex + 1 : 0;
      this.dotsEl.innerHTML = '';
      for (let i = 0; i < count; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sf-car__dot';
        b.setAttribute('aria-label', `Go to product ${i + 1}`);
        b.addEventListener('click', () => this.go(i + (this.index - mod(this.index, this.n)), true));
        this.dotsEl.appendChild(b);
      }
      this.updateDots();
    }

    updateDots() {
      if (!this.dotsEl) return;
      const active = this.loop ? mod(this.index, this.n) : this.index;
      [...this.dotsEl.children].forEach((d, i) => d.setAttribute('aria-current', String(i === active)));
    }

    slides() { return this.track.children; }

    xFor(pos) {
      const all = this.slides();
      const el = all[Math.max(0, Math.min(pos, all.length - 1))];
      return el ? el.offsetLeft - all[0].offsetLeft : 0;
    }

    place(animate, extra = 0) {
      this.track.classList.toggle('is-animating', !!animate);
      const x = this.canMove ? -this.xFor(this.offset + this.index) + extra : 0;
      this.track.style.transform = `translate3d(${x}px, 0, 0)`;
      if (!animate) this.updateDots();
    }

    // after a move: jump from the clone set back into the real set
    settle() {
      this.track.classList.remove('is-animating');
      if (this.loop && (this.index < 0 || this.index >= this.n)) {
        this.index = mod(this.index, this.n);
        this.place(false);
      }
      this.updateDots();
    }

    go(i, user) {
      if (!this.canMove) return;
      if (this.loop) {
        // finish any in-flight wrap first so rapid clicks never run out of clones
        if (this.index < 0 || this.index >= this.n) {
          const delta = i - this.index;
          this.index = mod(this.index, this.n);
          this.place(false);
          void this.track.offsetWidth;
          i = this.index + delta;
        }
        this.index = Math.max(-this.n, Math.min(i, 2 * this.n - 1));
      } else {
        this.index = i > this.maxIndex ? (user ? this.maxIndex : 0) : Math.max(0, i);
      }
      this.place(!reduceMotion);
      if (reduceMotion) this.settle();
      this.updateDots();
      if (user) this.bump();
      this.schedule();
    }

    /* autoplay */
    hold(k) { this.pause.add(k); clearTimeout(this.timer); }
    release(k) { this.pause.delete(k); this.schedule(); }
    bump() { this.hold('user'); clearTimeout(this.userT); this.userT = setTimeout(() => this.release('user'), this.speed * 1.5); }
    schedule() {
      clearTimeout(this.timer);
      if (!this.autoplay || !this.canMove || this.pause.size) return;
      this.timer = setTimeout(() => this.go(this.index + 1, false), this.speed);
    }

    /* swipe / drag */
    initDrag() {
      let sx = 0, sy = 0, dx = 0, id = null, dragging = false, decided = false;
      const vp = this.viewport;

      vp.addEventListener('pointerdown', (e) => {
        if (!this.canMove || (e.pointerType === 'mouse' && e.button !== 0)) return;
        id = e.pointerId; sx = e.clientX; sy = e.clientY; dx = 0; dragging = false; decided = false;
      });
      vp.addEventListener('pointermove', (e) => {
        if (e.pointerId !== id) return;
        dx = e.clientX - sx;
        const dy = e.clientY - sy;
        if (!decided) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          decided = true;
          if (Math.abs(dy) > Math.abs(dx)) { id = null; return; } // vertical: let the page scroll
          dragging = true;
          this.hold('drag');
          if (this.loop && (this.index < 0 || this.index >= this.n)) { this.index = mod(this.index, this.n); }
          this.track.classList.add('is-dragging');
          try { vp.setPointerCapture(id); } catch (_) {}
        }
        if (!dragging) return;
        let extra = dx;
        if (!this.loop && ((this.index === 0 && dx > 0) || (this.index === this.maxIndex && dx < 0))) extra = dx / 3;
        this.place(false, extra);
      });
      const end = (e) => {
        if (e.pointerId !== id) return;
        id = null;
        if (!dragging) return;
        dragging = false;
        this.track.classList.remove('is-dragging');
        this.release('drag');
        this._suppress = true;
        setTimeout(() => { this._suppress = false; }, 60);
        const w = this.slides()[0]?.getBoundingClientRect().width || 300;
        let steps = Math.round(-dx / w);
        if (steps === 0 && Math.abs(dx) > 40) steps = dx < 0 ? 1 : -1;
        if (steps === 0) this.place(true);
        else this.go(this.index + steps, true);
      };
      vp.addEventListener('pointerup', end);
      vp.addEventListener('pointercancel', end);
      // a drag must not also count as a click on a card link/button
      vp.addEventListener('click', (e) => {
        if (this._suppress) { e.preventDefault(); e.stopPropagation(); this._suppress = false; }
      }, true);
      vp.addEventListener('dragstart', (e) => e.preventDefault());
    }
  }
  if (!customElements.get('sf-carousel')) customElements.define('sf-carousel', SfCarousel);
})();
