/* SF PDP — DailyDip product page. Self-contained (no theme JS dependency). */
(() => {
  if (window.SfCart) return;

  const root = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';

  /* ---------- Shared cart helpers ---------- */
  const SfCart = {
    async add(items) {
      const res = await fetch(root + 'cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items, sections: 'offcanvas-cart,cart-count-badge', sections_url: window.location.pathname })
      });
      const data = await res.json();
      if (!res.ok || data.status) throw new Error(data.description || data.message || 'Could not add to cart');
      this.render(data.sections || {});
      document.dispatchEvent(new CustomEvent('cart:updated', { detail: { source: 'sf-pdp', items } }));
      return data;
    },

    render(sections) {
      const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
      if (sections['offcanvas-cart']) {
        const fresh = parse(sections['offcanvas-cart']).getElementById('offcanvas-cart');
        const current = document.getElementById('offcanvas-cart');
        if (fresh && current) current.innerHTML = fresh.innerHTML;
      }
      if (sections['cart-count-badge']) {
        const fresh = parse(sections['cart-count-badge']).querySelector('.cart-count-badge');
        if (fresh) document.querySelectorAll('.cart-count-badge').forEach((b) => { b.outerHTML = fresh.outerHTML; });
      }
    },

    open() {
      const el = document.getElementById('offcanvas-cart');
      if (!el) { window.location.href = root + 'cart'; return; }
      if (window.bootstrap && bootstrap.Offcanvas) {
        bootstrap.Offcanvas.getOrCreateInstance(el).show();
      } else {
        const trigger = document.querySelector('[href="#offcanvas-cart"], [data-bs-target="#offcanvas-cart"]');
        if (trigger) trigger.click();
      }
    }
  };
  window.SfCart = SfCart;

  class SfPdpMain extends HTMLElement {
    connectedCallback() {
      this.variants = JSON.parse(this.querySelector('[data-sf-variants]').textContent);
      this.form = this.querySelector('[data-sf-form]');
      this.idInput = this.querySelector('[data-sf-id]');
      this.atc = this.querySelector('[data-sf-atc]');
      this.buyNow = this.querySelector('[data-sf-buynow]');
      this.error = this.querySelector('[data-sf-error]');
      this.qtyInput = this.querySelector('[data-sf-qty-input]');

      this.setHeaderOffset();
      this.initGallery();
      this.initPacks();
      this.initQty();
      this.initForm();
      this.initTabs();
      this.initSticky();
    }

    disconnectedCallback() {
      if (this.stickyObserver) this.stickyObserver.disconnect();
    }

    get variant() {
      const id = Number(this.idInput ? this.idInput.value : 0);
      return this.variants.find((v) => v.id === id) || this.variants[0];
    }

    setHeaderOffset() {
      const header = document.getElementById('header-group');
      if (!header) return;
      const set = () => this.style.setProperty('--sf-header-h', header.offsetHeight + 'px');
      set();
      if ('ResizeObserver' in window) new ResizeObserver(set).observe(header);
    }

    /* ---------- Gallery ---------- */
    initGallery() {
      this.track = this.querySelector('[data-sf-track]');
      if (!this.track) return;
      this.slides = [...this.track.children];
      this.thumbs = [...this.querySelectorAll('[data-sf-thumb]')];

      this.thumbs.forEach((t) => t.addEventListener('click', () => this.goTo(Number(t.dataset.sfThumb))));
      const prev = this.querySelector('[data-sf-prev]');
      const next = this.querySelector('[data-sf-next]');
      if (prev) prev.addEventListener('click', () => this.goTo(this.index - 1));
      if (next) next.addEventListener('click', () => this.goTo(this.index + 1));

      this.index = 0;
      let raf;
      this.track.addEventListener('scroll', () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const i = Math.round(this.track.scrollLeft / this.track.clientWidth);
          if (i !== this.index) this.setActive(i);
        });
      }, { passive: true });

      this.track.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); this.goTo(this.index + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.goTo(this.index - 1); }
      });
    }

    goTo(i) {
      if (!this.slides || !this.slides.length) return;
      const n = this.slides.length;
      i = (i + n) % n;
      this.track.scrollTo({ left: this.track.clientWidth * i, behavior: 'smooth' });
      this.setActive(i);
    }

    setActive(i) {
      this.index = i;
      this.thumbs.forEach((t, k) => t.setAttribute('aria-current', k === i ? 'true' : 'false'));
      const thumb = this.thumbs[i];
      if (thumb && thumb.parentElement) {
        const p = thumb.parentElement;
        const left = thumb.offsetLeft - p.clientWidth / 2 + thumb.clientWidth / 2;
        p.scrollTo({ left, behavior: 'smooth' });
      }
    }

    goToMedia(mediaId) {
      if (!mediaId || !this.slides) return;
      const i = this.slides.findIndex((s) => Number(s.dataset.mediaId) === mediaId);
      if (i > -1) this.goTo(i);
    }

    /* ---------- Packs / variant ---------- */
    initPacks() {
      this.querySelectorAll('[data-sf-pack]').forEach((input) => {
        input.addEventListener('change', () => this.selectVariant(Number(input.value)));
      });
    }

    selectVariant(id) {
      const v = this.variants.find((x) => x.id === id);
      if (!v) return;
      if (this.idInput) this.idInput.value = v.id;

      this.querySelectorAll('[data-sf-price]').forEach((el) => (el.textContent = v.price));
      const cmp = this.querySelector('[data-sf-compare]');
      if (cmp) { cmp.textContent = v.compare; cmp.hidden = !v.compare; }
      const save = this.querySelector('[data-sf-save]');
      if (save) { save.textContent = v.save; save.hidden = !v.save; }
      const sv = this.querySelector('[data-sf-sticky-variant]');
      if (sv) sv.textContent = v.title;

      this.updateStock(v);
      this.updateButtons(v);
      this.hideError();
      this.goToMedia(v.media);

      const url = new URL(window.location.href);
      url.searchParams.set('variant', v.id);
      window.history.replaceState({}, '', url.toString());
    }

    updateStock(v) {
      const box = this.querySelector('[data-sf-stock]');
      if (!box) return;
      const th = Number(box.dataset.threshold) || 20;
      const show = v.inv !== null && v.inv > 0 && v.inv <= th;
      box.hidden = !show;
      if (!show) return;
      box.querySelector('[data-sf-stock-text]').innerHTML = box.dataset.template.replace('[count]', v.inv);
      box.querySelector('[data-sf-stock-bar]').style.width = Math.min(100, (v.inv / th) * 100) + '%';
    }

    updateButtons(v) {
      if (this.atc) {
        this.atc.disabled = !v.available;
        this.atc.textContent = v.available ? this.atc.dataset.label : this.atc.dataset.soldout;
      }
      if (this.buyNow) this.buyNow.disabled = !v.available;
      this.querySelectorAll('[data-sf-sticky-btn], [data-sf-sticky-buy]').forEach((b) => { b.disabled = !v.available; });
    }

    /* ---------- Quantity ---------- */
    initQty() {
      if (!this.qtyInput) return;
      this.querySelectorAll('[data-sf-qty]').forEach((b) => {
        b.addEventListener('click', () => {
          const q = Math.max(1, (parseInt(this.qtyInput.value, 10) || 1) + Number(b.dataset.sfQty));
          this.qtyInput.value = q;
        });
      });
      this.qtyInput.addEventListener('change', () => {
        this.qtyInput.value = Math.max(1, parseInt(this.qtyInput.value, 10) || 1);
      });
    }

    get qty() {
      return this.qtyInput ? Math.max(1, parseInt(this.qtyInput.value, 10) || 1) : 1;
    }

    /* ---------- Add to cart ---------- */
    initForm() {
      if (!this.form) return;
      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.addToCart(this.atc, this.dataset.cartAction);
      });
      if (this.buyNow) this.buyNow.addEventListener('click', () => this.addToCart(this.buyNow, 'checkout'));
    }

    async addToCart(btn, action) {
      const v = this.variant;
      if (!v || !v.available) return;
      this.hideError();
      if (btn) btn.setAttribute('aria-busy', 'true');

      try {
        await SfCart.add([{ id: v.id, quantity: this.qty }]);
        if (action === 'checkout') { window.location.href = root + 'checkout'; return; }
        if (action === 'cart') { window.location.href = root + 'cart'; return; }
        this.flash(btn);
        if (action === 'drawer') SfCart.open();
      } catch (err) {
        this.showError(err.message);
      } finally {
        if (btn) btn.removeAttribute('aria-busy');
      }
    }

    flash(btn) {
      if (btn) {
        btn.classList.remove('sf-pop');
        void btn.offsetWidth;
        btn.classList.add('sf-pop');
      }
      if (!btn || !this.dataset.addedLabel) return;
      const original = btn.textContent;
      btn.textContent = this.dataset.addedLabel;
      clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(() => { btn.textContent = original; }, 1400);
    }

    showError(msg) {
      if (!this.error) return;
      this.error.textContent = msg;
      this.error.hidden = false;
    }

    hideError() {
      if (this.error) this.error.hidden = true;
    }

    /* ---------- Tabs ---------- */
    initTabs() {
      this.querySelectorAll('[data-sf-tabs]').forEach((wrap) => {
        const tabs = [...wrap.querySelectorAll('[role="tab"]')];
        const select = (tab) => {
          tabs.forEach((t) => {
            const on = t === tab;
            t.setAttribute('aria-selected', on);
            t.tabIndex = on ? 0 : -1;
            const panel = document.getElementById(t.getAttribute('aria-controls'));
            if (panel) panel.hidden = !on;
          });
        };
        tabs.forEach((t, i) => {
          t.addEventListener('click', () => select(t));
          t.addEventListener('keydown', (e) => {
            const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            const next = tabs[(i + d + tabs.length) % tabs.length];
            select(next);
            next.focus();
          });
        });
      });
    }

    /* ---------- Sticky bar ---------- */
    initSticky() {
      const bar = this.querySelector('[data-sf-sticky]');
      const target = this.form || this.atc;
      if (!bar || !target || !('IntersectionObserver' in window)) return;
      const atcBtn = bar.querySelector('[data-sf-sticky-btn]');
      const buyBtn = bar.querySelector('[data-sf-sticky-buy]');
      const btns = [atcBtn, buyBtn].filter(Boolean);

      this.stickyObserver = new IntersectionObserver(([entry]) => {
        // Show only once the main buy buttons have scrolled above the viewport.
        const show = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        bar.classList.toggle('is-visible', show);
        bar.setAttribute('aria-hidden', show ? 'false' : 'true');
        btns.forEach((b) => { b.tabIndex = show ? 0 : -1; });
      });
      this.stickyObserver.observe(target);

      if (atcBtn) atcBtn.addEventListener('click', () => this.addToCart(atcBtn, this.dataset.cartAction));
      if (buyBtn) buyBtn.addEventListener('click', () => this.addToCart(buyBtn, 'checkout'));
    }
  }

  if (!customElements.get('sf-pdp-main')) customElements.define('sf-pdp-main', SfPdpMain);

  /* ---------- Related products ---------- */
  class SfPdpRelated extends HTMLElement {
    connectedCallback() {
      this.addEventListener('click', (e) => this.onClick(e));
      if (this.querySelector('.sf-rel__track') || !this.dataset.url) return;
      const load = () => {
        fetch(this.dataset.url)
          .then((r) => r.text())
          .then((html) => {
            const fresh = new DOMParser().parseFromString(html, 'text/html').querySelector('sf-pdp-related');
            if (fresh && fresh.innerHTML.trim()) {
              this.innerHTML = fresh.innerHTML;
              if (window.SfReveal) window.SfReveal(this);
            }
          })
          .catch(() => {});
      };
      if (!('IntersectionObserver' in window)) return load();
      const io = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        load();
      }, { rootMargin: '0px 0px 400px 0px' });
      io.observe(this);
    }

    async onClick(e) {
      const btn = e.target.closest('[data-sf-quick-add]');
      if (!btn) return;
      btn.setAttribute('aria-busy', 'true');
      try {
        await SfCart.add([{ id: Number(btn.dataset.sfQuickAdd), quantity: 1 }]);
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = btn.dataset.label; }, 1400);
        SfCart.open();
      } catch (err) {
        btn.textContent = err.message;
        setTimeout(() => { btn.textContent = btn.dataset.label; }, 2500);
      } finally {
        btn.removeAttribute('aria-busy');
      }
    }
  }

  if (!customElements.get('sf-pdp-related')) customElements.define('sf-pdp-related', SfPdpRelated);

  /* ---------- Scroll reveal ----------
     Only content that starts below the fold is hidden and faded in,
     so nothing above the fold ever flashes. */
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealIO = !reduceMotion && 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.remove('sf-reveal--pending');
          e.target.classList.add('sf-reveal--in');
          revealIO.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -8% 0px' })
    : null;

  const initReveal = (scope) => {
    if (!revealIO) return;
    scope.querySelectorAll('.sf-reveal:not([data-sf-revealed])').forEach((el) => {
      el.dataset.sfRevealed = '';
      if (el.getBoundingClientRect().top > window.innerHeight) {
        el.classList.add('sf-reveal--pending');
        revealIO.observe(el);
      }
    });
  };
  window.SfReveal = initReveal;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initReveal(document));
  else initReveal(document);
  document.addEventListener('shopify:section:load', (e) => initReveal(e.target));
})();
