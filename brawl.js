/* 라운드비 대난투 v2 — 화면·조작·온라인 연결. 규칙·봇·스냅샷은 brawl-core.js(BrawlCore).
   혼자 하기(봇)가 기본이고, 온라인은 createArenaRoom(방장 권위) 위에 얹는다. 파일 전체를 try/catch 로 감싸 한 모드의 오류가 로비를 죽이지 않게 한다. */
(() => {
  "use strict";
  try { build(); } catch (error) { console.error("brawl", error); }

  function build() {
    const games = window.knx && window.knx.games, Core = window.BrawlCore;
    if (!games || !Core || typeof window.roundbArenaScreen !== "function") return;
    const {MAPS, KITS, DIFF, R} = Core;
    const ALLY = "#4cc9ff", FOE = "#ffa23c", ME = "#ffe066";
    const SK_TAG = ["기본기", "이동기", "광역·제어", "궁극기"];
    const MODE_LABEL = {ffa:"개인 난투", team2:"팀전 2:2", team3:"팀전 3:3", surv:"서바이벌"};
    const store = {
      get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
      set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 불가 */ } }
    };
    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    const kSrcSafe = (id, face) => { try { return kSrc(id, face); } catch { return "img/knights" + (face ? "/" : "_fixed/") + ["seoa", "hayun", "jiyu", "arin", "chaewon", "isol", "daon", "soyul", "ian", "teo"][id] + (face ? "_face" : "") + ".webp"; } };
    const imgs = {body:[], face:[], plan:{}};
    const bodyImg = id => imgs.body[id] || (imgs.body[id] = Object.assign(new Image(), {src:kSrcSafe(id, false)}));
    const faceImg = id => imgs.face[id] || (imgs.face[id] = Object.assign(new Image(), {src:kSrcSafe(id, true)}));
    const planImg = map => imgs.plan[map.id] || (imgs.plan[map.id] = Object.assign(new Image(), {src:map.plan}));
    const ready = img => img && img.complete && img.naturalWidth > 0;

    /* ---------- 설정(저장) ---------- */
    const cfg = {mode:"ffa", map:"rand", bots:7, diff:store.get("bw.played", "") ? 1 : 0, kn:0};
    try { Object.assign(cfg, JSON.parse(store.get("bw.cfg", "{}"))); } catch { /* 옛 값 무시 */ }
    try { const me = window.lbDbg && window.lbDbg.ME; if (!store.get("bw.cfg", "") && me && Number.isInteger(me.kn)) cfg.kn = clamp(me.kn, 0, 9); } catch { /* 로비 없음 */ }
    cfg.kn = clamp(cfg.kn | 0, 0, 9); cfg.bots = [3, 5, 7, 9].includes(cfg.bots) ? cfg.bots : 7; cfg.diff = clamp(cfg.diff | 0, 0, 2);
    if (!MODE_LABEL[cfg.mode]) cfg.mode = "ffa";
    if (!["3f", "4f", "rand"].includes(cfg.map)) cfg.map = "rand";
    let soundOn = store.get("bw.snd", "1") !== "0";

    /* ---------- 화면 뼈대 ---------- */
    const dialog = document.createElement("section");
    dialog.className = "brawl bw";
    window.roundbArenaScreen(dialog);
    const chips = (name, list) => `<div class="bw-chips" data-opt="${name}">${list.map(([v, l]) => `<button type="button" class="bw-chip" data-v="${v}" aria-pressed="false">${l}</button>`).join("")}</div>`;
    dialog.innerHTML = `
<div class="bw-menu" data-menu><div class="bw-wrap">
  <header class="bw-mhead"><h2>라운드비 대난투</h2><button type="button" class="bw-x" data-act="close">로비로</button></header>
  <details class="bw-sum" data-sum open>
    <summary>한눈에 보기 · 목표와 조작</summary>
    <ul>
      <li><b>목표</b><span>라운드비 3·4층 사무실에서 기사들이 맞붙어요. 많이 쓰러뜨리고 끝까지 살아남으세요.</span></li>
      <li><b>PC</b><span>WASD 이동 · 마우스로 조준 방향 · 기본공격은 가까운 적에게 자동 · 숫자 1~4 스킬 (2번 이동기는 Shift·우클릭도 돼요) · Q로 자동공격 대상 전환</span></li>
      <li><b>폰</b><span>왼쪽 조이스틱으로 이동 · 기본공격은 자동 · 오른쪽 작은 버튼 4개가 스킬 · 위쪽 [자동공격] 버튼으로 대상 전환</span></li>
      <li><b>팁</b><span>정수기는 체력 회복, 프린터는 밟으면 폭발, 상자는 회복·속도·방어막이에요.</span></li>
    </ul>
    <button type="button" class="bw-skip" data-act="skipsum">건너뛰기</button>
  </details>
  <div class="bw-opts" data-opts>
    <div class="bw-row"><label>모드</label>${chips("mode", [["ffa", "개인 난투"], ["team2", "팀전 2:2"], ["team3", "팀전 3:3"], ["surv", "서바이벌"]])}</div>
    <p class="bw-note" data-modenote></p>
    <div class="bw-row"><label>전장</label>${chips("map", [["3f", "3층 라운지"], ["4f", "4층 공유오피스"], ["rand", "랜덤"]])}</div>
    <div class="bw-row" data-botsrow><label>상대 봇</label>${chips("bots", [[3, "3명"], [5, "5명"], [7, "7명"], [9, "9명"]])}</div>
    <div class="bw-row"><label>난이도</label>${chips("diff", [[0, "쉬움 (연습)"], [1, "보통"], [2, "어려움"]])}</div>
  </div>
  <div class="bw-pick">
    <div class="bw-knights" data-knights></div>
    <div class="bw-detail" data-detail></div>
  </div>
  <div class="bw-go" data-go>
    <button type="button" class="bw-primary" data-act="solo">혼자 하기 · 봇과 대결</button>
    <div class="bw-online">
      <button type="button" data-act="host">방 만들기</button>
      <label class="bw-pub"><input type="checkbox" data-public> 공개방</label>
      <input data-code maxlength="6" placeholder="초대 코드" aria-label="초대 코드" autocomplete="off">
      <button type="button" data-act="join">참가</button>
      <button type="button" class="bw-primary" data-act="onlinestart" hidden>온라인 시작</button>
    </div>
  </div>
  <p class="bw-status" data-status role="status"></p>
</div></div>
<div class="bw-stage" data-stage hidden>
  <div class="bw-top">
    <button type="button" class="bw-exit" data-act="exit">나가기</button>
    <div class="bw-clock"><b data-time>3:00</b><small data-modeinfo></small></div>
    <div class="bw-sc" data-score></div>
    <button type="button" class="bw-ico" data-act="snd" aria-label="소리 켜기/끄기"></button>
  </div>
  <div class="bw-view" data-view>
    <canvas data-cv aria-label="라운드비 대난투 전장"></canvas>
    <div class="bw-hud">
      <div class="bw-me"><img data-meface alt=""><div><i class="bw-hp"><u data-hpfill></u><s data-hpshield></s></i><small data-hptxt></small></div></div>
      <canvas class="bw-mini" data-mini width="96" height="139"></canvas>
      <ul class="bw-feed" data-feed></ul>
      <div class="bw-banner" data-banner></div>
      <div class="bw-hint" data-hint></div>
      <div class="bw-combo" data-combo></div>
      <button type="button" class="bw-prio" data-act="prio"></button>
      <div class="bw-cutin" data-cutin></div>
      <button type="button" class="bw-skipend" data-act="skipend" hidden>빨리 결과 보기</button>
    </div>
    <div class="bw-stick" data-stick><i></i></div>
    <div class="bw-skills" data-skills>
      ${[0, 1, 2, 3].map(i => `<button type="button" class="bw-sk${i === 3 ? " ult" : ""}" data-sk="${i}"><kbd>${i + 1}</kbd><span></span><i class="cd"></i><b class="cdn"></b></button>`).join("")}
    </div>
    <div class="bw-result" data-result hidden><div class="bw-card" data-card></div></div>
  </div>
</div>`;
    document.body.append(dialog);
    const $ = (s, r = dialog) => r.querySelector(s), $$ = (s, r = dialog) => Array.from(r.querySelectorAll(s));
    const cv = $("[data-cv]"), ctx = cv.getContext("2d"), mini = $("[data-mini]"), mctx = mini.getContext("2d");
    const statusEl = $("[data-status]"), stage = $("[data-stage]"), menu = $("[data-menu]"), view = $("[data-view]");

    /* ---------- 상태 ---------- */
    let match = null, V = null, meIdx = 0, role = "", room = null, localSlot = 0, loopOn = false, raf = 0, last = 0, rewarded = "", resultShown = false, overAt = 0;
    let pubAt = 0, sendAt = 0, castSeq = 0, lastSnapAt = 0, lastHud = 0, lastMini = 0, hint = {i:0, at:0, done:{}}, banner = {txt:"", until:0}, shake = 0, hurtAt = 0;
    let touchy = false, dprCap = 2, lowfx = false, frameAvg = 16, slowCount = 0, exitArm = 0, round = 0, startedAt = 0, tipsOn = false;
    const remote = new Map(), picks = new Map();
    const keys = new Set(), mouse = {cx:0, cy:0, has:false, down:false}, stick = {x:0, y:0}, pend = [];
    let atkBtn = false, anyMove = false, anyAtk = false, anySkill = false;
    const cam = {x:400, y:580}, fx = [], feed = [];
    let W = 300, H = 300, dpr = 1, zoom = 1;

    /* ---------- 메뉴 ---------- */
    const detail = $("[data-detail]"), knightBox = $("[data-knights]");
    KITS.forEach((k, id) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "bw-kn"; b.dataset.kn = id; b.setAttribute("aria-pressed", "false");
      b.innerHTML = `<img src="${kSrcSafe(id, true)}" alt=""><b>${k.n}</b><small>${k.role}</small>`;
      knightBox.append(b);
    });
    function paintMenu() {
      $$("[data-opt]").forEach(g => {
        const key = g.dataset.opt, val = String(key === "mode" ? cfg.mode : cfg[key]);
        $$(".bw-chip", g).forEach(c => c.setAttribute("aria-pressed", String(c.dataset.v === val)));
      });
      $("[data-botsrow]").hidden = cfg.mode === "team2" || cfg.mode === "team3";
      $("[data-modenote]").textContent = {
        ffa:"모두가 적이에요. 쓰러져도 3초 뒤 부활 — 3분 안에 가장 많이 처치하면 승리!",
        team2:"2:2 팀전. 같은 팀은 공격이 안 맞아요. 먼저 10처치 하거나 3분 뒤 더 많이 처치한 팀 승리.",
        team3:"3:3 팀전. 같은 팀은 공격이 안 맞아요. 먼저 15처치 하거나 3분 30초 뒤 더 많이 처치한 팀 승리.",
        surv:"부활 없음! 시간이 지나면 안전지대가 줄어들어요. 마지막까지 살아남으면 승리."}[cfg.mode];
      $$(".bw-kn", knightBox).forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.kn) === cfg.kn)));
      const k = KITS[cfg.kn];
      detail.innerHTML = `<div class="bw-dhead"><img src="${kSrcSafe(cfg.kn, false)}" alt=""><div><h3>${k.n}</h3><span>${k.role} · 체력 ${k.hp}</span>
        <small>기본 공격(자동): ${k.basic.t === "cone" ? "근접 부채꼴" : "원거리 발사"} · 사거리 ${k.basic.rng} 안의 가까운 적에게</small></div></div>
        <ol>${k.skills.map((s, i) => `<li><kbd>${i + 1}</kbd><div><b>${SK_TAG[i]} · ${s.n}</b><span>${s.d} (${s.cd}초)</span></div></li>`).join("")}</ol>`;
      store.set("bw.cfg", JSON.stringify(cfg));
    }
    paintMenu();
    $("[data-sum]").open = store.get("bw.sum", "1") !== "0";
    const setStatus = text => { statusEl.textContent = text || ""; };

    /* ---------- 소리·효과 ---------- */
    const sndBtn = $('[data-act="snd"]');
    const paintSnd = () => { sndBtn.textContent = soundOn ? "소리 켬" : "소리 끔"; sndBtn.setAttribute("aria-pressed", String(soundOn)); };
    paintSnd();
    function snd(name, gap, x, y) {
      if (!soundOn || typeof sfx !== "function") return;
      if (x != null && V) { const me = V.fighters[meIdx]; if (me && Math.hypot(me.x - x, me.y - y) > 560) return; }
      try { sfx(name, gap || 0); } catch { /* 소리 실패 무시 */ }
    }
    /* ---------- 이펙트(새 이미지 없이 캔버스 도형만: 그라디언트·선·원·부채꼴·파티클) ---------- */
    const THEME = [
      {c:"#ffd36b", c2:"#fff3c4", s:"line"}, {c:"#c19bff", c2:"#efe3ff", s:"star"}, {c:"#8fe3ff", c2:"#ffffff", s:"cross"}, {c:"#7dffb0", c2:"#eafff3", s:"line"},
      {c:"#ffb36b", c2:"#fff0d9", s:"gear"}, {c:"#ff7a8a", c2:"#ffe0e5", s:"star"}, {c:"#ff9d4d", c2:"#ffe6bf", s:"ember"}, {c:"#9fd0ff", c2:"#e8f4ff", s:"hex"},
      {c:"#b8c6ff", c2:"#ffffff", s:"diamond"}, {c:"#d0c07a", c2:"#fff6d0", s:"hex"}];
    const th = id => THEME[id] || THEME[0];
    let fxq = 1, hitstopUntil = 0, dimUntil = 0, punch = 0, prio = 0;
    const parts = [];
    const addFx = o => { if (fx.length < Math.round((lowfx ? 50 : 140) * fxq)) fx.push(Object.assign({t:0, life:.5}, o)); };
    const part = o => { if (parts.length < Math.round((lowfx ? 60 : 230) * fxq)) parts.push(Object.assign({t:0, life:.5, vx:0, vy:0, g:0, sz:5, rot:0, vr:0, sh:"dot", col:"#fff", add:1}, o)); };
    function burst(x, y, id, n, sp, o) {
      const T = th(id); n = Math.max(1, Math.round(n * fxq)); o = o || {};
      for (let k = 0; k < n; k++) {
        const a = o.ang !== undefined ? o.ang + (Math.random() - .5) * (o.spread || 1.2) : Math.random() * 6.283, v = sp * (.4 + Math.random() * .8);
        part({x, y, vx:Math.cos(a) * v, vy:Math.sin(a) * v, life:.3 + Math.random() * .35, sz:3 + Math.random() * 4, sh:Math.random() < .55 ? T.s : "dot", col:Math.random() < .5 ? T.c : T.c2, rot:a, vr:(Math.random() - .5) * 10, g:o.g || 0, add:o.add === undefined ? 1 : o.add});
      }
    }
    const posOf = i => { const f = V && V.fighters[i]; return f ? {x:f.rx !== undefined ? f.rx : f.x, y:f.ry !== undefined ? f.ry : f.y} : {x:0, y:0}; };
    const kick = level => { shake = Math.max(shake, [0, 3, 6, 10][level] * (lowfx ? .6 : 1)); };
    const stopFor = ms => { if (!role) hitstopUntil = Math.max(hitstopUntil, performance.now() + ms); };
    const cutEl = $("[data-cutin]");
    function cutin(f, sk, mine) {
      const me = V.fighters[meIdx], hostile = !mine && me && !isAlly(f, me);
      cutEl.className = "bw-cutin " + (mine ? "me" : hostile ? "foe" : "ally");
      cutEl.innerHTML = `<img src="${kSrcSafe(f.id, true)}" alt=""><div><small>${mine ? "▼ " : hostile ? "■ 적 " : "▲ "}${KITS[f.id].n} · ${KITS[f.id].role}</small><b>${sk.n}</b></div>`;
      void cutEl.offsetWidth; cutEl.classList.add("play");
    }
    function castFx(f, slot) {
      if (!f) return;
      const now = performance.now(), sk = KITS[f.id].skills[slot], T = th(f.id), p = posOf(f.i), ult = slot === 3, mine = f.i === meIdx;
      f._castAt = now; f._castSlot = slot;
      addFx({k:"flare", x:p.x, y:p.y - 34, r:ult ? 110 : 62, col:T.c, life:ult ? .4 : .26});
      if (sk.delay || ult) addFx({k:"charge", x:p.x, y:p.y + 10, r:ult ? 100 : 66, col:T.c, col2:T.c2, life:Math.max(.32, sk.delay || .45)});
      if (ult) {
        addFx({k:"rune", x:p.x, y:p.y + 12, r:64, col:T.c, col2:T.c2, life:1, id:f.id});
        const me = V.fighters[meIdx];
        if (mine || (me && Math.hypot(me.x - p.x, me.y - p.y) < 650)) cutin(f, sk, mine);
        if (mine) { dimUntil = now + 480; punch = .09; kick(1); }
        snd(mine ? "rushs" : "skill", 120, mine ? undefined : p.x, mine ? undefined : p.y);
      } else {
        if (sk.me) for (let k = 0, n = 10 * fxq; k < n; k++) part({x:p.x + (Math.random() - .5) * 46, y:p.y + 14, vy:-90 - Math.random() * 70, life:.8, sz:4, sh:Math.random() < .5 ? "cross" : T.s, col:Math.random() < .5 ? T.c : T.c2});
        snd("skill", 80, mine ? undefined : p.x, mine ? undefined : p.y);
      }
      if (mine) anySkill = true;
    }
    function handleEvents(list) {
      if (!V) return;
      const now = performance.now(), me = V.fighters[meIdx], F = V.fighters;
      const near = (x, y, d) => me && Math.hypot(me.x - x, me.y - y) < d;
      for (const e of list) {
        switch (e[0]) {
          case "hit": {
            const [, di, x, y, amt, si, fl = 0] = e, d = F[di], s = F[si];
            if (!d) break;
            const crit = fl & 1, weak = fl & 2, soak = fl & 4, big = amt >= 40, T = th(s ? s.id : d.id), ang = s ? Math.atan2(y - s.y, x - s.x) : -1.57;
            d._flashAt = now;
            addFx({k:"num", x:x + (Math.random() - .5) * 16, y:y - 44, txt:(crit ? "치명! " : soak ? "◆" : "") + amt, st:crit ? 2 : weak ? 3 : soak ? 4 : big ? 1 : 0, col:di === meIdx ? "#ff9d8a" : "#fff", life:crit ? 1.05 : .8});
            addFx({k:"spark", x, y:y - 16, col:T.c2, col2:T.c, ang, life:.24, big:big || crit ? 1 : 0});
            burst(x, y - 22, s ? s.id : d.id, big || crit ? 10 : 4, big ? 300 : 190, {ang, spread:1.5});
            if (big || crit) addFx({k:"ring", x, y:y - 16, r:big ? 54 : 38, col:T.c2, life:.26, lw:4});
            if (di === meIdx) { hurtAt = now; snd("door", 150); kick(amt >= 60 ? 3 : big ? 2 : 1); if (amt >= 40) stopFor(55); }
            else if (si === meIdx) { snd("click", 70); if (big || crit) { kick(big ? 2 : 1); stopFor(big ? 55 : 40); } }
            break;
          }
          case "kill": {
            const [, ki, vi, x, y] = e, v = F[vi];
            addFx({k:"ko", x, y, col:"#ffd36b", life:.7});
            addFx({k:"ring", x, y, r:90, col:"#fff", life:.4, lw:5});
            burst(x, y - 30, v ? v.id : 0, 18, 340);
            pushFeed(ki, vi);
            if (ki === meIdx) { say("처치!", 1200); snd("kill", 0); kick(2); stopFor(85); }
            if (vi === meIdx) { snd("heart", 0); kick(3); }
            break;
          }
          case "sw": {
            const [, i, ang, rng, arc, sl = -1] = e, f = F[i];
            if (!f) break;
            const T = th(f.id), p = posOf(i), skill = sl >= 0;
            f._faceAng = ang; f._faceUntil = now + 420; if (skill) f._castAt = now; else f._swAt = now;
            addFx({k:"slash", x:p.x, y:p.y, ang, rng, arc, col:T.c, col2:T.c2, life:skill ? .34 : .2, big:skill ? 1 : 0});
            if (!lowfx) for (let k = 0, n = (skill ? 7 : 2) * fxq; k < n; k++) { const a = ang + (Math.random() - .5) * arc * .0175, r2 = rng * (.7 + Math.random() * .35); part({x:p.x + Math.cos(a) * r2, y:p.y - 20 + Math.sin(a) * r2, vx:Math.cos(a) * 110, vy:Math.sin(a) * 110, life:.3, sz:3.5, sh:T.s, col:Math.random() < .5 ? T.c : T.c2, rot:a, vr:6}); }
            if (skill && i === meIdx) kick(1);
            snd("paper", 90, p.x, p.y);
            break;
          }
          case "shot": {
            const [, i, ang, sl = -1] = e, f = F[i];
            if (!f) break;
            const p = posOf(i), T = th(f.id), mx = p.x + Math.cos(ang) * 30, my = p.y - 28 + Math.sin(ang) * 30;
            f._faceAng = ang; f._faceUntil = now + 380; if (sl >= 0) f._castAt = now; else f._swAt = now;
            addFx({k:"flare", x:mx, y:my, r:sl >= 0 ? 38 : 22, col:T.c, life:.16});
            burst(mx, my, f.id, sl >= 0 ? 5 : 2, 170, {ang, spread:.7});
            snd("beam", 90, p.x, p.y);
            break;
          }
          case "cast": castFx(F[e[1]], e[2]); break;
          case "ring": {
            const [, x, y, r, kn, st = 32] = e, T = th(kn), heal = st & 4, pull = st & 2, slow = st & 8, hard = st & 49;
            if (heal) {
              addFx({k:"ring", x, y, r, col:T.c, life:.65, lw:3, soft:1});
              for (let k = 0, n = 10 * fxq; k < n; k++) part({x:x + (Math.random() - .5) * r * 1.4, y:y + (Math.random() - .3) * r * .8, vy:-70 - Math.random() * 60, life:.95, sz:4.5, sh:"cross", col:Math.random() < .5 ? T.c : "#fff"});
            } else addFx({k:"shock", x, y, r, col:T.c, col2:T.c2, life:.55, pull:pull ? 1 : 0});
            if (hard && !heal) { addFx({k:"crack", x, y, r, life:1.3, seed:Math.random() * 99}); burst(x, y - 6, kn, 14, r * 2.4); if (near(x, y, r + 260)) kick(r > 170 ? 2 : 1); }
            if (slow) for (let k = 0, n = 8 * fxq; k < n; k++) part({x:x + (Math.random() - .5) * r * 1.6, y:y + (Math.random() - .5) * r, vy:50, life:.9, sz:4, sh:"hex", col:"#cfe0ff"});
            if (pull) for (let k = 0, n = 10 * fxq; k < n; k++) { const a = Math.random() * 6.283; part({x:x + Math.cos(a) * r, y:y + Math.sin(a) * r, vx:-Math.cos(a) * r * 2.4, vy:-Math.sin(a) * r * 2.4, life:.4, sz:4, sh:"line", rot:a, col:T.c2}); }
            snd("splash", 130, x, y);
            break;
          }
          case "beam": {
            const [, x, y, ang, len, w, kn] = e, T = th(kn);
            addFx({k:"beam", x, y:y - 28, ang, len, w, col:T.c, col2:T.c2, life:.42});
            if (!lowfx) for (let k = 0, n = 14 * fxq; k < n; k++) { const d = Math.random() * len; part({x:x + Math.cos(ang) * d, y:y - 28 + Math.sin(ang) * d, vx:(Math.random() - .5) * 120 - Math.sin(ang) * 80, vy:(Math.random() - .5) * 120 + Math.cos(ang) * 80, life:.4, sz:3.5, sh:T.s, col:T.c2, rot:ang}); }
            if (near(x, y, 600)) kick(2);
            snd("beam", 100, x, y);
            break;
          }
          case "blink": {
            const [, x0, y0, x1, y1, kn] = e, T = th(kn);
            addFx({k:"ghost", id:kn, x:x0, y:y0, flip:x1 >= x0 ? 1 : -1, col:T.c, life:.45});
            addFx({k:"streak", x:x0, y:y0, x2:x1, y2:y1, col:T.c, col2:T.c2, life:.32});
            addFx({k:"ring", x:x0, y:y0, r:46, col:T.c, life:.3, lw:4}); addFx({k:"ring", x:x1, y:y1, r:58, col:T.c2, life:.35, lw:4});
            burst(x0, y0 - 10, kn, 9, 150); burst(x1, y1 - 10, kn, 10, 190);
            snd("flash", 100, x1, y1);
            break;
          }
          case "dash": {
            const f = F[e[1]]; if (!f) break;
            const p = posOf(e[1]); f._dashUntil = now + 450;
            for (let k = 0, n = 7 * fxq; k < n; k++) part({x:p.x + (Math.random() - .5) * 30, y:p.y + 14, vx:(Math.random() - .5) * 90, vy:-20 - Math.random() * 30, life:.5, sz:6, sh:"dot", col:"#d8cfbc", add:0});
            snd("rushs", 120, p.x, p.y);
            break;
          }
          case "heal": { const p = posOf(e[1]), T = th(F[e[1]] ? F[e[1]].id : 2); addFx({k:"num", x:p.x, y:p.y - 50, txt:"+" + e[2], st:5, col:ALLY, life:.8}); for (let k = 0, n = 5 * fxq; k < n; k++) part({x:p.x + (Math.random() - .5) * 40, y:p.y + 6, vy:-70 - Math.random() * 40, life:.8, sz:4, sh:"cross", col:Math.random() < .5 ? T.c : "#fff"}); if (e[1] === meIdx) snd("coin", 150); break; }
          case "item": { const p = posOf(e[1]); addFx({k:"ring", x:p.x, y:p.y, r:50, col:"#fff", life:.35}); burst(p.x, p.y - 20, 2, 8, 160); if (e[1] === meIdx) { snd("up", 0); say(["회복!", "속도 업!", "방어막!"][e[2]] || "", 900); } break; }
          case "water": { const p = posOf(e[1]); addFx({k:"ring", x:p.x, y:p.y, r:60, col:ALLY, life:.45}); for (let k = 0, n = 8 * fxq; k < n; k++) part({x:p.x + (Math.random() - .5) * 40, y:p.y + 6, vy:-80, life:.9, sz:4, sh:"cross", col:"#bfe9ff"}); if (e[1] === meIdx) snd("up", 0); break; }
          case "warn": snd("warn", 300, e[1], e[2]); break;
          case "warn2": { const f = F[e[1]]; if (f) snd("warn", 300, f.x, f.y); break; }
          case "jam": addFx({k:"num", x:e[1], y:e[2] - 40, txt:"용지 걸림!", st:1, col:FOE, life:.9}); snd("warn", 300, e[1], e[2]); break;
          case "boom": addFx({k:"shock", x:e[1], y:e[2], r:e[3], col:FOE, col2:"#fff", life:.5}); addFx({k:"crack", x:e[1], y:e[2], r:e[3], life:1.2, seed:Math.random() * 99}); burst(e[1], e[2] - 10, 6, 16, 300); if (near(e[1], e[2], 420)) kick(2); snd("splash", 150, e[1], e[2]); break;
          case "trap": addFx({k:"mark", x:e[1], y:e[2], col:"#fff", life:.5}); break;
          case "zoneHit": if (e[1] === meIdx) { hurtAt = now; snd("warn", 1200); } break;
          case "respawn": addFx({k:"pillar", x:e[2], y:e[3], col:"#fff", life:.6}); addFx({k:"ring", x:e[2], y:e[3], r:55, col:"#fff", life:.5}); break;
          case "spark": addFx({k:"spark", x:e[1], y:e[2], col:th(e[3]).c2, col2:th(e[3]).c, ang:-1.57, life:.2}); break;
          case "go": say("시작!", 900); snd("flash", 0); break;
          case "end": say("경기 종료", 1500); break;
          default: break;
        }
      }
    }
    function say(txt, ms) { banner = {txt, until:performance.now() + ms}; }
    function pushFeed(ki, vi) {
      const F = V.fighters, k = F[ki], v = F[vi];
      feed.push({txt:`${k ? tag(k) + " " + KITS[k.id].n : "함정"} ▶ ${v ? tag(v) + " " + KITS[v.id].n : ""}`, at:performance.now(), me:ki === meIdx || vi === meIdx});
      if (feed.length > 4) feed.shift();
    }
    const isAlly = (a, b) => a.team === b.team;
    function tag(f) { const me = V.fighters[meIdx]; return f.i === meIdx ? "▼" : me && isAlly(f, me) ? "▲" : "■"; }

    /* ---------- 시작·끝 ---------- */
    function showMenu() {
      stopLoop(); stage.hidden = true; menu.hidden = false; dialog.classList.remove("bw-playing");
      $("[data-result]").hidden = true; resultShown = false;
      paintMenu();
    }
    function showStage() { menu.hidden = true; stage.hidden = false; dialog.classList.add("bw-playing"); dialog.focus(); paintPrio(); }
    function begin() {
      const mapId = cfg.map === "rand" ? (Math.random() < .5 ? "3f" : "4f") : cfg.map;
      const players = [{slot:0, kn:cfg.kn}];
      if (role === "host") for (const [slot, r] of remote) players.push({slot, kn:r.kn});
      match = Core.createMatch({mode:cfg.mode === "ffa" ? "ffa" : cfg.mode === "surv" ? "surv" : "team", map:mapId, size:cfg.bots + 1, teamSize:cfg.mode === "team3" ? 3 : 2, diff:cfg.diff, players});
      V = match; meIdx = 0; startRound();
      showStage();
      startLoop();
    }
    function startRound() {
      round++; rewarded = ""; resultShown = false; overAt = 0; fx.length = 0; parts.length = 0; hitstopUntil = 0; dimUntil = 0; punch = 0; feed.length = 0; pend.length = 0; banner = {txt:"", until:0}; shake = 0;
      startedAt = performance.now(); $("[data-result]").hidden = true; $('[data-act="skipend"]').hidden = true;
      tipsOn = store.get("bw.tips", "") !== "1"; hint = {i:0, at:0, done:{}}; anyMove = anyAtk = anySkill = false;
      const me = V.fighters[meIdx]; if (me) { cam.x = me.x; cam.y = me.y; }
      paintSkills(); say("준비!", 2200);
    }
    function paintSkills() {
      const me = V && V.fighters[meIdx]; if (!me) return;
      $$(".bw-sk").forEach((b, i) => { $("span", b).textContent = KITS[me.id].skills[i].n; });
      $("[data-meface]").src = kSrcSafe(me.id, true);
    }
    function startLoop() { if (loopOn) return; loopOn = true; last = performance.now(); raf = requestAnimationFrame(loop); }
    function stopLoop() { loopOn = false; cancelAnimationFrame(raf); }
    function teardown() {
      stopLoop();
      if (room) { try { room.close(); } catch { /* 이미 닫힘 */ } room = null; }
      role = ""; remote.clear(); match = null; V = null; keys.clear(); atkBtn = false; mouse.down = false; stick.x = stick.y = 0;
      $('[data-act="onlinestart"]').hidden = true; dialog.classList.remove("bw-guest");
    }
    function settle(forceQuit) {
      if (!V || rewarded === V.id) return;
      const f = V.fighters[meIdx]; if (!f) return;
      const secs = V.over && V.res ? V.res.t : Math.round(V.t || 0);
      if (forceQuit && secs < 30) { rewarded = V.id; return; }
      rewarded = V.id;
      let rp = 0, parts = [];
      try {
        let place = 0, win = false, score = 0, n = V.fighters.length;
        if (V.over && V.res) {
          const row = V.res.rows.find(r => r[0] === meIdx);
          if (row) { place = row[9]; score = row[8]; }
          win = V.res.mode === "team" ? V.res.winTeam === f.team : place === 1;
        } else { place = n; score = Core.pts(f); }
        const humans = V.fighters.filter(x => x.human).length || 1;
        const info = {mode:role ? "multi" : "solo", win, place, players:n, humans, online:humans > 1, score, secs, once:"brawl:" + V.id};
        if (forceQuit) info.quit = true;
        const g = window.knx && window.knx.reward && window.knx.reward.grant ? window.knx.reward.grant("brawl", info) : null;
        if (g) { rp = g.rp || 0; parts = g.parts || []; if (window.knx.bus && window.knx.bus.emit) window.knx.bus.emit("game:end", {id:"brawl", result:Object.assign({}, info, {rp})}); }
      } catch (error) { console.warn("brawl reward", error); }
      V.rewardText = rp > 0 ? "+" + rp + " RP" : "RP 없음";
      V.rewardParts = parts.map(p => `${p.label} +${p.rp}`).join(" · ");
      store.set("bw.played", "1");
    }

    /* ---------- 입력 ---------- */
    const autoTarget = f => {
      let best = null, bs = 1e9;
      for (const o of V.fighters) {
        if (!o.alive || o.team === f.team || (o.invisT > 0 && Math.hypot(o.x - f.x, o.y - f.y) > 130)) continue;
        const d = Math.hypot(o.x - f.x, o.y - f.y), sc = prio ? o.hp / o.maxhp * 800 + d * .3 : d;
        if (d < 640 && sc < bs && Core.los(V.map, f.x, f.y, o.x, o.y, 6)) { bs = sc; best = o; }
      }
      return best;
    };
    function localInput(f) {
      let mx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
      let my = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
      if (!mx && !my) { mx = stick.x; my = stick.y; }
      const L = Math.hypot(mx, my); if (L > 1) { mx /= L; my /= L; }
      if (L > .1) anyMove = true;
      let ax = f.aimX, ay = f.aimY, ad = 260;
      if (!touchy && mouse.has) {
        const wx = (mouse.cx - W / 2) / zoom + cam.x, wy = (mouse.cy - H / 2) / zoom + cam.y, dx = wx - f.x, dy = wy - f.y, d = Math.hypot(dx, dy) || 1;
        ax = dx / d; ay = dy / d; ad = d;
      } else {
        const t = autoTarget(f);
        if (t) { const dx = t.x - f.x, dy = t.y - f.y, d = Math.hypot(dx, dy) || 1; ax = dx / d; ay = dy / d; ad = d; }
        else if (L > .2) { ax = mx / L; ay = my / L; }
      }
      const atk = keys.has(" ") || keys.has("j") || mouse.down || atkBtn ? 1 : 0;
      if (atk) anyAtk = true;
      return {mx, my, ax, ay, ad, atk};
    }
    function pressSkill(slot) {
      if (!V || !V.fighters[meIdx] || V.over) return;
      pend.push(slot);
    }
    function applyInput(f, i) {
      f.inp.mx = i.mx; f.inp.my = i.my; f.aimX = i.ax; f.aimY = i.ay; f.aimD = i.ad; f.inp.atk = 0; f.inp.prio = prio;
      while (pend.length) f.inp.casts.push(pend.shift());
    }
    function onKey(event, down) {
      if (!dialog.open || stage.hidden || (event.target.matches && event.target.matches("input, textarea"))) return;
      const key = event.key.toLowerCase();
      const used = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "j", "shift", "1", "2", "3", "4", "q", "escape"];
      if (!used.includes(key)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (down) {
        if (event.repeat) return;
        keys.add(key);
        if (/^[1-4]$/.test(key)) pressSkill(Number(key) - 1);
        else if (key === "shift") pressSkill(1);
        else if (key === "q") togglePrio();
        else if (key === "escape") exitClick();
      } else keys.delete(key);
    }
    window.addEventListener("keydown", e => onKey(e, true), true);
    window.addEventListener("keyup", e => onKey(e, false), true);
    window.addEventListener("blur", () => { keys.clear(); atkBtn = false; mouse.down = false; });
    cv.addEventListener("contextmenu", e => e.preventDefault());
    cv.addEventListener("pointermove", e => { if (e.pointerType === "touch") return; const b = cv.getBoundingClientRect(); mouse.cx = e.clientX - b.left; mouse.cy = e.clientY - b.top; mouse.has = true; });
    cv.addEventListener("pointerdown", e => {
      if (e.pointerType === "touch") return;
      const b = cv.getBoundingClientRect(); mouse.cx = e.clientX - b.left; mouse.cy = e.clientY - b.top; mouse.has = true;
      if (e.button === 0) { mouse.down = true; try { cv.setPointerCapture(e.pointerId); } catch { /* 무시 */ } }
      if (e.button === 2) pressSkill(1);
    });
    const upMouse = e => { if (e.button === 0) mouse.down = false; };
    cv.addEventListener("pointerup", upMouse); cv.addEventListener("pointercancel", () => { mouse.down = false; });
    // 터치: 조이스틱·공격·스킬 버튼
    const stickEl = $("[data-stick]"), knob = $("i", stickEl);
    let stickId = null;
    const stickMove = e => {
      const b = stickEl.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2, max = b.width / 2 - 10;
      let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy);
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      const mag = Math.hypot(dx, dy) / max;
      if (mag < .15) { stick.x = stick.y = 0; } else { stick.x = dx / max; stick.y = dy / max; }
    };
    stickEl.addEventListener("pointerdown", e => { stickId = e.pointerId; try { stickEl.setPointerCapture(e.pointerId); } catch { /* 무시 */ } if (e.pointerType === "touch") touchy = true; dialog.classList.toggle("bw-touchy", touchy); stickMove(e); e.preventDefault(); });
    stickEl.addEventListener("pointermove", e => { if (e.pointerId === stickId) stickMove(e); });
    const stickEnd = e => { if (e.pointerId !== stickId) return; stickId = null; stick.x = stick.y = 0; knob.style.transform = ""; };
    stickEl.addEventListener("pointerup", stickEnd); stickEl.addEventListener("pointercancel", stickEnd);
    $$(".bw-sk").forEach(b => b.addEventListener("pointerdown", e => { e.preventDefault(); pressSkill(Number(b.dataset.sk)); }));
    const coarse = window.matchMedia ? window.matchMedia("(pointer:coarse)") : null;
    function detectTouch() { touchy = !!(coarse && coarse.matches) || (navigator.maxTouchPoints > 0 && window.innerWidth <= 820); dialog.classList.toggle("bw-touchy", touchy); paintPrio(); }

    /* ---------- 메인 루프 ---------- */
    function loop(now) {
      if (!loopOn) return;
      raf = requestAnimationFrame(loop);
      const rawDt = (now - last) / 1000, dt = clamp(rawDt, 0, .05); last = now;
      frameAvg = frameAvg * .94 + rawDt * 1000 * .06;
      if (rawDt < .25) fxq = frameAvg > 26 ? Math.max(.2, fxq - dt * .5) : frameAvg < 20 ? Math.min(1, fxq + dt * .08) : fxq;
      lowfx = fxq < .4; dprCap = fxq < .6 ? 1 : fxq < .85 ? 1.25 : 2;
      try {
        if (role === "guest") guestFrame(now, dt); else hostFrame(now, dt);
        if (!V) return;
        const me = V.fighters[meIdx];
        if (me) {
          const spec = me.alive ? me : V.fighters.filter(o => o.alive).sort((a, b) => b.hp - a.hp)[0] || me;
          const tx = spec.rx !== undefined ? spec.rx : spec.x, ty = spec.ry !== undefined ? spec.ry : spec.y;
          cam.x += (tx - cam.x) * Math.min(1, dt * 9); cam.y += (ty - cam.y) * Math.min(1, dt * 9);
        }
        updateFx(dt);
        draw(now);
        if (now - lastHud > 90) { lastHud = now; hud(now); }
        if (V.over && !resultShown) {
          if (!overAt) overAt = now;
          if (now - overAt > 1400) { resultShown = true; settle(false); showResult(); }
        }
      } catch (error) { console.error("brawl loop", error); stopLoop(); }
    }
    function hostFrame(now, dt) {
      if (!match) return;
      const me = match.fighters[meIdx];
      if (me) applyInput(me, localInput(me));
      if (now >= hitstopUntil) Core.step(match, dt);
      const evs = match.ev.splice(0);
      if (evs.length) { handleEvents(evs); if (room && role === "host") netEv.push(...evs); if (netEv.length > 60) netEv.splice(0, netEv.length - 60); }
      V = match;
      if (room && role === "host" && now - pubAt >= (match.over ? 500 : 66)) { pubAt = now; room.publish(Core.pack(match, netEv.splice(0, 40))); }
      const f = match.fighters[meIdx];
      $('[data-act="skipend"]').hidden = !(f && !f.alive && match.cfg.mode === "surv" && !match.over && !role);
    }
    const netEv = [];
    function guestFrame(now, dt) {
      if (!V) return;
      const k = Math.min(1, dt * 16);
      for (const f of V.fighters) { if (Math.hypot(f.x - f.rx, f.y - f.ry) > 200) { f.rx = f.x; f.ry = f.y; } else { f.rx += (f.x - f.rx) * k; f.ry += (f.y - f.ry) * k; } }
      const me = V.fighters[meIdx];
      if (!me || !room) return;
      const i = localInput(me);
      me.aimX = i.ax; me.aimY = i.ay;
      const msg = {m:[+i.mx.toFixed(2), +i.my.toFixed(2)], a:[+i.ax.toFixed(3), +i.ay.toFixed(3), Math.round(i.ad)], p:prio};
      if (pend.length) { for (const slot of pend.splice(0)) { room.input(Object.assign({c:slot, q:++castSeq}, msg)); } sendAt = now; }
      else if (now - sendAt > 50) { sendAt = now; room.input(msg); }
    }

    /* ---------- 그리기 ---------- */
    function sizeCanvas() {
      const b = cv.getBoundingClientRect();
      W = Math.max(50, b.width); H = Math.max(50, b.height); dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
      if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
      zoom = clamp(Math.min(W, H) / 560, .5, 1.5);
    }
    function rr(c, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    }
    let hatch = null;
    function hatchPattern() {   // 적 스킬 예고 = 주황 빗금(모양으로도 구분)
      if (hatch) return hatch;
      const c = document.createElement("canvas"); c.width = c.height = 14;
      const g = c.getContext("2d"); g.strokeStyle = FOE; g.lineWidth = 3; g.beginPath(); g.moveTo(-2, 16); g.lineTo(16, -2); g.moveTo(-2, 9); g.lineTo(9, -2); g.moveTo(5, 16); g.lineTo(16, 5); g.stroke();
      return hatch = ctx.createPattern(c, "repeat");
    }
    const GROUND = {shock:1, crack:1, rune:1, ghost:1, mark:1, charge:1};
    const ease = p => 1 - (1 - p) * (1 - p);
    function draw(now) {
      sizeCanvas();
      const z0 = zoom;
      zoom = z0 * (1 + punch); punch = punch > .003 ? punch * .9 : 0;
      const map = V.map, MW = map.w, MH = map.h, me = V.fighters[meIdx];
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, cv.width, cv.height);
      let cx = cam.x, cy = cam.y;
      const hw = W / 2 / zoom, hh = H / 2 / zoom;
      cx = hw * 2 >= MW ? MW / 2 : clamp(cx, hw, MW - hw); cy = hh * 2 >= MH ? MH / 2 : clamp(cy, hh, MH - hh);
      if (shake > .2) { cx += (Math.random() - .5) * shake; cy += (Math.random() - .5) * shake; shake *= .86; }
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * (W / 2 - cx * zoom), dpr * (H / 2 - cy * zoom));
      const img = planImg(map);
      if (ready(img)) ctx.drawImage(img, 0, 0, MW, MH); else { ctx.fillStyle = "#e6dfcf"; ctx.fillRect(0, 0, MW, MH); }
      ctx.fillStyle = "rgba(14,20,48,.30)"; ctx.fillRect(0, 0, MW, MH);
      const b = map.bounds;
      ctx.fillStyle = "rgba(8,12,30,.9)";
      ctx.beginPath(); ctx.rect(-50, -50, MW + 100, MH + 100); ctx.rect(b[0], b[1], b[2] - b[0], b[3] - b[1]); ctx.fill("evenodd");
      for (const s of map.solids) {
        if (s.kind === "wall") { ctx.fillStyle = "rgba(30,38,78,.82)"; ctx.fillRect(s.x, s.y, s.w, s.h); ctx.strokeStyle = "#7d8cc8"; ctx.lineWidth = 2; ctx.strokeRect(s.x, s.y, s.w, s.h); }
        else {
          ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(s.x + 3, s.y + 9, s.w, s.h);
          ctx.fillStyle = "#6b4f38"; ctx.fillRect(s.x, s.y + 6, s.w, s.h);
          ctx.fillStyle = "#b08a62"; rr(ctx, s.x, s.y, s.w, s.h, 4); ctx.fill();
          ctx.strokeStyle = "#e0c9a0"; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
      if (V.zone) {
        ctx.fillStyle = "rgba(150,40,70,.34)";
        ctx.beginPath(); ctx.rect(-50, -50, MW + 100, MH + 100); ctx.arc(V.zone.x, V.zone.y, V.zone.r, 0, 6.283, true); ctx.fill("evenodd");
        ctx.strokeStyle = "#ffd36b"; ctx.lineWidth = 4; ctx.setLineDash([16, 10]); ctx.beginPath(); ctx.arc(V.zone.x, V.zone.y, V.zone.r, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
      }
      const byKn = []; for (const f of V.fighters) byKn[f.id] = f;
      const hostileOf = f => !!(me && f && f.team !== me.team);
      const ex = o => o.t0 ? Math.min(.12, (now - o.t0) / 1000) : 0;
      for (const z of V.zones) {
        const T = th(z.id), hs = hostileOf(byKn[z.id]);
        ctx.globalAlpha = Math.min(1, z.t * 2);
        ctx.fillStyle = hs ? hatchPattern() : T.c; ctx.globalAlpha *= hs ? .3 : .2; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 6.283); ctx.fill();
        ctx.globalAlpha = .9; ctx.strokeStyle = hs ? FOE : T.c; ctx.lineWidth = hs ? 5 : 3; ctx.setLineDash(hs ? [14, 9] : []); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.fillStyle = "#fff"; ctx.font = `bold ${12 / zoom}px system-ui`; ctx.textAlign = "center"; ctx.fillText((hs ? "■ " : "▲ ") + (z.hps ? "성역" : "둔화 지대"), z.x, z.y + 4);
      }
      for (const t of V.traps) {
        const hs = me && t.team !== me.team;
        ctx.strokeStyle = hs ? FOE : ALLY; ctx.lineWidth = hs ? 3.5 : 2; ctx.setLineDash(hs ? [6, 4] : []); ctx.globalAlpha = t.arm ? 1 : .55;
        ctx.beginPath(); ctx.arc(t.x, t.y, 14, 0, 6.283); ctx.moveTo(t.x - 9, t.y - 9); ctx.lineTo(t.x + 9, t.y + 9); ctx.moveTo(t.x + 9, t.y - 9); ctx.lineTo(t.x - 9, t.y + 9); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      const bob = Math.sin(now / 260) * 3;
      for (const it of V.items) {
        const c = ["#fff", "#ffe066", "#c9a8ff"][it.k], g = ["✚", "»", "◆"][it.k];
        ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(it.x, it.y + 14, 14, 5, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = "#1c2345"; ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(it.x, it.y - 6 + bob, 16, 0, 6.283); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c; ctx.font = "bold 20px system-ui"; ctx.textAlign = "center"; ctx.fillText(g, it.x, it.y + 1 + bob);
        ctx.font = `bold ${11 / zoom}px system-ui`; ctx.lineWidth = 3; ctx.strokeStyle = "#101530"; const lb = ["회복", "속도", "방어막"][it.k]; ctx.strokeText(lb, it.x, it.y + 30); ctx.fillStyle = "#fff"; ctx.fillText(lb, it.x, it.y + 30);
      }
      for (const o of V.objs) {
        const water = o.k === "w", rdy = o.cd <= 0 && !(o.arm > 0);
        ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(o.x, o.y + 18, 22, 6, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = water ? (rdy ? "#7fd3ff" : "#5a7488") : (rdy ? "#cfd6e4" : "#8d94a6"); rr(ctx, o.x - 17, o.y - 22, 34, 40, 6); ctx.fill();
        ctx.strokeStyle = "#1c2345"; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = "#1c2345"; ctx.font = "bold 22px system-ui"; ctx.textAlign = "center"; ctx.fillText(water ? "💧" : "🖨", o.x, o.y + 6);
        ctx.font = `bold ${11 / zoom}px system-ui`; ctx.lineWidth = 3; ctx.strokeStyle = "#101530"; const nm = water ? "정수기" : "프린터"; ctx.strokeText(nm, o.x, o.y + 36); ctx.fillStyle = "#fff"; ctx.fillText(nm, o.x, o.y + 36);
        if (!water && o.arm > 0) { ctx.strokeStyle = "#ff5a3c"; ctx.setLineDash([10, 8]); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(o.x, o.y, 150 * (1 - o.arm / .9 * .35), 0, 6.283); ctx.stroke(); ctx.setLineDash([]); }
      }
      // 바닥 범위 예고: 적 = 굵은 점선 + 주황 빗금 + ⚠ / 아군·나 = 가는 실선 + 단색
      for (const t of V.tele) {
        const owner = V.fighters[t.by]; if (!owner) continue;
        const T = th(owner.id), hs = hostileOf(owner), pr = clamp(1 - t.t / (t.dur || 1), 0, 1);
        const ox = owner.rx !== undefined ? owner.rx : owner.x, oy = owner.ry !== undefined ? owner.ry : owner.y;
        ctx.save();
        if (t.k === "b") { ctx.translate(ox, oy); ctx.rotate(t.ang); }
        ctx.lineWidth = hs ? 5 : 2.5; ctx.setLineDash(hs ? [14, 9] : []); ctx.strokeStyle = hs ? FOE : "#ffffff";
        const shape = k => {
          ctx.beginPath();
          if (t.k === "c") ctx.arc(t.x, t.y, t.r * k, 0, 6.283);
          else if (t.k === "b") ctx.rect(0, -t.w / 2, t.len * k, t.w);
          else { ctx.moveTo(ox, oy); ctx.arc(ox, oy, t.rng * k, t.ang - t.arc * .00873, t.ang + t.arc * .00873); ctx.closePath(); }
        };
        ctx.globalAlpha = hs ? .55 : .2; ctx.fillStyle = hs ? hatchPattern() : T.c; shape(1); ctx.fill();
        ctx.globalAlpha = .45; ctx.fillStyle = hs ? FOE : T.c; shape(pr); ctx.fill();
        ctx.globalAlpha = 1; shape(1); ctx.stroke();
        ctx.restore();
        if (hs && t.dur >= .3) { const lx = t.k === "c" ? t.x : ox + Math.cos(t.ang) * 40, ly = t.k === "c" ? t.y : oy + Math.sin(t.ang) * 40; ctx.font = `bold ${16 / zoom}px system-ui`; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#0c1128"; ctx.strokeText("⚠", lx, ly); ctx.fillStyle = FOE; ctx.fillText("⚠", lx, ly); }
      }
      for (const o of fx) if (GROUND[o.k]) drawFx(o, now);
      const order = V.fighters.filter(f => f.alive).sort((a, b) => (a.ry !== undefined ? a.ry : a.y) - (b.ry !== undefined ? b.ry : b.y));
      for (const f of order) drawFighter(f, now);
      for (const p of V.proj) drawProj(p, now, ex(p), hostileOf(byKn[p.id]));
      for (const o of fx) if (!GROUND[o.k]) drawFx(o, now);
      ctx.save();
      for (const q of parts) drawPart(q);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (now < dimUntil) { ctx.fillStyle = `rgba(4,6,18,${(.4 * Math.min(1, (dimUntil - now) / 220)).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
      drawEdge(cx, cy, hw, hh);
      if (now - lastMini > 100) { lastMini = now; drawMini(); }
      zoom = z0;
    }
    function drawProj(p, now, e, hs) {
      const x = p.x + p.vx * e, y = p.y + p.vy * e, T = th(p.id), ang = Math.atan2(p.vy, p.vx), sp = Math.hypot(p.vx, p.vy), tail = clamp(sp * .075, 26, 110), r = Math.max(5, p.r * .8);
      ctx.save(); ctx.translate(x, y - 28); ctx.rotate(ang);
      ctx.strokeStyle = hs ? FOE : ALLY; ctx.lineWidth = hs ? 3 : 2; ctx.globalAlpha = .9;   // 적 탄 = 마름모 테두리, 아군 탄 = 둥근 테두리
      ctx.beginPath();
      if (hs) { ctx.moveTo(r + 8, 0); ctx.lineTo(0, r + 8); ctx.lineTo(-r - 8, 0); ctx.lineTo(0, -r - 8); ctx.closePath(); } else ctx.arc(0, 0, r + 6, 0, 6.283);
      ctx.stroke(); ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = lowfx ? "source-over" : "lighter";
      const g = ctx.createLinearGradient(-tail, 0, 0, 0); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, T.c);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-tail, 0); ctx.lineTo(-2, -r * .9); ctx.lineTo(5, 0); ctx.lineTo(-2, r * .9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = T.c2; ctx.strokeStyle = T.c; ctx.lineWidth = 2.5;
      if (p.pierce && p.id === 5) { ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(-r, 0, r * 2.2, -.9, .9); ctx.stroke(); ctx.strokeStyle = T.c2; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-r, 0, r * 2.2, -.8, .8); ctx.stroke(); }
      else switch (T.s) {
        case "star": ctx.rotate(now / 55); ctx.beginPath(); for (let i = 0; i < 8; i++) { const rad = i % 2 ? r * .5 : r * 1.6, an = i * .785; ctx.lineTo(Math.cos(an) * rad, Math.sin(an) * rad); } ctx.closePath(); ctx.fill(); break;
        case "cross": ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill(); ctx.fillRect(-r * 1.8, -1.5, r * 3.6, 3); ctx.fillRect(-1.5, -r * 1.8, 3, r * 3.6); break;
        case "diamond": ctx.beginPath(); ctx.moveTo(r * 2, 0); ctx.lineTo(0, r * .7); ctx.lineTo(-r * 1.4, 0); ctx.lineTo(0, -r * .7); ctx.closePath(); ctx.fill(); break;
        case "gear": ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill(); ctx.rotate(now / 140); ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, 6.283); ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]); break;
        case "hex": ctx.beginPath(); for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos(i * 1.047) * r * 1.4, Math.sin(i * 1.047) * r * 1.4); ctx.closePath(); ctx.fill(); break;
        case "ember": ctx.beginPath(); ctx.arc(0, 0, r * 1.2, 0, 6.283); ctx.fill(); ctx.strokeStyle = T.c; ctx.beginPath(); ctx.arc(0, 0, r * 1.9, 0, 6.283); ctx.stroke(); break;
        default: ctx.beginPath(); ctx.moveTo(r * 2, 0); ctx.lineTo(-r * .6, -r * .8); ctx.lineTo(-r * .6, r * .8); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      if (!lowfx && Math.random() < .3 * fxq) part({x:x - Math.cos(ang) * 8, y:y - 28, vx:(Math.random() - .5) * 40, vy:(Math.random() - .5) * 40, life:.3, sz:2.8, sh:"dot", col:T.c2});
    }
    function drawFighter(f, now) {
      const me = V.fighters[meIdx], mine = f.i === meIdx, ally = me && isAlly(f, me) && !mine, T = th(f.id);
      const x = f.rx !== undefined ? f.rx : f.x, y = f.ry !== undefined ? f.ry : f.y, col = mine ? ME : ally ? ALLY : FOE;
      let alpha = 1;
      if (f.invisT > 0) alpha = mine || ally ? .4 : (me && Math.hypot(me.x - f.x, me.y - f.y) < 110 ? .5 : .06);
      if (f.invulT > 0 && Math.floor(now / 90) % 2) alpha *= .55;
      ctx.globalAlpha = alpha;
      const sp = f._lx === undefined ? 0 : Math.hypot(x - f._lx, y - f._ly); f._lx = x; f._ly = y; f._mv = (f._mv || 0) * .8 + sp * .2;
      const walk = f._mv > .6 ? Math.sin(now / 85 + f.i * 2) : 0;
      const fa = f._faceUntil > now ? f._faceAng : f.aimAng, flip = Math.cos(fa) < 0 ? -1 : 1;
      const ct = (now - (f._castAt || -1e9)) / 1000, cp = ct < .26 ? Math.sin(ct / .26 * Math.PI) : 0;   // 시전 모션: 눌렸다가 늘어나며 앞으로 찌르기
      const st = (now - (f._swAt || -1e9)) / 1000, sp2 = st < .16 ? Math.sin(st / .16 * Math.PI) : 0;
      const lunge = cp * 12 + sp2 * 7, lx = Math.cos(fa) * lunge, ly = Math.sin(fa) * lunge * .5;
      if (fxq > .45 && (f.dash || (f._dashUntil || 0) > now) && now - (f._gAt || 0) > 38) { f._gAt = now; addFx({k:"ghost", id:f.id, x, y, flip, col:T.c, life:.32}); }
      if (fxq > .45 && f.hasteT > 0 && f._mv > 1.5 && now - (f._dAt || 0) > 110) { f._dAt = now; part({x:x - flip * 12, y:y + 10, vx:-flip * 40, vy:-8, life:.35, sz:4, sh:"line", rot:fa, col:T.c2}); }
      if (fxq > .45 && f.ampT > 0 && now - (f._aAt || 0) > 120) { f._aAt = now; part({x:x + (Math.random() - .5) * 30, y:y - 20, vy:-70, life:.6, sz:4, sh:"ember", col:"#ff7a8a"}); }
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x, y + 12, 24, 8, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = mine ? 5 : 3.5; ctx.setLineDash(mine || ally ? [] : [7, 5]); ctx.beginPath(); ctx.ellipse(x, y + 12, 27, 10, 0, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
      const img = bodyImg(f.id), hgt = 104, flashing = now - (f._flashAt || -1e9) < 130;
      if (ready(img)) {
        const w = hgt * img.naturalWidth / img.naturalHeight;
        ctx.save(); ctx.translate(x + lx, y + 14 + ly - Math.abs(walk) * 3); ctx.rotate(walk * .05 + (f.stun > 0 ? Math.sin(now / 40) * .12 : 0) + (flashing ? Math.sin(now / 25) * .05 : 0));
        ctx.scale(flip * (1 + cp * .1), 1 - cp * .08);
        ctx.drawImage(img, -w / 2, -hgt, w, hgt);
        if (flashing) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = alpha * .65; ctx.drawImage(img, -w / 2, -hgt, w, hgt); }
        ctx.restore(); ctx.globalAlpha = alpha;
      } else { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y - 30, 24, 0, 6.283); ctx.fill(); }
      if (f.shieldT > 0) {
        ctx.save(); ctx.translate(x, y - 36); ctx.rotate(now / 1500); ctx.strokeStyle = "#cfe9ff"; ctx.lineWidth = 3;
        ctx.beginPath(); for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos(i * 1.047) * 42, Math.sin(i * 1.047) * 42); ctx.closePath(); ctx.stroke();
        ctx.globalAlpha = alpha * .14; ctx.fillStyle = "#cfe9ff"; ctx.fill(); ctx.restore(); ctx.globalAlpha = alpha;
      }
      if (f.drT > 0) { ctx.strokeStyle = "#ffd36b"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y - 36, 46, -.8, .8); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y - 36, 46, 2.3, 3.9); ctx.stroke(); }
      if (f.reflT > 0) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.beginPath(); for (let i = 0; i < 10; i++) { const an = i * .628 + now / 400; ctx.moveTo(x + Math.cos(an) * 44, y - 36 + Math.sin(an) * 44); ctx.lineTo(x + Math.cos(an) * 54, y - 36 + Math.sin(an) * 54); } ctx.stroke(); }
      if (f.slowT > 0) { ctx.strokeStyle = "#9fb2ff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y + 12, 32, 12, 0, 0, 6.283); ctx.stroke(); }
      if (f.hasteT > 0) { ctx.strokeStyle = "#fff6b0"; ctx.lineWidth = 3; ctx.beginPath(); for (let k = 0; k < 3; k++) { ctx.moveTo(x - 28 * flip, y - 10 - k * 12); ctx.lineTo(x - 44 * flip, y - 10 - k * 12); } ctx.stroke(); }
      if (f.ampT > 0) { ctx.fillStyle = "#ff7a8a"; ctx.font = "bold 14px system-ui"; ctx.textAlign = "center"; ctx.fillText("⚔", x + 30, y - 58); }
      if (f.stun > 0) { ctx.fillStyle = "#ffe066"; ctx.font = "bold 16px system-ui"; ctx.textAlign = "center"; for (let k = 0; k < 3; k++) { const a = now / 160 + k * 2.1; ctx.fillText("★", x + Math.cos(a) * 20, y - 104 + Math.sin(a) * 6); } }
      const bw = 52, by = y - 104 - (f.stun > 0 ? 14 : 0);
      ctx.fillStyle = "#0c1128"; ctx.fillRect(x - bw / 2 - 2, by - 2, bw + 4, 10);
      ctx.fillStyle = col; ctx.fillRect(x - bw / 2, by, bw * clamp(f.hp / f.maxhp, 0, 1), 6);
      if (f.shieldV > 0) { ctx.fillStyle = "#e6f3ff"; ctx.fillRect(x - bw / 2, by - 4, bw * clamp(f.shieldV / f.maxhp, 0, 1), 3); }
      const nm = (mine ? "나 · " : "") + KITS[f.id].n, mark = mine ? "▼" : ally ? "▲" : "■";
      ctx.font = `bold ${12 / zoom}px system-ui`; ctx.textAlign = "center"; ctx.lineWidth = 3.5; ctx.strokeStyle = "#0c1128"; ctx.strokeText(mark + " " + nm, x, by - 7); ctx.fillStyle = col; ctx.fillText(mark + " " + nm, x, by - 7);
      ctx.globalAlpha = 1;
    }
    function drawPart(q) {
      const a = 1 - q.t / q.life, s = q.sz * (a * .6 + .4);
      ctx.globalCompositeOperation = q.add && !lowfx ? "lighter" : "source-over";
      ctx.globalAlpha = Math.max(0, a); ctx.fillStyle = ctx.strokeStyle = q.col;
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot + q.vr * q.t);
      switch (q.sh) {
        case "line": ctx.lineWidth = Math.max(1.5, s * .45); ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-s * 2.2, 0); ctx.lineTo(s * 2.2, 0); ctx.stroke(); break;
        case "star": ctx.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? s * .45 : s * 1.6, an = i * .785; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); } ctx.closePath(); ctx.fill(); break;
        case "cross": ctx.fillRect(-s * 1.3, -s * .32, s * 2.6, s * .64); ctx.fillRect(-s * .32, -s * 1.3, s * .64, s * 2.6); break;
        case "gear": ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, s, 0, 6.283); ctx.stroke(); ctx.fillRect(-1.2, -s * 1.5, 2.4, s * .6); ctx.fillRect(-1.2, s * .9, 2.4, s * .6); break;
        case "hex": ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos(i * 1.047) * s * 1.2, Math.sin(i * 1.047) * s * 1.2); ctx.closePath(); ctx.stroke(); break;
        case "diamond": ctx.beginPath(); ctx.moveTo(s * 1.6, 0); ctx.lineTo(0, s * .7); ctx.lineTo(-s * 1.6, 0); ctx.lineTo(0, -s * .7); ctx.closePath(); ctx.fill(); break;
        default: ctx.beginPath(); ctx.arc(0, 0, s * .8, 0, 6.283); ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    }
    function drawFx(o, now) {
      const p = clamp(o.t / o.life, 0, 1), a = 1 - p;
      ctx.save(); ctx.globalAlpha = Math.max(0, a);
      switch (o.k) {
        case "ring": ctx.strokeStyle = o.col; ctx.lineWidth = (o.lw || 6) * a + 1; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (.3 + .7 * ease(p)), 0, 6.283); ctx.stroke(); if (o.soft) { ctx.globalAlpha = a * .16; ctx.fillStyle = o.col; ctx.fill(); } break;
        case "shock": {
          const r1 = o.r * (o.pull ? 1 - ease(p) * .6 : .25 + .75 * ease(p));
          ctx.globalCompositeOperation = lowfx ? "source-over" : "lighter";
          ctx.strokeStyle = o.col; ctx.lineWidth = 10 * a + 2; ctx.beginPath(); ctx.arc(o.x, o.y, r1, 0, 6.283); ctx.stroke();
          ctx.strokeStyle = o.col2; ctx.lineWidth = 4 * a + 1; ctx.beginPath(); ctx.arc(o.x, o.y, r1 * .72, 0, 6.283); ctx.stroke();
          ctx.globalAlpha = a * .28; ctx.fillStyle = o.col; ctx.beginPath(); ctx.arc(o.x, o.y, r1, 0, 6.283); ctx.fill();
          break;
        }
        case "crack": {
          ctx.globalAlpha = p < .6 ? 1 : 1 - (p - .6) / .4; ctx.lineCap = "round"; ctx.lineJoin = "round";
          for (let pass = 0; pass < 2; pass++) {
            ctx.strokeStyle = pass ? "#ffe9c0" : "rgba(24,12,30,.75)"; ctx.lineWidth = pass ? 1.6 : 5; ctx.beginPath();
            for (let i = 0; i < 9; i++) {
              const a0 = i / 9 * 6.283 + o.seed, len = o.r * (.5 + .5 * Math.abs(Math.sin(o.seed + i * 2.3))) * Math.min(1, p * 8 + .3);
              ctx.moveTo(o.x, o.y);
              for (let j = 1; j <= 4; j++) { const rad = len * j / 4, jit = Math.sin(o.seed * 3 + i * 7.3 + j * 3.1) * .18; ctx.lineTo(o.x + Math.cos(a0 + jit) * rad, o.y + Math.sin(a0 + jit) * rad * .8); }
            }
            ctx.stroke();
          }
          break;
        }
        case "slash": {
          const half = o.arc * .00873, a0 = o.ang - half, a1 = o.ang + half, cur = a0 + (a1 - a0) * Math.min(1, p * 2.2 + .2);
          ctx.translate(o.x, o.y - 24); ctx.lineCap = "round";
          ctx.globalCompositeOperation = lowfx ? "source-over" : "lighter";
          if (!lowfx) { const g = ctx.createRadialGradient(0, 0, o.rng * .15, 0, 0, o.rng); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, o.col); ctx.fillStyle = g; } else ctx.fillStyle = o.col;
          ctx.globalAlpha = a * (o.big ? .6 : .38); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, o.rng, a0, cur); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = a; ctx.strokeStyle = o.col2; ctx.lineWidth = (o.big ? 9 : 5) * a + 1; ctx.beginPath(); ctx.arc(0, 0, o.rng * .96, Math.max(a0, cur - .9), cur); ctx.stroke();
          ctx.strokeStyle = o.col; ctx.lineWidth = o.big ? 5 : 3; ctx.beginPath(); ctx.arc(0, 0, o.rng * .84, Math.max(a0, cur - .7), cur); ctx.stroke();
          if (o.big) { ctx.globalAlpha = a * .8; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, o.rng * 1.05, Math.max(a0, cur - .5), cur); ctx.stroke(); }
          break;
        }
        case "beam": {
          ctx.translate(o.x, o.y); ctx.rotate(o.ang);
          const wv = o.w * (1 - p * .6);
          ctx.globalCompositeOperation = lowfx ? "source-over" : "lighter";
          ctx.globalAlpha = a * .5; ctx.fillStyle = o.col; ctx.fillRect(0, -wv * .65, o.len, wv * 1.3);
          ctx.globalAlpha = a * .95; ctx.fillStyle = o.col2; ctx.fillRect(0, -wv * .2, o.len, wv * .4);
          ctx.beginPath(); ctx.arc(0, 0, wv * .7 * a + 4, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.arc(o.len, 0, wv * .5 * a + 3, 0, 6.283); ctx.fill();
          break;
        }
        case "streak": ctx.globalCompositeOperation = lowfx ? "source-over" : "lighter"; ctx.lineCap = "round"; ctx.strokeStyle = o.col; ctx.lineWidth = 16 * a + 2; ctx.beginPath(); ctx.moveTo(o.x, o.y - 30); ctx.lineTo(o.x2, o.y2 - 30); ctx.stroke(); ctx.strokeStyle = o.col2; ctx.lineWidth = 5 * a + 1; ctx.stroke(); break;
        case "flare": {
          const r = o.r * (.5 + ease(p) * .6);
          ctx.globalCompositeOperation = lowfx ? "source-over" : "lighter";
          if (lowfx) { ctx.fillStyle = o.col; ctx.globalAlpha = a * .5; ctx.beginPath(); ctx.arc(o.x, o.y, r * .6, 0, 6.283); ctx.fill(); }
          else { const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r); g.addColorStop(0, "#fff"); g.addColorStop(.35, o.col); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, 6.283); ctx.fill(); }
          break;
        }
        case "charge": {
          ctx.globalAlpha = .4 + p * .6; ctx.strokeStyle = o.col; ctx.lineWidth = 3 + p * 3; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (1 - p * .85), 0, 6.283); ctx.stroke();
          ctx.strokeStyle = o.col2; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 8; i++) { const an = i * .785 + p * 2; ctx.moveTo(o.x + Math.cos(an) * o.r * (1.15 - p * .8), o.y + Math.sin(an) * o.r * (1.15 - p * .8)); ctx.lineTo(o.x + Math.cos(an) * o.r * (.9 - p * .8), o.y + Math.sin(an) * o.r * (.9 - p * .8)); } ctx.stroke();
          break;
        }
        case "rune": {
          const sides = {line:3, star:4, cross:4, gear:8, hex:6, diamond:4, ember:5}[th(o.id).s] || 6, rot = o.t * 3, r = o.r * (1 + p * .5);
          ctx.globalAlpha = a * .9; ctx.translate(o.x, o.y); ctx.scale(1, .45); ctx.strokeStyle = o.col; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, r * .72, 0, 6.283); ctx.stroke();
          ctx.strokeStyle = o.col2; ctx.rotate(rot); ctx.beginPath(); for (let i = 0; i <= sides; i++) { const an = i / sides * 6.283; ctx.lineTo(Math.cos(an) * r * .72, Math.sin(an) * r * .72); } ctx.stroke();
          break;
        }
        case "ghost": {
          const img = bodyImg(o.id); if (!ready(img)) break;
          const hgt = 104, w = hgt * img.naturalWidth / img.naturalHeight;
          ctx.globalAlpha = a * .42; ctx.translate(o.x, o.y + 14); ctx.scale(o.flip || 1, 1); ctx.drawImage(img, -w / 2, -hgt, w, hgt);
          if (!lowfx) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = a * .3; ctx.drawImage(img, -w / 2, -hgt, w, hgt); }
          break;
        }
        case "spark": {
          const n = o.big ? 9 : 6, len = (o.big ? 34 : 22) * (.4 + p);
          ctx.globalCompositeOperation = lowfx ? "source-over" : "lighter"; ctx.lineCap = "round";
          for (let i = 0; i < n; i++) { const an = (o.ang || 0) + (i / n - .5) * 3.4 + Math.sin(o.x + i) * .3, l = len * (.6 + .4 * Math.abs(Math.sin(i * 2.1 + o.x))); ctx.strokeStyle = i % 2 ? o.col : o.col2; ctx.lineWidth = 3 * a + .8; ctx.beginPath(); ctx.moveTo(o.x + Math.cos(an) * 6, o.y + Math.sin(an) * 6); ctx.lineTo(o.x + Math.cos(an) * l, o.y + Math.sin(an) * l); ctx.stroke(); }
          ctx.fillStyle = "#fff"; ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(o.x, o.y, 7 * a + 2, 0, 6.283); ctx.fill();
          break;
        }
        case "ko": {
          ctx.translate(o.x, o.y - 40); ctx.rotate(p * 1.2); ctx.fillStyle = o.col; ctx.beginPath(); for (let i = 0; i < 16; i++) { const rad = i % 2 ? 14 : 46 * (.4 + ease(p) * .8), an = i * .3927; ctx.lineTo(Math.cos(an) * rad, Math.sin(an) * rad); } ctx.closePath(); ctx.fill();
          break;
        }
        case "mark": ctx.strokeStyle = o.col; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(o.x, o.y, 14 + 22 * ease(p), 0, 6.283); ctx.stroke(); break;
        case "pillar": { const wd = 30 * a + 6; ctx.globalCompositeOperation = lowfx ? "source-over" : "lighter"; ctx.fillStyle = o.col; ctx.globalAlpha = a * .6; ctx.fillRect(o.x - wd / 2, o.y - 130 * (.4 + p), wd, 130 * (.4 + p) + 12); break; }
        case "num": {
          const sizes = [15, 22, 28, 12, 17, 17], size = (sizes[o.st || 0]) / zoom * 1.1, yy = o.y - p * (o.st === 2 ? 46 : 34), pop = o.st === 2 ? 1 + Math.max(0, .45 - p * 2) : 1;
          ctx.font = `${o.st === 3 ? "italic " : ""}bold ${size * pop}px system-ui`; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "#0c1128"; ctx.strokeText(o.txt, o.x, yy);
          ctx.fillStyle = o.st === 2 ? "#ffd23c" : o.st === 3 ? "#b6bccf" : o.st === 4 ? "#9fe3ff" : o.st === 5 ? "#8fe3ff" : o.col; ctx.fillText(o.txt, o.x, yy);
          break;
        }
        default: break;
      }
      ctx.restore();
    }
    function updateFx(dt) {
      for (let i = fx.length - 1; i >= 0; i--) { const o = fx[i]; o.t += dt; if (o.t >= o.life) fx.splice(i, 1); }
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i]; q.t += dt;
        if (q.t >= q.life) { parts.splice(i, 1); continue; }
        q.vy += q.g * dt; const dr = Math.max(0, 1 - 2.2 * dt); q.vx *= dr; q.vy *= dr; q.x += q.vx * dt; q.y += q.vy * dt;
      }
    }
    function drawEdge(cx, cy, hw, hh) {
      const me = V.fighters[meIdx]; if (!me) return;
      const list = V.fighters.filter(f => f.alive && !isAlly(f, me)).map(f => ({f, d:Math.hypot(f.x - me.x, f.y - me.y)})).sort((a, b) => a.d - b.d).slice(0, 4);
      for (const {f} of list) {
        const sx = (f.x - cx) * zoom + W / 2, sy = (f.y - cy) * zoom + H / 2;
        if (sx > 14 && sx < W - 14 && sy > 14 && sy < H - 14) continue;
        const ang = Math.atan2(sy - H / 2, sx - W / 2);
        const t = Math.min((W / 2 - 18) / Math.abs(Math.cos(ang) || 1e-6), (H / 2 - 18) / Math.abs(Math.sin(ang) || 1e-6));
        const px = W / 2 + Math.cos(ang) * t, py = H / 2 + Math.sin(ang) * t;
        ctx.save(); ctx.translate(px, py); ctx.rotate(ang); ctx.fillStyle = FOE; ctx.strokeStyle = "#0c1128"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-8, -8); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    function drawMini() {
      const map = V.map, w = mini.width, h = mini.height, sx = w / map.w, sy = h / map.h, me = V.fighters[meIdx];
      mctx.clearRect(0, 0, w, h);
      const img = planImg(map);
      if (ready(img)) mctx.drawImage(img, 0, 0, w, h); else { mctx.fillStyle = "#cfc8b6"; mctx.fillRect(0, 0, w, h); }
      mctx.fillStyle = "rgba(14,20,48,.45)"; mctx.fillRect(0, 0, w, h);
      mctx.fillStyle = "rgba(20,28,64,.8)"; for (const s of map.solids) mctx.fillRect(s.x * sx, s.y * sy, s.w * sx, s.h * sy);
      if (V.zone) { mctx.strokeStyle = "#ffd36b"; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(V.zone.x * sx, V.zone.y * sy, V.zone.r * sx, 0, 6.283); mctx.stroke(); }
      for (const f of V.fighters) {
        if (!f.alive) continue;
        const x = f.x * sx, y = f.y * sy, mine = f.i === meIdx, ally = me && isAlly(f, me);
        mctx.fillStyle = mine ? ME : ally ? ALLY : FOE; mctx.strokeStyle = "#0c1128"; mctx.lineWidth = 1.5;
        if (mine || ally) { mctx.beginPath(); mctx.arc(x, y, mine ? 5 : 4, 0, 6.283); mctx.fill(); mctx.stroke(); } else { mctx.fillRect(x - 3.5, y - 3.5, 7, 7); mctx.strokeRect(x - 3.5, y - 3.5, 7, 7); }
      }
    }

    /* ---------- HUD ---------- */
    const clockEl = $("[data-time]"), infoEl = $("[data-modeinfo]"), scoreEl = $("[data-score]"), hpFill = $("[data-hpfill]"), hpShield = $("[data-hpshield]"), hpTxt = $("[data-hptxt]");
    const bannerEl = $("[data-banner]"), hintEl = $("[data-hint]"), comboEl = $("[data-combo]"), feedEl = $("[data-feed]"), skBtns = $$(".bw-sk");
    const HINTS = [[1, "move", "조이스틱 / WASD 로 움직여 보세요"], [5, "", "기본공격은 자동! 가까운 적에게 알아서 나가요"], [12, "skill", "숫자 1~4 (또는 작은 버튼)으로 스킬을 써 보세요 — 2번은 이동기, 4번은 궁극기"], [30, "", "정수기·상자에서 체력을 채우세요"], [44, "", "바닥의 빗금 표시는 적 스킬 예고예요. 피하세요!"]];
    let lastCombo = 0;
    const prioEl = $('[data-act="prio"]');
    function paintPrio() { prioEl.innerHTML = `자동공격 · <b>${prio ? "약한 적" : "가까운 적"}</b>` + (touchy ? "" : " <kbd>Q</kbd>"); }
    function togglePrio() { prio = prio ? 0 : 1; paintPrio(); snd("click", 0); }
    const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
    function hud(now) {
      const me = V.fighters[meIdx]; if (!me) return;
      const mode = V.cfg.mode, F = V.fighters;
      clockEl.textContent = V.phase === "ready" ? "준비" : fmt(V.limit - V.t);
      infoEl.textContent = mode === "team" ? (V.cfg.teamSize === 3 ? MODE_LABEL.team3 : MODE_LABEL.team2) : MODE_LABEL[mode];
      let sc;
      if (mode === "team") sc = `<b class="a">▲ ${V.score[me.team]}</b><span>:</span><b class="f">■ ${V.score[1 - me.team]}</b>`;
      else if (mode === "surv") sc = `<b>생존 ${F.filter(f => f.alive).length}/${F.length}</b>`;
      else { const top = F.slice().sort((a, b) => b.kills - a.kills)[0]; sc = `<b>내 처치 ${me.kills}</b><small>1위 ${KITS[top.id].n} ${top.kills}</small>`; }
      if (scoreEl.dataset.v !== sc) { scoreEl.dataset.v = sc; scoreEl.innerHTML = sc; }
      hpFill.style.width = clamp(me.hp / me.maxhp * 100, 0, 100) + "%";
      hpShield.style.width = clamp(me.shieldV / me.maxhp * 100, 0, 100) + "%";
      hpTxt.textContent = `${Math.ceil(me.hp)} / ${me.maxhp}${me.shieldV > 0 ? " (+" + Math.round(me.shieldV) + ")" : ""}`;
      skBtns.forEach((b, i) => {
        const sk = KITS[me.id].skills[i], cd = me.cd[i], pct = cd > 0 ? clamp(cd / (sk.cd * (me.bot ? me.bot.cdMul : 1)) * 100, 0, 100) : 0;
        $(".cd", b).style.height = pct + "%"; $(".cdn", b).textContent = cd > 0 ? Math.ceil(cd) : "";
        b.classList.toggle("ready", cd <= 0 && me.alive && me.stun <= 0); b.disabled = !me.alive;
      });
      const cb = me.combo >= 3 && me.alive ? me.combo : 0;
      if (cb !== lastCombo) { lastCombo = cb; comboEl.textContent = cb ? `${cb} COMBO` : ""; comboEl.classList.remove("pop"); void comboEl.offsetWidth; if (cb) comboEl.classList.add("pop"); }
      let text = "";
      if (V.over) text = banner.until > now ? banner.txt : "";
      else if (V.phase === "ready") text = V.readyT > 0 ? String(Math.ceil(V.readyT)) : "";
      else if (!me.alive) text = mode === "surv" ? "탈락! 남은 승부를 지켜봐요" : `쓰러졌어요 · ${Math.max(1, Math.ceil(me.respT))}초 뒤 부활`;
      else if (banner.until > now) text = banner.txt;
      if (bannerEl.textContent !== text) bannerEl.textContent = text;
      let h = "";
      if (tipsOn && V.phase === "play" && me.alive && !V.over) {
        const el = V.t; while (hint.i < HINTS.length && (hint.done[hint.i] || (HINTS[hint.i][1] === "move" && anyMove) || (HINTS[hint.i][1] === "atk" && anyAtk) || (HINTS[hint.i][1] === "skill" && anySkill))) hint.i++;
        const t = HINTS[hint.i];
        if (t && el >= t[0]) { if (!hint.at) hint.at = el; if (el - hint.at > 9) { hint.done[hint.i] = true; hint.at = 0; } else h = t[2]; }
      }
      if (hintEl.textContent !== h) hintEl.textContent = h;
      const fresh = feed.filter(e => now - e.at < 5200);
      if (fresh.length !== feed.length) { feed.length = 0; feed.push(...fresh); }
      const html = feed.map(e => `<li${e.me ? ' class="me"' : ""}>${e.txt}</li>`).join("");
      if (feedEl.dataset.v !== html) { feedEl.dataset.v = html; feedEl.innerHTML = html; }
      view.classList.toggle("bw-hurt", now - hurtAt < 180);
    }

    /* ---------- 결과 ---------- */
    function showResult() {
      const res = V.res, f = V.fighters[meIdx]; if (!res || !f) return;
      const my = res.rows.find(r => r[0] === meIdx), n = res.rows.length;
      const win = res.mode === "team" ? res.winTeam === f.team : my && my[9] === 1, draw = res.mode === "team" && res.winTeam < 0;
      const title = draw ? "무승부" : win ? "승리!" : res.mode === "surv" ? "탈락 · " + my[9] + "위" : res.mode === "team" ? "패배" : my[9] + "위 / " + n;
      const sub = res.mode === "team" ? `▲ ${res.score[f.team]} : ■ ${res.score[1 - f.team]}` : res.mode === "surv" ? (win ? "마지막 생존자!" : "안전지대에서 밀려났거나 쓰러졌어요") : `${my[3]}처치 · ${my[4]}사망`;
      const row = r => {
        const k = KITS[r[1]], mine = r[0] === meIdx, ally = isAlly(V.fighters[r[0]], f);
        return `<tr class="${mine ? "mine" : ""}"><td>${r[9]}</td><td class="who"><img src="${kSrcSafe(r[1], true)}" alt=""><span>${mine ? "▼ 나 · " : ally ? "▲ " : "■ "}${k.n}</span>${r[0] === res.mvp ? "<em>MVP</em>" : ""}</td><td>${r[3]}</td><td>${r[4]}</td><td>${r[5]}</td><td title="치유 ${r[7]}">${r[6]}</td><td><b>${r[8]}</b></td></tr>`;
      };
      const canAgain = role !== "guest";
      $("[data-card]").innerHTML = `
        <small>${MODE_LABEL[res.mode === "team" ? (V.cfg.teamSize === 3 ? "team3" : "team2") : res.mode]} · ${V.map.name} · ${Math.floor(res.t / 60)}분 ${res.t % 60}초</small>
        <h2 class="${win ? "win" : ""}">${title}</h2><p class="bw-sub">${sub}</p>
        <p class="bw-reward"><b>${V.rewardText || ""}</b><span>${V.rewardParts || ""}</span></p>
        <div class="bw-tblw"><table class="bw-tbl"><thead><tr><th>순위</th><th>기사</th><th>처치</th><th>사망</th><th>피해</th><th>지원</th><th>점수</th></tr></thead><tbody>${res.rows.map(row).join("")}</tbody></table></div>
        <p class="bw-pts">점수 = 처치×100 + 지원×40 + 피해÷6 + 치유÷8</p>
        <div class="bw-btns">${canAgain ? '<button type="button" class="bw-primary" data-act="again">다시 하기</button><button type="button" data-act="settings">설정 바꾸기</button>' : '<span class="bw-wait">방장이 다시 시작하면 이어져요</span>'}<button type="button" data-act="exitnow">나가기</button></div>`;
      $("[data-result]").hidden = false;
      snd(win ? "win" : "lose", 0);
      if (tipsOn) store.set("bw.tips", "1");
    }
    function exitClick() {
      if (!V || V.over || menu.hidden === false) { leave(); return; }
      const now = performance.now();
      if (now < exitArm) { exitArm = 0; settle(true); leave(); return; }
      exitArm = now + 3000; const b = $('[data-act="exit"]'); b.textContent = "한 번 더 누르면 나가요"; b.classList.add("arm");
      setTimeout(() => { if (performance.now() >= exitArm) { b.textContent = "나가기"; b.classList.remove("arm"); } }, 3100);
    }
    function leave() { dialog.close(); }

    /* ---------- 온라인(방장 권위) ---------- */
    function connect(next) {
      teardown(); role = next; setStatus("연결 중…");
      room = createArenaRoom("brawl", {
        error(message) { const keep = message; teardown(); showMenu(); setStatus(keep); },
        ready(slot, code) {
          localSlot = slot;
          if (slot) { dialog.classList.add("bw-guest"); setStatus("방에 들어왔어요 · 기사를 고르고 방장이 시작하기를 기다려요"); room && room.input({pick:cfg.kn}); }
          else { setStatus("초대 코드 " + code + " · 친구를 기다리는 중 (0명 참가)"); $('[data-act="onlinestart"]').hidden = false; }
        },
        accept: () => !match && remote.size < 9,
        join(slot) { remote.set(slot, {kn:slot % 10, q:0}); setStatus(`참가자 ${remote.size}명 대기 중 · '온라인 시작'을 눌러 주세요`); },
        leave(slot) {
          remote.delete(slot);
          if (match && match.fighters[slot] && match.fighters[slot].human) { Core.makeBot(match.fighters[slot], match.cfg.diff); }
          else setStatus(`참가자 ${remote.size}명 대기 중`);
        },
        input(slot, msg) {
          if (!msg || typeof msg !== "object") return;
          const r = remote.get(slot); if (!r) return;
          if (Number.isInteger(msg.pick) && msg.pick >= 0 && msg.pick < 10) r.kn = msg.pick;
          const f = match && match.fighters[slot]; if (!f || !f.human) return;
          const num = (v, a, b) => Number.isFinite(v) ? clamp(v, a, b) : 0;
          if (Array.isArray(msg.m)) { f.inp.mx = num(msg.m[0], -1, 1); f.inp.my = num(msg.m[1], -1, 1); }
          if (Array.isArray(msg.a)) { const ax = num(msg.a[0], -1, 1), ay = num(msg.a[1], -1, 1), d = Math.hypot(ax, ay); if (d > .01) { f.aimX = ax / d; f.aimY = ay / d; } f.aimD = num(msg.a[2], 0, 900); }
          f.inp.prio = msg.p ? 1 : 0;
          if (Number.isInteger(msg.c) && msg.c >= 0 && msg.c < 4 && Number.isInteger(msg.q) && msg.q !== r.q) { r.q = msg.q; f.inp.casts.push(msg.c); }
        },
        state(snap) {
          if (!snap || snap.v !== 1 || !Array.isArray(snap.f)) return;
          const fresh = !V || V.id !== snap.id;
          V = Core.unpack(snap, fresh ? null : V);
          match = null; meIdx = localSlot; lastSnapAt = performance.now();
          if (fresh) { V.fighters.forEach(f => { f.rx = f.x; f.ry = f.y; }); startRound(); if (stage.hidden) showStage(); startLoop(); }
          for (const f of V.fighters) if (f.rx === undefined) { f.rx = f.x; f.ry = f.y; }
          if (snap.e && snap.e.length) handleEvents(snap.e);
        }
      });
      if (role === "host") room.host({listed:$("[data-public]").checked}); else room.join($("[data-code]").value);
    }
    function onlineStart() {
      if (role !== "host") return;
      for (const [slot, r] of remote) picks.set(slot, r.kn);
      begin();
      if (room) room.publish(Core.pack(match, []));
    }

    /* ---------- 클릭 ---------- */
    dialog.addEventListener("click", event => {
      const chip = event.target.closest(".bw-chip");
      if (chip) {
        const key = chip.parentElement.dataset.opt, v = chip.dataset.v;
        if (key === "mode") cfg.mode = v; else if (key === "map") cfg.map = v; else cfg[key] = Number(v);
        paintMenu(); return;
      }
      const kn = event.target.closest(".bw-kn");
      if (kn) { cfg.kn = Number(kn.dataset.kn); paintMenu(); if (role === "guest" && room) room.input({pick:cfg.kn}); return; }
      const b = event.target.closest("[data-act]"); if (!b) return;
      switch (b.dataset.act) {
        case "close": case "exitnow": leave(); break;
        case "exit": exitClick(); break;
        case "prio": togglePrio(); break;
        case "skipsum": $("[data-sum]").open = false; store.set("bw.sum", "0"); break;
        case "snd": soundOn = !soundOn; store.set("bw.snd", soundOn ? "1" : "0"); paintSnd(); break;
        case "solo": teardown(); setStatus(""); begin(); break;
        case "host": connect("host"); break;
        case "join": connect("guest"); break;
        case "onlinestart": onlineStart(); break;
        case "again": if (role === "host") { onlineStart(); } else { begin(); } break;
        case "settings": showMenu(); if (role === "host") setStatus("설정을 바꾸고 '온라인 시작'을 눌러 주세요"); break;
        case "skipend": if (match && !match.over) { Core.fastForward(match); V = match; } break;
        default: break;
      }
    });
    $("[data-sum]").addEventListener("toggle", e => store.set("bw.sum", e.target.open ? "1" : "0"));
    dialog.addEventListener("close", () => { if (V && !V.over && !resultShown) settleOnClose(); teardown(); showMenu(); setStatus(""); exitArm = 0; });
    function settleOnClose() { try { settle(true); } catch { /* 무시 */ } }
    window.addEventListener("resize", detectTouch);

    function openMenu() {
      detectTouch(); showMenu();
      if (!dialog.open) dialog.showScreen();
      setStatus("혼자 시작하거나 초대 코드로 함께 플레이하세요.");
    }
    if (window.roundbRooms && window.roundbRooms.register) window.roundbRooms.register("brawl", code => { openMenu(); $("[data-code]").value = code; connect("guest"); });
    games.register({id:"brawl", name:"대난투", tag:"라운드비 3·4층 기사 10인 난투 · 스킬 4개", kind:"main", open:openMenu});
    const shortcut = document.querySelector("[data-open-brawl]");
    if (shortcut) shortcut.addEventListener("click", () => games.open("brawl"));
    if (typeof window.knxKeyHints === "function") {
      window.knxKeyHints({id:"brawl", screen:() => dialog.open && !stage.hidden, corner:"bl", bottom:10, title:"대난투 단축키",
        rows:[["WASD", "이동"], ["마우스", "조준 방향"], ["자동", "가까운 적 기본공격"], ["1~4", "스킬 (4 = 궁극기)"], ["Shift", "2번 이동기"], ["우클릭", "2번 이동기"], ["Q", "자동공격 대상 전환"], ["Esc", "나가기"]]});
    }
    window.bwDebug = {get V() { return V; }, get match() { return match; }, cfg, begin, Core};
  }
})();
