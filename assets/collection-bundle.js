/*
  © 2024 Jhango
  https://www.jhango.com
*/
console.log('The Street - Premium Shopify Theme by JHANGO.com | Learn more at https://www.JHANGO.com')

class BundleBuilder extends HTMLElement {
  constructor () {
    super()

    this.bundleContents = JSON.parse(localStorage.getItem('ks-bundle-contents')) || []
    this.card = this.querySelector('#collection-bundle-card')

    this.buildBundle()
    this.calcPrices()
    this.handleCartStickyPosition()
    this.animateBtnBundleCheckout()
    this.initStickyMobileCard()

    this.querySelectorAll('.product-card form').forEach(form => {
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        this.addToBundle(form)
      })
    })

    this.querySelectorAll('.product-card select[name="id"').forEach(select => {
      select.addEventListener('change', () => this.onChangeProductCardVariant(select))
    })

    this.querySelectorAll('.collection-bundle-card-list .btn-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.removeFromBundle(btn)
      })
    })

    this.querySelectorAll('.btn-bundle-checkout').forEach(btn => {
      btn.addEventListener('click', () => this.handleCheckout(btn))
    })
  }

  addToBundle (form) {
    const btn = form.querySelector('.btn-add-to-bundle')
    const select = form.querySelector('select')
    const selectedOption = select.options[select.selectedIndex]

    this.bundleContents.push({
      product_id: Number(selectedOption.dataset.productId),
      product_title: selectedOption.dataset.productTitle,
      variant_id: Number(selectedOption.dataset.variantId),
      variant_img: selectedOption.dataset.variantImg,
      variant_price: Number(selectedOption.dataset.variantPrice)
    })

    localStorage.setItem('ks-bundle-contents', JSON.stringify(this.bundleContents))
    console.log(this.bundleContents)

    this.buildBundle()
    this.calcPrices()

    btn.textContent = btn.dataset.textAddedToBundle

    setTimeout(() => {
      btn.textContent = btn.dataset.textAddToBundle
    }, 2000)
  }

  removeFromBundle (btn) {
    this.bundleContents = this.bundleContents.filter((elem, index) =>
      index !== Number(btn.dataset.number - 1))

    localStorage.setItem('ks-bundle-contents', JSON.stringify(this.bundleContents))

    this.buildBundle()
    this.calcPrices()

    this.querySelector('collection-bundle-card').focus()
  }

  buildBundle () {
    this.querySelectorAll('.collection-bundle-card-list li').forEach((elem, index) => {
      const bundleElem = this.bundleContents[index]
      const img = elem.querySelector('img')

      if (bundleElem) {
        elem.classList.add('active')
        img.setAttribute('src', bundleElem.variant_img)
        img.setAttribute('alt', bundleElem.product_title)
        img.setAttribute('data-bs-toggle', 'tooltip')
        img.setAttribute('data-bs-placement', 'top')
        img.setAttribute('data-bs-title', bundleElem.product_title)
        elem.querySelector('.btn-close').setAttribute('data-variant-id', bundleElem.variant_id)
      } else {
        elem.classList.remove('active')
        img.setAttribute('src', img.dataset.src)
        img.setAttribute('alt', '')
        img.removeAttribute('data-bs-toggle')
        img.removeAttribute('data-bs-placement')
        img.removeAttribute('data-bs-title')
        elem.querySelector('.btn-close').removeAttribute('data-variant-id')
      }
    })

    this.querySelectorAll('.collection-bundle-card-list-wrapper').forEach(elem => {
      if (Number(elem.dataset.tierQty <= this.bundleContents.length)) {
        elem.classList.add('active')
      } else {
        elem.classList.remove('active')
      }
    })

    this.querySelectorAll('.btn-bundle-checkout').forEach(btn => { btn.disabled = true })

    window.theme.bundle_builder_tiers.forEach(tier => {
      if (tier.qty === this.bundleContents.length) {
        this.querySelectorAll('.btn-bundle-checkout').forEach(btn => { btn.disabled = false })
      }
    })

    const maxQty = window.theme.bundle_builder_tiers[window.theme.bundle_builder_tiers.length - 1].qty

    if (this.bundleContents.length === maxQty) {
      this.querySelectorAll('.btn-add-to-bundle').forEach(elem => { elem.disabled = true })
    } else {
      this.querySelectorAll('.btn-add-to-bundle').forEach(elem => { elem.disabled = false })
    }
  }

  calcPrices () {
    const totalPrice = this.bundleContents.reduce((accumulator, currentValue) =>
      currentValue.variant_price + accumulator, 0)

    const currentQty = this.bundleContents.length
    let discount = 0
    let savings = 0

    window.theme.bundle_builder_tiers.forEach(tier => {
      if (tier.qty <= currentQty) {
        discount = tier.discount
      }
    })

    if (discount > 0) {
      savings = discount / 100 * totalPrice
    }

    this.querySelectorAll('[data-bundle-price]').forEach(elem => {
      elem.textContent = window.Shopify.formatMoney(totalPrice)
    })

    this.querySelectorAll('[data-you-save]').forEach(elem => {
      elem.textContent = `${window.Shopify.formatMoney(savings)} (${discount}%)`
    })
  }

  handleCartStickyPosition () {
    if (window.matchMedia('(min-width: 800px)').matches) {
      const headerGroup = document.querySelector('#header-group.sticky-top')

      let oldScroll = window.scrollY

      window.addEventListener('scroll', () => {
        const newScroll = window.scrollY
        if (newScroll > oldScroll) {
          if (newScroll > headerGroup.clientHeight) {
            this.card.style.top = '20px'
          }
        } else if (newScroll < oldScroll) {
          this.card.style.top = `${headerGroup.clientHeight + 20}px`
        }

        oldScroll = Math.max(window.scrollY, 0)
      })
    }
  }

  onChangeProductCardVariant (select) {
    const variantImg = select[select.selectedIndex].dataset.variantImg

    if (variantImg.length) {
      select.closest('.product-card').querySelector('.product-card-img-wrapper img').setAttribute('src', variantImg)
    }
  }

  animateBtnBundleCheckout () {
    const animate = () => {
      this.querySelectorAll('.btn-bundle-checkout').forEach(btn => {
        btn.classList.add('animate__animated', 'animate__shakeX')
      })
      setTimeout(() => {
        this.querySelectorAll('.btn-bundle-checkout').forEach(btn => {
          btn.classList.remove('animate__animated', 'animate__shakeX')
        })
      }, 1000)
    }
    animate()

    setTimeout(() => {
      setInterval(() => {
        animate()
      }, 4000)
    }, 1000)
  }

  async handleCheckout (btn) {
    btn.classList.add('loading')
    btn.disabled = true
    btn.setAttribute('aria-busy', 'true')

    const items = []

    this.bundleContents.forEach(elem => {
      items.push({
        id: elem.variant_id,
        quantity: 1
      })
    })

    if (btn.dataset.redirectToCheckout === 'true') {
      await fetch(`${window.Shopify.routes.cart_add_url}.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      })
      window.location.href = `${window.Shopify.routes.root_url}checkout`
    } else {
      await document.querySelector('cart-container').add({ items })
    }

    btn.classList.remove('loading')
    btn.disabled = false
    btn.setAttribute('aria-busy', 'false')

    this.bundleContents = []
    localStorage.setItem('ks-bundle-contents', JSON.stringify(this.bundleContents))
    this.buildBundle()
    this.calcPrices()
  }

  initStickyMobileCard () {
    const stickyCard = this.querySelector('#collection-bundle-sticky-mobile-card')
    if (!stickyCard) return

    const top = document.querySelector('#collection-bundle-card').getBoundingClientRect().bottom

    window.addEventListener('scroll', () => {
      if (window.matchMedia('(min-width: 800px').matches) return

      if (window.scrollY > top) {
        stickyCard.classList.add('show')
        document.body.style.paddingBottom = stickyCard.clientHeight + 'px'
      } else {
        stickyCard.classList.remove('show')
        document.body.style.paddingBottom = 0
      }
    })

    const btnScrollBundleCard = stickyCard.querySelector('.btn-scroll-bundle-card')
    const headerHeight = document.querySelector('#header-group.sticky-top').clientHeight

    btnScrollBundleCard?.addEventListener('click', (e) => {
      window.scrollTo({
        behavior: 'smooth',
        top: document.querySelector('#collection-bundle-card').getBoundingClientRect().top - document.body.getBoundingClientRect().top - headerHeight - 16
      })
    })
  }
}
customElements.define('bundle-builder', BundleBuilder)
