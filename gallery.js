/* 팬아트 갤러리 + 댓글 (2026-11-10) — 전체 화면 오버레이. 다른 모드 코드는 건드리지 않고, 이 파일 하나와 gallery.css 만으로 동작해요.
   - 작품: 정적 gallery/items.json + gallery/img/ (tools/add_gallery_item.py 로 추가)와, 운영자가 화면에서 올린 Firestore galleryItems 를 합쳐서 보여요.
     운영자 도구(추가·수정·삭제·숨김·순서)는 gallery-admin.js 에 따로 있고 운영자 버튼을 눌렀을 때만 내려받아요. 사용자 글은 전부 textContent 로만 출력해요(XSS 방지).
   - 댓글: Firestore 컬렉션 galleryComments (itemId = 작품 id · nick · text · ts). 게시판과 같은 REST 방식 — 읽기는 공개, 쓰기는 익명 로그인 토큰,
     운영자 삭제는 게시판의 운영자 모드(brdMasterOn)가 켜져 있으면 그 토큰을 그대로 써요. 규칙: docs/gallery-firestore-rules.md
   - 딥링크: #gallery (목록) · #gallery/<id> (작품). 뒤로가기·Esc 로 닫혀요. */
(() => {
  "use strict";
  if (window.roundbGallery) return;
  const D = document, COL = "galleryComments";
  const LIM = {nick: 12, text: 200, note: 80, title: 40, artist: 20, source: 40, desc: 200};
  const COOL = 30000, LS_KEY = "roundb.gallery.v1", PAGE = 30;
  const FB = (() => { try { if (typeof CC_FB !== "undefined" && CC_FB && CC_FB.pid && CC_FB.key) return CC_FB; } catch (e) {} return {key: "AIzaSyBjZkuzEClkdheaA3jtbvyI7TiJ4Yl4JKs", pid: "roundb-games"}; })();   // 웹 앱 설정값은 공개돼도 되는 값 — 접근은 보안 규칙이 막아요
  const DOCS = "projects/" + FB.pid + "/databases/(default)/documents", API = "https://firestore.googleapis.com/v1/" + DOCS;
  const FS_COL = "galleryItems", DATA_OK = /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/;
  const S = {stat: null, itemsErr: false, itemsBusy: false, fs: [], fsState: "idle", fsAt: 0, t0: 0, all: null, big: {}, bigErr: {}, open: false, view: "", id: "", T: {}, ui: {}, layer: null, lbOpen: false, wantClose: false, scroll: 0, ret: null, root: null, ad: null, adP: null, opAsk: false, opWas: false, detOk: false};

  /* ---------- 작은 도우미 ---------- */
  const lsGet = () => { try { const j = JSON.parse(localStorage.getItem(LS_KEY) || "null"); return j && typeof j === "object" ? j : {}; } catch (e) { return {}; } };
  const lsSet = o => { try { localStorage.setItem(LS_KEY, JSON.stringify(Object.assign(lsGet(), o))); } catch (e) {} };
  const str = (v, n) => typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "";
  const imgOk = p => typeof p === "string" && /^gallery\/img\/[A-Za-z0-9_.-]+\.(?:jpe?g|png|webp)$/i.test(p);
  const dateTxt = d => /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d.replace(/-/g, ".") : "";
  function h(tag, props, ...kids) {   // 글자는 전부 text node 로 들어가요(HTML 로 해석되지 않음)
    const e = D.createElement(tag);
    if (props) for (const k of Object.keys(props)) {
      const v = props[k]; if (v == null || v === false) continue;
      if (k === "class") e.className = v; else if (k === "text") e.textContent = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of kids.flat(2)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : D.createTextNode(String(c))); }
    return e;
  }
  const notify = t => { try { if (typeof window.toast === "function") window.toast(t); } catch (e) {} };
  const sfx = k => { try { if (typeof window.sfx === "function") window.sfx(k); } catch (e) {} };
  const tsMs = ts => Date.parse(String(ts || "").replace(/(\.\d{3})\d+Z$/, "$1Z")) || 0;
  function when(ts) {
    const t = tsMs(ts); if (!t) return ""; const d = Date.now() - t;
    if (d < 60000) return "방금"; if (d < 3600000) return Math.floor(d / 60000) + "분 전"; if (d < 86400000) return Math.floor(d / 3600000) + "시간 전";
    const x = new Date(t); return (x.getFullYear() === new Date().getFullYear() ? "" : x.getFullYear() + ".") + (x.getMonth() + 1) + "/" + x.getDate();
  }

  /* ---------- 작품 목록 ---------- */
  function cleanItems(j) {
    if (!Array.isArray(j)) return [];
    const seen = new Set(), out = [];
    for (const x of j) {
      if (!x || typeof x !== "object") continue;
      const id = typeof x.id === "string" && /^[a-z0-9-]{1,40}$/.test(x.id) ? x.id : ""; if (!id || seen.has(id) || !imgOk(x.img)) continue; seen.add(id);
      out.push({id, title: str(x.title, LIM.title) || "제목 없음", artist: str(x.artist, LIM.artist) || "익명", source: str(x.source, LIM.source), kind: x.kind === "ai" ? "ai" : "human",
        date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || "") ? x.date : "", img: x.img, thumb: imgOk(x.thumb) ? x.thumb : x.img, desc: str(x.desc, LIM.desc), note: str(x.note, LIM.note)});
    }
    return out.map((v, i) => [v, i]).sort((a, b) => (b[0].date > a[0].date ? 1 : b[0].date < a[0].date ? -1 : b[1] - a[1])).map(a => a[0]);   // 새 그림이 앞(같은 날은 나중에 건 것이 앞)
  }
  /* 운영자가 올린 작품(Firestore galleryItems): 문서 하나 = 메타 + 썸네일(data URL ≤ 40KB) + 큰 그림(data URL).
     목록은 select 로 큰 그림을 뺀 필드만 읽고(읽기 용량 절약), 큰 그림은 작품을 열 때 한 건만 읽어요.
     thumb 이 없는 문서 = '기본 작품 덮어쓰기'(숨김·순서·글 고치기). 규칙: docs/gallery-firestore-rules.md */
  const FS_FIELDS = ["title", "artist", "source", "kind", "date", "desc", "note", "order", "hidden", "thumb"];
  const fieldOut = v => v && ("stringValue" in v ? v.stringValue : "integerValue" in v ? Number(v.integerValue) : "booleanValue" in v ? v.booleanValue : null);
  function fsDoc(d) {
    const id = String(d && d.name || "").split("/").pop(); if (!/^[a-z0-9-]{1,40}$/.test(id)) return null;
    const src = d.fields || {}, f = {}; for (const k of FS_FIELDS) if (src[k]) f[k] = fieldOut(src[k]);
    const o = {id, full: typeof f.thumb === "string" && f.thumb.length <= 40000 && DATA_OK.test(f.thumb)};
    for (const [k, n] of [["title", LIM.title], ["source", LIM.source], ["desc", LIM.desc], ["note", LIM.note]]) if (typeof f[k] === "string") o[k] = str(f[k], n);
    if (typeof f.artist === "string") o.artist = str(f.artist, LIM.artist) || "익명";
    if (f.kind === "human" || f.kind === "ai") o.kind = f.kind;
    if (typeof f.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.date)) o.date = f.date;
    if (Number.isFinite(f.order)) o.order = f.order; if (typeof f.hidden === "boolean") o.hidden = f.hidden;
    if (o.full) o.thumb = f.thumb;
    return o;
  }
  function mergeAll() {   // 정적 작품 + Firestore 작품 → 표시 순서(order 작은 것이 앞, 같으면 날짜 새것이 앞)
    if (!S.stat) { S.all = null; return; }
    const m = new Map();
    S.stat.forEach((x, i) => m.set(x.id, Object.assign({}, x, {src: "static", order: null, hidden: false, ov: false, eff: i * 10})));   // 기본 순서 = items.json 의 날짜순
    for (const d of S.fs) {
      if (d.full) { const o = d.order == null ? 0 : d.order; m.set(d.id, {id: d.id, title: d.title || "제목 없음", artist: d.artist || "익명", source: d.source || "", kind: d.kind || "human", date: d.date || "", desc: d.desc || "", note: d.note || "", thumb: d.thumb, img: S.big[d.id] || null, src: "fs", ov: false, order: o, hidden: !!d.hidden, eff: o}); continue; }
      const t = m.get(d.id); if (!t) continue;
      for (const k of ["title", "artist", "source", "kind", "date", "desc", "note"]) if (d[k] !== undefined && (k !== "title" || d[k])) t[k] = d[k];
      if (d.order != null) { t.order = d.order; t.eff = d.order; } if (d.hidden != null) t.hidden = d.hidden; t.ov = true;
    }
    S.all = [...m.values()].sort((a, b) => a.eff - b.eff || (b.date > a.date ? 1 : b.date < a.date ? -1 : 0) || (a.id < b.id ? -1 : 1));
  }
  const items = () => S.all ? (masterTok() ? S.all : S.all.filter(x => !x.hidden)) : null;   // 숨긴 작품은 운영자에게만 보여요
  const byId = id => (items() || []).find(x => x.id === id) || null;
  const gridReady = () => !!S.stat && (S.fsState !== "busy" && S.fsState !== "idle" || Date.now() - S.t0 > 2500);   // 운영자 작품이 늦게 와서 격자가 뒤늦게 바뀌지 않게 잠깐 기다려요
  function refreshView() {
    if (!S.open) return;
    if (S.view === "list") fillGrid(); else if (S.view === "detail" && (!S.detOk || !byId(S.id))) render(true);
  }
  async function loadStatic() {
    if (S.itemsBusy || S.stat) return; S.itemsBusy = true; S.itemsErr = false;
    try { const r = await fetch("gallery/items.json", {cache: "no-cache"}); if (!r.ok) throw new Error("http " + r.status); S.stat = cleanItems(await r.json()); mergeAll(); }
    catch (e) { S.itemsErr = true; }
    finally { S.itemsBusy = false; }
    refreshView();
  }
  async function loadFs(force) {
    if (S.fsState === "busy" || (!force && S.fsState !== "idle" && Date.now() - S.fsAt < 180000)) return; S.fsState = "busy";
    const r = await net("POST", ":runQuery", {structuredQuery: {from: [{collectionId: FS_COL}], select: {fields: FS_FIELDS.map(fieldPath => ({fieldPath}))}, limit: 100}});
    S.fsAt = Date.now();
    if (r.s === 200 && Array.isArray(r.j)) { S.fs = r.j.filter(x => x && x.document).map(x => fsDoc(x.document)).filter(Boolean); S.fsState = "ok"; }
    else S.fsState = r.s === 403 || r.s === 401 ? "closed" : "err";   // closed = 규칙이 아직 안 열렸어요 → 정적 작품만 보여요
    mergeAll(); refreshView();
  }
  function loadItems(force) {
    if (force) { S.stat = null; S.fsState = "idle"; S.itemsErr = false; }
    S.t0 = Date.now(); setTimeout(refreshView, 2600); loadStatic(); loadFs(!!force);
  }
  async function loadBig(it) {   // 큰 그림은 작품을 열 때 한 건만 읽어요
    if (!it || it.src !== "fs" || it.img || S.big[it.id] || S.bigErr[it.id]) return;
    const r = await net("GET", "/" + FS_COL + "/" + encodeURIComponent(it.id) + "?mask.fieldPaths=img"), v = r.s === 200 && r.j && r.j.fields && r.j.fields.img && r.j.fields.img.stringValue;
    if (typeof v === "string" && v.length <= 800000 && DATA_OK.test(v)) { S.big[it.id] = v; mergeAll(); } else S.bigErr[it.id] = true;
    if (S.open && S.view === "detail" && S.id === it.id) paintFig();
  }
  function paintFig() {
    const it = byId(S.id), im = S.body && S.body.querySelector(".gl-figbtn img"), cap = S.body && S.body.querySelector(".gl-fighint"); if (!it) return;
    if (im && it.img && im.getAttribute("src") !== it.img) im.src = it.img;
    if (cap) cap.textContent = S.bigErr[it.id] ? "큰 그림을 불러오지 못해 작은 그림만 보여요" : it.src === "fs" && !it.img ? "큰 그림을 불러오는 중…" : "그림을 누르면 크게 볼 수 있어요";
  }

  /* ---------- 서버(Firestore REST) ---------- */
  async function net(method, path, body, tok) {
    const url = API + path + (tok ? "" : (path.indexOf("?") < 0 ? "?" : "&") + "key=" + encodeURIComponent(FB.key));   // 읽기는 공개(키만), 쓰기·삭제는 토큰
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 15000);
    try {
      const hd = {}; if (tok) hd.Authorization = "Bearer " + tok; if (body) hd["Content-Type"] = "application/json";
      const r = await fetch(url, {method, headers: hd, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal}); let j = null; try { j = await r.json(); } catch (e) {}
      return {s: r.status, j};
    } catch (e) { return {s: 0, j: null}; } finally { clearTimeout(tm); }
  }
  const docOut = d => { const f = d.fields || {}, o = {name: d.name || "", id: String(d.name || "").split("/").pop()}; for (const k of ["itemId", "nick", "text"]) o[k] = f[k] && typeof f[k].stringValue === "string" ? f[k].stringValue : ""; o.ts = f.ts && f.ts.timestampValue || ""; return o; };
  /* 번호 = 뒤집은 시각 13자리 + 무작위 7자 → 이름순으로 읽으면 새 댓글이 먼저 나와서, 복합 색인 없이 '최신순'을 만들어요 */
  function genId() {
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", b = new Uint8Array(7);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b); else for (let i = 0; i < 7; i++) b[i] = Math.floor(Math.random() * 256);
    return String(Math.max(0, 9999999999999 - Date.now())).padStart(13, "0") + Array.from(b, v => A[v % 62]).join("");
  }
  const th = key => S.T[key] || (S.T[key] = {rows: [], last: "", end: false, busy: false, err: "", closed: false, loaded: false});
  async function loadThread(key, more) {
    const t = th(key); if (t.busy) return; t.busy = true; t.err = ""; t.at = Date.now(); paint(key);
    const n = PAGE;
    const q = {from: [{collectionId: COL}], where: {fieldFilter: {field: {fieldPath: "itemId"}, op: "EQUAL", value: {stringValue: key}}}, orderBy: [{field: {fieldPath: "__name__"}, direction: "ASCENDING"}], limit: n};
    if (more && t.last) q.startAt = {values: [{referenceValue: t.last}], before: false};
    const r = await net("POST", ":runQuery", {structuredQuery: q});
    t.busy = false;
    if (r.s === 200 && Array.isArray(r.j)) {
      const got = r.j.filter(x => x && x.document).map(x => docOut(x.document)).filter(x => x.itemId === key);
      t.rows = more ? t.rows.concat(got.filter(x => !t.rows.some(y => y.id === x.id))) : got;
      t.end = got.length < n; if (got.length) t.last = got[got.length - 1].name; t.loaded = true; t.closed = false;
    } else if (r.s === 403 || r.s === 401) { t.closed = true; t.loaded = true; }   // 규칙이 아직 안 열렸어요 → '곧 열려요'
    else t.err = r.s === 0 ? "인터넷 연결을 확인해 주세요" : "불러오지 못했어요. 잠시 뒤 다시 눌러 주세요";
    paint(key);
  }

  /* 글 검사 — 게시판(문의·게임평)과 같은 기준의 1차 검사예요. 링크·길이는 서버 규칙도 막아요 */
  const BAD = ["시발", "씨발", "ㅅㅂ", "ㅆㅂ", "병신", "ㅂㅅ", "개새끼", "좆", "지랄", "ㅈㄹ", "염병", "미친놈", "미친년", "썅", "fuck", "shit"];
  /* 링크 막기(공개 입력 전부: 닉네임·댓글): http(s)://, www., 흔한 도메인 꼴(abc.com · bit.ly …)과 단축 주소를 찾아요. @계정이름 처럼 글자로 적는 건 괜찮아요.
     서버 규칙(docs/gallery-firestore-rules.md 의 noUrl)도 같은 목록으로 막아요 — 목록을 고치면 두 군데를 함께 고쳐 주세요. */
  const TLD = "com|net|org|kr|co|me|io|ly|gl|to|cc|tv|xyz|app|dev|info|biz|link|site|shop|store|online|ai|gg|jp|cn|us|uk|de|fr|do|vc|im|so|sh|fm|page|top|club|live|blog|be|la|gd|gy|ws|ms";
  const RE_URL = new RegExp("https?:|www[.]|:[/][/]|[a-z0-9][.](?:" + TLD + ")(?![a-z0-9])", "i");
  const hasLink = s => RE_URL.test(s) || RE_URL.test(s.replace(/[\s\u200b-\u200d\ufeff]+/g, ""));   // 띄어 써서 피하는 경우(abc . com)도 거절
  const RE_MAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/, RE_RRN = /\d{6}\s?-\s?[1-4]\d{6}/;
  const RE_PHONE = /(?:^|\D)(?:\+?82[-.\s]?)?(?:0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}|0[2-6]\d?[-.\s]?\d{3,4}[-.\s]?\d{4})(?!\d)/;
  function checkComment(nick, text) {
    const max = LIM.text, all = nick + "\n" + text, flat = all.toLowerCase().replace(/[\s._\-~*!?,]+/g, "");
    if (!text) return "댓글을 적어 주세요.";
    if (text.length > max) return max + "자까지 쓸 수 있어요.";
    if (nick === "운영자") return "'운영자' 이름은 쓸 수 없어요.";
    if (hasLink(all)) return "링크는 올릴 수 없어요. 계정 이름만 적어 주세요 (예: @이름).";
    if (RE_MAIL.test(all) || RE_PHONE.test(all) || RE_RRN.test(all)) return "전화번호·이메일 같은 개인정보처럼 보이는 글이 있어요. 개인정보는 적지 말아 주세요.";
    if (BAD.some(w => flat.includes(w))) return "욕설이 들어 있어요. 고운 말로 고쳐서 남겨 주세요.";
    return "";
  }
  const cooldownLeft = () => Math.max(0, COOL - (Date.now() - (Number(lsGet().last) || 0)));
  async function sendComment(key, nick, text) {   // 성공하면 {row}, 실패하면 {err:"closed|busy|net|auth|fail"}
    let tok; try { tok = await ccToken(); } catch (e) { return {err: "auth"}; }
    if (!tok) return {err: "auth"};
    for (let i = 0, r, again = false; i < 4; i++) {
      const id = genId();
      const w = {update: {name: DOCS + "/" + COL + "/" + id, fields: {itemId: {stringValue: key}, nick: {stringValue: nick}, text: {stringValue: text}}}, updateTransforms: [{fieldPath: "ts", setToServerValue: "REQUEST_TIME"}], currentDocument: {exists: false}};
      r = await net("POST", ":commit", {writes: [w]}, tok);
      if (r.s === 401 && !again) { again = true; try { tok = await ccToken(true); } catch (e) { return {err: "auth"}; } i--; continue; }
      if (r.s === 409) continue;   // 번호가 겹쳤으면 새 번호로
      if (r.s === 200) return {row: {id, name: DOCS + "/" + COL + "/" + id, itemId: key, nick, text, ts: new Date().toISOString(), fresh: true}};
      return {err: r.s === 403 ? "closed" : r.s === 429 ? "busy" : r.s === 0 ? "net" : "fail"};
    }
    return {err: "fail"};
  }
  const masterTok = () => { try { if (typeof brdMasterOn === "function" && brdMasterOn() && BRD.master && BRD.master.tok) return BRD.master.tok; } catch (e) {} return ""; };   // 게시판 '운영자 모드'가 켜져 있으면 삭제 버튼이 보여요

  /* ---------- 댓글 묶음(입력 + 목록) ---------- */
  function threadUI(key, o) {
    const max = LIM.text, t = th(key), st = lsGet();
    let nickDefault = st.nick; if (typeof nickDefault !== "string") { try { nickDefault = typeof SAVE !== "undefined" && SAVE && typeof SAVE.nick === "string" ? SAVE.nick : ""; } catch (e) { nickDefault = ""; } }
    const nick = h("input", {class: "gl-in", type: "text", maxlength: LIM.nick, autocomplete: "off", placeholder: "비우면 '익명'", id: "gl-n-" + key}); nick.value = String(nickDefault || "").slice(0, LIM.nick);
    const cnt = h("em", {text: "0/" + max, style: "font-style:normal"});
    const text = h("textarea", {class: "gl-in", maxlength: max, rows: 3, placeholder: o.ph, id: "gl-t-" + key});
    const msg = h("p", {class: "gl-msg", role: "status", "aria-live": "polite"});
    const send = h("button", {type: "submit", class: "gl-btn gl-primary", text: "댓글 남기기"});
    const closed = h("p", {class: "gl-closed", hidden: true, text: "댓글은 곧 열려요. 지금은 그림만 둘러볼 수 있어요."}), list = h("div"), more = h("div", {class: "gl-more"});
    let busy = false, arm = "";
    const say = (m, warn) => { msg.textContent = m || ""; msg.className = "gl-msg" + (warn ? " gl-warn" : ""); };
    text.addEventListener("input", () => { cnt.textContent = text.value.length + "/" + max; });
    const form = h("form", {class: "gl-form", novalidate: true, onsubmit: async ev => {
      ev.preventDefault(); if (busy) return;
      const n = str(nick.value, LIM.nick) || "익명", tx = text.value.replace(/\r/g, "").replace(/[ \t]*\n[ \t]*/g, " ").trim();
      const bad = checkComment(n, tx); if (bad) { say(bad, true); return; }
      const left = cooldownLeft(); if (left > 0) { say("잠깐만요! " + Math.ceil(left / 1000) + "초 뒤에 다시 남길 수 있어요.", true); return; }
      busy = true; send.setAttribute("aria-disabled", "true"); say("남기는 중…");
      const r = await sendComment(key, n, tx); busy = false; send.removeAttribute("aria-disabled");
      if (r.row) {
        lsSet({nick: n === "익명" && !nick.value.trim() ? "" : n, last: Date.now()}); t.rows.unshift(r.row); t.closed = false; text.value = ""; cnt.textContent = "0/" + max;
        say("댓글을 남겼어요. 고마워요!"); sfx("up"); paint(key);
      } else say(r.err === "closed" || r.err === "auth" ? "댓글은 곧 열려요. 조금만 기다려 주세요!" : r.err === "net" ? "인터넷 연결을 확인해 주세요." : r.err === "busy" ? "요청이 몰렸어요. 잠시 뒤 다시 눌러 주세요." : "지금은 남기지 못했어요. 잠시 뒤 다시 눌러 주세요.", true);
    }},
      h("div", {class: "gl-form-row"},
        h("label", {class: "gl-fld", for: "gl-n-" + key}, h("span", {}, "닉네임 (" + LIM.nick + "자까지)"), nick),
        h("label", {class: "gl-fld", for: "gl-t-" + key}, h("span", {}, "댓글", cnt), text),
        send),
      msg);
    const el = h("div", {"data-thread": key}, closed, form, list, more);
    function paint() {
      const dis = t.closed; nick.disabled = dis; text.disabled = dis; if (dis) send.setAttribute("aria-disabled", "true"); else if (!busy) send.removeAttribute("aria-disabled");
      closed.hidden = !t.closed;
      const M = !!masterTok(), rows = t.rows;
      list.replaceChildren();
      if (t.closed) { more.replaceChildren(); return; }
      if (!rows.length) list.append(h("p", {class: "gl-state", role: t.err ? "alert" : "status", text: t.err || (t.busy || !t.loaded ? "불러오는 중…" : o.empty)}));
      else list.append(h("ul", {class: "gl-cms"}, rows.map(c => h("li", {class: "gl-cm"},
        h("div", {class: "gl-cm-h"}, h("b", {class: "gl-cm-n", text: c.nick}), h("time", {datetime: c.ts, title: c.ts ? new Date(tsMs(c.ts)).toLocaleString("ko-KR") : "", text: when(c.ts)}),
          M ? h("button", {type: "button", class: "gl-btn gl-small", "data-del": c.id, text: arm === c.id ? "정말 삭제" : "삭제", "aria-label": c.nick + "님의 글 삭제", onclick: () => del(c)}) : null),
        h("p", {class: "gl-cm-t", text: c.text})))));
      if (t.err && rows.length) list.append(h("p", {class: "gl-msg gl-warn", role: "alert", text: t.err}));
      const btns = [];
      if (rows.length && !t.end) btns.push(h("button", {type: "button", class: "gl-btn", "aria-disabled": t.busy ? "true" : null, text: t.busy ? "불러오는 중…" : "더 보기", onclick: () => { if (!t.busy) loadThread(key, true); }}));
      if (t.err && !rows.length) btns.push(h("button", {type: "button", class: "gl-btn", text: "다시 불러오기", onclick: () => loadThread(key, false)}));
      more.replaceChildren(...btns);
    }
    async function del(c) {
      if (arm !== c.id) { arm = c.id; paint(); setTimeout(() => { if (arm === c.id) { arm = ""; paint(); } }, 3500); return; }
      arm = ""; const tok = masterTok(); if (!tok) { notify("운영자 로그인이 끝났어요. 게시판에서 다시 로그인해 주세요"); paint(); return; }
      const r = await net("DELETE", "/" + COL + "/" + encodeURIComponent(c.id), null, tok);
      if (r.s === 200) { t.rows = t.rows.filter(x => x.id !== c.id); notify("지웠어요"); } else notify(r.s === 403 || r.s === 401 ? "삭제할 권한이 없어요. 운영자 로그인을 확인해 주세요" : "지우지 못했어요. 잠시 뒤 다시 눌러 주세요");
      paint();
    }
    S.ui[key] = paint; paint();
    if (!t.busy && (!t.loaded || Date.now() - (t.at || 0) > 60000)) loadThread(key, false);   // 다시 열면 최신 댓글을 새로 받아요
    return el;
  }
  function paint(key) { const f = S.ui[key]; if (f) { try { f(); } catch (e) {} } }

  /* ---------- 화면 ---------- */
  function ensureRoot() {
    if (S.root) return S.root;
    const back = h("button", {type: "button", class: "gl-btn", "data-back": "1", hidden: true, text: "← 갤러리", onclick: goBack});
    const close = h("button", {type: "button", class: "gl-btn", "data-close": "1", "aria-label": "갤러리 닫기", text: "✕ 닫기", onclick: closeAll});
    const op = h("button", {type: "button", class: "gl-btn gl-opbtn", "data-op": "1", onclick: opClick});
    const body = h("main", {class: "gl-body", tabindex: "-1"});
    const lbImg = h("img", {alt: "", onclick: () => lbToggle()}), lbBox = h("div", {class: "gl-lb-box", onclick: ev => { if (ev.target === lbBox) closeLb(); }}, lbImg);
    const lb = h("div", {class: "gl-lb", role: "dialog", "aria-modal": "true", "aria-label": "그림 크게 보기", hidden: true},
      h("div", {class: "gl-lb-top"}, h("span", {text: "그림을 누르면 원래 크기로 커져요 · Esc 로 닫기"}), h("button", {type: "button", class: "gl-btn", "data-lbx": "1", text: "✕ 닫기", onclick: closeLb})), lbBox);
    const root = h("section", {class: "gl", id: "gl-root", role: "dialog", "aria-modal": "true", "aria-label": "팬아트 갤러리", tabindex: "-1", hidden: true},
      h("header", {class: "gl-head"}, back, h("h2", {text: "🖼 팬아트 갤러리"}), op, close), body, lb);
    for (const ev of ["keydown", "keyup", "keypress"]) root.addEventListener(ev, e => e.stopPropagation());   // 입력 중 키가 로비(WASD)나 게임 단축키로 새지 않게
    D.body.append(root); Object.assign(S, {root, body, back, lb, lbImg, op}); paintHead();
    return root;
  }
  function paintHead() {   // 운영자 버튼: 로그인 전 '🔧 운영자' / 로그인 중 '🔧 로그아웃'
    if (!S.op) return; const on = !!masterTok();
    S.op.replaceChildren(h("span", {"aria-hidden": "true", text: "🔧"}), h("span", {class: "gl-op-t", text: on ? " 로그아웃" : " 운영자"}));
    S.op.setAttribute("aria-label", on ? "운영자 모드 끄기(로그아웃)" : "운영자 모드(로그인)"); S.op.classList.toggle("on", on);
  }
  function loadAdmin() {   // 운영자 도구는 운영자 버튼을 눌렀을 때(또는 이미 운영자 모드일 때)만 내려받아요
    if (S.ad) return Promise.resolve(S.ad);
    if (!S.adP) {
      S.adP = new Promise((res, rej) => { const sc = D.createElement("script"); sc.src = "gallery-admin.js?v=ga1"; sc.onload = () => S.ad ? res(S.ad) : rej(new Error("admin")); sc.onerror = () => rej(new Error("load")); D.head.append(sc); });
      S.adP.catch(() => { S.adP = null; });
    }
    return S.adP;
  }
  function opClick() {
    try { if (typeof ccSdk === "function" && !masterTok()) ccSdk().catch(() => {}); } catch (e) {}   // 구글 로그인 도구를 미리 받아 둬요(로그인 버튼을 누르는 순간 바로 창이 열려야 팝업이 안 막혀요)
    loadAdmin().then(a => a.headClick(), () => notify("운영자 도구를 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요"));
  }
  function opbar() {
    if (masterTok()) { if (S.ad) return S.ad.bar(); loadAdmin().then(() => render(true), () => {}); return null; }
    return S.ad && S.opAsk ? S.ad.loginPanel() : null;
  }
  function openLb(it) {
    S.lbImg.src = it.img || it.thumb; S.lbImg.alt = it.title + " — " + it.artist; S.lb.classList.remove("zoom"); S.lb.hidden = false; S.lbOpen = true; S.layer = {el: S.lb, close: closeLb, force: closeLbNow};
    S.lb.querySelector("[data-lbx]").focus(); if (it.src === "fs" && !it.img) loadBig(it).then(() => { const x = byId(it.id); if (S.lbOpen && x && x.img) S.lbImg.src = x.img; });
  }
  function closeLbNow() { if (S.lbOpen) { S.lb.hidden = true; S.lbOpen = false; S.lbImg.removeAttribute("src"); } }
  function closeLb() { if (!S.lbOpen) return; if (S.layer && S.layer.el === S.lb) S.layer = null; closeLbNow(); const b = S.body.querySelector(".gl-figbtn"); if (b) b.focus(); }
  function lbToggle() { S.lb.classList.toggle("zoom"); }
  function closeLayerNow() { const l = S.layer; S.layer = null; if (l) { try { l.force(); } catch (e) {} } else closeLbNow(); }

  const badge = k => h("span", {class: "gl-badge " + k}, k === "ai" ? "🤖 AI" : "✋ 사람");
  function imgEl(src, alt, eager) {
    const i = h("img", {src, alt, decoding: "async", loading: eager ? "eager" : "lazy"});
    i.addEventListener("error", () => { const p = i.parentNode; if (p) p.replaceChild(h("span", {class: "gl-broken", text: "그림을 불러오지 못했어요"}), i); });
    return i;
  }
  function card(it) {
    const line = h("span", {class: "gl-line1"}, h("b", {text: it.artist}), it.note ? " · " : "", it.note ? h("span", {text: it.note}) : null);   // 필명 · 한 줄(말줄임)
    return h("a", {class: "gl-card", href: "#gallery/" + it.id, "data-id": it.id, onclick: ev => { if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button) return; ev.preventDefault(); go("#gallery/" + it.id); }},
      h("span", {class: "gl-thumb"}, imgEl(it.thumb, it.title + " — " + it.artist + "의 그림"), badge(it.kind), it.hidden ? h("span", {class: "gl-hidtag", text: "🚫 숨김"}) : null),
      h("span", {class: "gl-cap"}, h("b", {class: "gl-ti", text: it.title}), line, it.date ? h("span", {class: "gl-date", text: dateTxt(it.date)}) : null));
  }
  function cardWrap(it) {   // 운영자 모드에서는 카드 아래에 수정·숨김·순서 버튼이 붙어요
    const tools = S.ad && masterTok() && S.ad.cardTools ? S.ad.cardTools(it) : null;
    return h("div", {class: "gl-cw" + (it.hidden ? " gl-hid" : "")}, card(it), tools);
  }
  function viewList() {
    const b = S.body; b.replaceChildren(); S.ui = {};
    const wrap = h("div", {class: "gl-wrap"});
    wrap.append(...[opbar(), h("div", {class: "gl-sec-h"}, h("h3", {text: "🖼 작품"}), h("span", {text: gridReady() && items() ? "총 " + items().length + "점" : ""}))].filter(Boolean));
    S.gridHost = h("div"); S.countEl = wrap.querySelector(".gl-sec-h span"); wrap.append(S.gridHost); fillGrid();
    wrap.append(h("div", {class: "gl-foot"}, h("p", {text: "기사단 원작 그림은 AI로 만든 캐릭터입니다. 팬아트는 '✋ 사람'(손으로 그린 그림)과 '🤖 AI'(AI가 만든 그림)로 구분해 걸어요."}), h("p", {text: "댓글에는 링크와 개인정보(전화번호·이메일 등)를 적을 수 없어요. 계정은 @이름처럼 글자로만 적어 주세요. 운영자가 지울 수 있어요."})));
    b.append(wrap); S.back.hidden = true; S.view = "list";
  }
  function fillGrid() {   // 작품 목록이 늦게 도착하면 격자만 채워요
    const g = S.gridHost; if (!g) return; g.replaceChildren(); const list = gridReady() ? items() : null; if (S.countEl) S.countEl.textContent = list ? "총 " + list.length + "점" : "";
    if (!list) g.append(S.itemsErr ? h("div", {class: "gl-state", role: "alert"}, h("p", {text: "작품 목록을 불러오지 못했어요."}), h("p", {}, h("button", {type: "button", class: "gl-btn", text: "다시 불러오기", onclick: () => loadItems(true)}))) : h("p", {class: "gl-state", role: "status", text: "불러오는 중…"}));
    else g.append(h("div", {class: "gl-grid"}, list.map(cardWrap), h("div", {class: "gl-empty"}, h("p", {}, h("b", {"aria-hidden": "true", text: "+"}), "여기에 네 그림이 걸려", h("br"), "— 저퀄 환영,", h("br"), "쓰레드로 보내줘"))));
  }
  function viewDetail(id) {
    const b = S.body; b.replaceChildren(); S.ui = {};
    const it = byId(id), wrap = h("div", {class: "gl-wrap"}); S.back.hidden = false; S.view = "detail"; S.id = id; S.detOk = !!it;
    if (!it) {
      const wait = !S.itemsErr && (!S.stat || S.fsState === "busy" || S.fsState === "idle"), ready = !!S.all && !wait;   // 운영자 작품이 아직 오는 중이면 '없음'이라고 하지 않고 기다려요
      wrap.append(...[opbar(), h("div", {class: "gl-state", role: ready ? "alert" : "status"}, h("p", {text: ready ? "찾을 수 없는 작품이에요. 내려갔거나 주소가 틀렸을 수 있어요." : S.itemsErr ? "작품 목록을 불러오지 못했어요." : "불러오는 중…"}),
        ready || S.itemsErr ? h("p", {}, h("button", {type: "button", class: "gl-btn", text: ready ? "갤러리 보기" : "다시 불러오기", onclick: () => ready ? goBack() : loadItems(true)})) : null)].filter(Boolean));
      b.append(wrap); return;
    }
    const list = items(), i = list.indexOf(it), prev = list[i - 1], next = list[i + 1];
    const fig = h("figure", {class: "gl-fig"}, h("button", {type: "button", class: "gl-figbtn", "aria-label": "그림 크게 보기: " + it.title, onclick: () => openLb(it)}, imgEl(it.img, it.title + " — " + it.artist + "의 그림", true)),
      h("figcaption", {class: "gl-fighint", text: it.src === "fs" && !it.img ? "큰 그림을 불러오는 중…" : "그림을 누르면 크게 볼 수 있어요"}));
    const meta = h("dl", {class: "gl-meta"}, h("dt", {text: "필명"}), h("dd", {text: it.artist}), it.source ? [h("dt", {text: "출처"}), h("dd", {text: it.source})] : null,
      it.date ? [h("dt", {text: "날짜"}), h("dd", {text: dateTxt(it.date)})] : null);
    const tools = S.ad && masterTok() && S.ad.detailTools ? S.ad.detailTools(it) : null;
    const info = h("div", {class: "gl-info"}, h("div", {class: "gl-badges"}, badge(it.kind), it.hidden ? h("span", {class: "gl-hidtag gl-hidtag-in", text: "🚫 숨김 — 운영자에게만 보여요"}) : null), h("h2", {text: it.title}), tools, meta,
      it.desc ? h("p", {class: "gl-desc", text: it.desc}) : null,
      it.note ? h("blockquote", {class: "gl-note"}, h("h3", {text: "작가의 한마디"}), h("p", {text: it.note})) : null,
      h("p", {class: "gl-ainote", text: "기사단 원작 그림은 AI로 만든 캐릭터입니다."}),
      h("div", {class: "gl-nav"}, prev ? h("button", {type: "button", class: "gl-btn", text: "← 이전 작품", onclick: () => go("#gallery/" + prev.id, true)}) : null, next ? h("button", {type: "button", class: "gl-btn", text: "다음 작품 →", onclick: () => go("#gallery/" + next.id, true)}) : null));
    const thread = h("section", {class: "gl-thread", "aria-labelledby": "gl-cm-h"}, h("h3", {id: "gl-cm-h", text: "💬 댓글"}), threadUI(it.id, {ph: "이 그림에 대한 한마디를 남겨 주세요", empty: "아직 댓글이 없어요. 첫 댓글을 남겨 보세요!"}));
    wrap.append(...[opbar(), h("div", {class: "gl-detail"}, fig, info, thread)].filter(Boolean)); b.append(wrap);
    if (it.src === "fs" && !it.img) loadBig(it);
  }
  function render(keep) {
    if (!S.open) return;
    const prevScroll = S.body ? S.body.scrollTop : 0;
    if (S.view === "list") viewList(); else if (S.view === "detail") viewDetail(S.id);
    if (keep && S.body) S.body.scrollTop = prevScroll;
  }

  /* ---------- 주소(#gallery) · 뒤로가기 · 열고 닫기 ---------- */
  const parseHash = () => { const m = /^#gallery(?:\/([a-z0-9-]{1,40}))?\/?$/.exec(location.hash || ""); return m ? {id: m[1] || ""} : null; };
  const depth = () => (history.state && typeof history.state === "object" && history.state.gl) | 0;
  const isDeep = () => !!(history.state && typeof history.state === "object" && history.state.deep);   // 맨 처음 칸이 갤러리 주소(쓰레드 링크로 바로 들어옴)인지 — 새로고침해도 history.state 에 남아요
  const strip = () => { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} };
  function go(hash, replace) {   // 갤러리 안에서 화면 옮기기(작품 보기·이전/다음)
    try { if (replace) history.replaceState({gl: Math.max(1, depth()), deep: isDeep()}, "", hash); else history.pushState({gl: depth() + 1, deep: isDeep()}, "", hash); } catch (e) { location.hash = hash; }
    route();
  }
  function goBack() {   // '← 갤러리': 작품에서 목록으로
    if (S.view !== "detail") return;
    if (depth() >= 2) { history.back(); return; }
    try { history.replaceState({gl: Math.max(1, depth()), deep: isDeep()}, "", "#gallery"); } catch (e) { location.hash = "#gallery"; } route();
  }
  function closeAll() {
    if (S.layer) { S.layer.close(); return; }
    const steps = depth() - (isDeep() ? 1 : 0);
    if (steps > 0) { S.wantClose = true; history.go(-steps); } else { strip(); route(); }
  }
  function route() {
    let m = parseHash();
    if (S.wantClose) { S.wantClose = false; if (m && isDeep()) { strip(); m = null; } }
    if (!m) { hide(); return; }
    if (!depth()) { try { history.replaceState({gl: 1, deep: true}, "", location.hash); } catch (e) {} }   // 딥링크(쓰레드 링크)로 바로 들어온 첫 화면
    show(m.id);
  }
  function show(id) {
    ensureRoot();
    if (!S.open) { S.open = true; S.ret = D.activeElement; S.root.hidden = false; D.body.classList.add("gl-open"); S.view = ""; S.opWas = !!masterTok(); paintHead(); S.tick = setInterval(tick, 15000); }
    const want = id ? "detail" : "list";
    if (S.view === "list" && want === "detail") S.scroll = S.body.scrollTop;
    if (S.view !== want || (want === "detail" && S.id !== id)) {
      closeLayerNow(); S.id = id; S.view = want; render();
      S.body.scrollTop = want === "list" ? S.scroll : 0; S.root.focus({preventScroll: true});
    }
    if (!S.stat && !S.itemsBusy && !S.itemsErr) loadItems(); else if (S.stat) loadFs(false);   // 다시 열 때 3분이 지났으면 운영자 작품 목록을 새로 읽어요
  }
  function tick() {   // 운영자 로그인이 끝나면(약 50분) 편집 버튼을 거둬요
    const on = !!masterTok(); if (on !== S.opWas) { S.opWas = on; paintHead(); render(true); }
  }
  function hide() {
    if (!S.open) return; closeLayerNow(); clearInterval(S.tick); S.open = false; S.view = ""; S.root.hidden = true; D.body.classList.remove("gl-open"); S.ui = {};
    const r = S.ret; S.ret = null; try { if (r && r.focus && D.contains(r)) r.focus({preventScroll: true}); } catch (e) {}
  }
  function open(id) { if (S.open) { if (id) go("#gallery/" + id); return; } if (!parseHash()) go(id ? "#gallery/" + id : "#gallery"); else route(); }

  D.addEventListener("keydown", e => {
    if (!S.open) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (S.layer) S.layer.close(); else if (S.view === "detail") goBack(); else closeAll(); return; }
    if (e.key === "Tab") {   // 화면 밖으로 포커스가 나가지 않게 가둬요
      const scope = S.layer ? S.layer.el : S.root, f = [...scope.querySelectorAll("a[href],button:not([disabled]):not([hidden]),input:not([disabled]),textarea:not([disabled]),select:not([disabled])")].filter(x => x.offsetParent !== null || x === D.activeElement);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1], a = D.activeElement;
      if (!scope.contains(a)) { e.preventDefault(); first.focus(); } else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    }
  }, true);
  D.addEventListener("click", e => {
    const b = e.target && e.target.closest && e.target.closest("[data-open-gallery]"); if (!b) return;
    e.preventDefault(); sfx("click"); open(b.getAttribute("data-open-gallery") || "");
  });
  window.addEventListener("popstate", route);
  window.addEventListener("hashchange", route);

  /* ---------- 로비·게임 목록에 붙이기 ---------- */
  try {
    const k = window.knx;
    if (k && k.games && k.games.register) k.games.register({id: "fanart", name: "팬아트 갤러리", tag: "사람들이 그려 준 기사단 그림 · 댓글", kind: "life", open: () => open(),
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18v14H3z"/><path d="M12 15.5s-3-1.8-3-3.9a1.7 1.7 0 0 1 3-1 1.7 1.7 0 0 1 3 1c0 2.1-3 3.9-3 3.9z"/></svg>'});
  } catch (e) {}

  window.roundbGallery = {open, close: closeAll, openItem: id => open(String(id || "")), get state() { const l = items(); return {open: S.open, view: S.view, id: S.id, items: l && l.length, fs: S.fsState, op: !!masterTok(), threads: Object.keys(S.T)}; },
    _setAdmin: a => { S.ad = a; },   // gallery-admin.js 가 자기를 등록해요
    _core: {S, h, net, DOCS, FB, LIM, str, notify, sfx, masterTok, render, mergeAll, loadFs, loadItems, items, byId, goBack, paintHead, fsDoc, DATA_OK, FS_COL, closeLayerNow, th, loadBig},
    _t: {genId, cleanItems, hasLink, checkComment, cooldownLeft, parseHash, S, loadItems, fsDoc, mergeAll}};
  if (parseHash()) { const go0 = () => { try { route(); } catch (e) { console.error("gallery route", e); } }; if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", go0); else go0(); }   // 쓰레드 링크로 바로 열기
})();
