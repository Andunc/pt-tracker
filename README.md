# PT Tracker

A lightweight web app version of your Personal Training Tracker spreadsheet. It has:

- **Dashboard** — today's sessions, active clients, revenue, outstanding balance, what's owed to Reach
- **Clients / Sessions / Payments / Reach** — the same data as your spreadsheet, editable from the app
- **Connect Google Calendar** button — adds sessions straight to your calendar
- **Recurring Session Generator** — replaces the "copy/paste rows" workflow
- **Reports** — client statements and a monthly business summary, both printable/exportable to PDF

Your data lives in a **Google Sheet** (not inside the app), so it automatically stays in sync between your phone and your laptop — you just open the same web address on both.

No coding experience needed for setup, but there are a few one-time steps with Google. Budget about 15 minutes.

---

## Step 1 — Prep your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet (or import your existing `pt-tracker-spreadsheet to show claude.xlsx`: **File → Import → Upload → Replace spreadsheet**).
2. Make sure it has tabs named exactly: **Clients**, **Sessions**, **Payments**, **Reach** (your existing file already has these).
3. Copy the **Sheet ID** out of the URL — the long string between `/d/` and `/edit`:
   `https://docs.google.com/spreadsheets/d/`**`THIS_IS_YOUR_SHEET_ID`**`/edit`
4. Keep that ID handy for Step 3.

## Step 2 — Create a Google Cloud project + OAuth Client ID

This is what lets the app securely read/write your Sheet and Calendar as *you* — nobody else can use it.

Google reorganized this flow in 2025–2026 into what it now calls the **Google Auth Platform** (Branding / Audience / Data access / Clients), replacing the older single "OAuth consent screen" page. If you land on a page that says **"Google Auth Platform not configured yet"** — that's expected on a fresh project, not an error. Click **[Get started]** and follow the 4-step wizard below.

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and sign in with the same Google account as your spreadsheet.
2. Click the project dropdown (top left) → **New Project** → name it something like "PT Tracker" → **Create**, then make sure it's selected.
3. Go to **APIs & Services → Library** and enable:
   - **Google Sheets API**
   - **Google Calendar API**
4. Go to **APIs & Services → OAuth consent screen** (or search "OAuth" in the top search bar). You'll see **"Google Auth Platform not configured yet"** — click **[Get started]** to open the wizard:
   - **1. App information** — App name: "PT Tracker". User support email: your email.
   - **2. Audience** — choose **External** (this is the only real decision here, and it can't be changed later without starting a new project). External apps start in "Testing" mode, which is exactly what you want for a personal app.
   - **3. Contact information** — your email again.
   - **4. Finish** — accept the policy → **Create**.
5. You'll land on the **Audience** tab. Under **Test users**, click **Add users** and add your own email (andrea.m.duncan@gmail.com). Only accounts on this list can sign in while the app is in Testing mode — that's fine, it's just you.
   - Because this is a personal app in Testing mode, Google will show an "unverified app" warning when you sign in — that's expected. Click **Advanced → Go to PT Tracker (unsafe)** to continue. Testing-mode tokens expire after 7 days, so you'll re-click "Sign in" occasionally — that's normal.
6. Go to the **Data access** tab → **Add or remove scopes**. The two scopes this app needs (Sheets and Calendar) aren't in the default checklist, so use the **manually add scopes** box at the bottom and paste in, one at a time:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/calendar.events`
   Click **Update**, then **Save**.
7. Go to the **Clients** tab → **Create Client** (this is the new location for what used to be "Credentials → Create Credentials → OAuth client ID").
   - Application type: **Web application**
   - Name: "PT Tracker Web"
   - Under **Authorized JavaScript origins**, add the web address you'll host the app at (see Step 4 first if you're not sure yet — you can come back and edit this later). If you're hosting on GitHub Pages it'll look like `https://yourusername.github.io`. Leave **Authorized redirect URIs** blank — this app only needs the JavaScript origin.
   - Click **Create**, then copy the **Client ID** (ends in `.apps.googleusercontent.com`). You won't need the Client Secret — this app never uses it.

## Step 3 — Fill in config.js

Open `config.js` in this folder in any text editor and paste in your values:

```js
window.PT_CONFIG = {
  CLIENT_ID: "paste your OAuth Client ID here",
  SHEET_ID: "paste your Google Sheet ID here",
  REACH_RATE: 10
};
```

Save the file.

## Step 4 — Host it so your phone and laptop can both reach it

Google's sign-in won't work on a file opened directly from your computer (`file://`) — it needs a real web address. The easiest free option is **GitHub Pages**:

1. Create a free account at [github.com](https://github.com) if you don't have one.
2. Create a new repository (e.g. `pt-tracker`), and upload all the files in this folder (`index.html`, `style.css`, `app.js`, `config.js`, `manifest.json`, and the `assets` folder) — drag and drop them in on the repository's page, then **Commit changes**.
3. Go to the repo's **Settings → Pages**, set **Source** to the `main` branch, root folder, and save.
4. After a minute, GitHub gives you a URL like `https://yourusername.github.io/pt-tracker/`. That's your app's address — open it on your phone and your laptop.
5. Go back to Step 2.5 and make sure that exact address (just the origin, e.g. `https://yourusername.github.io`) is listed under **Authorized JavaScript origins** on your OAuth Client ID.

(Netlify Drop or Vercel work the same way if you'd rather use those — any static hosting works.)

## Step 5 — Use it

1. Open your app's URL.
2. Click **Sign in with Google** and approve access to Sheets.
3. Click **Connect Google Calendar** and approve access to Calendar (separate step, since it's a separate permission).
4. Add clients, log sessions and payments, and try the **Reports** tab.

On your phone, use "Add to Home Screen" from the browser share menu for a quick app-like icon.

---

## How it works / good to know

- All your data stays in your own Google Sheet — the app just reads and writes to it. You can still open the spreadsheet directly any time.
- Dashboard numbers, client balances, and reports are all calculated live from your Sessions/Payments/Reach data — you don't need to touch the old formula columns in your spreadsheet.
- The **Reach** amount owed = ($10 × completed sessions booked via Reach) − payments you've logged to Reach. Change the rate in `config.js` if it's ever not $10.
- "Add to Calendar" on a session creates a fresh calendar event each time it's clicked (it doesn't check for duplicates), so click it once per session.
- Deleting a row in the app clears that row in the sheet rather than removing it entirely — safe, and matches how your spreadsheet already handles blank rows.
- Because the OAuth consent screen is in "Testing" mode, you'll need to re-approve sign-in roughly weekly. If you want that to stop, Google offers a "Publish" option on the consent screen, but for a single-user personal app, Testing mode is simplest and fine to leave as-is.
