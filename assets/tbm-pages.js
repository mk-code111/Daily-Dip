/* TBM utility pages: search placeholder typing, 404 cup easter egg, password countdown. */
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- search: the empty box types out suggestions ---------- */
  const typing = (input) => {
    if (input.dataset.tbmTyping) return;
    input.dataset.tbmTyping = '1';
    const words = (input.dataset.tbmType || '').split(',').map((w) => w.trim()).filter(Boolean);
    if (!words.length || reduced) return;
    const base = input.placeholder;
    let w = 0; let i = 0; let del = false; let timer;
    const tick = () => {
      if (input.value || document.activeElement === input) { input.placeholder = base; timer = setTimeout(tick, 1200); return; }
      const word = words[w];
      i += del ? -1 : 1;
      input.placeholder = `Try “${word.slice(0, i)}”`;
      let wait = del ? 35 : 75;
      if (!del && i === word.length) { del = true; wait = 1600; }
      else if (del && i === 0) { del = false; w = (w + 1) % words.length; wait = 350; }
      timer = setTimeout(tick, wait);
    };
    timer = setTimeout(tick, 900);
    input.addEventListener('focus', () => { input.placeholder = base; });
  };

  /* ---------- 404: tap the spilled cup to set it right ---------- */
  const cup = (btn) => {
    if (btn.dataset.tbmReady) return;
    btn.dataset.tbmReady = '1';
    btn.addEventListener('click', () => {
      const up = btn.classList.toggle('is-up');
      btn.closest('.tbm-nf')?.classList.toggle('is-fixed', up);
      btn.setAttribute('aria-pressed', String(up));
    });
  };

  /* ---------- password: launch countdown ---------- */
  const countdown = (el) => {
    if (el.dataset.tbmReady) return;
    el.dataset.tbmReady = '1';
    const raw = (el.dataset.tbmPwCount || '').trim().replace(' ', 'T');
    const end = new Date(raw.length <= 10 ? `${raw}T00:00` : raw).getTime();
    if (Number.isNaN(end)) return;
    const units = { d: el.querySelector('[data-u="d"]'), h: el.querySelector('[data-u="h"]'), m: el.querySelector('[data-u="m"]'), s: el.querySelector('[data-u="s"]') };
    const pad = (n) => String(n).padStart(2, '0');
    const set = (u, v) => {
      if (units[u].textContent === v) return;
      units[u].textContent = v;
      if (!reduced) { units[u].classList.remove('is-tick'); void units[u].offsetWidth; units[u].classList.add('is-tick'); }
    };
    const run = () => {
      const left = Math.max(0, end - Date.now());
      const sec = Math.floor(left / 1000);
      set('d', pad(Math.floor(sec / 86400)));
      set('h', pad(Math.floor((sec % 86400) / 3600)));
      set('m', pad(Math.floor((sec % 3600) / 60)));
      set('s', pad(sec % 60));
      if (left <= 0) { clearInterval(t); el.hidden = true; }
    };
    if (end <= Date.now()) return;
    el.hidden = false;
    run();
    const t = setInterval(run, 1000);
  };


  /* ---------- contact: message counter, focus the result after posting ---------- */
  const contact = (ta) => {
    if (ta.dataset.tbmReady) return;
    ta.dataset.tbmReady = '1';
    const out = ta.closest('form')?.querySelector('[data-tbm-ct-count]');
    const max = Number(ta.getAttribute('maxlength')) || 0;
    if (!out || !max) return;
    const upd = () => { const n = ta.value.length; out.textContent = `${n}/${max}`; out.classList.toggle('is-near', n > max * 0.9); };
    ta.addEventListener('input', upd); upd();
  };

  const init = () => {
    document.querySelectorAll('.tbm-sr__input[data-tbm-type]').forEach(typing);
    document.querySelectorAll('[data-tbm-nf-cup]').forEach(cup);
    document.querySelectorAll('[data-tbm-pw-count]').forEach(countdown);
    document.querySelectorAll('[data-tbm-ct-msg]').forEach(contact);
    const done = document.querySelector('[data-tbm-ct-focus]');
    if (done && /contact_posted|form_type=contact|#TbmContactForm/.test(location.href + location.hash)) { done.scrollIntoView({ block: 'center' }); done.focus({ preventScroll: true }); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  document.addEventListener('shopify:section:load', init);
})();
