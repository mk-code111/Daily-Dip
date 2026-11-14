/**
 * DailyDip Rewards — App Home (Shopify-hosted, no server).
 *
 * One screen in the Shopify admin to edit the cart reward tiers. On Save it:
 *   1. creates / updates / switches off the matching Shopify automatic discounts
 *      (free shipping, % off or ₹ off the order, with a minimum cart value or quantity), and
 *   2. saves the tiers to the shop metafield `dailydip.rewards` (JSON),
 *      which the theme's cart reward bar reads (snippets/sf-cart-rewards.liquid).
 * So the cart bar and checkout always show the same offers.
 *
 * Free-gift tiers are shown in the cart bar, but their discount is not created
 * automatically (Shopify needs a "Buy X get Y" discount set up by hand).
 */
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

const NS = 'dailydip';
const KEY = 'rewards';
const MAX_TIERS = 5;

// The three discounts created by hand on 14 Nov 2026 are taken over by the app.
const DEFAULTS = {
  version: 1,
  live: false,
  measure: 'value',
  mode: 'highest',
  done_text: 'Congratulations! You have unlocked all rewards 🎉',
  tiers: [
    { enabled: true, icon: 'truck-fast', type: 'shipping', min: 399, desc: 'Free delivery', value_type: 'free', value: 0,
      text: 'You are {{min_amount}} away from Free delivery', gift_products: '', gift_mode: 'popup', max: 1,
      discount_id: 'gid://shopify/DiscountAutomaticNode/1548533792998', discount_kind: 'shipping' },
    { enabled: true, icon: 'percent', type: 'discount', min: 799, desc: '5% off', value_type: 'percentage', value: 5,
      text: 'You are {{min_amount}} away from 5% off your order', gift_products: '', gift_mode: 'popup', max: 1,
      discount_id: 'gid://shopify/DiscountAutomaticNode/1548534251750', discount_kind: 'discount' },
    { enabled: true, icon: 'percent', type: 'discount', min: 1599, desc: '10% off', value_type: 'percentage', value: 10,
      text: 'You are {{min_amount}} away from 10% off your order', gift_products: '', gift_mode: 'popup', max: 1,
      discount_id: 'gid://shopify/DiscountAutomaticNode/1548534481126', discount_kind: 'discount' },
    { enabled: false, icon: 'gift', type: 'gift', min: 2499, desc: 'Free gift', value_type: 'free', value: 0,
      text: 'Spend {{min_amount}} more to unlock a free gift', gift_products: '', gift_mode: 'popup', max: 1,
      discount_id: '', discount_kind: '' },
    { enabled: false, icon: 'award', type: 'discount', min: 3499, desc: '15% off', value_type: 'percentage', value: 15,
      text: 'You are {{min_amount}} away from 15% off your order', gift_products: '', gift_mode: 'popup', max: 1,
      discount_id: '', discount_kind: '' },
  ],
};

const ICONS = [
  ['truck', 'Delivery van'], ['truck-fast', 'Fast delivery'], ['percent', 'Percent badge'],
  ['coin', 'Money tag'], ['gift', 'Gift'], ['award', 'Award'],
];

