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
      <li><b>PC</b><span>WASD 이동 · 마우스로 조준, 클릭/Space 공격 · 숫자 1~4 스킬 (2번 이동기는 Shift·우클릭도 돼요)</span></li>
      <li><b>폰</b><span>왼쪽 조이스틱으로 이동 · 큰 버튼 공격(자동 조준) · 작은 버튼 4개가 스킬</span></li>
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
      <button type="button" class="bw-skipend" data-act="skipend" hidden>빨리 결과 보기</button>
    </div>
    <div class="bw-stick" data-stick><i></i></div>
    <div class="bw-skills" data-skills>
      ${[0, 1, 2, 3].map(i => `<button type="button" class="bw-sk${i === 3 ? " ult" : ""}" data-sk="${i}"><kbd>${i + 1}</kbd><span></span><i class="cd"></i><b class="cdn"></b></button>`).join("")}
      <button type="button" class="bw-atk" data-atk>공격</button>
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
        <small>기본 공격: ${k.basic.t === "cone" ? "근접 부채꼴" : "원거리 발사"} (자동 연타, 마우스·버튼 누르는 동안)</small></div></div>
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
    const addFx = o => { if (fx.length < (lowfx ? 60 : 160)) fx.push(Object.assign({t:0, life:.5}, o)); };
    const posOf = i => { const f = V && V.fighters[i]; return f ? {x:f.rx !== undefined ? f.rx : f.x, y:f.ry !== undefined ? f.ry : f.y} : {x:0, y:0}; };
    function handleEvents(list) {
      if (!V) return;
      const me = V.fighters[meIdx], F = V.fighters, col = id => KITS[id] ? KITS[id].col : "#fff";
      for (const e of list) {
        switch (e[0]) {
          case "hit": {
            const [, di, x, y, amt, si] = e, d = F[di];
            if (!d) break;
            addFx({k:"num", x, y:y - 40, txt:String(amt), col:di === meIdx ? "#ff9d8a" : "#fff", life:.8, big:amt >= 40});
            addFx({k:"spark", x, y:y - 10, col:"#fff", life:.25});
            if (di === meIdx) { hurtAt = performance.now(); snd("door", 150); if (amt >= 40) shake = Math.max(shake, 5); }
            else if (si === meIdx) snd("click", 70);
            break;
          }
          case "kill": {
            const [, ki, vi, x, y] = e;
            addFx({k:"burst", x, y, col:"#ffd36b", life:.7});
            pushFeed(ki, vi);
            if (ki === meIdx) { say("처치!", 1200); snd("kill", 0); }
            if (vi === meIdx) { snd("heart", 0); shake = Math.max(shake, 7); }
            break;
          }
          case "sw": {
            const p = posOf(e[1]);
            addFx({k:"slash", x:p.x, y:p.y, ang:e[2], rng:e[3], arc:e[4], col:col(F[e[1]] ? F[e[1]].id : 0), life:.18});
            snd("paper", 90, p.x, p.y);
            break;
          }
          case "shot": { const p = posOf(e[1]); snd("beam", 90, p.x, p.y); break; }
          case "cast": {
            const p = posOf(e[1]);
            if (e[1] === meIdx) { anySkill = true; snd(e[2] === 3 ? "rushs" : "skill", 80); } else if (e[2] === 3) snd("skill", 120, p.x, p.y);
            break;
          }
          case "ring": addFx({k:"ring", x:e[1], y:e[2], r:e[3], col:col(e[4]), life:.45}); snd("splash", 130, e[1], e[2]); break;
          case "beam": addFx({k:"beam", x:e[1], y:e[2], ang:e[3], len:e[4], w:e[5], col:col(e[6]), life:.3}); snd("beam", 100, e[1], e[2]); break;
          case "blink": addFx({k:"streak", x:e[1], y:e[2], x2:e[3], y2:e[4], col:col(e[5]), life:.3}); snd("flash", 100, e[3], e[4]); break;
          case "dash": { const p = posOf(e[1]); snd("rushs", 120, p.x, p.y); break; }
          case "heal": { const p = posOf(e[1]); addFx({k:"num", x:p.x, y:p.y - 50, txt:"+" + e[2], col:ALLY, life:.8}); if (e[1] === meIdx) snd("coin", 150); break; }
          case "item": { const p = posOf(e[1]); addFx({k:"ring", x:p.x, y:p.y, r:50, col:"#fff", life:.35}); if (e[1] === meIdx) { snd("up", 0); say(["회복!", "속도 업!", "방어막!"][e[2]] || "", 900); } break; }
          case "water": { const p = posOf(e[1]); addFx({k:"ring", x:p.x, y:p.y, r:60, col:ALLY, life:.45}); if (e[1] === meIdx) snd("up", 0); break; }
          case "warn": snd("warn", 300, e[1], e[2]); break;
          case "jam": addFx({k:"num", x:e[1], y:e[2] - 40, txt:"용지 걸림!", col:FOE, life:.9}); snd("warn", 300, e[1], e[2]); break;
          case "boom": addFx({k:"ring", x:e[1], y:e[2], r:e[3], col:FOE, life:.5}); addFx({k:"burst", x:e[1], y:e[2], col:"#fff", life:.6}); snd("splash", 150, e[1], e[2]); break;
          case "zoneHit": if (e[1] === meIdx) { hurtAt = performance.now(); snd("warn", 1200); } break;
          case "respawn": addFx({k:"ring", x:e[2], y:e[3], r:55, col:"#fff", life:.5}); break;
          case "spark": addFx({k:"spark", x:e[1], y:e[2], col:col(e[3]), life:.2}); break;
          case "go": say("시작!", 900); snd("flash", 0); break;
          case "end": say("경기 종료", 1500); break;
          default: break;
        }
      }
      void me;
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
    function showStage() { menu.hidden = true; stage.hidden = false; dialog.classList.add("bw-playing"); dialog.focus(); }
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
      round++; rewarded = ""; resultShown = false; overAt = 0; fx.length = 0; feed.length = 0; pend.length = 0; banner = {txt:"", until:0}; shake = 0;
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
      let best = null, bd = 640;
      for (const o of V.fighters) {
        if (!o.alive || o.team === f.team || (o.invisT > 0 && Math.hypot(o.x - f.x, o.y - f.y) > 130)) continue;
        const d = Math.hypot(o.x - f.x, o.y - f.y);
        if (d < bd && Core.los(V.map, f.x, f.y, o.x, o.y, 6)) { bd = d; best = o; }
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
      f.inp.mx = i.mx; f.inp.my = i.my; f.aimX = i.ax; f.aimY = i.ay; f.aimD = i.ad; f.inp.atk = i.atk;
      while (pend.length) f.inp.casts.push(pend.shift());
    }
    function onKey(event, down) {
      if (!dialog.open || stage.hidden || (event.target.matches && event.target.matches("input, textarea"))) return;
      const key = event.key.toLowerCase();
      const used = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "j", "shift", "1", "2", "3", "4", "escape"];
      if (!used.includes(key)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (down) {
        if (event.repeat) return;
        keys.add(key);
        if (/^[1-4]$/.test(key)) pressSkill(Number(key) - 1);
        else if (key === "shift") pressSkill(1);
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
    const atkEl = $("[data-atk]");
    atkEl.addEventListener("pointerdown", e => { atkBtn = true; try { atkEl.setPointerCapture(e.pointerId); } catch { /* 무시 */ } e.preventDefault(); });
    const atkEnd = () => { atkBtn = false; };
    atkEl.addEventListener("pointerup", atkEnd); atkEl.addEventListener("pointercancel", atkEnd);
    $$(".bw-sk").forEach(b => b.addEventListener("pointerdown", e => { e.preventDefault(); pressSkill(Number(b.dataset.sk)); }));
    const coarse = window.matchMedia ? window.matchMedia("(pointer:coarse)") : null;
    function detectTouch() { touchy = !!(coarse && coarse.matches) || (navigator.maxTouchPoints > 0 && window.innerWidth <= 820); dialog.classList.toggle("bw-touchy", touchy); }

    /* ---------- 메인 루프 ---------- */
    function loop(now) {
      if (!loopOn) return;
      raf = requestAnimationFrame(loop);
      const rawDt = (now - last) / 1000, dt = clamp(rawDt, 0, .05); last = now;
      frameAvg = frameAvg * .94 + rawDt * 1000 * .06;
      if (frameAvg > 27) { if (++slowCount > 90 && !lowfx) { lowfx = true; dprCap = 1; } else if (slowCount > 30 && dprCap > 1.25) dprCap = 1.25; } else slowCount = Math.max(0, slowCount - 1);
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
      Core.step(match, dt);
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
      const msg = {m:[+i.mx.toFixed(2), +i.my.toFixed(2)], a:[+i.ax.toFixed(3), +i.ay.toFixed(3), Math.round(i.ad)], k:i.atk};
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
    function draw(now) {
      sizeCanvas();
      const map = V.map, MW = map.w, MH = map.h;
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
      const ex = o => o.t0 ? Math.min(.12, (now - o.t0) / 1000) : 0;
      for (const z of V.zones) {
        const c = KITS[z.id] ? KITS[z.id].col : "#fff";
        ctx.globalAlpha = .2 * Math.min(1, z.t * 2); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 6.283); ctx.fill();
        ctx.globalAlpha = .85; ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.setLineDash(z.hps ? [] : [8, 8]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.fillStyle = "#fff"; ctx.font = `bold ${12 / zoom}px system-ui`; ctx.textAlign = "center"; ctx.fillText(z.hps ? "✚ 성역" : "▼ 둔화", z.x, z.y + 4);
      }
      for (const t of V.traps) { ctx.strokeStyle = t.arm ? "#fff" : "#ffffff77"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(t.x, t.y, 14, 0, 6.283); ctx.moveTo(t.x - 9, t.y - 9); ctx.lineTo(t.x + 9, t.y + 9); ctx.moveTo(t.x + 9, t.y - 9); ctx.lineTo(t.x - 9, t.y + 9); ctx.stroke(); }
      const bob = Math.sin(now / 260) * 3;
      for (const it of V.items) {
        const c = ["#fff", "#ffe066", "#c9a8ff"][it.k], g = ["✚", "»", "◆"][it.k];
        ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(it.x, it.y + 14, 14, 5, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = "#1c2345"; ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(it.x, it.y - 6 + bob, 16, 0, 6.283); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c; ctx.font = `bold ${20}px system-ui`; ctx.textAlign = "center"; ctx.fillText(g, it.x, it.y + 1 + bob);
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
      for (const t of V.tele) {
        const owner = V.fighters[t.by], c = owner && KITS[owner.id] ? KITS[owner.id].col : "#fff", pr = 1 - t.t / (t.dur || 1);
        if (t.k === "c") {
          ctx.globalAlpha = .15 + pr * .3; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 6.283); ctx.fill();
          ctx.globalAlpha = 1; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.stroke(); ctx.setLineDash([]);
        } else if (owner) {
          const ox = owner.rx !== undefined ? owner.rx : owner.x, oy = owner.ry !== undefined ? owner.ry : owner.y;
          ctx.save(); ctx.translate(ox, oy); ctx.rotate(t.ang); ctx.globalAlpha = .18 + pr * .35; ctx.fillStyle = c; ctx.fillRect(0, -t.w / 2, t.len, t.w); ctx.globalAlpha = 1; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(0, -t.w / 2, t.len, t.w); ctx.restore();
        }
      }
      const order = V.fighters.filter(f => f.alive).sort((a, b) => (a.ry !== undefined ? a.ry : a.y) - (b.ry !== undefined ? b.ry : b.y));
      for (const f of order) drawFighter(f, now);
      for (const p of V.proj) {
        const e = ex(p), x = p.x + p.vx * e, y = p.y + p.vy * e, c = KITS[p.id] ? KITS[p.id].col : "#fff";
        ctx.strokeStyle = c; ctx.globalAlpha = .45; ctx.lineWidth = p.r * 1.4; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x - p.vx * .05, y - p.vy * .05); ctx.lineTo(x, y); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.fillStyle = "#fff"; ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, Math.max(5, p.r * .8), 0, 6.283); ctx.fill(); ctx.stroke();
      }
      for (const o of fx) drawFx(o);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawEdge(cx, cy, hw, hh);
      if (now - lastMini > 100) { lastMini = now; drawMini(); }
    }
    function drawFighter(f, now) {
      const me = V.fighters[meIdx], mine = f.i === meIdx, ally = me && isAlly(f, me) && !mine;
      const x = f.rx !== undefined ? f.rx : f.x, y = f.ry !== undefined ? f.ry : f.y, col = mine ? ME : ally ? ALLY : FOE;
      let alpha = 1;
      if (f.invisT > 0) alpha = mine || ally ? .4 : (me && Math.hypot(me.x - f.x, me.y - f.y) < 110 ? .5 : .06);
      if (f.invulT > 0 && Math.floor(now / 90) % 2) alpha *= .55;
      ctx.globalAlpha = alpha;
      const sp = f._lx === undefined ? 0 : Math.hypot(x - f._lx, y - f._ly); f._lx = x; f._ly = y; f._mv = (f._mv || 0) * .8 + sp * .2;
      const walk = f._mv > .6 ? Math.sin(now / 85 + f.i * 2) : 0;
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x, y + 12, 24, 8, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = mine ? 5 : 3.5; ctx.setLineDash(mine || ally ? [] : [7, 5]); ctx.beginPath(); ctx.ellipse(x, y + 12, 27, 10, 0, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
      const img = bodyImg(f.id), hgt = 104;
      if (ready(img)) {
        const w = hgt * img.naturalWidth / img.naturalHeight, flip = Math.cos(f.aimAng) < 0 ? -1 : 1;
        ctx.save(); ctx.translate(x, y + 14 - Math.abs(walk) * 3); ctx.rotate(walk * .05 + (f.stun > 0 ? Math.sin(now / 40) * .12 : 0)); ctx.scale(flip, 1);
        ctx.drawImage(img, -w / 2, -hgt, w, hgt); ctx.restore();
        if (f.flash > 0 || (f.alive && hurtFlash(f))) { ctx.globalAlpha = alpha * .4; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(x, y - 44, 22, 44, 0, 0, 6.283); ctx.fill(); ctx.globalAlpha = alpha; }
      } else { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y - 30, 24, 0, 6.283); ctx.fill(); }
      if (f.shieldT > 0) { ctx.strokeStyle = "#cfe9ff"; ctx.lineWidth = 3; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(x, y - 36, 38, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); }
      if (f.drT > 0) { ctx.strokeStyle = "#ffd36b"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - 36, 42, -.8, .8); ctx.arc(x, y - 36, 42, 2.3, 3.9); ctx.stroke(); }
      if (f.slowT > 0) { ctx.strokeStyle = "#9fb2ff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y + 12, 32, 12, 0, 0, 6.283); ctx.stroke(); }
      if (f.hasteT > 0) { ctx.strokeStyle = "#fff6b0"; ctx.lineWidth = 3; ctx.beginPath(); for (let k = 0; k < 3; k++) { ctx.moveTo(x - 28, y - 10 - k * 12); ctx.lineTo(x - 44, y - 10 - k * 12); } ctx.stroke(); }
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
    const hurtFlash = f => f.flash > 0;
    function drawFx(o) {
      const p = o.t / o.life, a = 1 - p;
      ctx.globalAlpha = Math.max(0, a);
      switch (o.k) {
        case "ring": ctx.strokeStyle = o.col; ctx.lineWidth = 6 * a + 1; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (.3 + .7 * Math.min(1, p * 1.6)), 0, 6.283); ctx.stroke(); break;
        case "slash": ctx.strokeStyle = o.col; ctx.lineWidth = 8 * a + 2; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(o.x, o.y - 20, o.rng * (.7 + .3 * p), o.ang - o.arc * .0087, o.ang + o.arc * .0087); ctx.stroke(); break;
        case "beam": ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.ang); ctx.fillStyle = o.col; ctx.globalAlpha = a * .7; ctx.fillRect(0, -o.w / 2 * a, o.len, o.w * a); ctx.fillStyle = "#fff"; ctx.globalAlpha = a; ctx.fillRect(0, -3, o.len, 6); ctx.restore(); break;
        case "streak": ctx.strokeStyle = o.col; ctx.lineWidth = 10 * a + 2; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(o.x, o.y - 30); ctx.lineTo(o.x2, o.y2 - 30); ctx.stroke(); break;
        case "spark": ctx.strokeStyle = o.col; ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k < 5; k++) { const ang = k * 1.26 + o.x; ctx.moveTo(o.x + Math.cos(ang) * 4, o.y + Math.sin(ang) * 4); ctx.lineTo(o.x + Math.cos(ang) * (8 + 14 * p), o.y + Math.sin(ang) * (8 + 14 * p)); } ctx.stroke(); break;
        case "burst": ctx.fillStyle = o.col; for (let k = 0; k < 8; k++) { const ang = k * .785, d = 10 + 60 * p; ctx.beginPath(); ctx.arc(o.x + Math.cos(ang) * d, o.y - 30 + Math.sin(ang) * d, 5 * a + 1, 0, 6.283); ctx.fill(); } break;
        case "num": ctx.font = `bold ${(o.big ? 22 : 15) / zoom * 1.1}px system-ui`; ctx.textAlign = "center"; ctx.lineWidth = 3.5; ctx.strokeStyle = "#0c1128"; ctx.strokeText(o.txt, o.x, o.y - p * 34); ctx.fillStyle = o.col; ctx.fillText(o.txt, o.x, o.y - p * 34); break;
        default: break;
      }
      ctx.globalAlpha = 1;
    }
    function updateFx(dt) {
      for (let i = fx.length - 1; i >= 0; i--) { const o = fx[i]; o.t += dt; if (o.t >= o.life) fx.splice(i, 1); }
      for (const f of V.fighters) if (f.flash > 0 && role === "guest") f.flash -= dt;
      if (role === "guest") for (const f of V.fighters) { if (f._hp !== undefined && f.hp < f._hp - .5) f.flash = .15; f._hp = f.hp; }
    }
    function drawEdge(cx, cy, hw, hh) {
      const me = V.fighters[meIdx]; if (!me) return;
      const list = V.fighters.filter(f => f.alive && !isAlly(f, me)).map(f => ({f, d:Math.hypot(f.x - me.x, f.y - me.y)})).sort((a, b) => a.d - b.d).slice(0, 4);
      for (const {f} of list) {
        const sx = (f.x - cx) * zoom + W / 2, sy = (f.y - cy) * zoom + H / 2;
        if (sx > 14 && sx < W - 14 && sy > 14 && sy < H - 14) continue;
        const ang = Math.atan2(sy - H / 2, sx - W / 2), ex = clamp(W / 2 + Math.cos(ang) * W, 18, W - 18), ey = clamp(H / 2 + Math.sin(ang) * H, 18, H - 18);
        const t = Math.min((W / 2 - 18) / Math.abs(Math.cos(ang) || 1e-6), (H / 2 - 18) / Math.abs(Math.sin(ang) || 1e-6));
        const px = W / 2 + Math.cos(ang) * t, py = H / 2 + Math.sin(ang) * t;
        ctx.save(); ctx.translate(px, py); ctx.rotate(ang); ctx.fillStyle = FOE; ctx.strokeStyle = "#0c1128"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-8, -8); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        void ex; void ey;
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
    const HINTS = [[1, "move", "조이스틱 / WASD 로 움직여 보세요"], [6, "atk", "가까운 상대를 향해 공격! (큰 버튼 / 클릭 / Space)"], [14, "skill", "숫자 1~4 (또는 작은 버튼)으로 스킬을 써 보세요 — 2번은 이동기"], [30, "", "정수기·상자에서 체력을 채우세요"], [44, "", "프린터를 밟으면 폭발해요. 적을 유인해 보세요"]];
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
      comboEl.textContent = me.combo >= 3 && me.alive ? `${me.combo} COMBO` : "";
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
          f.inp.atk = msg.k ? 1 : 0;
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
    window.bwDebug = {get V() { return V; }, get match() { return match; }, cfg, begin, Core};
  }
})();
