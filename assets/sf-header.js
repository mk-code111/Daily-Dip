/* SF Header: scrolled state, touch-friendly dropdowns, phone menu drawer. */
(() => {
  if (customElements.get('sf-header')) return;

  class SfHeader extends HTMLElement {
    connectedCallback() {
      this.drawer = document.getElementById(this.dataset.drawer);
      this.opener = this.querySelector('[data-sf-hd-open]');

      // scrolled state
      this._onScroll = () => this.classList.toggle('is-scrolled', window.scrollY > 8);
      window.addEventListener('scroll', this._onScroll, { passive: true });
      this._onScroll();

      // dropdowns: first tap on a parent link opens it on touch screens
      this.querySelectorAll('[data-sf-hd-parent]').forEach((a) => {
        const item = a.parentElement;
        a.addEventListener('click', (e) => {
          if (!window.matchMedia('(hover: none)').matches) return;
          if (!item.classList.contains('is-open')) {
            e.preventDefault();
            this.closeDrops(item);
            item.classList.add('is-open');
            a.setAttribute('aria-expanded', 'true');
          }
        });
        item.addEventListener('mouseenter', () => a.setAttribute('aria-expanded', 'true'));
        item.addEventListener('mouseleave', () => { a.setAttribute('aria-expanded', 'false'); item.classList.remove('is-open'); });
        item.addEventListener('focusout', (e) => {
          if (!item.contains(e.relatedTarget)) { item.classList.remove('is-open'); a.setAttribute('aria-expanded', 'false'); }
        });
      });
      this._onDocClick = (e) => { if (!this.contains(e.target)) this.closeDrops(); };
      document.addEventListener('click', this._onDocClick);

      // phone drawer
      this.opener?.addEventListener('click', () => this.open());
      this.drawer?.querySelectorAll('[data-sf-hd-close]').forEach((el) => el.addEventListener('click', () => this.close()));
      this._onKey = (e) => {
        if (e.key !== 'Escape') return;
        if (this.drawer && !this.drawer.hidden) this.close();
        this.closeDrops();
      };
      document.addEventListener('keydown', this._onKey);
      this._mq = window.matchMedia('(min-width: 990px)');
      this._onMq = () => { if (this._mq.matches) this.close(true); };
      this._mq.addEventListener?.('change', this._onMq);
    }

    disconnectedCallback() {
      window.removeEventListener('scroll', this._onScroll);
      document.removeEventListener('click', this._onDocClick);
      document.removeEventListener('keydown', this._onKey);
      this._mq?.removeEventListener?.('change', this._onMq);
      document.documentElement.classList.remove('sf-hd-locked');
    }

    closeDrops(except) {
      this.querySelectorAll('.sf-hd__item--parent.is-open').forEach((it) => {
        if (it === except) return;
        it.classList.remove('is-open');
        it.querySelector('[data-sf-hd-parent]')?.setAttribute('aria-expanded', 'false');
      });
    }

    open() {
      const d = this.drawer;
      if (!d) return;
      d.hidden = false;
      document.documentElement.classList.add('sf-hd-locked');
      this.opener?.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('is-open')));
      this._trap = (e) => {
        if (e.key !== 'Tab') return;
        const f = [...d.querySelectorAll('a[href], button, summary')].filter((el) => el.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      };
      d.addEventListener('keydown', this._trap);
      setTimeout(() => d.querySelector('.sf-hd__close')?.focus(), 60);
    }

    close(instant) {
      const d = this.drawer;
      if (!d || d.hidden) return;
      d.classList.remove('is-open');
      document.documentElement.classList.remove('sf-hd-locked');
      this.opener?.setAttribute('aria-expanded', 'false');
      d.removeEventListener('keydown', this._trap);
      const done = () => { d.hidden = true; };
      if (instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) done();
      else setTimeout(done, 320);
      if (!instant) this.opener?.focus({ preventScroll: true });
    }
  }
  customElements.define('sf-header', SfHeader);
})();
