/* SF Cart: countdown timer + reward gifts for the theme cart drawer.
   Markup: snippets/sf-cart-timer, snippets/sf-cart-rewards (rendered inside #offcanvas-cart).
   The theme re-renders the drawer after every cart change, so these elements reconnect
   often; all state lives in localStorage / sessionStorage. */
(() => {
  if (customElements.get('sf-cart-timer')) return;

  const root = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';
  const TIMER_KEY = 'sf-cart-timer';

  /* re-render drawer + badges (same approach as SfCart in sf-pdp.js) */
  async function refreshCart() {
    try {
      const res = await fetch(`${root}?sections=offcanvas-cart,cart-count-badge`);
      const sections = await res.json();
      if (window.SfCart && SfCart.render) { SfCart.render(sections); return; }
      const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
      const fresh = sections['offcanvas-cart'] && parse(sections['offcanvas-cart']).getElementById('offcanvas-cart');
      const current = document.getElementById('offcanvas-cart');
      if (fresh && current) current.innerHTML = fresh.innerHTML;
      const badge = sections['cart-count-badge'] && parse(sections['cart-count-badge']).querySelector('.cart-count-badge');
      if (badge) document.querySelectorAll('.cart-count-badge').forEach((b) => { b.outerHTML = badge.outerHTML; });
    } catch (e) { /* leave the drawer as it is */ }
  }
  const post = (url, body) => fetch(root + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });

  const readTimer = () => { try { return JSON.parse(localStorage.getItem(TIMER_KEY)) || null; } catch (e) { return null; } };
  const writeTimer = (v) => { try { v ? localStorage.setItem(TIMER_KEY, JSON.stringify(v)) : localStorage.removeItem(TIMER_KEY); } catch (e) {} };

  /* ---------------- Countdown ---------------- */
  class SfCartTimer extends HTMLElement {
    connectedCallback() {
      const count = Number(this.dataset.count || 0);
      this.total = Number(this.dataset.ms || 0);
      if (!count || !this.total) { writeTimer(null); this.hidden = true; return; }

      let state = readTimer();
      // start a new countdown when there is none, or the duration setting changed
      if (!state || state.ms !== this.total) {
        state = { end: Date.now() + this.total, ms: this.total, expired: false };
        writeTimer(state);
      }
      this.state = state;
      if (state.expired) { this.hidden = true; return; }

      this.msg = this.querySelector('[data-sf-tm-msg]');
      this.fill = this.querySelector('[data-sf-tm-fill]');
      const message = this.dataset.message || '{{timer}}';
      const parts = message.split(/\{\{\s*timer\s*\}\}/);
      this.msg.textContent = '';
      this.msg.append(document.createTextNode(parts[0] || ''));
      this.time = document.createElement('strong');
      this.time.className = 'sf-tm__time';
      this.msg.append(this.time);
      if (parts.length > 1) this.msg.append(document.createTextNode(parts.slice(1).join('')));
      this.hidden = false;
      this.tick();
      this.iv = setInterval(() => this.tick(), 1000);
    }
    disconnectedCallback() { clearInterval(this.iv); }

    tick() {
      const left = Math.max(0, this.state.end - Date.now());
      const s = Math.ceil(left / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      this.time.textContent = `${mm}:${ss}`;
      this.fill.style.width = `${(left / this.state.ms) * 100}%`;
      this.classList.toggle('is-urgent', left <= 60000);
      if (left <= 0) this.finish();
    }

    async finish() {
      clearInterval(this.iv);
      if (this.dataset.end === 'clear') {
        writeTimer(null);
        this.hidden = true;
        await post('cart/clear.js', {});
        await refreshCart();
      } else {
        writeTimer({ ...this.state, expired: true });
        this.classList.add('is-leaving');
        setTimeout(() => { this.hidden = true; }, 400);
      }
    }
  }
  customElements.define('sf-cart-timer', SfCartTimer);

  /* ---------------- Rewards: gifts + unlock pop ---------------- */
  class SfCartRewards extends HTMLElement {
    connectedCallback() {
      // little pop on a tier that was just unlocked
      const achieved = Number(this.dataset.achieved || 0);
      const prev = Number(sessionStorage.getItem('sf-rw-achieved') || 0);
      if (achieved > prev) {
        const tiers = this.querySelectorAll('.sf-rw__tier.is-done');
        tiers[tiers.length - 1]?.classList.add('is-new');
      }
      try { sessionStorage.setItem('sf-rw-achieved', String(achieved)); } catch (e) {}

      // animate the fill from where it was
      const fill = this.querySelector('.sf-rw__fill');
      const target = getComputedStyle(this).getPropertyValue('--sf-rw-pct').trim();
      if (fill && window.__sfRwLast && window.__sfRwLast !== target) {
        fill.style.width = window.__sfRwLast;
        requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = ''; }));
      }
      window.__sfRwLast = target;

      this.addEventListener('click', (e) => this.onClick(e));
      this.syncGifts();
    }

    data() {
      const el = this.querySelector('[data-sf-rw-gifts]');
      if (!el) return null;
      try { return JSON.parse(el.textContent); } catch (e) { return null; }
    }

    onClick(e) {
      const open = e.target.closest('[data-sf-gift-open]');
      if (open) {
        const list = this.querySelector(`[data-sf-gift-list="${open.dataset.sfGiftOpen}"]`);
        if (list) { list.hidden = !list.hidden; open.setAttribute('aria-expanded', String(!list.hidden)); }
        return;
      }
      const add = e.target.closest('[data-sf-gift-add]');
      if (add && !add.disabled) this.addGift(Number(add.dataset.sfGiftAdd), add.dataset.tier, add);
    }

    async addGift(id, tier, btn) {
      const d = this.data();
      const t = d && d.tiers.find((x) => String(x.tier) === String(tier));
      const have = d ? d.giftLines.filter((g) => String(g.tier) === String(tier)).length : 0;
      if (t && have >= t.max) { if (btn) btn.textContent = `Max ${t.max}`; return; }
      if (btn) { btn.disabled = true; btn.textContent = '…'; }
      await post('cart/add.js', { items: [{ id, quantity: 1, properties: { _sf_gift: String(tier) } }] });
      await refreshCart();
    }

    // remove gifts whose tier is no longer unlocked; auto-add for "auto" tiers
    async syncGifts() {
      const d = this.data();
      if (!d || this._busy) return;
      const guard = `sf-rw-sync-${Date.now() >> 12}`; // ~4s window, stops loops
      if (sessionStorage.getItem(guard)) return;

      const locked = d.giftLines.filter((g) => {
        const t = d.tiers.find((x) => String(x.tier) === String(g.tier));
        return !t || !t.unlocked;
      });
      if (locked.length) {
        this._busy = true;
        sessionStorage.setItem(guard, '1');
        const updates = {};
        locked.forEach((g) => { updates[g.key] = 0; });
        await post('cart/update.js', { updates });
        await refreshCart();
        return;
      }
      const auto = d.tiers.find((t) => t.unlocked && t.mode === 'auto' && t.variants.some((v) => v.available)
        && !d.giftLines.some((g) => String(g.tier) === String(t.tier)));
      if (auto) {
        this._busy = true;
        sessionStorage.setItem(guard, '1');
        const v = auto.variants.find((x) => x.available);
        await post('cart/add.js', { items: [{ id: v.id, quantity: 1, properties: { _sf_gift: String(auto.tier) } }] });
        await refreshCart();
      }
    }
  }
  customElements.define('sf-cart-rewards', SfCartRewards);
})();
