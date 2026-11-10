/* 기사단 소개 (2026-11-10) — 전체 화면 오버레이. 팬아트 갤러리(gallery.js)와 같은 방식이라 다른 모드 코드는 건드리지 않고, 이 파일 하나와 knights.css 로만 동작해요.
   - 내용: 정적 knights/data.json (설정·TMI·포즈 이름표) + knights/img/pose_<id>.jpg (포즈 시트 — tools/build_knight_poses.mjs 가 knightrig.js 로 만든 그림) + 기존 얼굴 아이콘 img/knights/<id>_face.webp.
     글자는 전부 textContent 로만 출력해요(XSS 방지). 서버·로그인 없음 — 최애는 이 기기(localStorage)에만 저장돼요.
   - 딥링크: #knights (목록) · #knights/<id> (기사 한 명, 예: #knights/jiyu). 뒤로가기·Esc 로 닫혀요. */
(() => {
  "use strict";
  if (window.roundbKnights) return;
  const D = document, LS_KEY = "roundb.knights.v1", ID_RE = /^[a-z0-9-]{1,40}$/;
  const S = {data: null, err: false, busy: false, open: false, view: "", id: "", lbOpen: false, wantClose: false, scroll: 0, ret: null, root: null};

  /* ---------- 작은 도우미 ---------- */
  const lsGet = () => { try { const j = JSON.parse(localStorage.getItem(LS_KEY) || "null"); return j && typeof j === "object" ? j : {}; } catch (e) { return {}; } };
  const lsSet = o => { try { localStorage.setItem(LS_KEY, JSON.stringify(Object.assign(lsGet(), o))); } catch (e) {} };
  const str = (v, n) => typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "";
  const strs = (v, n, m) => Array.isArray(v) ? v.map(x => str(x, n)).filter(Boolean).slice(0, m) : [];
  const favId = () => { const f = lsGet().fav; return typeof f === "string" && ID_RE.test(f) ? f : ""; };
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
  const faceSrc = id => "img/knights/" + id + "_face.webp";
  const poseSrc = id => "knights/img/pose_" + id + ".jpg";
  const shareUrl = id => location.origin + location.pathname + "#knights" + (id ? "/" + id : "");

  /* ---------- 데이터 ---------- */
  function cleanData(j) {
    const list = j && Array.isArray(j.knights) ? j.knights : [], seen = new Set(), out = [];
    for (const x of list) {
      if (!x || typeof x !== "object") continue;
      const id = typeof x.id === "string" && ID_RE.test(x.id) ? x.id : ""; if (!id || seen.has(id)) continue; seen.add(id);
      const c = x.chem && typeof x.chem === "object" ? x.chem : {};
      out.push({id, no: Number(x.no) || out.length + 1, name: str(x.name, 12) || id, en: str(x.en, 20), role: str(x.role, 16), age: Number(x.age) || 0, weapon: str(x.weapon, 60),
        hair: str(x.hair, 60), eye: str(x.eye, 40), keywords: strs(x.keywords, 20, 3), line: str(x.line, 80), props: strs(x.props, 50, 6), likes: str(x.likes, 100), dislikes: str(x.dislikes, 100),
        chem: {with: typeof c.with === "string" && ID_RE.test(c.with) ? c.with : "", text: str(c.text, 200)}, summary: str(x.summary, 60), tmi: strs(x.tmi, 220, 8),
        poses: Array.isArray(x.sheet) ? x.sheet.map(p => str(p && p.label, 30)).filter(Boolean) : []});
    }
    out.sort((a, b) => a.no - b.no);
    return {title: str(j && j.title, 60) || "라운드 기사단 10인", intro: str(j && j.intro, 200), list: out};
  }
  async function loadData(force) {
    if (S.busy || (S.data && !force)) return; S.busy = true; S.err = false;
    try { const r = await fetch("knights/data.json", {cache: "no-cache"}); if (!r.ok) throw new Error("http " + r.status); const d = cleanData(await r.json()); if (!d.list.length) throw new Error("empty"); S.data = d; }
    catch (e) { S.err = true; }
    finally { S.busy = false; }
    if (S.open) render(true);
  }
  const byId = id => (S.data ? S.data.list : []).find(x => x.id === id) || null;

  /* ---------- 최애 ---------- */
  function setFav(id) {
    const cur = favId(), next = cur === id ? "" : id; lsSet({fav: next});
    sfx(next ? "up" : "click"); notify(next ? (byId(id) ? byId(id).name : "") + " — 내 최애로 골랐어요!" : "최애를 풀었어요");
    render(true);
  }

  /* ---------- 화면 ---------- */
  function ensureRoot() {
    if (S.root) return S.root;
    const back = h("button", {type: "button", class: "kn-btn", "data-back": "1", hidden: true, text: "← 기사단", onclick: goBack});
    const close = h("button", {type: "button", class: "kn-btn", "data-close": "1", "aria-label": "기사단 소개 닫기", text: "✕ 닫기", onclick: closeAll});
    const body = h("main", {class: "kn-body", tabindex: "-1"});
    const lbImg = h("img", {alt: "", onclick: () => lbToggle()}), lbBox = h("div", {class: "kn-lb-box", onclick: ev => { if (ev.target === lbBox) closeLb(); }}, lbImg);
    const lb = h("div", {class: "kn-lb", role: "dialog", "aria-modal": "true", "aria-label": "포즈 시트 크게 보기", hidden: true},
      h("div", {class: "kn-lb-top"}, h("span", {text: "그림을 누르면 원래 크기로 커져요 · Esc 로 닫기"}), h("button", {type: "button", class: "kn-btn", "data-lbx": "1", text: "✕ 닫기", onclick: closeLb})), lbBox);
    const root = h("section", {class: "kn", id: "kn-root", role: "dialog", "aria-modal": "true", "aria-label": "기사단 소개", tabindex: "-1", hidden: true},
      h("header", {class: "kn-head"}, back, h("h2", {text: "🛡 기사단 소개"}), close), body, lb);
    for (const ev of ["keydown", "keyup", "keypress"]) root.addEventListener(ev, e => e.stopPropagation());   // 키가 로비(WASD)나 게임 단축키로 새지 않게
    D.body.append(root); Object.assign(S, {root, body, back, lb, lbImg});
    return root;
  }
  function openLb(src, alt) { S.lbImg.src = src; S.lbImg.alt = alt; S.lb.classList.remove("zoom"); S.lb.hidden = false; S.lbOpen = true; S.lb.querySelector("[data-lbx]").focus(); }
  function closeLb() { if (!S.lbOpen) return; S.lb.hidden = true; S.lbOpen = false; S.lbImg.removeAttribute("src"); const b = S.body.querySelector(".kn-figbtn"); if (b) b.focus(); }
  function closeLbNow() { if (S.lbOpen) { S.lb.hidden = true; S.lbOpen = false; S.lbImg.removeAttribute("src"); } }
  function lbToggle() { S.lb.classList.toggle("zoom"); }

  function img(src, alt, cls, eager) {
    const i = h("img", {src, alt, class: cls || null, decoding: "async", loading: eager ? "eager" : "lazy"});
    i.addEventListener("error", () => { const p = i.parentNode; if (p) p.replaceChild(h("span", {class: "kn-broken", text: "그림을 불러오지 못했어요"}), i); });
    return i;
  }
  const favTag = () => h("span", {class: "kn-fav"}, h("span", {"aria-hidden": "true"}, "⭐ "), "내 최애");   // 색이 아니라 글자·모양으로 표시

  function card(k) {
    const fav = favId() === k.id;
    return h("a", {class: "kn-card" + (fav ? " is-fav" : ""), href: "#knights/" + k.id, "data-id": k.id,
      onclick: ev => { if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button) return; ev.preventDefault(); go("#knights/" + k.id); }},
      h("span", {class: "kn-face"}, img(faceSrc(k.id), k.name + " 얼굴"), h("span", {class: "kn-no", "aria-hidden": "true", text: String(k.no).padStart(2, "0")}), fav ? favTag() : null),
      h("span", {class: "kn-cap"}, h("b", {class: "kn-nm", text: k.name}), h("span", {class: "kn-sub", text: k.role + (k.age ? " · " + k.age + "세" : "")}), h("span", {class: "kn-sum", text: k.summary})));
  }
  function viewList() {
    const b = S.body; b.replaceChildren();
    const wrap = h("div", {class: "kn-wrap"}), d = S.data;
    S.back.hidden = true; S.view = "list";
    if (!d) {
      wrap.append(S.err ? h("div", {class: "kn-state", role: "alert"}, h("p", {text: "기사단 정보를 불러오지 못했어요."}), h("p", {}, h("button", {type: "button", class: "kn-btn", text: "다시 불러오기", onclick: () => loadData(true)}))) : h("p", {class: "kn-state", role: "status", text: "불러오는 중…"}));
      b.append(wrap); return;
    }
    const fav = byId(favId());
    wrap.append(h("div", {class: "kn-intro"}, h("h3", {text: d.title}), h("p", {text: d.intro}), h("p", {class: "kn-hint", text: "마음에 드는 기사를 눌러 포즈 시트와 TMI 를 보고, ⭐ 내 최애로 골라 보세요."})));
    if (fav) wrap.append(h("p", {class: "kn-favbar"}, h("span", {"aria-hidden": "true"}, "⭐ "), "내 최애: ", h("a", {href: "#knights/" + fav.id, onclick: ev => { ev.preventDefault(); go("#knights/" + fav.id); }}, fav.name + " (" + fav.role + ")")));
    wrap.append(h("div", {class: "kn-grid"}, d.list.map(card)));
    wrap.append(h("div", {class: "kn-foot"}, h("p", {text: "기사단 원작 그림은 AI로 만든 캐릭터입니다."}), h("p", {text: "TMI는 가볍게 즐기는 설정놀이예요. 최애는 이 기기에만 저장돼요."})));
    b.append(wrap);
  }
  function row(dt, dd) { return dd ? [h("dt", {text: dt}), dd.nodeType ? h("dd", {}, dd) : h("dd", {text: dd})] : null; }
  function viewDetail(id) {
    const b = S.body; b.replaceChildren();
    const wrap = h("div", {class: "kn-wrap"}); S.back.hidden = false; S.view = "detail"; S.id = id;
    const k = byId(id);
    if (!k) {
      wrap.append(h("div", {class: "kn-state", role: S.data ? "alert" : "status"}, h("p", {text: S.data ? "찾을 수 없는 기사예요. 주소가 틀렸을 수 있어요." : S.err ? "기사단 정보를 불러오지 못했어요." : "불러오는 중…"}),
        S.data || S.err ? h("p", {}, h("button", {type: "button", class: "kn-btn", text: S.data ? "기사단 목록 보기" : "다시 불러오기", onclick: () => S.data ? goBack() : loadData(true)})) : null));
      b.append(wrap); return;
    }
    const L = S.data.list, i = L.indexOf(k), prev = L[(i + L.length - 1) % L.length], next = L[(i + 1) % L.length], fav = favId() === k.id;
    const alt = k.name + "의 포즈 시트 — " + k.poses.map((p, n) => (n + 1) + ". " + p).join(", ");
    const fig = h("figure", {class: "kn-fig"}, h("button", {type: "button", class: "kn-figbtn", "aria-label": "포즈 시트 크게 보기: " + k.name, onclick: () => openLb(poseSrc(k.id), alt)}, img(poseSrc(k.id), alt, null, true)),
      h("figcaption", {class: "kn-fighint", text: "한 명당 포즈 " + k.poses.length + "가지 · 그림을 누르면 크게 볼 수 있어요"}));
    const poses = k.poses.length ? h("ol", {class: "kn-poses", "aria-label": k.name + "의 포즈 이름표"}, k.poses.map((p, n) => h("li", {}, h("b", {"aria-hidden": "true", text: String(n + 1)}), p))) : null;
    const msg = h("p", {class: "kn-msg", role: "status", "aria-live": "polite"});
    const copyBtn = h("button", {type: "button", class: "kn-btn", text: "🔗 링크 복사", onclick: () => copyLink(k.id, msg)});
    const favBtn = h("button", {type: "button", class: "kn-btn" + (fav ? " kn-on" : " kn-primary"), "aria-pressed": fav ? "true" : "false", text: fav ? "★ 내 최애예요 (눌러서 풀기)" : "⭐ 내 최애로 고르기", onclick: () => setFav(k.id)});
    const partner = k.chem.with ? byId(k.chem.with) : null;
    const dl = h("dl", {class: "kn-meta"},
      row("직업", k.role), row("무기", k.weapon), row("나이", k.age ? k.age + "세" : ""), row("머리", k.hair), row("눈", k.eye),
      k.keywords.length ? row("성격", h("span", {class: "kn-chips"}, k.keywords.map(w => h("span", {class: "kn-chip"}, h("i", {"aria-hidden": "true", text: "#"}), w)))) : null,
      k.props.length ? row("시그니처 소품", k.props.join(" · ")) : null, row("좋아하는 것", k.likes), row("싫어하는 것", k.dislikes));
    const info = h("section", {class: "kn-info", "aria-label": k.name + " 설정"},
      h("div", {class: "kn-title"}, h("span", {class: "kn-face kn-face-s"}, img(faceSrc(k.id), k.name + " 얼굴", null, true)),
        h("div", {class: "kn-tt"}, h("h2", {text: k.name}), h("p", {class: "kn-en", text: String(k.no).padStart(2, "0") + " · " + k.en + " · " + k.role})), fav ? favTag() : null),
      k.line ? h("blockquote", {class: "kn-quote"}, h("h3", {text: "말버릇"}), h("p", {text: "“" + k.line + "”"})) : null,
      dl,
      k.chem.text ? h("div", {class: "kn-chem"}, h("h3", {text: "💞 케미"}), h("p", {text: k.chem.text}), partner ? h("button", {type: "button", class: "kn-btn kn-small", text: partner.name + " 보러 가기 →", onclick: () => go("#knights/" + partner.id, true)}) : null) : null);
    const tmi = k.tmi.length ? h("section", {class: "kn-tmi", "aria-labelledby": "kn-tmi-h"}, h("h3", {id: "kn-tmi-h", text: "🤫 " + k.name + " TMI"}), h("ul", {}, k.tmi.map(t => h("li", {text: t})))) : null;
    const acts = h("div", {class: "kn-acts"}, favBtn, copyBtn);
    const nav = h("div", {class: "kn-nav"}, h("button", {type: "button", class: "kn-btn", text: "← " + prev.name, "aria-label": "이전 기사: " + prev.name, onclick: () => go("#knights/" + prev.id, true)}),
      h("button", {type: "button", class: "kn-btn", text: "목록", onclick: goBack}), h("button", {type: "button", class: "kn-btn", text: next.name + " →", "aria-label": "다음 기사: " + next.name, onclick: () => go("#knights/" + next.id, true)}));
    wrap.append(h("div", {class: "kn-detail"}, fig, poses, h("div", {class: "kn-cols"}, h("div", {class: "kn-colA"}, info, acts, msg), h("div", {class: "kn-colB"}, tmi)), nav,
      h("div", {class: "kn-foot"}, h("p", {text: "기사단 원작 그림은 AI로 만든 캐릭터입니다."}), h("p", {text: "TMI는 가볍게 즐기는 설정놀이예요. 최애는 이 기기에만 저장돼요."}))));
    b.append(wrap);
  }
  async function copyLink(id, msg) {
    const url = shareUrl(id); let ok = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(url); ok = true; } } catch (e) {}
    if (!ok) { try { const t = h("textarea", {readonly: true, style: "position:fixed;left:-9999px;top:0"}); t.value = url; D.body.append(t); t.select(); ok = D.execCommand("copy"); t.remove(); } catch (e) {} }
    msg.textContent = ok ? "링크를 복사했어요: " + url : "복사하지 못했어요. 주소창의 주소를 직접 복사해 주세요: " + url; msg.className = "kn-msg" + (ok ? "" : " kn-warn");
    if (ok) notify("링크를 복사했어요");
  }
  function render(keep) {
    if (!S.open) return;
    const prevScroll = S.body ? S.body.scrollTop : 0;
    if (S.view === "list") viewList(); else if (S.view === "detail") viewDetail(S.id);
    if (keep && S.body) S.body.scrollTop = prevScroll;
  }

  /* ---------- 주소(#knights) · 뒤로가기 · 열고 닫기 (팬아트 갤러리와 같은 방식) ---------- */
  const parseHash = () => { const m = /^#knights(?:\/([a-z0-9-]{1,40}))?\/?$/.exec(location.hash || ""); return m ? {id: m[1] || ""} : null; };
  const depth = () => (history.state && typeof history.state === "object" && history.state.kn) | 0;
  const isDeep = () => !!(history.state && typeof history.state === "object" && history.state.deep);   // 맨 처음 칸이 기사단 주소(링크로 바로 들어옴)인지 — 새로고침해도 남아요
  const strip = () => { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} };
  function go(hash, replace) {   // 기사단 안에서 화면 옮기기(기사 보기·이전/다음)
    try { if (replace) history.replaceState({kn: Math.max(1, depth()), deep: isDeep()}, "", hash); else history.pushState({kn: depth() + 1, deep: isDeep()}, "", hash); } catch (e) { location.hash = hash; }
    route();
  }
  function goBack() {   // '← 기사단': 기사에서 목록으로
    if (S.view !== "detail") return;
    if (depth() >= 2) { history.back(); return; }
    try { history.replaceState({kn: Math.max(1, depth()), deep: isDeep()}, "", "#knights"); } catch (e) { location.hash = "#knights"; } route();
  }
  function closeAll() {
    if (S.lbOpen) { closeLb(); return; }
    const steps = depth() - (isDeep() ? 1 : 0);
    if (steps > 0) { S.wantClose = true; history.go(-steps); } else { strip(); route(); }
  }
  function route() {
    let m = parseHash();
    if (S.wantClose) { S.wantClose = false; if (m && isDeep()) { strip(); m = null; } }
    if (!m) { hide(); return; }
    if (!depth()) { try { history.replaceState({kn: 1, deep: true}, "", location.hash); } catch (e) {} }   // 링크로 바로 들어온 첫 화면
    show(m.id);
  }
  function show(id) {
    ensureRoot();
    if (!S.open) { S.open = true; S.ret = D.activeElement; S.root.hidden = false; D.body.classList.add("kn-open"); S.view = ""; }
    const want = id ? "detail" : "list";
    if (S.view === "list" && want === "detail") S.scroll = S.body.scrollTop;
    if (S.view !== want || (want === "detail" && S.id !== id)) {
      closeLbNow(); S.id = id; S.view = want; render();
      S.body.scrollTop = want === "list" ? S.scroll : 0; S.root.focus({preventScroll: true});
    }
    if (!S.data && !S.busy && !S.err) loadData();
  }
  function hide() {
    if (!S.open) return; closeLbNow(); S.open = false; S.view = ""; S.root.hidden = true; D.body.classList.remove("kn-open");
    const r = S.ret; S.ret = null; try { if (r && r.focus && D.contains(r)) r.focus({preventScroll: true}); } catch (e) {}
  }
  function open(id) { if (S.open) { if (id) go("#knights/" + id); return; } if (!parseHash()) go(id ? "#knights/" + id : "#knights"); else route(); }

  D.addEventListener("keydown", e => {
    if (!S.open) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (S.lbOpen) closeLb(); else if (S.view === "detail") goBack(); else closeAll(); return; }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && S.view === "detail" && !S.lbOpen && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && S.data) {   // 키보드로 이전/다음 기사
      const a = D.activeElement; if (a && /^(input|textarea|select)$/i.test(a.tagName)) return;
      const L = S.data.list, i = L.findIndex(x => x.id === S.id); if (i < 0) return;
      e.preventDefault(); go("#knights/" + L[(i + (e.key === "ArrowRight" ? 1 : L.length - 1)) % L.length].id, true); return;
    }
    if (e.key === "Tab") {   // 화면 밖으로 포커스가 나가지 않게 가둬요
      const scope = S.lbOpen ? S.lb : S.root, f = [...scope.querySelectorAll("a[href],button:not([disabled]):not([hidden])")].filter(x => x.offsetParent !== null || x === D.activeElement);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1], a = D.activeElement;
      if (!scope.contains(a)) { e.preventDefault(); first.focus(); } else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    }
  }, true);
  D.addEventListener("click", e => {
    const b = e.target && e.target.closest && e.target.closest("[data-open-knights]"); if (!b) return;
    e.preventDefault(); sfx("click"); open(b.getAttribute("data-open-knights") || "");
  });
  window.addEventListener("popstate", route);
  window.addEventListener("hashchange", route);

  /* ---------- 게임 목록(생활)에 붙이기 ---------- */
  try {
    const k = window.knx;
    if (k && k.games && k.games.register) k.games.register({id: "knights", name: "기사단 소개", tag: "10인 기사 포즈 시트 · TMI · 내 최애", kind: "life", open: () => open(),
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M12 8v6M9 11h6"/></svg>'});
  } catch (e) {}

  window.roundbKnights = {open, close: closeAll, openKnight: id => open(String(id || "")), get state() { return {open: S.open, view: S.view, id: S.id, count: S.data && S.data.list.length}; },
    _t: {cleanData, parseHash, S, loadData, favId}};
  if (parseHash()) { const go0 = () => { try { route(); } catch (e) { console.error("knights route", e); } }; if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", go0); else go0(); }   // 링크로 바로 열기
})();
