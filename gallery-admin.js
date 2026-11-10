/* 팬아트 갤러리 운영자 도구 (2026-11-10) — gallery.js 가 운영자 버튼을 눌렀을 때(또는 이미 운영자 모드일 때)만 내려받아요. 일반 방문자는 이 파일을 받지 않아요.
   - 로그인: 문의·게임평 게시판의 운영자 모드(ccGoogle → /bcfg/ping 확인 → BRD.master)를 그대로 써요. 토큰은 메모리에만 있고 약 50분 뒤 끝나요.
   - 저장소: Firestore galleryItems (읽기 공개 / 쓰기·삭제는 운영자만 — 규칙은 docs/gallery-firestore-rules.md). 서버 규칙이 아직 게시되지 않았으면 저장이 거절되고 안내가 나와요.
   - 기능: 작품 추가(브라우저에서 그림 줄이기) · 수정 · 삭제 · 숨김/보이기 · 순서 · 기본 작품(items.json) 숨김/글 고치기/원래대로. 링크 칸은 없어요. */
(() => {
  "use strict";
  const G = window.roundbGallery, C = G && G._core;
  if (!C || G._admin) return;
  G._admin = true;
  const {S, h, net, DOCS, LIM, str, notify, sfx, masterTok, FS_COL} = C, D = document;
  const A = {msg: "", busy: false, arm: "", ed: null};
  const MAX_IN = 25 * 1024 * 1024, MAX_PIXELS = 100e6, BIG_CHARS = 760000, THUMB_CHARS = 38000;   // 규칙 한도: 큰 그림 800000자 · 썸네일 40000자 (문서 1MiB 아래)
  const kb = n => Math.max(1, Math.round(n * 0.75 / 1024));

  /* ---------- 서버 쓰기 ---------- */
  const enc = v => typeof v === "boolean" ? {booleanValue: v} : typeof v === "number" ? {integerValue: String(Math.round(v))} : {stringValue: String(v)};
  const encAll = o => { const f = {}; for (const k of Object.keys(o)) f[k] = enc(o[k]); return f; };
  const nameOf = id => DOCS + "/" + FS_COL + "/" + id;
  function wr(id, o, how) {   // how: {create} 새 문서만 · {exists} 있는 문서만 · {full} 문서 전체 쓰기(아니면 바뀐 칸만)
    const w = {update: {name: nameOf(id), fields: encAll(o)}};
    if (!(how && how.full)) w.updateMask = {fieldPaths: Object.keys(o)};
    if (how && how.create) w.currentDocument = {exists: false}; else if (how && how.exists) w.currentDocument = {exists: true};
    return w;
  }
  function loginEnded() { notify("운영자 로그인이 끝났어요. 🔧 운영자 버튼으로 다시 로그인해 주세요"); S.opWas = false; C.paintHead(); C.render(true); }
  async function commit(writes) {   // 성공하면 {ok:true}, 실패하면 이유를 알리고 {ok:false, status}
    const tok = masterTok(); if (!tok) { loginEnded(); return {ok: false, status: 401}; }
    for (let i = 0; i < writes.length; i += 100) {
      const r = await net("POST", ":commit", {writes: writes.slice(i, i + 100)}, tok);
      if (r.s === 200) continue;
      if (r.s === 401) loginEnded();
      else if (r.s === 403) notify("저장 권한이 없어요. 서버 규칙(galleryItems)이 아직 게시되지 않았거나 운영자 로그인이 끝났을 수 있어요");
      else if (r.s !== 409) notify(r.s === 0 ? "인터넷 연결을 확인해 주세요" : "저장하지 못했어요. 잠시 뒤 다시 눌러 주세요");
      return {ok: false, status: r.s};
    }
    return {ok: true};
  }
  function applyLocal(id, patch, full) { let d = S.fs.find(x => x.id === id); if (!d) { d = {id, full: false}; S.fs.push(d); } Object.assign(d, patch); if (full) d.full = true; }
  const refresh = () => { C.mergeAll(); C.render(true); };

  /* ---------- 로그인 · 로그아웃 (게시판 운영자 모드와 같은 상태를 써요) ---------- */
  function loginPanel() {
    return h("section", {class: "gl-opask", "aria-label": "운영자 로그인"},
      h("h3", {text: "🔧 운영자 로그인"}),
      h("p", {class: "gl-dim", text: "작품을 올리고 고치려면 운영자 구글 계정으로 로그인해야 해요. 로그인은 약 50분 동안 유지되고, 새로고침하면 다시 해야 해요. 문의·게임평 게시판의 운영자 모드와 같은 로그인이에요(비밀번호는 이 게임이 받지 않아요)."}),
      A.msg ? h("p", {class: "gl-msg gl-warn", role: "alert", text: A.msg}) : null,
      h("div", {class: "gl-row"}, h("button", {type: "button", class: "gl-btn gl-primary", "aria-disabled": A.busy ? "true" : null, text: A.busy ? "로그인 창을 열었어요…" : "구글로 로그인", onclick: login}),
        h("button", {type: "button", class: "gl-btn", text: "닫기", onclick: () => { S.opAsk = false; A.msg = ""; C.render(true); }})));
  }
  async function login() {
    if (A.busy) return; A.busy = true; A.msg = ""; C.render(true);
    try {
      const g = await ccGoogle(true);   // 게시판과 같은 구글 로그인 창(메인 스크립트의 함수)
      const r = await brdFs("GET", "/bcfg/ping", null, g.tok);   // 규칙이 이 계정을 운영자로 보면 404(문서는 없지만 읽기는 허용), 아니면 403
      if (r.s === 200 || r.s === 404) {
        BRD.master = {uid: g.uid, tok: g.tok, t: g.t, m: g.m}; BRD.mo = true; BRD.ls.mh = 1; brdSave(); BRD.lock = null; BRD.det = {}; BRD.sel = null;
        try { await g.done(false); } catch (e) {}
        S.opAsk = false; notify("운영자 모드를 켰어요 (약 50분)"); sfx("up");
      } else { try { await g.done(false); } catch (e) {} A.msg = r.s === 403 ? "이 구글 계정은 운영자로 등록돼 있지 않아요." : "운영자인지 확인하지 못했어요. 잠시 뒤 다시 해 주세요."; }
    } catch (e) { A.msg = typeof brdErr === "function" ? brdErr(e) : "로그인하지 못했어요. 잠시 뒤 다시 해 주세요."; }
    finally { A.busy = false; S.opWas = !!masterTok(); C.paintHead(); C.render(true); }
  }
  function logout() {
    try { BRD.mo = false; BRD.master = null; BRD.lock = null; BRD.sel = null; BRD.det = {}; } catch (e) {}
    S.opAsk = false; S.opWas = false; A.arm = ""; closeEditor(true); C.paintHead(); C.render(true); notify("운영자 모드를 껐어요");
  }
  function headClick() {
    if (masterTok()) { logout(); return; }
    S.opAsk = !S.opAsk; A.msg = ""; C.render(true);
    if (S.opAsk) { const b = S.body.querySelector(".gl-opask .gl-primary"); if (b) b.focus(); }
  }
  function bar() {
    let left = 0, who = ""; try { left = Math.max(0, 50 - Math.floor((Date.now() - BRD.master.t) / 60000)); who = BRD.master.m || ""; } catch (e) {}
    return h("section", {class: "gl-opbar", "aria-label": "운영자 도구"},
      h("p", {class: "gl-opt", text: "🔧 운영자 모드 켜짐" + (who ? " · " + who : "") + " · 약 " + left + "분 남음"}),
      h("div", {class: "gl-row"}, h("button", {type: "button", class: "gl-btn gl-primary", text: "＋ 작품 추가", onclick: () => openEditor(null)}), h("button", {type: "button", class: "gl-btn", text: "로그아웃", onclick: logout})),
      S.fsState === "closed" || S.fsState === "err" ? h("p", {class: "gl-msg gl-warn", role: "status", text: S.fsState === "closed" ? "작품 저장소(서버 규칙 galleryItems)가 아직 열리지 않아서 추가·수정·숨김·순서 변경이 저장되지 않아요. 지금은 기본 작품만 보여요." : "작품 저장소를 불러오지 못했어요. 인터넷을 확인하고 갤러리를 다시 열어 주세요."}) : null,
      S.fs.length >= 90 ? h("p", {class: "gl-msg gl-warn", role: "status", text: "작품 문서가 " + S.fs.length + "개예요. 목록은 100개까지만 읽어서, 오래된 작품을 정리해 주세요."}) : null,
      h("p", {class: "gl-dim gl-small-t", text: "각 작품 밑의 버튼으로 순서(▲▼)·수정·숨기기·삭제를 해요. 숨긴 작품은 나만 보여요(🚫). 댓글 옆 [삭제] 로 욕설·광고 댓글도 지울 수 있어요."}));
  }

  /* ---------- 작품 버튼줄 · 순서 · 숨김 · 삭제 ---------- */
  function tools(it) {
    const nm = it.title, idx = S.all.indexOf(it);
    const b = (text, fn, aria, cls, dis) => h("button", {type: "button", class: "gl-btn gl-small" + (cls ? " " + cls : ""), text, disabled: dis ? "" : null, "aria-label": aria + ": " + nm, onclick: e => { e.stopPropagation(); fn(e.currentTarget); }});
    const row = [b("▲", () => move(it, -1), "앞으로 옮기기", "", idx <= 0), b("▼", () => move(it, 1), "뒤로 옮기기", "", idx < 0 || idx >= S.all.length - 1),
      b("수정", () => openEditor(it), "수정"), b(it.hidden ? "보이기" : "숨기기", () => toggleHide(it), it.hidden ? "다시 보이게 하기" : "숨기기")];
    if (it.src === "fs") row.push(b("삭제", btn => confirmTwice(btn, it.id + ":del", "삭제", "정말 삭제", () => remove(it)), "삭제", "gl-danger"));
    else if (it.ov) row.push(b("원래대로", btn => confirmTwice(btn, it.id + ":rst", "원래대로", "정말 되돌리기", () => reset(it)), "기본 모습으로 되돌리기"));
    return h("div", {class: "gl-op", role: "group", "aria-label": "운영자 도구: " + nm}, row);
  }
  function confirmTwice(btn, key, normal, ask, fn) {   // 두 번 눌러 확정(3.5초 안에)
    if (A.arm !== key) { A.arm = key; btn.textContent = ask; btn.classList.add("gl-armed"); setTimeout(() => { if (A.arm === key) { A.arm = ""; btn.textContent = normal; btn.classList.remove("gl-armed"); } }, 3500); return; }
    A.arm = ""; fn();
  }
  async function move(it, dir) {   // 보이는 순서(숨김 포함)에서 한 칸 옮기고, 바뀐 작품의 번호만 10단위로 다시 매겨요
    const arr = S.all.slice(), i = arr.findIndex(x => x.id === it.id), j = i + dir; if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const ws = [], ps = []; arr.forEach((x, k) => { const o = k * 10; if (x.order !== o) { ws.push(wr(x.id, {order: o}, x.src === "fs" ? {exists: true} : {})); ps.push([x.id, o]); } });
    if (!ws.length) return;
    const r = await commit(ws); if (!r.ok) return;
    ps.forEach(([id, o]) => applyLocal(id, {order: o})); sfx("click"); refresh();
  }
  async function toggleHide(it) {
    const v = !it.hidden, r = await commit([wr(it.id, {hidden: v}, it.src === "fs" ? {exists: true} : {})]); if (!r.ok) return;
    applyLocal(it.id, {hidden: v}); notify(v ? "숨겼어요 (나만 보여요)" : "다시 보이게 했어요"); refresh();
  }
  async function purgeComments(id) {   // 작품을 지우면 그 작품의 댓글도 함께 정리(최대 100개, 실패해도 무시)
    try {
      const tok = masterTok(), r = await net("POST", ":runQuery", {structuredQuery: {from: [{collectionId: "galleryComments"}], where: {fieldFilter: {field: {fieldPath: "itemId"}, op: "EQUAL", value: {stringValue: id}}}, select: {fields: [{fieldPath: "__name__"}]}, limit: 100}}, tok);
      const names = r.s === 200 && Array.isArray(r.j) ? r.j.filter(x => x && x.document).map(x => x.document.name) : [];
      if (names.length && tok) await net("POST", ":commit", {writes: names.map(delete_ => ({delete: delete_}))}, tok);
    } catch (e) {}
  }
  async function remove(it) {
    const r = await commit([{delete: nameOf(it.id)}]); if (!r.ok) return;
    purgeComments(it.id); S.fs = S.fs.filter(x => x.id !== it.id); delete S.big[it.id]; delete S.T[it.id]; notify("작품을 지웠어요"); C.mergeAll();
    if (S.view === "detail" && S.id === it.id) C.goBack(); else C.render(true);
  }
  async function reset(it) {   // 기본 작품의 덮어쓰기(숨김·순서·고친 글)를 지워 items.json 모습으로
    const r = await commit([{delete: nameOf(it.id)}]); if (!r.ok) return;
    S.fs = S.fs.filter(x => x.id !== it.id); notify("기본 모습으로 되돌렸어요"); refresh();
  }

  /* ---------- 그림 줄이기(브라우저 안에서) ---------- */
  async function decode(file) {
    if (window.createImageBitmap) { try { return await createImageBitmap(file, {imageOrientation: "from-image"}); } catch (e) { try { return await createImageBitmap(file); } catch (e2) {} } }
    return await new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("decode")); }; im.src = u; });
  }
  function toJpeg(src, sw, sh, long, q0, maxLen) {   // 한도(글자 수) 안에 들 때까지 품질 → 크기를 차례로 낮춰요
    let scale = Math.min(1, long / Math.max(sw, sh)), q = q0;
    for (let i = 0; i < 18; i++) {
      const w = Math.max(1, Math.round(sw * scale)), hh = Math.max(1, Math.round(sh * scale)), cv = D.createElement("canvas"); cv.width = w; cv.height = hh;
      const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, hh); g.drawImage(src, 0, 0, w, hh);   // 투명 배경은 흰색으로
      const url = cv.toDataURL("image/jpeg", q);
      if (/^data:image\/jpeg;base64,/.test(url) && url.length <= maxLen) return {url, w, h: hh};
      if (q > 0.5) q = Math.max(0.45, q - 0.1); else scale *= 0.85;
    }
    throw new Error("too big");
  }
  async function processImage(file) {
    const okType = /^image\/(jpeg|png|webp)$/.test(file.type) || (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name));
    if (!okType) throw new Error("JPG·PNG·WebP 그림만 올릴 수 있어요.");
    if (file.size > MAX_IN) throw new Error("파일이 너무 커요(25MB까지).");
    let src; try { src = await decode(file); } catch (e) { throw new Error("그림을 열 수 없어요. 다른 파일로 해 보세요."); }
    try {
      const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
      if (!sw || !sh || sw * sh > MAX_PIXELS) throw new Error("그림 크기가 너무 커요.");
      return {big: toJpeg(src, sw, sh, 1200, 0.86, BIG_CHARS), thumb: toJpeg(src, sw, sh, 480, 0.78, THUMB_CHARS)};
    } catch (e) { throw e && e.message === "too big" ? new Error("그림을 한도 안으로 줄이지 못했어요. 다른 그림으로 해 보세요.") : e; } finally { try { if (src.close) src.close(); } catch (e) {} }
  }

  /* ---------- 작품 추가·수정 창 ---------- */
  const todayStr = () => { const d = new Date(), z = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); };
  const rid = () => { const A36 = "abcdefghijklmnopqrstuvwxyz0123456789", b = new Uint8Array(4); if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b); else for (let i = 0; i < 4; i++) b[i] = Math.floor(Math.random() * 256); return Array.from(b, v => A36[v % 36]).join(""); };
  const newId = () => "f" + todayStr().replace(/-/g, "") + "-" + rid();
  function closeEditor(force) {
    const E = A.ed; if (!E) return; if (!force && E.busy) return; A.ed = null; if (S.layer && S.layer.el === E.el) S.layer = null; E.el.remove();
    try { if (E.ret && E.ret.focus && D.contains(E.ret)) E.ret.focus({preventScroll: true}); } catch (e) {}
  }
  function openEditor(it) {
    closeEditor(true);
    const isNew = !it, stat = !!it && it.src === "static", E = A.ed = {busy: false, big: null, thumb: null, ret: D.activeElement, el: null};
    const inp = (id, max, ph) => h("input", {class: "gl-in", type: "text", id, maxlength: max, autocomplete: "off", placeholder: ph || null});
    const fTitle = inp("ge-title", LIM.title, "예) 아린 기사 그림"), fArtist = inp("ge-artist", LIM.artist, "비우면 '익명'"), fSource = inp("ge-source", LIM.source, "예) 쓰레드 @아이디(글자로만)"), fNote = inp("ge-note", LIM.note, "작가가 남긴 한마디(한 줄)");
    const fDesc = h("textarea", {class: "gl-in", id: "ge-desc", maxlength: LIM.desc, rows: 3, placeholder: "그림 설명(선택)"}), fDate = h("input", {class: "gl-in", type: "date", id: "ge-date"});
    const fHide = h("input", {type: "checkbox", id: "ge-hide"}), fFile = h("input", {class: "gl-in", type: "file", id: "ge-file", accept: "image/jpeg,image/png,image/webp"});
    const kinds = ["human", "ai"].map(k => h("input", {type: "radio", name: "ge-kind", value: k, id: "ge-k-" + k}));
    const cNote = h("em", {text: "0/" + LIM.note, style: "font-style:normal"}), cDesc = h("em", {text: "0/" + LIM.desc, style: "font-style:normal"});
    const prev = h("img", {class: "gl-ed-prev", alt: "", hidden: true}), info = h("p", {class: "gl-dim gl-small-t", role: "status", "aria-live": "polite"}), msg = h("p", {class: "gl-msg", role: "status", "aria-live": "polite"});
    fNote.addEventListener("input", () => { cNote.textContent = fNote.value.length + "/" + LIM.note; }); fDesc.addEventListener("input", () => { cDesc.textContent = fDesc.value.length + "/" + LIM.desc; });
    const say = (m, warn) => { msg.textContent = m || ""; msg.className = "gl-msg" + (warn ? " gl-warn" : ""); };
    if (it) { fTitle.value = it.title; fArtist.value = it.artist === "익명" ? "" : it.artist; fSource.value = it.source; fNote.value = it.note; fDesc.value = it.desc; fDate.value = it.date || todayStr(); fHide.checked = !!it.hidden; cNote.textContent = it.note.length + "/" + LIM.note; cDesc.textContent = it.desc.length + "/" + LIM.desc; }
    else fDate.value = todayStr();
    kinds.find(k => k.value === (it ? it.kind : "human")).checked = true;
    if (it) { prev.src = it.thumb; prev.hidden = false; prev.alt = it.title; }
    fFile.addEventListener("change", async () => {
      const f = fFile.files && fFile.files[0]; E.big = E.thumb = null; if (!f) { info.textContent = ""; return; }
      info.textContent = "그림을 줄이는 중…"; say("");
      try { const r = await processImage(f); if (A.ed !== E) return; E.big = r.big; E.thumb = r.thumb; prev.src = r.thumb.url; prev.hidden = false; prev.alt = "고른 그림 미리보기"; info.textContent = "그림 " + r.big.w + "×" + r.big.h + "px · 약 " + kb(r.big.url.length) + "KB / 썸네일 " + r.thumb.w + "×" + r.thumb.h + "px · 약 " + kb(r.thumb.url.length) + "KB"; }
      catch (e) { if (A.ed !== E) return; fFile.value = ""; info.textContent = ""; say(e && e.message || "그림을 처리하지 못했어요.", true); }
    });
    async function save(ev) {
      ev.preventDefault(); if (E.busy) return;
      const v = {title: str(fTitle.value, LIM.title), artist: str(fArtist.value, LIM.artist) || "익명", source: str(fSource.value, LIM.source), note: str(fNote.value, LIM.note), desc: str(fDesc.value, LIM.desc),
        date: /^\d{4}-\d{2}-\d{2}$/.test(fDate.value) ? fDate.value : todayStr(), kind: kinds.find(k => k.checked).value, hidden: !!fHide.checked};
      if (!v.title) { say("제목을 적어 주세요.", true); fTitle.focus(); return; }
      if (isNew && !E.big) { say("그림 파일을 골라 주세요.", true); fFile.focus(); return; }
      if (isNew && S.fs.length >= 100) { say("작품 문서가 100개라 더 올릴 수 없어요. 오래된 작품을 지우거나 '원래대로'로 정리한 뒤 올려 주세요.", true); return; }
      if (fFile.files && fFile.files[0] && !E.big) { say("그림을 아직 줄이는 중이에요. 잠시만요.", true); return; }
      E.busy = true; sub.setAttribute("aria-disabled", "true"); say("저장하는 중…");
      let ok = false, st = 0;
      try {
        if (isNew) {
          const order = S.all && S.all.length ? Math.min(...S.all.map(x => x.eff)) - 10 : 0;   // 새 작품은 맨 앞
          for (let i = 0; i < 4 && !ok; i++) {
            const id = newId(), r = await commit([wr(id, Object.assign({}, v, {order, thumb: E.thumb.url, img: E.big.url}), {create: true, full: true})]);
            if (r.ok) { ok = true; S.big[id] = E.big.url; applyLocal(id, Object.assign({}, v, {order, thumb: E.thumb.url}), true); }
            else { st = r.status; if (r.status !== 409) break; }
          }
        } else {
          const diff = {}; for (const k of ["title", "artist", "source", "kind", "date", "desc", "note", "hidden"]) { const cur = k === "artist" ? it.artist : it[k]; if (v[k] !== cur) diff[k] = v[k]; }
          const newImg = !!E.big && !stat; if (newImg) { diff.thumb = E.thumb.url; diff.img = E.big.url; }
          if (!Object.keys(diff).length) { say("바뀐 내용이 없어요."); E.busy = false; sub.removeAttribute("aria-disabled"); return; }
          const r = await commit([wr(it.id, diff, stat ? {} : {exists: true})]); st = r.status;
          if (r.ok) { ok = true; const p = Object.assign({}, diff); delete p.img; applyLocal(it.id, p, newImg); if (newImg) S.big[it.id] = E.big.url; }
        }
      } catch (e) { st = -1; }
      E.busy = false; sub.removeAttribute("aria-disabled");
      if (ok) { sfx("up"); notify(isNew ? "작품을 올렸어요" : "고쳤어요"); closeEditor(true); refresh(); if (isNew && S.view === "detail") C.goBack(); } else say(st === 401 ? "운영자 로그인이 끝났어요. 🔧 버튼으로 다시 로그인한 뒤 저장해 주세요." : st === 403 ? "저장 권한이 없어요. 서버 규칙(galleryItems)이 아직 게시되지 않았거나 운영자 로그인이 끝났을 수 있어요." : st === 0 ? "인터넷 연결을 확인해 주세요." : "저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.", true);
    }
    const sub = h("button", {type: "submit", class: "gl-btn gl-primary", text: isNew ? "올리기" : "저장"});
    const fld = (label, id, el, extra) => h("label", {class: "gl-fld", for: id}, h("span", {}, label, extra || null), el);
    const form = h("form", {class: "gl-form gl-ed-form", novalidate: true, onsubmit: save},
      stat ? h("p", {class: "gl-closed", text: "기본 작품이라 그림은 바꿀 수 없어요. 글(제목·필명·종류 등)은 고칠 수 있고, 되돌리려면 '원래대로'를 눌러요."}) : fld(isNew ? "그림 파일 (JPG·PNG·WebP)" : "그림 바꾸기 (고르지 않으면 그대로)", "ge-file", fFile),
      stat ? null : h("div", {class: "gl-ed-prevbox"}, prev, info),
      fld("제목 (" + LIM.title + "자까지)", "ge-title", fTitle), fld("필명 (" + LIM.artist + "자까지)", "ge-artist", fArtist),
      h("fieldset", {class: "gl-fset"}, h("legend", {text: "종류"}), h("label", {class: "gl-rad", for: "ge-k-human"}, kinds[0], " ✋ 사람이 그린 그림"), h("label", {class: "gl-rad", for: "ge-k-ai"}, kinds[1], " 🤖 AI가 만든 그림")),
      fld("출처 (선택)", "ge-source", fSource), fld("작가의 한마디 (한 줄)", "ge-note", fNote, cNote), fld("설명 (선택)", "ge-desc", fDesc, cDesc), fld("날짜", "ge-date", fDate),
      h("label", {class: "gl-chk", for: "ge-hide"}, fHide, isNew ? " 숨긴 채로 저장 (확인한 뒤 '보이기'로 공개)" : " 숨김 (나만 보여요)"),
      msg, h("div", {class: "gl-row"}, sub, h("button", {type: "button", class: "gl-btn", text: "취소", onclick: () => closeEditor(false)})));
    E.el = h("div", {class: "gl-ed", role: "dialog", "aria-modal": "true", "aria-label": isNew ? "작품 추가" : "작품 수정"}, h("div", {class: "gl-ed-box"}, h("h3", {text: isNew ? "＋ 작품 추가" : "✎ 작품 수정"}), form));
    E.el.addEventListener("click", ev => { if (ev.target === E.el) closeEditor(false); });
    S.root.append(E.el); S.layer = {el: E.el, close: () => closeEditor(false), force: () => closeEditor(true)};
    (stat ? fTitle : fFile).focus();
  }

  const API = {headClick, bar, loginPanel, cardTools: tools, detailTools: tools, openEditor, _t: {wr, encAll, toJpeg, processImage, newId}};
  G._setAdmin(API);
})();
