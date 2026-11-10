/* 기사단 소개 (2026-11-10) — 전체 화면 오버레이. 팬아트 갤러리(gallery.js)와 같은 방식이라 다른 모드 코드는 건드리지 않고, 이 파일 하나와 knights.css 로만 동작해요.
   - 내용: 정적 knights/data.json (설정·TMI·표정 이름) + knights/img/sheet_<id>.jpg (캐릭터 시트 — 공식 3면도·표정·치비만으로 tools/build_knight_sheets.mjs 가 만든 그림) + 기존 얼굴 아이콘 img/knights/<id>_face.webp.
     글자는 전부 textContent 로만 출력해요(XSS 방지). 최애는 이 기기(localStorage)에만 저장돼요.
   - 댓글: 기사마다 한 묶음. 팬아트 갤러리의 댓글 묶음(gallery.js 의 commentThread)을 그대로 가져다 써서 같은 컬렉션(galleryComments)·같은 규칙이에요 — 글 묶음 번호(itemId)만 kn-<기사 id>.
   - 딥링크: #knights (목록) · #knights/<id> (기사 한 명, 예: #knights/jiyu) · #knights/<id>/comments (그 기사의 댓글 칸으로 바로). 뒤로가기·Esc 로 닫혀요. */
(() => {
  "use strict";
  if (window.roundbKnights) return;
  const D = document, LS_KEY = "roundb.knights.v1", ID_RE = /^[a-z0-9-]{1,40}$/;
  const S = {data: null, err: false, busy: false, open: false, view: "", id: "", sub: "", dom: null, jt: 0, lbOpen: false, wantClose: false, scroll: 0, ret: null, root: null};

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
  const sheetSrc = id => "knights/img/sheet_" + id + ".jpg";
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
        faces: x.sheet && typeof x.sheet === "object" ? strs(x.sheet.faces, 12, 6) : []});
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
    if (S.view === "detail" && S.dom && S.dom.id === id) paintFav(id); else render(true);   // 상세에서는 댓글 입력칸을 건드리지 않고 최애 표시만 바꿔요
  }
  function paintFav(id) {
    const D2 = S.dom, fav = favId() === id; if (!D2 || D2.id !== id) return;
    D2.favBtn.className = "kn-btn" + (fav ? " kn-on" : " kn-primary"); D2.favBtn.setAttribute("aria-pressed", fav ? "true" : "false"); D2.favBtn.textContent = fav ? "★ 내 최애예요 (눌러서 풀기)" : "⭐ 내 최애로 고르기";
    const old = D2.title.querySelector(".kn-fav"); if (old) old.remove(); if (fav) D2.title.append(favTag());
  }

  /* ---------- 화면 ---------- */
  function ensureRoot() {
    if (S.root) return S.root;
    const back = h("button", {type: "button", class: "kn-btn", "data-back": "1", hidden: true, text: "← 기사단", onclick: goBack});
    const close = h("button", {type: "button", class: "kn-btn", "data-close": "1", "aria-label": "기사단 소개 닫기", text: "✕ 닫기", onclick: closeAll});
    const body = h("main", {class: "kn-body", tabindex: "-1"});
    const lbImg = h("img", {alt: "", onclick: () => lbToggle()}), lbBox = h("div", {class: "kn-lb-box", onclick: ev => { if (ev.target === lbBox) closeLb(); }}, lbImg);
    const lb = h("div", {class: "kn-lb", role: "dialog", "aria-modal": "true", "aria-label": "캐릭터 시트 크게 보기", hidden: true},
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
    wrap.append(h("div", {class: "kn-intro"}, h("h3", {text: d.title}), h("p", {text: d.intro}), h("p", {class: "kn-hint", text: "마음에 드는 기사를 눌러 캐릭터 시트(3면도·표정·치비)와 TMI 를 보고, 댓글도 남겨 보세요. ⭐ 내 최애로 골라 둘 수도 있어요."})));
    if (fav) wrap.append(h("p", {class: "kn-favbar"}, h("span", {"aria-hidden": "true"}, "⭐ "), "내 최애: ", h("a", {href: "#knights/" + fav.id, onclick: ev => { ev.preventDefault(); go("#knights/" + fav.id); }}, fav.name + " (" + fav.role + ")")));
    wrap.append(h("div", {class: "kn-grid"}, d.list.map(card)));
    wrap.append(h("div", {class: "kn-foot"}, h("p", {text: "기사단 원작 그림은 AI로 만든 캐릭터입니다."}), h("p", {text: "TMI는 가볍게 즐기는 설정놀이예요. 최애는 이 기기에만 저장돼요."})));
    b.append(wrap);
  }
  function row(dt, dd) { return dd ? [h("dt", {text: dt}), dd.nodeType ? h("dd", {}, dd) : h("dd", {text: dd})] : null; }
  function sheetInfo(k) {   // 캐릭터 시트 그림 안의 구성을 글로도 풀어 줘요(폰에서는 그림 속 글자가 작아서)
    const items = [["3면도", "앞모습 · 옆모습 · 뒷모습"]];
    if (k.faces.length) items.push(["표정 " + k.faces.length + "가지", k.faces.map((f, n) => (n + 1) + " " + f).join(" · ")]);
    items.push(["그 밖에", "치비(게임 속 모습) · 프로필"]);
    return h("ul", {class: "kn-sheetinfo", "aria-label": k.name + " 캐릭터 시트 구성"}, items.map(([t, v]) => h("li", {}, h("b", {text: t}), h("span", {text: v}))));
  }
  function commentsBlock(k) {   // 팬아트 갤러리의 댓글 묶음을 그대로 써요(같은 컬렉션 galleryComments · 닉네임 12자 · 댓글 200자 · 30초 간격 · 링크 차단 · 운영자 삭제)
    const G = window.roundbGallery, mk = G && typeof G.commentThread === "function" ? G.commentThread : null, core = G && G._core;
    let body = null;
    if (mk) { try { body = mk("kn-" + k.id, {ph: k.name + "에게 한마디 남겨 주세요", empty: "아직 댓글이 없어요. " + k.name + "의 첫 댓글을 남겨 보세요!", closedText: "댓글은 곧 열려요. 지금은 기사단 소개만 둘러볼 수 있어요."}); } catch (e) { body = null; } }
    const op = core && core.masterTok && core.masterTok() ? h("p", {class: "kn-mbar", text: "운영자 모드가 켜져 있어요 — 댓글 옆에 [삭제] 버튼이 보여요."}) : null;
    return h("section", {class: "kn-thread", id: "kn-thread", "aria-labelledby": "kn-cm-h"}, h("h3", {id: "kn-cm-h", text: "💬 " + k.name + "에게 한마디"}), op,
      body || h("p", {class: "kn-state", role: "alert", text: "댓글을 불러오지 못했어요. 새로고침하면 다시 시도해요."}),
      h("p", {class: "kn-foot kn-foot-s", text: "댓글에는 링크와 개인정보(전화번호·이메일 등)를 적을 수 없어요. 계정은 @이름처럼 글자로만 적어 주세요. 운영자가 지울 수 있어요."}));
  }
  function viewDetail(id, sub) {
    const b = S.body; b.replaceChildren(); S.dom = null;
    const wrap = h("div", {class: "kn-wrap kn-wrap-d"}); S.back.hidden = false; S.view = "detail"; S.id = id;
    const k = byId(id);
    if (!k) {
      wrap.append(h("div", {class: "kn-state", role: S.data ? "alert" : "status"}, h("p", {text: S.data ? "찾을 수 없는 기사예요. 주소가 틀렸을 수 있어요." : S.err ? "기사단 정보를 불러오지 못했어요." : "불러오는 중…"}),
        S.data || S.err ? h("p", {}, h("button", {type: "button", class: "kn-btn", text: S.data ? "기사단 목록 보기" : "다시 불러오기", onclick: () => S.data ? goBack() : loadData(true)})) : null));
      b.append(wrap); return;
    }
    const L = S.data.list, i = L.indexOf(k), prev = L[(i + L.length - 1) % L.length], next = L[(i + 1) % L.length], fav = favId() === k.id;
    const alt = k.name + "의 캐릭터 시트 — 3면도(앞·옆·뒤)" + (k.faces.length ? ", 표정 " + k.faces.length + "종(" + k.faces.join(", ") + ")" : "") + ", 치비, 프로필";
    const fig = h("figure", {class: "kn-fig"}, h("button", {type: "button", class: "kn-figbtn", "aria-label": "캐릭터 시트 크게 보기: " + k.name, onclick: () => openLb(sheetSrc(k.id), alt)}, img(sheetSrc(k.id), alt, null, true)),
      h("figcaption", {class: "kn-fighint", text: "공식 그림으로 만든 캐릭터 시트 · 그림을 누르면 크게 볼 수 있어요"}), sheetInfo(k));
    const msg = h("p", {class: "kn-msg", role: "status", "aria-live": "polite"});
    const copyBtn = h("button", {type: "button", class: "kn-btn", text: "🔗 링크 복사", onclick: () => copyLink(k.id, msg)});
    const cmBtn = h("button", {type: "button", class: "kn-btn", text: "💬 댓글 보기", onclick: () => jumpToComments()});
    const favBtn = h("button", {type: "button", class: "kn-btn" + (fav ? " kn-on" : " kn-primary"), "aria-pressed": fav ? "true" : "false", text: fav ? "★ 내 최애예요 (눌러서 풀기)" : "⭐ 내 최애로 고르기", onclick: () => setFav(k.id)});
    const partner = k.chem.with ? byId(k.chem.with) : null;
    const dl = h("dl", {class: "kn-meta"},
      row("직업", k.role), row("무기", k.weapon), row("나이", k.age ? k.age + "세" : ""), row("머리", k.hair), row("눈", k.eye),
      k.keywords.length ? row("성격", h("span", {class: "kn-chips"}, k.keywords.map(w => h("span", {class: "kn-chip"}, h("i", {"aria-hidden": "true", text: "#"}), w)))) : null,
      k.props.length ? row("시그니처 소품", k.props.join(" · ")) : null, row("좋아하는 것", k.likes), row("싫어하는 것", k.dislikes));
    const title = h("div", {class: "kn-title"}, h("span", {class: "kn-face kn-face-s"}, img(faceSrc(k.id), k.name + " 얼굴", null, true)),
      h("div", {class: "kn-tt"}, h("h2", {text: k.name}), h("p", {class: "kn-en", text: String(k.no).padStart(2, "0") + " · " + k.en + " · " + k.role})), fav ? favTag() : null);
    const info = h("section", {class: "kn-info", "aria-label": k.name + " 설정"}, title,
      k.line ? h("blockquote", {class: "kn-quote"}, h("h3", {text: "말버릇"}), h("p", {text: "“" + k.line + "”"})) : null,
      dl,
      k.chem.text ? h("div", {class: "kn-chem"}, h("h3", {text: "💞 케미"}), h("p", {text: k.chem.text}), partner ? h("button", {type: "button", class: "kn-btn kn-small", text: partner.name + " 보러 가기 →", onclick: () => go("#knights/" + partner.id, true)}) : null) : null);
    const tmi = k.tmi.length ? h("section", {class: "kn-tmi", "aria-labelledby": "kn-tmi-h"}, h("h3", {id: "kn-tmi-h", text: "🤫 " + k.name + " TMI"}), h("ul", {}, k.tmi.map(t => h("li", {text: t})))) : null;
    const acts = h("div", {class: "kn-acts"}, favBtn, cmBtn, copyBtn);
    const nav = h("div", {class: "kn-nav"}, h("button", {type: "button", class: "kn-btn", text: "← " + prev.name, "aria-label": "이전 기사: " + prev.name, onclick: () => go("#knights/" + prev.id, true)}),
      h("button", {type: "button", class: "kn-btn", text: "목록", onclick: goBack}), h("button", {type: "button", class: "kn-btn", text: next.name + " →", "aria-label": "다음 기사: " + next.name, onclick: () => go("#knights/" + next.id, true)}));
    S.dom = {id: k.id, favBtn, title};
    wrap.append(h("div", {class: "kn-detail"}, h("div", {class: "kn-colL"}, fig), h("div", {class: "kn-colR"}, info, acts, msg, tmi), commentsBlock(k)), nav,
      h("div", {class: "kn-foot"}, h("p", {text: "기사단 원작 그림은 AI로 만든 캐릭터입니다."}), h("p", {text: "TMI는 가볍게 즐기는 설정놀이예요. 최애는 이 기기에만 저장돼요."})));
    b.append(wrap);
    if (sub === "comments") scheduleJump();
  }
  function jumpToComments() { const t = S.body && S.body.querySelector("#kn-thread"); if (t) { t.scrollIntoView({block: "start", behavior: "auto"}); const f = t.querySelector("textarea,input"); if (f && !f.disabled) f.focus({preventScroll: true}); } }
  function scheduleJump() { clearTimeout(S.jt); let n = 0; const tick = () => { if (!S.open || S.view !== "detail") return; const img0 = S.body.querySelector(".kn-figbtn img"); if (img0 && !img0.complete && n++ < 20) { S.jt = setTimeout(tick, 150); return; } jumpToComments(); }; S.jt = setTimeout(tick, 60); }   // 위쪽 그림이 자리를 잡은 뒤에 댓글 칸으로 내려가요
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
    if (S.view === "list") viewList(); else if (S.view === "detail") viewDetail(S.id, S.sub);
    if (keep && S.body) S.body.scrollTop = prevScroll;
  }

  /* ---------- 주소(#knights) · 뒤로가기 · 열고 닫기 (팬아트 갤러리와 같은 방식) ---------- */
  const parseHash = () => { const m = /^#knights(?:\/([a-z0-9-]{1,40})(?:\/(comments))?)?\/?$/.exec(location.hash || ""); return m ? {id: m[1] || "", sub: m[2] || ""} : null; };
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
    show(m.id, m.sub);
  }
  function show(id, sub) {
    ensureRoot(); sub = sub || "";
    if (!S.open) { S.open = true; S.ret = D.activeElement; S.root.hidden = false; D.body.classList.add("kn-open"); S.view = ""; }
    const want = id ? "detail" : "list";
    if (S.view === "list" && want === "detail") S.scroll = S.body.scrollTop;
    if (S.view !== want || (want === "detail" && (S.id !== id || S.sub !== sub))) {
      closeLbNow(); S.id = id; S.sub = sub; S.view = want; render();
      S.body.scrollTop = want === "list" ? S.scroll : 0; S.root.focus({preventScroll: true});
    }
    if (!S.data && !S.busy && !S.err) loadData();
  }
  function hide() {
    if (!S.open) return; clearTimeout(S.jt); closeLbNow(); S.open = false; S.view = ""; S.sub = ""; S.dom = null; S.root.hidden = true; D.body.classList.remove("kn-open");
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
      const scope = S.lbOpen ? S.lb : S.root, f = [...scope.querySelectorAll("a[href],button:not([disabled]):not([hidden]),input:not([disabled]),textarea:not([disabled])")].filter(x => x.offsetParent !== null || x === D.activeElement);
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
    if (k && k.games && k.games.register) k.games.register({id: "knights", name: "기사단 소개", tag: "10인 기사 캐릭터 시트 · TMI · 댓글", kind: "life", open: () => open(),
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M12 8v6M9 11h6"/></svg>'});
  } catch (e) {}

  window.roundbKnights = {open, close: closeAll, openKnight: id => open(String(id || "")), get state() { return {open: S.open, view: S.view, id: S.id, count: S.data && S.data.list.length}; },
    _t: {cleanData, parseHash, S, loadData, favId}};
  if (parseHash()) { const go0 = () => { try { route(); } catch (e) { console.error("knights route", e); } }; if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", go0); else go0(); }   // 링크로 바로 열기
})();
