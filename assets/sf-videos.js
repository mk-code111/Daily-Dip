/* SF Shoppable videos: preview autoplay (only while on screen), sound toggles,
   add to cart, and the full-screen story player. Needs sf-cards.js (carousel)
   and sf-pdp.js (window.SfCart). */
(() => {
  if (customElements.get('sf-videos')) return;
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mod = (a, n) => ((a % n) + n) % n;

  const srcOf = (video) => {
    if (!video) return '';
    if (video.currentSrc) return video.currentSrc;
    const mp4 = [...video.querySelectorAll('source')].find((s) => /mp4/.test(s.type)) || video.querySelector('source');
    return mp4 ? mp4.src : video.src;
  };

  class SfVideos extends HTMLElement {
    connectedCallback() {
      if (this._ready) return;
      this._ready = true;
      this.story = this.querySelector('[data-sf-sv-story]');
      this.player = this.querySelector('[data-sf-sv-player]');
      this.progress = this.querySelector('[data-sf-sv-progress]');
      this.storySound = this.querySelector('[data-sf-sv-story-sound]');
      this.storyProduct = this.querySelector('[data-sf-sv-story-product]');
      // real (non-clone) items, in order
      this.items = [...this.querySelectorAll('.sf-car__slide:not([data-sf-clone]) [data-sf-sv-item]')];
      this.n = this.items.length;

      this.addEventListener('click', (e) => this.onClick(e));
      this.initPreviews();
      this.initStory();
    }

    disconnectedCallback() {
      this.io?.disconnect();
      document.removeEventListener('keydown', this._onKey);
      document.documentElement.classList.remove('sf-sv-locked');
    }

    /* ---------- previews ---------- */
    initPreviews() {
      const videos = [...this.querySelectorAll('.sf-sv__bag video')];
      videos.forEach((v) => { v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); });
      if (!('IntersectionObserver' in window)) return;
      this.io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          const v = en.target;
          const item = v.closest('[data-sf-sv-item]');
          const auto = v.dataset.autoplay === 'true' && !reduceMotion;
          if (en.isIntersecting && en.intersectionRatio >= 0.55 && auto && this.story.hidden) {
            v.play().then(() => item.classList.add('is-playing')).catch(() => {});
          } else {
            v.pause();
            item.classList.remove('is-playing');
          }
        });
      }, { threshold: [0, 0.55, 1] });
      videos.forEach((v) => this.io.observe(v));
    }

    onClick(e) {
      // phones (centred layout): tapping a side video brings it to the middle
      const slide = e.target.closest('.sf-car__slide');
      const car = this.querySelector('sf-carousel');
      if (slide && car && car.centered && car.centered() && !slide.classList.contains('is-active')) {
        e.preventDefault();
        e.stopPropagation();
        const pos = [...car.track.children].indexOf(slide);
        car.go(pos - car.offset, true);
        return;
      }
      const sound = e.target.closest('[data-sf-sv-sound]');
      if (sound) { e.stopPropagation(); this.toggleCardSound(sound); return; }
      const open = e.target.closest('[data-sf-sv-open]');
      if (open) { this.openStory(Number(open.dataset.sfSvOpen)); return; }
      const add = e.target.closest('[data-sf-sv-add]');
      if (add) { this.addToCart(add); return; }
      if (e.target.closest('[data-sf-sv-close]')) { this.closeStory(); return; }
      const step = e.target.closest('[data-sf-sv-step]');
      if (step) { this.openStory(this.current + Number(step.dataset.sfSvStep)); return; }
      if (e.target.closest('[data-sf-sv-story-sound]')) { this.toggleStorySound(); }
    }

    toggleCardSound(btn) {
      const video = btn.closest('.sf-sv__bag').querySelector('video');
      if (!video) return;
      const turnOn = video.muted;
      // only one card plays sound at a time
      this.querySelectorAll('.sf-sv__bag video').forEach((v) => { v.muted = true; });
      this.querySelectorAll('[data-sf-sv-sound]').forEach((b) => { b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', 'Turn sound on'); });
      if (turnOn) {
        video.muted = false;
        video.play().catch(() => {});
        btn.closest('[data-sf-sv-item]').classList.add('is-playing');
        btn.setAttribute('aria-pressed', 'true');
        btn.setAttribute('aria-label', 'Turn sound off');
      }
    }

    async addToCart(btn) {
      if (btn.disabled) return;
      const label = btn.dataset.label || btn.textContent;
      btn.disabled = true;
      btn.textContent = '…';
      try {
        if (!window.SfCart) throw new Error('Cart not ready');
        await window.SfCart.add([{ id: Number(btn.dataset.sfSvAdd), quantity: 1 }]);
        btn.textContent = 'Added ✓';
        btn.classList.remove('is-added'); void btn.offsetWidth; btn.classList.add('is-added');
        if (!this.story.hidden) this.closeStory();
        window.SfCart.open();
      } catch (err) {
        btn.textContent = 'Try again';
      } finally {
        setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 1600);
      }
    }

    /* ---------- story player ---------- */
    initStory() {
      if (!this.story) return;
      this.current = 0;
      this.player.addEventListener('timeupdate', () => {
        const d = this.player.duration || 0;
        this.progress.style.width = d ? `${(this.player.currentTime / d) * 100}%` : '0';
      });
      this.player.addEventListener('click', () => { this.player.paused ? this.player.play() : this.player.pause(); });
      this._onKey = (e) => {
        if (this.story.hidden) return;
        if (e.key === 'Escape') this.closeStory();
        if (e.key === 'ArrowRight') this.openStory(this.current + 1);
        if (e.key === 'ArrowLeft') this.openStory(this.current - 1);
      };
      document.addEventListener('keydown', this._onKey);
      // swipe: left/right = next/previous, down = close
      let sx = 0, sy = 0;
      this.story.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
      this.story.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - sx;
        const dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) this.openStory(this.current + (dx < 0 ? 1 : -1));
        else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) this.closeStory();
      }, { passive: true });
    }

    openStory(i) {
      if (!this.n) return;
      this.current = mod(i, this.n);
      const item = this.items[this.current];
      const src = srcOf(item.querySelector('.sf-sv__bag video'));
      // pause previews while the player is open
      this.querySelectorAll('.sf-sv__bag video').forEach((v) => { v.pause(); v.muted = true; });
      this.querySelectorAll('[data-sf-sv-sound]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      this.querySelectorAll('.is-playing').forEach((el) => el.classList.remove('is-playing'));

      this.storyProduct.innerHTML = '';
      const card = item.querySelector('.sf-sv__product');
      if (card) this.storyProduct.appendChild(card.cloneNode(true));

      if (this.story.hidden) {
        this.lastFocus = document.activeElement;
        this.story.hidden = false;
        document.documentElement.classList.add('sf-sv-locked');
        setTimeout(() => this.story.querySelector('[data-sf-sv-close].sf-sv__story-btn')?.focus(), 50);
      }
      if (src) {
        this.player.src = src;
        this.player.muted = this.storySound.getAttribute('aria-pressed') !== 'true';
        this.player.currentTime = 0;
        this.player.play().catch(() => { this.player.muted = true; this.syncStorySound(); this.player.play().catch(() => {}); });
      } else {
        this.player.removeAttribute('src');
      }
      this.syncStorySound();
    }

    toggleStorySound() {
      this.player.muted = !this.player.muted;
      this.storySound.setAttribute('aria-pressed', String(!this.player.muted));
      this.syncStorySound();
    }

    syncStorySound() {
      const on = !this.player.muted;
      this.storySound.setAttribute('aria-pressed', String(on));
      this.storySound.setAttribute('aria-label', on ? 'Mute' : 'Turn sound on');
    }

    closeStory() {
      if (this.story.hidden) return;
      this.player.pause();
      this.player.removeAttribute('src');
      this.player.load();
      this.story.hidden = true;
      document.documentElement.classList.remove('sf-sv-locked');
      this.lastFocus?.focus?.({ preventScroll: true });
      // let the observer restart visible previews
      this.querySelectorAll('.sf-sv__bag video').forEach((v) => { this.io?.unobserve(v); this.io?.observe(v); });
    }
  }
  customElements.define('sf-videos', SfVideos);
})();
