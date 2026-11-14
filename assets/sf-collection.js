/* SF Collection pages: description fold, filter drawer, instant filters/sort, load more. */
(() => {
  /* ---------- hero: fold long descriptions ---------- */
  const initHero = () => {
    document.querySelectorAll('[data-sf-ch-desc]').forEach((d) => {
      if (d.dataset.ready) return;
      d.dataset.ready = '1';
      const btn = d.nextElementSibling?.matches('[data-sf-ch-more]') ? d.nextElementSibling : null;
      d.classList.add('is-clamped');
      if (!btn || d.scrollHeight <= d.clientHeight + 4) { d.classList.remove('is-clamped'); return; }
      btn.hidden = false;
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') !== 'true';
        btn.setAttribute('aria-expanded', String(open));
        d.classList.toggle('is-clamped', !open);
      });
    });
    // keep the active pill in view on phones
    document.querySelectorAll('[data-sf-ch-pills]').forEach((ul) => {
      const a = ul.querySelector('.is-active');
      if (a && ul.scrollWidth > ul.clientWidth) ul.scrollLeft = a.parentElement.offsetLeft - 16;
    });
  };

  /* ---------- grid ---------- */
  class SfCollection extends HTMLElement {
    connectedCallback() {
      if (this._ready) return;
      this._ready = true;
      this.sectionId = this.dataset.section;

      this.addEventListener('click', (e) => {
        if (e.target.closest('[data-sf-cg-open]')) return this.open();
        if (e.target.closest('[data-sf-cg-close]')) return this.close();
        const more = e.target.closest('[data-sf-cg-more]');
        if (more) { e.preventDefault(); return this.loadMore(more); }
        const link = e.target.closest('a[data-sf-cg-link]');
        if (link) { e.preventDefault(); this.render(link.href); }
      });

      this.addEventListener('change', (e) => {
        if (e.target.matches('[data-sf-cg-sort]')) return this.render(this.urlFromForm());
        if (e.target.closest('[data-sf-cg-form]')) {
          clearTimeout(this._t);
          this._t = setTimeout(() => this.render(this.urlFromForm()), e.target.type === 'number' ? 600 : 50);
        }
      });
      this.addEventListener('submit', (e) => { e.preventDefault(); this.render(this.urlFromForm()); });
      this.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen()) this.close();
        if (e.key === 'Tab' && this.isOpen()) this.trap(e);
      });

      this._onPop = () => this.render(location.href, false);
      window.addEventListener('popstate', this._onPop);
    }

    disconnectedCallback() {
      window.removeEventListener('popstate', this._onPop);
      document.documentElement.classList.remove('sf-cg-lock');
    }

    get drawer() { return this.querySelector('[data-sf-cg-drawer]'); }
    get overlay() { return this.querySelector('.sf-cg__overlay'); }
    isOpen() { return this.drawer && !this.drawer.hidden; }

    open() {
      if (!this.drawer) return;
      this._last = document.activeElement;
      this.drawer.hidden = false; this.overlay.hidden = false;
      document.documentElement.classList.add('sf-cg-lock');
      this.querySelector('[data-sf-cg-open]')?.setAttribute('aria-expanded', 'true');
      this.drawer.querySelector('.sf-cg__x')?.focus();
    }

    close() {
      if (!this.drawer) return;
      this.drawer.hidden = true; this.overlay.hidden = true;
      document.documentElement.classList.remove('sf-cg-lock');
      const btn = this.querySelector('[data-sf-cg-open]');
      btn?.setAttribute('aria-expanded', 'false');
      (this._last && this.contains(this._last) ? this._last : btn)?.focus();
    }

    trap(e) {
      const f = [...this.drawer.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), summary, select')]
        .filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    urlFromForm() {
      const params = new URLSearchParams();
      const form = this.querySelector('[data-sf-cg-form]');
      if (form) {
        for (const [k, v] of new FormData(form)) if (String(v).trim() !== '') params.append(k, v);
      }
      const sort = this.querySelector('[data-sf-cg-sort]');
      if (sort) params.set('sort_by', sort.value);
      const q = params.toString();
      return `${this.dataset.base}${q ? `?${q}` : ''}`;
    }

    sectionUrl(url) {
      const u = new URL(url, location.origin);
      u.searchParams.set('section_id', this.sectionId);
      return u.toString();
    }

    async fetchDoc(url) {
      const res = await fetch(this.sectionUrl(url));
      if (!res.ok) throw new Error(res.status);
      return new DOMParser().parseFromString(await res.text(), 'text/html');
    }

    async render(url, push = true) {
      this.classList.add('is-loading');
      try {
        const doc = await this.fetchDoc(url);
        const fresh = doc.querySelector('sf-collection');
        if (!fresh) throw new Error('no section');

        // results area
        this.querySelector('[data-sf-cg-results]').replaceWith(fresh.querySelector('[data-sf-cg-results]'));
        // drawer: swap filter groups but keep which ones are open + scroll position
        const oldForm = this.querySelector('[data-sf-cg-form]');
        const newForm = fresh.querySelector('[data-sf-cg-form]');
        if (oldForm && newForm) {
          const open = new Set([...oldForm.querySelectorAll('details[open]')].map((d) => d.dataset.key));
          const closed = new Set([...oldForm.querySelectorAll('details:not([open])')].map((d) => d.dataset.key));
          newForm.querySelectorAll('details').forEach((d) => {
            if (open.has(d.dataset.key)) d.open = true;
            else if (closed.has(d.dataset.key)) d.open = false;
          });
          const scroll = oldForm.scrollTop;
          const focusedName = document.activeElement?.name; const focusedVal = document.activeElement?.value;
          oldForm.replaceWith(newForm);
          newForm.scrollTop = scroll;
          if (focusedName) {
            const sel = `[name="${CSS.escape(focusedName)}"]${focusedVal && document.activeElement?.type === 'checkbox' ? `[value="${CSS.escape(focusedVal)}"]` : ''}`;
            newForm.querySelector(sel)?.focus({ preventScroll: true });
          }
          this.querySelector('.sf-cg__dfoot')?.replaceWith(fresh.querySelector('.sf-cg__dfoot'));
        }
        if (push) history.pushState({}, '', url);
        this.querySelectorAll('.sf-cg__item').forEach((li) => li.classList.add('is-new'));
        if (!this.isOpen()) {
          const top = this.getBoundingClientRect().top + scrollY - 90;
          if (scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
        }
      } catch (err) {
        location.href = url;
      } finally {
        this.classList.remove('is-loading');
      }
    }

    async loadMore(btn) {
      btn.setAttribute('aria-busy', 'true');
      try {
        const doc = await this.fetchDoc(btn.href);
        const fresh = doc.querySelector('sf-collection');
        const items = fresh.querySelectorAll('.sf-cg__item');
        const grid = this.querySelector('[data-sf-cg-grid]');
        items.forEach((li) => { li.classList.add('is-new'); grid.appendChild(li); });
        this.querySelector('[data-sf-cg-more-wrap]').replaceWith(fresh.querySelector('[data-sf-cg-more-wrap]') || document.createElement('span'));
        items[0]?.querySelector('a')?.focus({ preventScroll: true });
      } catch (err) {
        location.href = btn.href;
      }
    }
  }

  if (!customElements.get('sf-collection')) customElements.define('sf-collection', SfCollection);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHero); else initHero();
  document.addEventListener('shopify:section:load', initHero);
})();