/* ---------------- Admin API ---------------- */
async function gql(query, variables = {}) {
  const res = await fetch('shopify:admin/api/graphql.json', {
    method: 'POST',
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors && json.errors.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data;
}

const LOAD = `#graphql
  query Load($ns: String!, $key: String!) {
    shop { id currencyCode metafield(namespace: $ns, key: $key) { value } }
  }`;

const SAVE_META = `#graphql
  mutation SaveMeta($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) { userErrors { field message } }
  }`;

const SHIP_CREATE = `#graphql
  mutation ShipCreate($d: DiscountAutomaticFreeShippingInput!) {
    discountAutomaticFreeShippingCreate(freeShippingAutomaticDiscount: $d) {
      automaticDiscountNode { id } userErrors { field message }
    }
  }`;
const SHIP_UPDATE = `#graphql
  mutation ShipUpdate($id: ID!, $d: DiscountAutomaticFreeShippingInput!) {
    discountAutomaticFreeShippingUpdate(id: $id, freeShippingAutomaticDiscount: $d) {
      automaticDiscountNode { id } userErrors { field message }
    }
  }`;
const BASIC_CREATE = `#graphql
  mutation BasicCreate($d: DiscountAutomaticBasicInput!) {
    discountAutomaticBasicCreate(automaticBasicDiscount: $d) {
      automaticDiscountNode { id } userErrors { field message }
    }
  }`;
const BASIC_UPDATE = `#graphql
  mutation BasicUpdate($id: ID!, $d: DiscountAutomaticBasicInput!) {
    discountAutomaticBasicUpdate(id: $id, automaticBasicDiscount: $d) {
      automaticDiscountNode { id } userErrors { field message }
    }
  }`;
const DELETE = `#graphql
  mutation Del($id: ID!) {
    discountAutomaticDelete(id: $id) { deletedAutomaticDiscountId userErrors { field message } }
  }`;

const firstError = (payload) => payload && payload.userErrors && payload.userErrors.length
  ? payload.userErrors.map((e) => e.message).join('; ') : null;

/* Build the Shopify discount input for one tier */
function discountInput(cfg, tier, active) {
  const now = new Date().toISOString();
  const minimumRequirement = cfg.measure === 'quantity'
    ? { quantity: { greaterThanOrEqualToQuantity: String(Math.max(1, Math.round(tier.min))) } }
    : { subtotal: { greaterThanOrEqualToSubtotal: String(tier.min) } };
  const base = {
    title: `DailyDip reward · ${tier.desc || 'Tier'}`,
    startsAt: now,
    endsAt: active ? null : now,   // ending now = switched off
    minimumRequirement,
  };
  if (tier.type === 'shipping') {
    return {
      ...base,
      destination: { all: true },
      combinesWith: { orderDiscounts: true, productDiscounts: true },
    };
  }
  const value = tier.value_type === 'fixed'
    ? { discountAmount: { amount: String(tier.value), appliesOnEachItem: false } }
    : { percentage: Math.min(100, Math.max(0, Number(tier.value))) / 100 };
  return {
    ...base,
    customerGets: { value, items: { all: true } },
    combinesWith: { shippingDiscounts: true, productDiscounts: true, orderDiscounts: cfg.mode === 'all' },
  };
}

/* Create / update / switch off the discount for one tier. Returns the tier with its discount id. */
async function syncTier(cfg, tier) {
  const t = { ...tier };
  const managed = t.type === 'shipping' || t.type === 'discount';
  const active = Boolean(cfg.live && t.enabled && managed && Number(t.min) > 0);

  // reward type changed (shipping <-> discount, or now a gift): the old discount can't be converted
  if (t.discount_id && t.discount_kind && t.discount_kind !== t.type) {
    const r = await gql(DELETE, { id: t.discount_id });
    const err = firstError(r.discountAutomaticDelete);
    if (err) throw new Error(`Tier "${t.desc}": ${err}`);
    t.discount_id = '';
    t.discount_kind = '';
  }
  if (!managed) return t;
  if (!t.discount_id && !active) return t;   // nothing to switch off

  const d = discountInput(cfg, t, active);
  const isShip = t.type === 'shipping';
  let payload;
  if (t.discount_id) {
    const r = await gql(isShip ? SHIP_UPDATE : BASIC_UPDATE, { id: t.discount_id, d });
    payload = isShip ? r.discountAutomaticFreeShippingUpdate : r.discountAutomaticBasicUpdate;
  } else {
    const r = await gql(isShip ? SHIP_CREATE : BASIC_CREATE, { d });
    payload = isShip ? r.discountAutomaticFreeShippingCreate : r.discountAutomaticBasicCreate;
  }
  const err = firstError(payload);
  if (err) throw new Error(`Tier "${t.desc}": ${err}`);
  t.discount_id = payload.automaticDiscountNode.id;
  t.discount_kind = t.type;
  return t;
}

/* ---------------- UI ---------------- */
function TierCard({ tier, index, currency, measure, onChange }) {
  const set = (k) => (e) => {
    const el = e.currentTarget;
    const v = el.type === 'checkbox' || el.tagName === 'S-CHECKBOX' || el.tagName === 'S-SWITCH' ? el.checked : el.value;
    onChange(index, { ...tier, [k]: v });
  };
  const num = (k) => (e) => onChange(index, { ...tier, [k]: Number(e.currentTarget.value || 0) });
  const unit = measure === 'quantity' ? 'items' : currency;

  return (
    <s-section heading={`Tier ${index + 1}`}>
      <s-stack direction="block" gap="base">
        <s-switch label={`Use tier ${index + 1}`} checked={tier.enabled} onChange={set('enabled')} />
        {tier.enabled && (
          <s-stack direction="block" gap="base">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-select label="Reward type" value={tier.type} onChange={(e) => {
                const type = e.currentTarget.value;
                const next = { ...tier, type };
                if (type === 'shipping') next.value_type = 'free';
                if (type === 'discount' && next.value_type === 'free') next.value_type = 'percentage';
                if (type === 'gift') next.value_type = 'free';
                onChange(index, next);
              }}>
                <s-option value="shipping">Shipping discount (free delivery)</s-option>
                <s-option value="discount">Discount on order</s-option>
                <s-option value="gift">Free gift (product)</s-option>
              </s-select>
              <s-number-field label={`Minimum (${unit})`} value={String(tier.min)} min="0" onChange={num('min')} />
            </s-grid>

            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-text-field label="Reward description" details="Short label in the cart, e.g. 5% off" value={tier.desc} maxLength="20" onChange={set('desc')} />
              <s-select label="Tier icon" value={tier.icon} onChange={set('icon')}>
                {ICONS.map(([v, l]) => <s-option value={v}>{l}</s-option>)}
              </s-select>
            </s-grid>

            {tier.type === 'discount' && (
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-select label="Discount value" value={tier.value_type} onChange={set('value_type')}>
                  <s-option value="percentage">Percentage</s-option>
                  <s-option value="fixed">Fixed amount</s-option>
                </s-select>
                <s-number-field
                  label={tier.value_type === 'fixed' ? `Amount (${currency})` : 'Percentage (%)'}
                  value={String(tier.value)} min="0" max={tier.value_type === 'fixed' ? undefined : '100'}
                  onChange={num('value')}
                />
              </s-grid>
            )}

            {tier.type === 'gift' && (
              <s-stack direction="block" gap="base">
                <s-banner tone="warning">
                  Free-gift tiers show in the cart, but their checkout discount isn't created automatically.
                  Set up a "Buy X get Y" discount for the gift in Discounts.
                </s-banner>
                <s-text-field label="Gift product handles" details="Comma-separated, e.g. daily-cleanse,daily-detox" value={tier.gift_products} onChange={set('gift_products')} />
                <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                  <s-select label="How customers get the gift" value={tier.gift_mode} onChange={set('gift_mode')}>
                    <s-option value="popup">Let customer pick (popup)</s-option>
                    <s-option value="auto">Auto-add to cart</s-option>
                  </s-select>
                  <s-number-field label="Max rewards per order" value={String(tier.max)} min="1" onChange={num('max')} />
                </s-grid>
              </s-stack>
            )}

            <s-text-area
              label="Text before completing tier"
              details="Use {{min_amount}} for what is still needed and {{reward}} for the description."
              value={tier.text} rows="2" onChange={set('text')}
            />
            {tier.discount_id && (
              <s-text tone="subdued">Linked discount: {tier.discount_id.split('/').pop()}</s-text>
            )}
          </s-stack>
        )}
      </s-stack>
    </s-section>
  );
}

function App() {
  const [cfg, setCfg] = useState(null);
  const [shopId, setShopId] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    gql(LOAD, { ns: NS, key: KEY })
      .then((d) => {
        setShopId(d.shop.id);
        setCurrency(d.shop.currencyCode || 'INR');
        let stored = null;
        try { stored = d.shop.metafield ? JSON.parse(d.shop.metafield.value) : null; } catch (e) { stored = null; }
        const merged = { ...DEFAULTS, ...(stored || {}) };
        const tiers = [...(merged.tiers || [])];
        while (tiers.length < MAX_TIERS) tiers.push({ ...DEFAULTS.tiers[tiers.length] });
        merged.tiers = tiers.slice(0, MAX_TIERS);
        setCfg(merged);
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  if (!cfg) {
    return (
      <s-page heading="Cart rewards">
        {error ? <s-banner tone="critical">{error}</s-banner> : <s-spinner accessibilityLabel="Loading" />}
      </s-page>
    );
  }

  const update = (patch) => { setCfg({ ...cfg, ...patch }); setSaved(''); };
  const updateTier = (i, t) => { const tiers = [...cfg.tiers]; tiers[i] = t; update({ tiers }); };

  const validate = () => {
    const on = cfg.tiers.filter((t) => t.enabled);
    for (const t of on) {
      if (!(Number(t.min) > 0)) return `"${t.desc || 'A tier'}" needs a minimum above 0.`;
      if (t.type === 'discount' && !(Number(t.value) > 0)) return `"${t.desc}" needs a discount value above 0.`;
      if (t.type === 'discount' && t.value_type === 'percentage' && Number(t.value) > 100) return `"${t.desc}" can't be more than 100%.`;
    }
    const mins = on.map((t) => Number(t.min));
    if (new Set(mins).size !== mins.length) return 'Two switched-on tiers have the same minimum. Give each a different one.';
    return '';
  };

  const save = async () => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setSaving(true); setError(''); setSaved('');
    try {
      const tiers = [];
      for (const t of cfg.tiers) tiers.push(await syncTier(cfg, t));
      const next = { ...cfg, tiers, saved_at: new Date().toISOString() };
      const r = await gql(SAVE_META, {
        metafields: [{ ownerId: shopId, namespace: NS, key: KEY, type: 'json', value: JSON.stringify(next) }],
      });
      const err = firstError(r.metafieldsSet);
      if (err) throw new Error(err);
      setCfg(next);
      setSaved(cfg.live ? 'Saved. Cart bar and checkout discounts are updated.' : 'Saved. Discounts are switched off until you turn on "Rewards live at checkout".');
      try { shopify.toast.show('Rewards saved'); } catch (e) { /* toast not available */ }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <s-page heading="Cart rewards">
      <s-button slot="primary-action" variant="primary" loading={saving} onClick={save}>Save</s-button>

      {error && <s-banner tone="critical">{error}</s-banner>}
      {saved && <s-banner tone="success">{saved}</s-banner>}

      <s-section heading="Status">
        <s-stack direction="block" gap="base">
          <s-switch
            label="Rewards live at checkout"
            details="On: the switched-on tiers are active Shopify discounts. Off: all reward discounts are switched off (the cart bar still shows the tiers)."
            checked={cfg.live}
            onChange={(e) => update({ live: e.currentTarget.checked })}
          />
          <s-text tone="subdued">
            Saving updates the discounts in Discounts (titled "DailyDip reward · …") and the cart reward bar together.
            Edit offers here, not in Discounts, or they will be overwritten on the next save.
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="Customer purchases">
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          <s-select label="Measure by" value={cfg.measure} onChange={(e) => update({ measure: e.currentTarget.value })}>
            <s-option value="value">Total cart value</s-option>
            <s-option value="quantity">Total item quantity</s-option>
          </s-select>
          <s-select label="When customers reach multiple tiers" value={cfg.mode} onChange={(e) => update({ mode: e.currentTarget.value })}>
            <s-option value="all">Give rewards from all tiers (discounts stack)</s-option>
            <s-option value="highest">Only give the highest discount</s-option>
          </s-select>
        </s-grid>
        <s-text tone="subdued">
          Free delivery always combines with a discount. "Highest" stops the % / ₹ discounts from stacking with each other.
        </s-text>
      </s-section>

      {cfg.tiers.map((t, i) => (
        <TierCard tier={t} index={i} currency={currency} measure={cfg.measure} onChange={updateTier} />
      ))}

      <s-section heading="Messages">
        <s-text-field label="Text after completing full reward bar" value={cfg.done_text} onChange={(e) => update({ done_text: e.currentTarget.value })} />
      </s-section>
    </s-page>
  );
}

export default async () => {
  render(<App />, document.body);
};
