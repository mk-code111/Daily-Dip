/* SF Announcement bar: rotating messages or scrolling ticker, tap-to-copy codes. */
(() => {
  if (customElements.get('sf-announce')) return;

  class SfAnnounce extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('[data-sf-ann-track]');
      if (!this.track) return;
      this.items = [...this.track.children];
      this.live = this.querySelector('.sf-ann__live');
      this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      this.addEventListener('click', (e) => {
        const code = e.target.closest('[data-sf-ann-code]');
        if (code) { e.preventDefault(); this.copy(code); return; }
        if (e.target.closest('[data-sf-ann-next]')) { this.go(this.index + 1); this.restart(); }
        if (e.target.closest('[data-sf-ann-prev]')) { this.go(this.index - 1); this.restart(); }
      });

      if (this.dataset.mode === 'marquee') this.initMarquee();
      else this.initRotate();

      // theme editor: show the selected message
      this._onSelect = (e) => {
        const item = e.target.closest?.('.sf-ann__item');
        if (!item || !this.contains(item) || this.dataset.mode === 'marquee') return;
        this.go(Number(item.dataset.index)); this.stop();
      };
      this._onDeselect = () => this.restart();
      document.addEventListener('shopify:block:select', this._onSelect);
      document.addEventListener('shopify:block:deselect', this._onDeselect);
    }

    disconnectedCallback() {
      this.stop();
      this._ro?.disconnect();
      document.removeEventListener('shopify:block:select', this._onSelect);
      document.removeEventListener('shopify:block:deselect', this._onDeselect);
    }

    /* ---------- rotate ---------- */
    initRotate() {
      this.index = 0;
      if (this.items.length < 2) return;
      this.interval = Math.max(2, Number(this.dataset.interval) || 4) * 1000;
      this.addEventListener('mouseenter', () => this.stop());
      this.addEventListener('mouseleave', () => this.restart());
      this.addEventListener('focusin', () => this.stop());
      this.addEventListener('focusout', (e) => { if (!this.contains(e.relatedTarget)) this.restart(); });
      document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.restart()));
      this.restart();
    }

    go(i) {
      const n = this.items.length;
      if (n < 2) return;
      const next = ((i % n) + n) % n;
      if (next === this.index) return;
      const cur = this.items[this.index];
      const nxt = this.items[next];
      cur.classList.remove('is-in'); cur.classList.add('is-out'); cur.setAttribute('aria-hidden', 'true');
      nxt.classList.remove('is-out'); nxt.setAttribute('aria-hidden', 'false');
      void nxt.offsetWidth; // start the rise from below
      nxt.classList.add('is-in');
      setTimeout(() => cur.classList.remove('is-out'), 450);
      this.index = next;
      if (this.live && this.matches(':focus-within')) this.live.textContent = nxt.textContent.trim().replace(/\s+/g, ' ');
    }

    stop() { clearInterval(this._timer); this._timer = null; }

    restart() {
      this.stop();
      if (this.dataset.mode === 'marquee' || this.items.length < 2 || this.reduced) return;
      this._timer = setInterval(() => this.go(this.index + 1), this.interval);
    }

    /* ---------- marquee ---------- */
    initMarquee() {
      const originals = this.items;
      const viewport = this.querySelector('.sf-ann__viewport');
      const build = () => {
        // remove old copies, then repeat the set until one half is wider than the bar
        this.track.querySelectorAll('[data-sf-ann-copy]').forEach((el) => el.remove());
        const base = originals.reduce((w, el) => w + el.offsetWidth, 0) || 1;
        const sets = Math.max(1, Math.ceil(viewport.offsetWidth / base));
        const addSet = () => originals.forEach((el) => {
          const c = el.cloneNode(true);
          c.setAttribute('data-sf-ann-copy', '');
          c.setAttribute('aria-hidden', 'true');
          c.removeAttribute('data-shopify-editor-block');
          c.querySelectorAll('a, button').forEach((f) => f.setAttribute('tabindex', '-1'));
          this.track.appendChild(c);
        });
        for (let i = 1; i < sets; i++) addSet();      // first half
        for (let i = 0; i < sets; i++) addSet();      // identical second half
        const speed = Math.max(10, Number(this.dataset.speed) || 45);
        this.style.setProperty('--sf-ann-dur', ((base * sets) / speed).toFixed(1) + 's');
      };
      build();
      let lastW = viewport.offsetWidth;
      if ('ResizeObserver' in window) {
        this._ro = new ResizeObserver(() => {
          if (Math.abs(viewport.offsetWidth - lastW) < 40) return;
          lastW = viewport.offsetWidth; build();
        });
        this._ro.observe(viewport);
      }
      document.fonts?.ready.then(build);
    }

    /* ---------- copy code ---------- */
    async copy(btn) {
      const code = btn.dataset.sfAnnCode;
      try { await navigator.clipboard.writeText(code); }
      catch (_) {
        const t = document.createElement('textarea');
        t.value = code; t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); } catch (_) {}
        t.remove();
      }
      btn.classList.add('is-copied');
      if (this.live) this.live.textContent = `Code ${code} copied`;
      clearTimeout(btn._t);
      btn._t = setTimeout(() => btn.classList.remove('is-copied'), 1600);
    }
  }

  customElements.define('sf-announce', SfAnnounce);
})();
