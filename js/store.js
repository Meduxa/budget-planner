// Data layer. Firebase (Auth + Firestore) when config.js is filled in,
// otherwise a browser-only DEMO store (localStorage + local-seed.js).
// Each kind ("budget" | "forecast" | "payments") is one document per year:
//   departments/{departmentId}/{kind}/{year}
(function () {
  const CFG = window.BP_CONFIG;
  const S = CFG.settings;
  const SDK = "https://www.gstatic.com/firebasejs/12.19.0";

  const hasConfig = !String(CFG.firebase.apiKey || "").startsWith("PASTE");
  const forceDemo = new URLSearchParams(location.search).has("demo");
  const isConfigured = hasConfig && !forceDemo;
  const demoKey = (kind, year) => `bp:${S.departmentId}:${kind}:${year}`;

  function demoStore() {
    return {
      mode: "demo",
      init(onUser) { onUser({ displayName: "Demo user", email: null }); },
      async signIn() {},
      async signOut() {},
      async load(kind, year) {
        try {
          const raw = localStorage.getItem(demoKey(kind, year));
          if (raw) return JSON.parse(raw);
        } catch { /* storage blocked: fall through to seed */ }
        const seed = window.BP_SEED?.[kind]?.[year];
        return seed ? JSON.parse(JSON.stringify(seed)) : null;
      },
      async save(kind, year, doc) {
        try {
          localStorage.setItem(demoKey(kind, year), JSON.stringify(doc));
        } catch {
          throw new Error("This browser blocked local storage, so demo data can't be saved.");
        }
      },
      reset() {
        try {
          Object.keys(localStorage)
            .filter((k) => k.startsWith(`bp:${S.departmentId}:`))
            .forEach((k) => localStorage.removeItem(k));
        } catch { /* nothing to clear */ }
      },
    };
  }

  async function firebaseStore() {
    const [appMod, authMod, fs] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    const app = appMod.initializeApp(CFG.firebase);
    const auth = authMod.getAuth(app);
    const db = fs.getFirestore(app);
    const ref = (kind, year) => fs.doc(db, "departments", S.departmentId, kind, String(year));

    return {
      mode: "firebase",
      init(onUser) { authMod.onAuthStateChanged(auth, onUser); },
      signIn() { return authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider()); },
      signOut() { return authMod.signOut(auth); },
      async load(kind, year) {
        const snap = await fs.getDoc(ref(kind, year));
        return snap.exists() ? snap.data() : null;
      },
      async save(kind, year, doc) {
        await fs.setDoc(ref(kind, year), {
          ...doc,
          updatedAt: fs.serverTimestamp(),
          updatedBy: auth.currentUser?.email ?? null,
        });
      },
    };
  }

  BP.store = {
    isConfigured,
    forceDemo: hasConfig && forceDemo,
    create: () => (isConfigured ? firebaseStore() : Promise.resolve(demoStore())),
  };
})();
