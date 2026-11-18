/* Vprono data layer.
 * The app was written against a small document API (doc/collection, get/set/add, onSnapshot).
 * This file provides that API on top of Supabase (Postgres + Auth + Realtime), so the app code stays the same.
 *
 * Paths the app uses and the tables behind them:
 *   players/<uid>                        -> players(id, data, score, pseudo, groups)
 *   groups/<code>                        -> groups(code, name, created_by)
 *   groups/<code>/messages (collection)  -> messages(id, group_code, user_id, body, kind, bet, ts)
 *   days/<date>                          -> days(date, doc)     (read-only for players)
 *   meta/season                          -> meta(id, doc)       (read-only for players)
 */
(function () {
  "use strict";
  const cfg = window.VPRONO_CONFIG || {};
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const snapOf = (id, data) => ({ id, exists: !!data, data: () => data });
  const qsnap = (rows) => ({ docs: rows.map((r) => ({ id: r.id, data: () => r.data })) });
  const err = (e) => Object.assign(new Error((e && e.message) || "db error"), { code: (e && e.code) || "unavailable" });
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  let chanSeq = 0;

  /* Subscribe to a table: run `load` now, then again whenever a matching row changes (Realtime),
     with a slow poll as a safety net when the realtime socket is unavailable. */
  function live(table, filter, load, next, error) {
    let stopped = false;
    const run = async () => {
      if (stopped) return;
      try { const r = await load(); if (!stopped) next(r); } catch (e) { if (!stopped && error) error(err(e)); }
    };
    const rerun = debounce(run, 250);
    run();
    const opts = { event: "*", schema: "public", table };
    if (filter) opts.filter = filter;
    const ch = sb.channel("vp-" + table + "-" + ++chanSeq).on("postgres_changes", opts, rerun).subscribe();
    const poll = setInterval(run, 90000);
    const vis = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", vis);
    return () => { stopped = true; clearInterval(poll); document.removeEventListener("visibilitychange", vis); sb.removeChannel(ch); };
  }

  /* ---------- documents ---------- */
  function doc(path) {
    const [col, id, sub] = path.split("/");
    if (sub) throw new TypeError("unsupported path " + path);
    if (col === "players") {
      const load = async () => {
        const { data, error } = await sb.from("players").select("id,data").eq("id", id).maybeSingle();
        if (error) throw error;
        return snapOf(id, data ? data.data : null);
      };
      return {
        id, path, get: load,
        async set(d) {
          const row = { id, data: d, score: Number(d.score) || 0, pseudo: d.pseudo || "", groups: d.groups || [], updated_at: new Date().toISOString() };
          const { error } = await sb.from("players").upsert(row);
          if (error) throw err(error);
        },
        onSnapshot: (next, error) => live("players", "id=eq." + id, load, next, error),
      };
    }
    if (col === "groups") {
      const load = async () => {
        const { data, error } = await sb.from("groups").select("code,name,created_by").eq("code", id).maybeSingle();
        if (error) throw error;
        return snapOf(id, data ? { name: data.name, createdBy: data.created_by } : null);
      };
      return {
        id, path, get: load,
        async set(d) {
          const { error } = await sb.from("groups").insert({ code: id, name: d.name, created_by: d.createdBy });
          if (error) throw err(error);
        },
        onSnapshot: (next, error) => live("groups", "code=eq." + id, load, next, error),
      };
    }
    if (col === "days" || col === "meta") {
      const key = col === "days" ? "date" : "id";
      const load = async () => {
        const { data, error } = await sb.from(col).select("doc").eq(key, id).maybeSingle();
        if (error) throw error;
        return snapOf(id, data ? data.doc : null);
      };
      return { id, path, get: load, onSnapshot: (next, error) => live(col, key + "=eq." + id, load, next, error) };
    }
    throw new TypeError("unknown collection " + col);
  }

  /* ---------- queries ---------- */
  function collection(path) {
    const parts = path.split("/");
    if (parts[0] === "groups" && parts[2] === "messages") return messages(parts[1]);
    if (parts[0] === "global") return globalMessages();
    if (parts[0] !== "players") throw new TypeError("unsupported collection " + path);
    const q = { filters: [], order: null, lim: 1000 };
    const api = {
      where(field, op, value) { q.filters.push([field, op, value]); return api; },
      orderBy(field, dir) { q.order = [field, dir || "asc"]; return api; },
      limit(n) { q.lim = n; return api; },
      async get() { return qsnap(await run()); },
      onSnapshot(next, error) { return live("players", null, async () => qsnap(await run()), next, error); },
    };
    async function run() {
      let r = sb.from("players").select("id,data");
      for (const [f, op, v] of q.filters) {
        if (f === "groups" && op === "array-contains") r = r.contains("groups", [v]);
        else if (op === "==") r = r.eq(f, v);
      }
      if (q.order) r = r.order(q.order[0], { ascending: q.order[1] !== "desc", nullsFirst: false });
      r = r.limit(q.lim);
      const { data, error } = await r;
      if (error) throw error;
      return data;
    }
    return api;
  }

  function messages(code) {
    const q = { lim: 60 };
    const run = async () => {
      const { data, error } = await sb.from("messages").select("id,user_id,body,kind,bet,ts").eq("group_code", code)
        .order("ts", { ascending: false }).limit(q.lim);
      if (error) throw error;
      return { docs: data.map((m) => ({ id: String(m.id), data: () => ({ u: m.user_id, t: m.body, kind: m.kind || undefined, bet: m.bet || undefined, ts: Date.parse(m.ts) }) })) };
    };
    const api = {
      orderBy() { return api; },
      limit(n) { q.lim = n; return api; },
      get: run,
      onSnapshot: (next, error) => live("messages", "group_code=eq." + code, run, next, error),
      async add(d) {
        const { error } = await sb.from("messages").insert({ group_code: code, user_id: d.u, body: d.t || "", kind: d.kind || null, bet: d.bet || null });
        if (error) throw err(error);
      },
    };
    return api;
  }

  function globalMessages() {
    const q = { lim: 80 };
    const run = async () => {
      const { data, error } = await sb.from("global_messages").select("id,user_id,pseudo,body,kind,bet,ts").order("ts", { ascending: false }).limit(q.lim);
      if (error) throw error;
      return { docs: data.map((m) => ({ id: String(m.id), data: () => ({ u: m.user_id, p: m.pseudo, t: m.body, kind: m.kind || undefined, bet: m.bet || undefined, ts: Date.parse(m.ts) }) })) };
    };
    const api = {
      orderBy() { return api; },
      limit(n) { q.lim = n; return api; },
      get: run,
      onSnapshot: (next, error) => live("global_messages", null, run, next, error),
      async add(d) {
        const { error } = await sb.from("global_messages").insert({ user_id: d.u, pseudo: (d.p || "").slice(0, 24), body: d.t || "", kind: d.kind || null, bet: d.bet || null });
        if (error) throw err(error);
      },
    };
    return api;
  }

  /* ---------- people ---------- */
  function userApi(session) {
    const u = session.user;
    return {
      id: async () => u.id,
      me: async () => ({ id: u.id, name: (u.user_metadata && u.user_metadata.pseudo) || "" }),
      can: async () => true,
      profiles: async () => ({}),
      email: u.email,
      pseudo: (u.user_metadata && u.user_metadata.pseudo) || "",
    };
  }

  window.VP = {
    sb,
    db: { doc, collection },
    userApi,
    async session() { const { data } = await sb.auth.getSession(); return data.session; },
    onAuth(fn) { return sb.auth.onAuthStateChange((ev, s) => fn(ev, s)); },
    signUp: (email, password, pseudo) => sb.auth.signUp({ email, password, options: { data: { pseudo }, emailRedirectTo: location.origin + location.pathname } }),
    signIn: (email, password) => sb.auth.signInWithPassword({ email, password }),
    reset: (email) => sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }),
    updatePassword: (password) => sb.auth.updateUser({ password }),
    signOut: () => sb.auth.signOut(),
  };
})();
