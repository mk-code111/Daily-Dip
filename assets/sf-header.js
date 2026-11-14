/* SF Header: scrolled state, touch-friendly dropdowns, phone menu drawer. */
(() => {
  if (customElements.get('sf-header')) return;

  class SfHeader extends HTMLElement {
    connectedCallback() {
      this.drawer = document.getElementById(this.dataset.drawer);
      this.opener = this.querySelector('[data-sf-hd-open]');

      // placement + scroll behaviour
      this.wrap = this.querySelector('.sf-hd__wrap');
      this.mode = this.dataset.scroll || 'always';
      this.frost = this.dataset.frost === 'true';
      if (this.dataset.float === 'all' && !this.heroFirst()) this.classList.remove('is-float');
      this.lastY = window.scrollY;
      this.measure();
      this._onScroll = () => {
        if (this._raf) return;
        this._raf = requestAnimationFrame(() => { this._raf = 0; this.update(); });
      };
      this._onResize = () => { this.measure(); this.update(); };
      window.addEventListener('scroll', this._onScroll, { passive: true });
      window.addEventListener('resize', this._onResize);
      window.addEventListener('load', this._onResize);
      if ('ResizeObserver' in window && this.wrap) {
        this._ro = new ResizeObserver(() => this.publishHeight());
        this._ro.observe(this.wrap);
      }
      this.update();
      // reveal the bar whenever something inside it gets keyboard focus
      this.addEventListener('focusin', () => this.show());

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

    /* first section of the page, if it's a banner-like section the bar can float over */
    firstSection() {
      const main = document.querySelector('main') || document.getElementById('MainContent');
      return main ? main.querySelector('.shopify-section') : null;
    }

    heroFirst() {
      const first = this.firstSection();
      if (!first) return false;
      if (/slideshow|slider|banner|hero|image|video|sf-moments/i.test(first.id + ' ' + first.className)) return true;
      const media = first.querySelector('img, video, picture');
      return !!media && first.offsetHeight > 260 && media.getBoundingClientRect().top - first.getBoundingClientRect().top < 40;
    }

    measure() {
      // spacer height = bar height when not scrolled (so content never jumps)
      if (this.wrap && !this.classList.contains('is-scrolled')) {
        this.style.setProperty('--sf-hd-space', this.wrap.offsetHeight + 'px');
      }
      // where the header stops being "over the banner" and may hide
      const first = this.classList.contains('is-float') ? this.firstSection() : null;
      const barH = this.wrap ? this.wrap.offsetHeight : 90;
      if (first) {
        this.overUntil = first.getBoundingClientRect().bottom + window.scrollY - barH;
        this.hideAfter = Math.max(this.overUntil, barH * 2);
      } else {
        this.overUntil = -1;
        this.hideAfter = Math.max(this.getBoundingClientRect().bottom + window.scrollY, 0) + 200;
      }
      this.publishHeight();
    }

    publishHeight() {
      if (!this.wrap) return;
      const h = this.classList.contains('is-hidden') ? 0 : this.wrap.offsetHeight;
      document.documentElement.style.setProperty('--sf-hd-bar-h', h + 'px');
    }

    busy() {
      return (this.drawer && !this.drawer.hidden) || !!this.querySelector('.sf-hd__item--parent.is-open, .sf-hd__item--parent:hover');
    }

    show() { this.classList.remove('is-hidden'); }

    update() {
      const y = Math.max(window.scrollY, 0);
      const dy = y - this.lastY;
      this.classList.toggle('is-scrolled', y > 8);
      // fixed once the spacer's top reaches the top of the screen
      this.classList.toggle('is-fixed', this.getBoundingClientRect().top <= 0);
      this.classList.toggle('is-over', this.frost && this.overUntil > 0 && y < this.overUntil);

      if (this.mode !== 'always') {
        const past = y > this.hideAfter;
        if (!past || this.busy()) this.show();
        else if (this.mode === 'hide') this.classList.add('is-hidden');
        else if (dy > 6) this.classList.add('is-hidden');
        else if (dy < -6) this.show();
      }
      if (Math.abs(dy) > 6 || y < 8) this.lastY = y;
      const hidden = this.classList.contains('is-hidden');
      if (hidden !== this._wasHidden) { this._wasHidden = hidden; this.publishHeight(); }
    }

    disconnectedCallback() {
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('load', this._onResize);
      this._ro?.disconnect();
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

  /* Wishlist drawer: the theme's "Quick view" there does nothing, so swap it for a
     "View product" link to the product page. Items are built by the theme's
     wishlist.js, so watch the list and swap whenever it re-renders. */
  const swapQuickView = (root) => {
    root.querySelectorAll('product-quick-view-button:not([data-sf-swapped])').forEach((qv) => {
      qv.setAttribute('data-sf-swapped', '');
      const url = qv.querySelector('[data-product-url]')?.dataset.productUrl;
      if (!url) return;
      const a = document.createElement('a');
      a.className = 'sf-search-view';
      a.href = url;
      a.innerHTML = 'View product <span class="sf-search-view__arrow" aria-hidden="true">&rarr;</span>';
      qv.after(a);
    });
  };
  const watchWishlist = () => {
    const list = document.querySelector('#offcanvas-wishlist .wishlist-product-list');
    if (!list) return;
    swapQuickView(list);
    new MutationObserver(() => swapQuickView(list)).observe(list, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchWishlist);
  else watchWishlist();
})();
