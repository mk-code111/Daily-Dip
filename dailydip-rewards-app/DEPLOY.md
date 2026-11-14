# DailyDip Rewards: how to deploy

A small private Shopify app that adds a **Cart rewards** page to your Shopify admin.
When you press **Save** there, it:

1. creates, updates or switches off the matching **Shopify automatic discounts**
   (titled "DailyDip reward · …" in Discounts), and
2. saves the tiers to your store (shop metafield `dailydip.rewards`). The theme's cart
   reward bar reads them, so the cart bar and checkout always show the same offers.

There is **no server and no hosting**. Shopify hosts the page. It only needs deploying once.

---

## What you need (one time)

| | |
|---|---|
| A computer with internet | Mac or Windows |
| **Node.js 20 or newer** | Download the LTS version from https://nodejs.org and install it |
| **Shopify CLI** | After Node is installed, open Terminal (Mac) or PowerShell (Windows) and run: `npm install -g @shopify/cli@latest` |
| A free **Shopify Partner** account | https://partners.shopify.com, signing up with the same email as your store is easiest |

Check it worked: `shopify version` should print a version number.

---

## Step 1: Create the app

In Terminal / PowerShell, go to a folder where you keep projects (for example `cd Documents`), then run:

```
shopify app init
```

Answer the questions:

- **Your app's name:** `DailyDip Rewards`
- **Get started building your app:** choose **Build an extension-only app**
- A browser opens: log in to your Partner account and pick your organization.

This creates a folder `dailydip-rewards` with a starter App Home page.

```
cd dailydip-rewards
```

## Step 2: Put the DailyDip files in

From this package, copy these into the new `dailydip-rewards` folder (replace when asked):

| From this package | To |
|---|---|
| `extensions/app-home/src/AppHome.jsx` | `extensions/app-home/src/AppHome.jsx` |
| `extensions/app-home/locales/en.default.json` | `extensions/app-home/locales/en.default.json` |

Then:

1. **Delete** the starter folder `extensions/app-home/src/pages` (the DailyDip page doesn't use it).
2. Open `extensions/app-home/shopify.extension.toml` (the one the CLI made) and make it match the
   one in this package. **Keep the `uid = "…"` line the CLI generated.** The important parts are:
   ```toml
   [[extensions.targeting]]
   module = "./src/AppHome.jsx"
   target = "admin.app.home.render"

   [access_scopes]
   scopes = "read_discounts,write_discounts"
   ```
3. Open `shopify.app.toml` in the app's main folder and set the scopes there too:
   ```toml
   [access_scopes]
   scopes = "read_discounts,write_discounts"
   ```

## Step 3: Deploy

```
shopify app deploy
```

Confirm with **Yes, release this new version**. This uploads the app to Shopify. There's nothing else to host.

## Step 4: Install it on DailyDip

1. Go to https://partners.shopify.com, then **Apps → DailyDip Rewards → Distribution**
   (in the newer Dev Dashboard: **Apps → DailyDip Rewards → Distribution**).
2. Choose **Custom distribution** and enter your store domain: `dailydip-dgwycnvr.myshopify.com`.
3. Copy the **install link**, open it while logged in to your DailyDip admin, and click **Install**.
   It will ask to allow **discounts** access: approve.

## Step 5: First save

1. In your Shopify admin, open **Apps → DailyDip Rewards**. You'll see **Cart rewards**.
2. It's already filled with your tiers and linked to the 3 discounts set up on 14 Nov:
   ₹399 free delivery · ₹799 5% off · ₹1599 10% off (tiers 4–5 off).
3. **Leave "Rewards live at checkout" OFF for now** (your live store still uses the Snap app).
4. Click **Save**. From now on the cart bar reads the tiers from the app.

## On the day you publish the new theme

1. **Apps → DailyDip Rewards**: switch **Rewards live at checkout** ON and click **Save**.
   The reward discounts become active immediately.
2. In **Discounts**, switch off the two Snap discounts ("Cart threshold discount", "Custom discount").
3. Turn off / uninstall **Snap Cart Drawer**.

(Ask Claude to do steps 2–3 if you like.)

## Changing offers later

Only ever change offers in **Apps → DailyDip Rewards**, then **Save**. That updates both the
checkout discount and the cart bar. If you edit a "DailyDip reward · …" discount directly in
Discounts, the app will overwrite it on the next save.

What the app can do per tier: on/off, icon, reward type (free delivery / % or ₹ off the order /
free gift), minimum cart value or item quantity, label, and the "You are … away" text.
It also sets: measure by value or quantity, and whether % discounts stack or only the highest applies.

**Free-gift tiers** show in the cart (with a pick-your-gift popup or auto-add), but Shopify needs a
"Buy X get Y" discount for the gift to be ₹0. Set that one up in Discounts by hand.

## If something goes wrong

- `shopify app deploy` shows an error: copy the whole error text and send it to Claude.
- The page shows a red message after Save: it names the tier and Shopify's reason. Send it to Claude.
- To check what's live: **Discounts**, search "DailyDip reward".
