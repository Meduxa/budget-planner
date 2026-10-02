// App shell: sign-in, year switcher, tab navigation, loading and saving.
(function () {
  const U = BP.util;
  const M = BP.model;
  const S = U.S;
  const $ = (id) => document.getElementById(id);
  const VIEW_IDS = ["dashboard", "budget", "forecast", "payments"];

  const app = BP.app = {
    year: new Date().getFullYear(),
    view: null,
    data: null,
    store: null,
    user: null,
    loadToken: 0,

    status(msg, isError = false) {
      const s = $("status");
      s.textContent = msg;
      s.classList.toggle("error", isError);
      s.hidden = !msg;
    },

    async save(kind, doc) {
      app.status("Saving…");
      try {
        await app.store.save(kind, app.year, doc);
        app.data[kind] = U.clone(doc);
        app.status("Saved.");
        setTimeout(() => { if ($("status").textContent === "Saved.") app.status(""); }, 2500);
        return true;
      } catch (e) {
        app.status(friendlyError(e), true);
        return false;
      }
    },
  };

  function friendlyError(e) {
    if (e?.code === "permission-denied") {
      return "Your account doesn't have access to this data. Ask the owner to add your email to the Firestore rules.";
    }
    if (e?.code === "unavailable") return "Can't reach Firebase — check your internet connection.";
    return e?.message || String(e);
  }

  // ── navigation ──
  const viewOf = (id) => BP.views[id];

  function canLeave() {
    const v = app.view && viewOf(app.view);
    if (v?.isDirty?.() && !confirm("You have unsaved changes. Discard them?")) return false;
    v?.reset?.();
    return true;
  }

  function route() {
    const id = VIEW_IDS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "dashboard";
    if (id !== app.view && app.view && !canLeave()) {
      history.replaceState(null, "", `#${app.view}`);
      return;
    }
    app.view = id;
    showView();
  }

  function showView() {
    document.querySelectorAll("[data-nav]").forEach((a) =>
      a.toggleAttribute("aria-current", a.dataset.nav === app.view));
    VIEW_IDS.forEach((id) => { $(`view-${id}`).hidden = id !== app.view || !app.data; });
    if (app.data) viewOf(app.view).render($(`view-${app.view}`), app);
  }

  // ── data ──
  const KINDS = ["budget", "forecast", "payments"];
  const KIND_LABELS = { budget: "budget", forecast: "sales forecast", payments: "supplier payments" };
  let seedMissing = [];

  // In Firebase mode, offer to copy local starter data (js/local-seed.js, never on GitHub)
  // into any section that is still empty for this year.
  function offerSeed(raw) {
    seedMissing = app.store.mode === "firebase"
      ? KINDS.filter((k, i) => raw[i] == null && window.BP_SEED?.[k]?.[app.year])
      : [];
    $("seedBanner").hidden = !seedMissing.length;
    if (seedMissing.length) {
      $("seedText").innerHTML = `<strong>Firebase has no ${seedMissing.map((k) => KIND_LABELS[k]).join(", ")} data for ${app.year} yet.</strong>
        This computer has the starter figures from your Excel file — upload them so you don't have to retype them.`;
    }
  }

  async function uploadSeed() {
    const list = seedMissing.map((k) => KIND_LABELS[k]).join(", ");
    if (!confirm(`Upload the ${app.year} starter figures (${list}) to Firebase?`)) return;
    const normalize = { budget: M.normalizeBudget, forecast: M.normalizeForecast, payments: M.normalizePayments };
    $("seedUpload").disabled = true;
    app.status("Uploading starter figures…");
    try {
      for (const k of seedMissing) {
        await app.store.save(k, app.year, normalize[k](window.BP_SEED[k][app.year]));
      }
      await loadYear();
      app.status("Starter figures uploaded.");
    } catch (e) {
      app.status(friendlyError(e), true);
    } finally {
      $("seedUpload").disabled = false;
    }
  }

  async function loadYear() {
    const token = ++app.loadToken;
    $("yearLabel").textContent = app.year;
    $("seedBanner").hidden = true;
    app.data = null;
    showView();
    app.status("Loading…");
    try {
      const raw = await Promise.all(KINDS.map((k) => app.store.load(k, app.year)));
      if (token !== app.loadToken) return;
      const [budget, forecast, payments] = raw;
      offerSeed(raw);
      app.data = {
        budget: M.normalizeBudget(budget),
        forecast: M.normalizeForecast(forecast),
        payments: M.normalizePayments(payments),
      };
      BP.views.forecast.resetMonth();
      app.status("");
      showView();
    } catch (e) {
      if (token !== app.loadToken) return;
      app.status(friendlyError(e), true);
    }
  }

  function changeYear(delta) {
    if (!canLeave()) return;
    app.year += delta;
    loadYear();
  }

  // ── auth ──
  function renderUser() {
    const box = $("userBox");
    box.replaceChildren();
    if (app.store.mode === "demo" || !app.user) return;
    const who = document.createElement("span");
    who.className = "user-name";
    who.textContent = app.user.displayName || app.user.email;
    const btn = document.createElement("button");
    btn.className = "btn ghost";
    btn.textContent = "Sign out";
    btn.onclick = () => { if (canLeave()) app.store.signOut(); };
    box.append(who, btn);
  }

  function onUser(user) {
    app.user = user;
    renderUser();
    $("signIn").hidden = !!user;
    $("appNav").hidden = !user;
    $("yearPicker").hidden = !user;
    if (user) loadYear();
    else { app.data = null; $("seedBanner").hidden = true; showView(); }
  }

  async function main() {
    $("deptName").textContent = S.departmentName;
    document.title = `${S.departmentName} · Budget planner`;

    $("prevYear").onclick = () => changeYear(-1);
    $("nextYear").onclick = () => changeYear(1);
    $("signInBtn").onclick = async () => {
      try { await app.store.signIn(); } catch (e) { app.status(friendlyError(e), true); }
    };
    $("resetDemo").onclick = () => {
      if (!confirm("Clear everything you changed in demo mode and go back to the starter data?")) return;
      app.store.reset();
      viewOf(app.view)?.reset?.();
      loadYear();
    };
    window.addEventListener("hashchange", route);
    window.addEventListener("beforeunload", (e) => {
      if (app.view && viewOf(app.view)?.isDirty?.()) e.preventDefault();
    });

    try {
      app.store = await BP.store.create();
    } catch (e) {
      app.status(`Couldn't load Firebase: ${friendlyError(e)}`, true);
      return;
    }
    $("demoBanner").hidden = app.store.mode !== "demo";
    if (BP.store.forceDemo) {
      $("demoText").innerHTML = `<strong>Demo mode</strong> (because the address ends in <code>?demo</code>).
        Changes are saved only in this browser, not in Firebase. Remove <code>?demo</code> to use the live data.`;
    }
    $("seedUpload").onclick = uploadSeed;
    app.view = VIEW_IDS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "dashboard";
    app.store.init(onUser);
  }

  main();
})();
