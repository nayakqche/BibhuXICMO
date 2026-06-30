# Connecting Google Analytics (GA4) & Google Search Console

This guide gets the **Connect** buttons on the AI CMO dashboard working. It's a
one-time setup (≈10 minutes). After it's done, every workspace just clicks
**Connect** and signs in with Google — no extra config per user.

There are two halves:

1. **One-time (you, the app owner):** create a Google OAuth app and add two
   environment variables. _Without this, the Connect buttons can't do anything._
2. **Per workspace (any user):** click **Connect**, sign in with Google, done.

---

## Part 1 — One-time Google OAuth app setup

### Step 1. Create / pick a Google Cloud project
1. Go to <https://console.cloud.google.com/>.
2. Top bar → project dropdown → **New Project** (or pick an existing one).
3. Name it anything (e.g. `Xicmo`).

### Step 2. Enable the two APIs
In the project, open **APIs & Services → Library** and enable both:

- **Google Search Console API**
- **Google Analytics Data API**

(Search each by name and click **Enable**.)

### Step 3. Configure the OAuth consent screen
1. **APIs & Services → OAuth consent screen**.
2. User type: **External**, then **Create**.
3. Fill App name, support email, developer email. Save.
4. **Scopes:** you don't have to add them here, but if asked, the app requests:
   - `.../auth/webmasters.readonly` (Search Console)
   - `.../auth/analytics.readonly` (Analytics)
5. **Test users:** while the app is in "Testing" mode, add the Google
   account(s) that will connect (e.g. your own email). Publishing the app to
   "Production" removes this restriction.

### Step 4. Create OAuth credentials
1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Under **Authorized redirect URIs**, add **both** of these, using your real
   app URL (whatever `APP_URL` is — e.g. `https://xicmo.onrender.com`):

   ```
   https://YOUR_APP_URL/api/integrations/google-search-console/callback
   https://YOUR_APP_URL/api/integrations/google-analytics/callback
   ```

   > These must match exactly (scheme, host, path, no trailing slash). If you
   > also test locally, add the `http://localhost:3000/...` versions too.
4. Click **Create**. Copy the **Client ID** and **Client secret**.

### Step 5. Add the two environment variables
On Render (the app's web service) → **Environment** → add:

| Key                 | Value                              |
| ------------------- | ---------------------------------- |
| `GSC_CLIENT_ID`     | the OAuth **Client ID** from above |
| `GSC_CLIENT_SECRET` | the OAuth **Client secret**        |

> Both Google Analytics and Search Console share this **one** pair of
> credentials — you do **not** need separate keys for each.

Also make sure `APP_URL` (or `NEXT_PUBLIC_APP_URL`) is set to your public app
URL — it's what builds the redirect URIs above.

**Redeploy** the service so the new env vars load.

---

## Part 2 — Connecting a workspace (any user, every time)

Once Part 1 is done, connecting is just:

1. Open the **AI CMO** dashboard (or **Integrations** in the sidebar).
2. On the **Google Analytics** / **Search Console** card, click **Connect**.
3. Sign in with Google and approve read-only access.
4. You're redirected back — the card now shows **connected**, and traffic /
   search data flows into the dashboard's **Traffic** and **Search** tabs.

### Picking the right property/site
Most accounts have one property that matches the workspace website — the app
**auto-selects** it for you. If your Google account manages several GA4
properties or Search Console sites, open **Integrations → Google Analytics**
(or **Search Console**) and click the property/site you want; that choice is
remembered and used across the dashboard.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Card says **"Set GSC_CLIENT_ID / GSC_CLIENT_SECRET to enable"** | Part 1 not done, or the service wasn't redeployed after adding env vars. |
| `redirect_uri_mismatch` on Google's screen | The redirect URI in Step 4 doesn't exactly match `APP_URL`. Re-check scheme/host/path. |
| `access_blocked` / "app not verified" | Add your Google account as a **Test user** (Step 3.5), or publish the consent screen to Production. |
| Connected, but **no data** | New GA4 properties / GSC sites can take ~24–48h to report data, or the signed-in Google account doesn't have access to that property. |
| Connected, but **wrong property** shows | Open the GA4 / Search Console page under **Integrations** and click the correct property/site to pin it. |

---

## How it works under the hood (for maintainers)

- **Start:** `GET /api/integrations/{gsc,ga4}/start` → builds the Google consent
  URL (`src/integrations/providers.ts`) and redirects.
- **Callback:** `GET /api/integrations/{google-search-console,google-analytics}/callback`
  → exchanges the code, stores tokens in the `Integration` table
  (`src/integrations/oauth.ts`).
- **Refresh:** access tokens auto-refresh via the stored refresh token
  (`refreshGoogleToken` in `src/integrations/google.ts`).
- **Data:** `listGSCSites` / `querySearchAnalytics` / `listGA4Properties` /
  `runGA4Report`, with `pickGSCSite` / `pickGA4Property` choosing the active
  property (persisted choice → domain match → first).
- **Scopes are read-only:** `webmasters.readonly` and `analytics.readonly`.
