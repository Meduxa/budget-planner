# Department Budget Planner

A static web page (HTML/CSS/JS, no build step, no install) for a department's
budget: **Revenue, Profit, Profit margin and Procurement — Plan vs Actual** by
month, quarter and year, plus the **sales forecast** by week and **supplier payments**.
Data lives in **Firebase Firestore**, sign-in is **Google via Firebase Auth**,
and the site is hosted on **GitHub Pages**.

## Try it locally first

Double-click `index.html`. Until `js/config.js` has your Firebase settings, the
app runs in **demo mode**: it starts from the figures in `js/local-seed.js`
(copied from the Excel sheets) and saves your edits only in this browser.
Use **Reset demo data** in the yellow bar to start over.

If your browser blocks something when opening the file directly, serve the folder instead:

```bash
npx serve .
```

## Pages

| Page | What it shows |
|---|---|
| **Dashboard** | Annual plan + actual-to-date tiles, plan-vs-actual chart, and one table with every month, quarter subtotal and a bold annual total for Revenue, Profit, Margin and Procurement. |
| **Budget detail** | The Excel layout: each budget line × Plan / Actual per month and quarter (or full year). Edit here. Actuals can be typed per line, or only as the month total. “Of which” lines (Batumi, Kutaisi) are shown under the total but not added to it. |
| **Sales forecast** | For each month: revenue target vs deals by status (Closed / Likely / In progress / Pipeline). **Outlook** = actual for closed months + forecast for open months — the number to show the CCO. Below it, one month's deals by week I–V. |
| **Supplier payments** | Payments by month in EUR/USD/GEL, paid vs scheduled, overdue flags, and GEL equivalents at exchange rates you set. |

## How the numbers work

- Quarter and annual values are sums of their months.
- **Profit margin = Profit ÷ Revenue** at every level (not an average of monthly margins).
- “% of plan” compares actual with plan for the same period.
- Firestore stores one document per year and section:
  `departments/{departmentId}/budget|forecast|payments/{year}`.

## Files

```
index.html              page layout
css/styles.css          styling (light + dark mode, print)
js/config.js            ← Firebase settings, department name, budget lines, deal statuses
js/local-seed.js        starter data for demo mode (NOT uploaded — in .gitignore)
js/util.js, model.js    formatting and budget math
js/chart.js             charts (SVG)
js/store.js             Firebase / demo data layer
js/views/*.js           the four pages
js/app.js               navigation, year switcher, sign-in
firestore.rules         security rules to paste into Firebase
```

## Going live

### 1. Firebase (once)
1. <https://console.firebase.google.com> → **Add project**.
2. **Build → Firestore Database → Create database** (production mode, a region near you).
3. **Build → Authentication → Get started → Sign-in method → Google → Enable**.
4. **Project settings → General → Your apps → Web (`</>`)** → register an app →
   copy the `firebaseConfig` values into `js/config.js`.
5. **Firestore → Rules**: paste `firestore.rules`, put your team's emails in the list, **Publish**.

The live database starts empty. Open the app **on the computer that has
`js/local-seed.js`**, sign in, and click **Upload starter figures** in the blue bar —
it copies the Excel figures into Firebase once. After that, edit in the app (Edit → Save).

To try things without touching live data, add `?demo` to the address
(e.g. `index.html?demo`) — that opens the browser-only demo mode.

### 2. GitHub
```bash
git init
git add .
git commit -m "Budget planner"
git branch -M main
git remote add origin https://github.com/<your-user>/<repo-name>.git
git push -u origin main
```

### 3. GitHub Pages
1. Repo → **Settings → Pages** → Source: **Deploy from a branch** → `main` / `(root)` → Save.
2. The site appears at `https://<your-user>.github.io/<repo-name>/`.
3. Firebase → **Authentication → Settings → Authorized domains → Add domain** → `<your-user>.github.io`.

## Security notes

- The Firebase web config in `config.js` is safe to commit; access is enforced by `firestore.rules`.
- GitHub Pages sites are public — anyone can open the page, but only signed-in,
  listed accounts can read or change data.
- Keep real figures out of the repository: `js/local-seed.js` is git-ignored. On a
  free GitHub plan, a Pages site needs a public repo, so this matters.
