/* SF Cart page: sections/sf-cart-main.liquid.
   Every change goes through the Cart AJAX API and re-renders this section, the drawer
   (offcanvas-cart) and the header badges in one request (Section Rendering API).
   Listens for changes made elsewhere (drawer, reward gifts, add-to-cart) and refreshes itself. */
(() => {
  if (customElements.get('sf-cart-page')) return;
  const root = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';
  const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

  class SfCartPage extends HTMLElement {
    connectedCallback() {
      if (this._wired) return;
      this._wired = true;
      this.sid = this.dataset.section;
      this.addEventListener('click', (e) => this.onClick(e));
      this.addEventListener('change', (e) => this.onChange(e));
      this.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.matches('[data-cp-code-input]')) { e.preventDefault(); this.applyCode(); }
      });
      this.addEventListener('input', (e) => { if (e.target.matches('[data-cp-note]')) this.queueNote(e.target.value); });
      this.addEventListener('submit', (e) => { const b = e.target.querySelector('.sf-cp__checkout'); if (b) b.classList.add('is-loading'); });

      // changes made outside the page (drawer, gifts, add to cart): refresh this section
      this._outside = () => { if (!this.busy && Date.now() - (this._own || 0) > 900) this.refresh(); };
      document.addEventListener('cart:updated', this._outside);
      document.addEventListener('sf:cart-changed', this._outside);
      const drawer = document.getElementById('offcanvas-cart');
      if (drawer) {
        let t;
        this._mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(this._outside, 250); });
        this._mo.observe(drawer, { childList: true, subtree: false });
        const cc = drawer.querySelector('cart-container');
        if (cc) this._mo.observe(cc, { childList: true });
      }
    }
    disconnectedCallback() {
      document.removeEventListener('cart:updated', this._outside);
      document.removeEventListener('sf:cart-changed', this._outside);
      this._mo && this._mo.disconnect();
    }

    /* ---------- events ---------- */
    onClick(e) {
      const step = e.target.closest('[data-cp-step]');
      if (step) {
        const input = this.querySelector(`[data-cp-qty][data-key="${CSS.escape(step.dataset.key)}"]`);
        const q = Math.max(0, Number(input.value || 0) + Number(step.dataset.cpStep));
        input.value = q;
        return this.change(step.dataset.key, q);
      }
      const rm = e.target.closest('[data-cp-remove]');
      if (rm) {
        const li = rm.closest('.sf-cp__item'); if (li) li.classList.add('is-removing');
        return this.change(rm.dataset.key, 0);
      }
      const pack = e.target.closest('[data-cp-vpick]');
      if (pack && !pack.disabled && pack.getAttribute('aria-checked') !== 'true') return this.swap(pack);
      if (e.target.closest('[data-cp-code-apply]')) return this.applyCode();
      const codeRm = e.target.closest('[data-cp-code-remove]');
      if (codeRm) return this.setCodes(this.codes().filter((c) => c.toLowerCase() !== codeRm.dataset.cpCodeRemove.toLowerCase()));
    }
    onChange(e) {
      if (e.target.matches('[data-cp-qty]')) this.change(e.target.dataset.key, Math.max(0, parseInt(e.target.value, 10) || 0));
    }

    /* ---------- cart calls ---------- */
    async post(url, body) {
      this._own = Date.now();
      this.busy = true; this.classList.add('is-busy'); this.alert('');
      try {
        const res = await fetch(root + url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(Object.assign({ sections: [this.sid, 'offcanvas-cart', 'cart-count-badge'], sections_url: window.location.pathname }, body))
        });
        const data = await res.json();
        if (!res.ok || data.status) throw new Error(data.description || data.message || 'Something went wrong. Please try again.');
        if (data.sections) this.renderAll(data.sections);
        this._own = Date.now();
        document.dispatchEvent(new CustomEvent('sf:cart-page-updated', { detail: data }));
        return data;
      } catch (err) {
        this.alert(err.message);
        this.refresh();
        return null;
      } finally {
        this.busy = false; this.classList.remove('is-busy');
      }
    }
    change(key, quantity) { return this.post('cart/change.js', { id: key, quantity }); }
    async swap(pack) {
      pack.classList.add('is-loading');
      const qty = Number(pack.dataset.qty || 1);
      const ok = await this.post('cart/change.js', { id: pack.dataset.key, quantity: 0 });
      if (ok) await this.post('cart/add.js', { items: [{ id: Number(pack.dataset.cpVpick), quantity: qty }] });
    }

    /* ---------- discount codes ---------- */
    codes() {
      const el = this.querySelector('[data-cp-codes]');
      return el && el.dataset.cpCodes ? el.dataset.cpCodes.split(',').filter(Boolean) : [];
    }
    async applyCode() {
      const input = this.querySelector('[data-cp-code-input]');
      const code = (input && input.value || '').trim();
      if (!code) return this.codeMsg('Enter a code first.', 'bad');
      const list = this.codes();
      if (list.some((c) => c.toLowerCase() === code.toLowerCase())) return this.codeMsg('That code is already added.', 'bad');
      const data = await this.setCodes(list.concat(code));
      if (!data) return;
      const found = (data.discount_codes || []).find((d) => d.code.toLowerCase() === code.toLowerCase());
      if (found && found.applicable) this.codeMsg(`Code ${found.code.toUpperCase()} applied.`, 'good');
      else this.codeMsg(`Code ${code.toUpperCase()} isn't valid for this cart.`, 'bad');
    }
    setCodes(list) { return this.post('cart/update.js', { discount: list.join(',') }); }
    codeMsg(text, kind) {
      const el = this.querySelector('[data-cp-code-msg]'); if (!el) return;
      el.textContent = text; el.hidden = !text;
      el.className = 'sf-cp__code-msg' + (kind ? ' is-' + kind : '');
    }

    /* ---------- note (saved quietly, no re-render) ---------- */
    queueNote(value) {
      clearTimeout(this._noteT);
      this._noteT = setTimeout(async () => {
        try {
          await fetch(root + 'cart/update.js', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ note: value }) });
          const msg = this.querySelector('[data-cp-note-msg]');
          if (msg) { msg.hidden = false; clearTimeout(this._noteMsgT); this._noteMsgT = setTimeout(() => { msg.hidden = true; }, 1800); }
        } catch (e) { /* keep typing */ }
      }, 600);
    }

    /* ---------- rendering ---------- */
    renderAll(sections) {
      if (sections[this.sid]) this.renderSelf(sections[this.sid]);
      if (window.SfCart && SfCart.render) SfCart.render(sections);
      else {
        if (sections['offcanvas-cart']) {
          const fresh = parse(sections['offcanvas-cart']).getElementById('offcanvas-cart');
          const cur = document.getElementById('offcanvas-cart');
          if (fresh && cur) cur.innerHTML = fresh.innerHTML;
        }
        if (sections['cart-count-badge']) {
          const b = parse(sections['cart-count-badge']).querySelector('.cart-count-badge');
          if (b) document.querySelectorAll('.cart-count-badge').forEach((x) => { x.outerHTML = b.outerHTML; });
        }
      }
    }
    renderSelf(html) {
      const fresh = parse(html).querySelector('sf-cart-page');
      if (!fresh) return;
      const keepMsg = this.querySelector('[data-cp-code-msg]');
      const msg = keepMsg && !keepMsg.hidden ? { text: keepMsg.textContent, cls: keepMsg.className } : null;
      const noteOpen = this.querySelector('.sf-cp__note[open]');
      const focusKey = document.activeElement && this.contains(document.activeElement) && document.activeElement.dataset ? document.activeElement.dataset.key : null;
      this.innerHTML = fresh.innerHTML;
      if (msg) { const m = this.querySelector('[data-cp-code-msg]'); if (m) { m.textContent = msg.text; m.className = msg.cls; m.hidden = false; } }
      if (noteOpen) { const n = this.querySelector('.sf-cp__note'); if (n) n.open = true; }
      if (focusKey) { const f = this.querySelector(`[data-cp-qty][data-key="${CSS.escape(focusKey)}"]`); if (f) f.focus(); }
    }
    async refresh() {
      try {
        const res = await fetch(`${window.location.pathname}?section_id=${encodeURIComponent(this.sid)}`);
        if (res.ok) this.renderSelf(await res.text());
      } catch (e) { /* keep the current view */ }
    }
    alert(text) {
      const el = this.querySelector('[data-cp-alert]'); if (!el) return;
      el.textContent = text || ''; el.hidden = !text;
    }
  }
  customElements.define('sf-cart-page', SfCartPage);
})();
