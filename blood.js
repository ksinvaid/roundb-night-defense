/* 진화 블러드 v2 — 드론 영웅 + 자동 생성 군체 + 진화 선택 + 집결/돌격/후퇴.
   시뮬레이션은 blood.sim.js(BloodSim), 여기는 화면·입력·온라인(createArenaRoom) 담당. */
(() => {
  "use strict";
  const games = window.knx && window.knx.games, SIM = window.BloodSim;
  if (!games || !SIM || typeof window.roundbArenaScreen !== "function") return;
  try { main(); } catch (error) { console.error("진화 블러드를 시작하지 못했어요", error); }

  function main() {
    const {W, H, SP, UP, UPC, TEAM, BASE_R} = SIM;
    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    const store = (k, v) => { try { if (v === undefined) return localStorage.getItem("bd." + k); localStorage.setItem("bd." + k, v); } catch (e) {} return null; };
    const dialog = document.createElement("section");
    dialog.className = "brawl blood bd";
    window.roundbArenaScreen(dialog);
    dialog.innerHTML = `
      <header class="bd-head"><strong>진화 블러드</strong><button type="button" data-snd aria-pressed="true">소리 켬</button><button type="button" data-exit>나가기</button></header>
      <div class="bd-setup" data-setup><div class="bd-card">
        <small class="bd-eyebrow">군체 전략 · 한 판 최대 10분</small>
        <h2>진화 블러드</h2>
        <ol class="bd-sum">
          <li><b>목표</b><span>적 기지(번호 표시)를 모두 부수면 승리. 내 기지가 부서지면 패배예요.</span></li>
          <li><b>조작</b><span>조이스틱 / WASD = 드론 이동 · 맵 탭 = 집결 · 두 번 탭 = 돌격 · 후퇴 버튼</span></li>
          <li><b>성장</b><span>혈액으로 군체가 저절로 생겨요. 진화P로 새 종과 업그레이드를 골라요.</span></li>
        </ol>
        <div class="bd-opts">
          <label>규칙<select data-rule><option value="elim">엘리미네이션 · 기지를 모두 파괴 (최대 10분)</option><option value="time">타임어택 · 5분 점수 대결</option></select></label>
          <label>난이도<select data-diff><option value="0">쉬움 (연습)</option><option value="1">보통</option><option value="2">어려움</option></select></label>
          <label>상대 AI<select data-ai>${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => `<option value="${i}">${i}명</option>`).join("")}</select></label>
          <label class="bd-check"><input type="checkbox" data-hints> 첫 판 힌트 보기</label>
        </div>
        <button type="button" class="bd-go" data-go>바로 시작 · AI전</button>
        <p class="bd-note" data-msg role="status"></p>
        <details class="bd-online"><summary>친구와 온라인으로 하기</summary>
          <div class="bd-orow"><button type="button" data-host>방 만들기</button><label><input type="checkbox" data-public> 공개방</label></div>
          <div class="bd-orow"><input data-code maxlength="6" placeholder="초대 코드" aria-label="초대 코드" autocomplete="off"><button type="button" data-join>참가</button></div>
          <div class="bd-orow"><button type="button" class="bd-go" data-online-start hidden>온라인 경기 시작</button></div>
        </details>
      </div></div>
      <div class="bd-stage" data-stage hidden>
        <canvas class="bd-cv" data-cv aria-label="진화 블러드 전장"></canvas>
        <div class="bd-alertedge" data-edge></div>
        <div class="bd-res" data-res></div>
        <canvas class="bd-mini" data-mini width="300" height="200" aria-label="미니맵 (누르면 집결)"></canvas>
        <div class="bd-banner" data-banner role="status"></div>
        <div class="bd-hint" data-hint hidden></div>
        <div class="bd-stick" data-stick aria-label="드론 조이스틱"><i></i></div>
        <div class="bd-bar">
          <button type="button" data-cmd="rally"><b>집결</b><small>Space</small></button>
          <button type="button" data-cmd="charge"><b>돌격</b><small>F</small></button>
          <button type="button" data-cmd="retreat"><b>후퇴</b><small>B</small></button>
          <button type="button" data-cmd="follow"><b>따라와</b><small>V</small></button>
          <button type="button" class="bd-evo-btn" data-evo-open><b data-evo-label>진화</b><small>G</small></button>
        </div>
        <div class="bd-evo" data-evo hidden></div>
        <div class="bd-over" data-over hidden></div>
      </div>`;
    document.body.append(dialog);
    const $ = s => dialog.querySelector(s);
    const cv = $("[data-cv]"), ctx = cv.getContext("2d"), mini = $("[data-mini]"), mctx = mini.getContext("2d");
    const stage = $("[data-stage]"), setup = $("[data-setup]"), resEl = $("[data-res]"), bannerEl = $("[data-banner]"), hintEl = $("[data-hint]");
    const evoEl = $("[data-evo]"), overEl = $("[data-over]"), edgeEl = $("[data-edge]"), stickEl = $("[data-stick]");
    const msg = t => { $("[data-msg]").textContent = t || ""; };

    /* ---------- 그림 ---------- */
    const spImg = [], droneImg = [], spUrl = [];
    let artReady = false;
    function loadArt() {
      if (artReady || !(window.dgr && window.dgr.mobDataURL)) return;
      artReady = true;
      SP.forEach((s, i) => { const url = window.dgr.mobDataURL({shape: s.shape, c: s.col, c2: "#2b2438", elite: i === 7}, 96); spUrl[i] = url; const im = new Image(); im.src = url; spImg[i] = im; });
      TEAM.forEach((t, i) => { const im = new Image(); im.src = window.dgr.mobDataURL({shape: "drone", c: t.c, c2: "#1b2236"}, 96); droneImg[i] = im; });
    }
    function shapePath(c, shape, x, y, r) {
      c.beginPath();
      const poly = (n, rot, k = 1) => { for (let i = 0; i < n; i++) { const a = rot + i * 6.2832 / n; i ? c.lineTo(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k) : c.moveTo(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k); } c.closePath(); };
      switch (shape) {
        case "circle": c.arc(x, y, r, 0, 6.2832); break;
        case "tri": poly(3, -1.5708, 1.15); break;
        case "tridown": poly(3, 1.5708, 1.15); break;
        case "square": c.rect(x - r * .88, y - r * .88, r * 1.76, r * 1.76); break;
        case "diamond": poly(4, 0, 1.2); break;
        case "pent": poly(5, -1.5708, 1.05); break;
        case "hex": poly(6, 0, 1.05); break;
        case "star": for (let i = 0; i < 10; i++) { const a = -1.5708 + i * .6283, rr = i % 2 ? r * .5 : r * 1.2; i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); break;
        case "cross": { const q = r * .42, L = r * 1.05; c.moveTo(x - q, y - L); c.lineTo(x + q, y - L); c.lineTo(x + q, y - q); c.lineTo(x + L, y - q); c.lineTo(x + L, y + q); c.lineTo(x + q, y + q); c.lineTo(x + q, y + L); c.lineTo(x - q, y + L); c.lineTo(x - q, y + q); c.lineTo(x - L, y + q); c.lineTo(x - L, y - q); c.lineTo(x - q, y - q); c.closePath(); break; }
        default: c.arc(x, y, r, Math.PI / 2, Math.PI * 1.5); c.closePath();
      }
    }
    const badges = TEAM.map(t => {
      const b = document.createElement("canvas"); b.width = b.height = 32;
      const c = b.getContext("2d"); shapePath(c, t.s, 16, 16, 10); c.fillStyle = t.c; c.fill(); c.lineWidth = 3; c.strokeStyle = "#10151c"; c.stroke();
      return b;
    });
    const symSvg = i => { const t = TEAM[i], c = document.createElement("canvas"); c.width = c.height = 28; const g = c.getContext("2d"); shapePath(g, t.s, 14, 14, 9); g.fillStyle = t.c; g.fill(); g.lineWidth = 2; g.strokeStyle = "#10151c"; g.stroke(); return `<img class="bd-sym" alt="" src="${c.toDataURL()}">`; };

    /* ---------- 상태 ---------- */
    let sim = null, V = null, role = "", slot = 0, room = null, raf = 0, last = 0, lastPub = 0, lastHud = 0, lastMini = 0, matchOver = false;
    let perfMs = 0, evoOpen = false, evoSig = "", rewarded = "", lowfx = false, slowFrames = 0, fpsEma = .016, shake = 0, edgeUntil = 0, lastWarn = 0, lastKillSnd = 0, started = 0;
    const humans = new Set(), names = new Map(), fx = [], banners = [], cam = {x: W / 2, y: H / 2};
    const input = {kx: 0, ky: 0, jx: 0, jy: 0, sentX: 0, sentY: 0, sentT: 0}, keys = new Set();
    const hint = {on: false, moved: false, rally: false, charge: false, evo: false, shownAt: 0, idx: -1};
    let vw = {scale: .6, ox: 0, oy: 0, w: 1, h: 1};
    const myName = () => { let nick; try { nick = typeof window.knx.me === "function" ? window.knx.me()?.nick : window.knx.me?.nick; } catch (e) {} return String(nick || (typeof SAVE !== "undefined" && SAVE.nick) || "기사").slice(0, 12); };

    /* ---------- 소리 ---------- */
    let muted = store("mute") === "1";
    const syncSnd = () => { const b = $("[data-snd]"); b.textContent = muted ? "소리 끔" : "소리 켬"; b.setAttribute("aria-pressed", String(!muted)); };
    const snd = (n, gap) => { if (muted) return; try { if (typeof sfx === "function") sfx(n, gap || 0); } catch (e) {} };
    syncSnd();

    /* ---------- 옵션 저장 ---------- */
    const firstPlay = store("played") !== "1";
    $("[data-rule]").value = store("rule") || "elim";
    $("[data-diff]").value = store("diff") ?? (firstPlay ? "0" : "1");
    $("[data-ai]").value = store("ai") || "3";
    $("[data-hints]").checked = store("hints") === null ? true : store("hints") === "1";
    const opts = () => ({rule: $("[data-rule]").value, diff: +$("[data-diff]").value, ai: +$("[data-ai]").value, hints: $("[data-hints]").checked});
    const saveOpts = () => { const o = opts(); store("rule", o.rule); store("diff", String(o.diff)); store("ai", String(o.ai)); store("hints", o.hints ? "1" : "0"); };

    /* ---------- 배너 · 효과 ---------- */
    const nowS = () => performance.now() / 1000;
    function banner(text, kind, sec) { banners.push({text, kind: kind || "", until: nowS() + (sec || 3)}); if (banners.length > 3) banners.shift(); lastHud = 0; }
    function addFx(e) { if (fx.length > 200) fx.shift(); e.t0 = nowS(); fx.push(e); }
    const inView = (x, y, m = 80) => Math.abs(x - cam.x) < vw.w / 2 / vw.scale + m && Math.abs(y - cam.y) < vw.h / 2 / vw.scale + m;
    function alertBase() {
      const t = nowS();
      edgeUntil = t + 1.6; shake = Math.max(shake, 5);
      if (t - lastWarn > 6) { lastWarn = t; snd("warn"); banner("⚠ 기지가 공격받고 있어요!", "bad", 3.5); }
    }
    function onEvent(e) {
      switch (e.k) {
        case "die": if (!lowfx && inView(e.x, e.y)) addFx({k: "spark", x: e.x, y: e.y, c: TEAM[e.o].c, d: .4}); if (e.by === slot) { const t = nowS(); if (t - lastKillSnd > .25) { lastKillSnd = t; snd("kill", 120); } } break;
        case "shot": if (!lowfx && inView(e.x, e.y, 200)) addFx({k: "line", x: e.x, y: e.y, x2: e.x2, y2: e.y2, c: TEAM[e.o] ? TEAM[e.o].c : "#fff", d: .12, w: e.d ? 4 : 2.5}); break;
        case "ring": addFx({k: "ring", x: e.x, y: e.y, r: e.r, c: TEAM[e.o].c, d: .35}); break;
        case "boom": {
          const p = V.players[e.o];
          addFx({k: "burst", x: e.x, y: e.y, c: TEAM[e.o].c, d: 1.1});
          banner(`${p ? p.name : "기지"} 기지 파괴!${e.by === slot ? " (+진화P 4)" : ""}`, e.by === slot ? "good" : "", 4);
          if (inView(e.x, e.y, 600)) shake = Math.max(shake, 8);
          snd(e.o === slot ? "lose" : "skill");
          break;
        }
        case "bhit": if (e.o === slot) alertBase(); break;
        case "drone": if (e.o === slot) { banner("드론이 쓰러졌어요 · 7초 뒤 부활", "bad", 3); snd("roar"); } addFx({k: "burst", x: e.x, y: e.y, c: TEAM[e.o].c, d: .6}); break;
        case "dback": if (e.o === slot) banner("드론 부활!", "good", 2); break;
        case "node": addFx({k: "ring", x: e.x, y: e.y, r: 140, c: TEAM[e.o].c, d: .8}); if (e.o === slot) { banner("거점 점령! 혈액·군체 한도 증가", "good", 3); snd("coin"); } break;
        case "evo": case "up": if (e.o === slot) snd("up"); break;
      }
    }

    /* ---------- 명령 ---------- */
    function send(m) {
      if (role === "guest") room && room.input(m);
      else if (sim) SIM.issue(sim, slot, m);
    }
    function order(kind, x, y, quiet) {
      if (!V || V.done) return;
      const me = V.players[slot];
      if (!me || !me.alive) return;
      const m = {k: "order", o: kind};
      if (Number.isFinite(x) && Number.isFinite(y)) { m.x = Math.round(x); m.y = Math.round(y); }
      send(m);
      if (kind === "rally") hint.rally = true;
      if (kind === "charge") hint.charge = true;
      const px = Number.isFinite(x) ? x : (kind === "retreat" ? me.bx : me.dx), py = Number.isFinite(y) ? y : (kind === "retreat" ? me.by : me.dy);
      if (kind !== "follow" && !quiet) addFx({k: "ring", x: px, y: py, r: kind === "charge" ? 90 : 60, c: kind === "charge" ? "#ff8a78" : kind === "retreat" ? "#8cc8ff" : "#9ae6cc", d: .5});
      snd("click");
      dialog.querySelectorAll("[data-cmd]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.cmd === kind)));
    }
    const orderHere = kind => { const me = V && V.players[slot]; if (!me) return; if (kind === "rally") order("rally", me.da ? me.dx : me.bx, me.da ? me.dy : me.by); else if (kind === "charge") order("charge"); else order(kind); };
    function toggleEvo(open) {
      evoOpen = open ?? !evoOpen;
      evoEl.hidden = !evoOpen; evoSig = "";
      if (evoOpen) { hint.evo = true; renderEvo(true); }
    }
    function renderEvo(force) {
      const me = V && V.players[slot];
      if (!evoOpen || !me) return;
      const sig = [me.ep, me.un.join(""), me.on.join(""), me.up.join("")].join("|");
      if (!force && sig === evoSig) return;
      evoSig = sig;
      let h = `<div class="bd-evo-h"><b>진화 선택</b><em>진화P ${me.ep}</em><small>${role === "solo" ? "고르는 동안 시간이 느려져요 · " : ""}종 카드를 누르면 생산을 켜고 꺼요</small><button type="button" data-evo-close>닫기</button></div><div class="bd-spg">`;
      SP.forEach((s, i) => {
        const un = me.un[i], on = me.on[i], can = !un && me.ep >= s.ep, st = un ? (on ? "on" : "off") : can ? "can" : "lock";
        h += `<button type="button" class="bd-spc ${st}" data-sp="${i}" aria-pressed="${!!(un && on)}"><img alt="" src="${spUrl[i] || ""}"><b>${s.n}</b><small>혈액 ${s.cost}</small><small class="bd-info">${s.info}</small><i>${un ? (on ? "● 생산 중" : "○ 꺼짐") : `해금 ${s.ep}P`}</i></button>`;
      });
      h += `</div><div class="bd-tree">`;
      UP.forEach((u, b) => {
        h += `<div class="bd-br"><b>${u.n}</b>`;
        for (let l = 0; l < 3; l++) {
          const own = me.up[b] > l, next = me.up[b] === l, can = next && me.ep >= UPC[l];
          h += `<button type="button" data-up="${b}" class="${own ? "own" : next ? (can ? "can" : "next") : "lock"}" ${next ? "" : "disabled"}>${u.lv[l]}<i>${own ? "완료" : UPC[l] + "P"}</i></button>`;
        }
        h += `</div>`;
      });
      evoEl.innerHTML = h + `</div>`;
    }

    /* ---------- 시작 · 종료 ---------- */
    function stopLoop() { cancelAnimationFrame(raf); raf = 0; }
    function showStage(on) { setup.hidden = on; stage.hidden = !on; }
    function resetMatchUi() {
      fx.length = 0; banners.length = 0; shake = 0; edgeUntil = 0; evoOpen = false; evoEl.hidden = true; evoSig = ""; overEl.hidden = true; matchOver = false;
      lastHud = 0; keys.clear(); input.kx = input.ky = input.jx = input.jy = 0; input.sentX = input.sentY = 0;
      hint.moved = hint.rally = hint.charge = hint.evo = false; hint.idx = -1; hint.shownAt = 0;
      dialog.querySelectorAll("[data-cmd]").forEach(b => b.setAttribute("aria-pressed", "false"));
    }
    function begin(solo) {
      loadArt();
      const o = opts(); saveOpts();
      resetMatchUi();
      const hs = [0, ...humans].sort((a, b) => a - b);
      const n = solo ? o.ai + 1 : Math.max(o.ai + 1, Math.max(...hs) + 1, hs.length + 1);
      const nm = []; hs.forEach(i => { nm[i] = i === 0 ? myName() : names.get(i) || ("플레이어 " + (i + 1)); });
      const mid = Math.floor(Math.random() * 1e9);
      sim = SIM.create({n: Math.min(10, n), diff: o.diff, rule: o.rule, humans: hs, names: nm, mid});
      V = sim; slot = 0; role = solo ? "solo" : "host"; started = nowS(); rewarded = "";
      hint.on = o.hints; cam.x = sim.players[0].bx; cam.y = sim.players[0].by;
      showStage(true); msg("");
      banner(`시작! 적 기지 ${sim.n - 1}개 · ${o.rule === "elim" ? "모두 부수면 승리" : "5분 안에 최고 점수"}`, "good", 4);
      last = performance.now(); lastPub = 0;
      stopLoop(); raf = requestAnimationFrame(frame);
    }
    function toSetup(text) {
      stopLoop(); sim = null; V = null; resetMatchUi(); showStage(false);
      if (role === "solo") role = "";
      $("[data-go]").hidden = role === "guest";
      $("[data-online-start]").hidden = role !== "host";
      msg(text || "");
    }
    function giveReward(quit) {
      if (!V) return null;
      const key = "blood:" + V.mid;
      if (rewarded === key) return null;
      rewarded = key;
      const R = window.knx && window.knx.reward;
      if (!R || typeof R.grant !== "function") return null;
      const secs = Math.round(V.time), rk = V.rank && V.rank.length ? V.rank : V.players.map(p => p.id).sort((a, b) => V.players[b].kills - V.players[a].kills);
      const place = quit ? V.n : rk.indexOf(slot) + 1, hum = V.players.filter(p => !p.ai).length;
      const score = V.score && V.score[slot] != null ? V.score[slot] : SIM.scoreOf(V.players[slot], V.players[slot].nodes || 0);
      try { return R.grant("blood", {win: !quit && place === 1, place, players: V.n, score, online: role !== "solo", humans: Math.max(1, hum), secs, quit: !!quit, once: key}); } catch (e) { return null; }
    }
    function abandon() {
      if (V && !V.done && !matchOver && started && role) { try { giveReward(true); } catch (e) {} }
    }
    function finishMatch() {
      if (matchOver) return;
      matchOver = true; store("played", "1");
      const me = V.players[slot], rk = V.rank, place = rk.indexOf(slot) + 1, win = place === 1;
      const r = giveReward(false);
      snd(win ? "win" : "lose");
      const rows = rk.map((id, i) => { const p = V.players[id]; return `<tr class="${id === slot ? "me" : ""}"><td>${i + 1}</td><td>${symSvg(id)}${esc(p.name)}${id === slot ? " (나)" : ""}</td><td>${V.score[id]}</td><td>${p.kills}</td><td>${p.destroyed}</td><td>${p.alive ? "생존" : "탈락"}</td></tr>`; }).join("");
      const title = win ? "승리!" : me.alive ? `시간 종료 · ${place}위` : `패배 · ${place}위`;
      const sub = V.rule === "time" ? "타임어택 · 점수 = 기지 파괴 500 + 처치 2 + 거점 30 + 생존 300" : win && V.players.filter(p => p.alive).length === 1 ? "모든 적 기지를 부쉈어요" : "점수 = 기지 파괴 500 + 처치 2 + 거점 30 + 생존 300";
      const rp = r ? `+${r.rp} RP${r.parts && r.parts.length ? " (" + r.parts.map(p => `${p.label} +${p.rp}`).join(" · ") + ")" : ""}` : "";
      overEl.dataset.out = win ? "win" : "loss";
      overEl.innerHTML = `<div><h2>${title}</h2><p>${sub}</p><div class="bd-rp">${rp}</div><table><thead><tr><th>순위</th><th>이름</th><th>점수</th><th>처치</th><th>기지 파괴</th><th>상태</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="bd-three">${role === "guest" ? `<button type="button" disabled>방장이 다시 시작해요</button>` : `<button type="button" data-again>다시 하기</button>`}<button type="button" data-setup-back>설정 바꾸기</button><button type="button" data-leave>나가기</button></div></div>`;
      overEl.hidden = false; evoEl.hidden = true; evoOpen = false;
      const again = overEl.querySelector("[data-again]") || overEl.querySelector("[data-setup-back]"); again && again.focus();
    }
    const esc = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));

    /* ---------- 온라인 ---------- */
    function disconnect() {
      stopLoop(); if (room) { try { room.close(); } catch (e) {} } room = null; role = ""; slot = 0; sim = null; V = null; humans.clear(); names.clear();
      resetMatchUi(); showStage(false);
      $("[data-go]").hidden = false; $("[data-online-start]").hidden = true;
    }
    function connect(next) {
      disconnect(); role = next; msg("연결 중…"); $(".bd-online").open = true;
      if (typeof createArenaRoom !== "function") { role = ""; msg("온라인 연결을 쓸 수 없어요."); return; }
      room = createArenaRoom("blood", {
        error(text) { disconnect(); msg(text); },
        ready(id, code) {
          slot = id;
          if (id) { room.input({k: "identity", name: myName()}); msg("방장이 시작하기를 기다리는 중이에요"); $("[data-go]").hidden = true; }
          else { msg("초대 코드 " + code + " · 친구가 들어오면 [온라인 경기 시작]을 누르세요"); $("[data-online-start]").hidden = false; }
        },
        accept: () => !sim || sim.done,
        join(id) { humans.add(id); msg(`현재 ${humans.size + 1}명이 모였어요 · 시작하면 남은 자리는 AI가 채워요`); },
        leave(id) {
          humans.delete(id);
          if (sim && !sim.done && sim.players[id]) { const p = sim.players[id]; p.ai = true; p.persona = id % 3; p.name = p.name + "(AI)"; p.aiT = sim.time + 1; p.sx = p.sy = 0; }
          if (!sim) msg(`현재 ${humans.size + 1}명이 모였어요`);
        },
        input(id, m) {
          if (!m) return;
          if (m.k === "identity") { if (typeof m.name === "string") names.set(id, m.name.trim().slice(0, 12) || "기사"); return; }
          if (sim) SIM.issue(sim, id, m);
        },
        state: applySnap
      });
      if (role === "host") room.host({listed: $("[data-public]").checked}); else room.join($("[data-code]").value);
    }

    /* ---------- 손님: 스냅샷 적용 ---------- */
    function applySnap(s) {
      try {
        if (!s || !Array.isArray(s.pl) || !Array.isArray(s.un)) return;
        if (s.v !== 4) { disconnect(); msg("방장도 새로고침한 뒤 다시 입장해 주세요."); return; }
        const first = !V || V.mid !== s.mid, prev = first ? null : V, n = s.n, bases = SIM.layout(n);
        if (first) {
          if (V && !V.done) abandon();
          resetMatchUi(); loadArt(); started = nowS(); rewarded = ""; fx.length = 0;
          hint.on = $("[data-hints]").checked; showStage(true); msg("");
          banner(`시작! 적 기지 ${n - 1}개`, "good", 3);
          last = performance.now();
        }
        const t = s.t, pls = s.pl.map((a, i) => {
          const old = prev && prev.players[i];
          const p = old || {id: i, bx: bases[i].x, by: bases[i].y, dx: a[0], dy: a[1], dfl: 0, dmax: 100, nodes: 0, pop: 0};
          const wasAlive = old ? old.alive : true, wasDa = old ? old.da : true, wasHit = old ? old.hitFlag : 0;
          Object.assign(p, {name: s.nm[i], ai: s.ai[i] > 0, persona: s.ai[i] - 1, tdx: a[0], tdy: a[1], da: a[2] > 0, dhp: a[2], dres: t + a[3], bhp: a[4], kills: a[5], destroyed: a[6], alive: !!a[7],
            bio: a[8], ep: a[9], un: SIM.unmask(a[10]), on: SIM.unmask(a[11]), up: [(a[12] / 100) | 0, ((a[12] / 10) | 0) % 10, a[12] % 10],
            ord: {k: SIM.KIND[a[13]] || "rally", x: a[14], y: a[15]}, bmax: a[16], hitFlag: a[17], hitT: a[17] ? t : -99, deaths: a[18]});
          if (old) {
            if (wasAlive && !p.alive) onEvent({k: "boom", o: i, x: p.bx, y: p.by, by: -1});
            if (wasDa && !p.da && p.alive) onEvent({k: "drone", o: i, x: p.dx, y: p.dy});
            if (!wasDa && p.da) onEvent({k: "dback", o: i});
            if (i === slot && a[17] && !wasHit) alertBase();
          }
          return p;
        });
        const oldMap = prev ? prev.umap : new Map(), umap = new Map(), units = [];
        for (let i = 0; i < s.un.length; i += 4) {
          const id = s.un[i], pk = s.un[i + 3], ot = (pk / 100) | 0, hp = pk % 100;
          let u = oldMap.get(id);
          if (!u) u = {id, o: (ot / 8) | 0, t: ot % 8, x: s.un[i + 1], y: s.un[i + 2], hp, mx: 99, fl: 0};
          else if (hp < u.hp) u.fl = .14;
          u.tx = s.un[i + 1]; u.ty = s.un[i + 2]; u.hp = hp; u.mx = 99;
          umap.set(id, u); units.push(u);
        }
        if (prev && !lowfx) { let c = 0; for (const [id, u] of oldMap) if (!umap.has(id) && c++ < 24 && inView(u.x, u.y)) addFx({k: "spark", x: u.x, y: u.y, c: TEAM[u.o].c, d: .4}); }
        const defs = prev ? prev.nodeDefs : SIM.layoutNodes(n, bases), nodes = defs.map((d, i) => {
          const o = s.nd[i * 3];
          if (prev && d.o !== o && o >= 0) onEvent({k: "node", o, x: d.x, y: d.y});
          d.o = o; d.co = s.nd[i * 3 + 1]; d.pr = s.nd[i * 3 + 2] / 100;
          return d;
        });
        for (const p of pls) { p.pop = 0; p.nodes = 0; }
        for (const u of units) pls[u.o] && pls[u.o].pop++;
        for (const d of nodes) if (d.o >= 0 && pls[d.o]) pls[d.o].nodes++;
        const ru = s.ru ? "time" : "elim";
        V = {guest: true, mid: s.mid, time: t, done: !!s.d, winner: s.w, n, rule: ru, limit: ru === "time" ? 300 : 600, diff: s.df, players: pls, units, umap, nodes, nodeDefs: defs, rank: s.rk || [], score: s.sc || []};
        if (!raf && !matchOver) { last = performance.now(); raf = requestAnimationFrame(frame); }
        if (V.done && !matchOver) finishMatch();
      } catch (error) { console.error("blood snapshot", error); }
    }

    /* ---------- 입력 ---------- */
    function inputVec() {
      let x = input.kx, y = input.ky;
      if (!x && !y) { x = input.jx; y = input.jy; }
      return [x, y];
    }
    function applySteer(now) {
      const [x, y] = inputVec();
      if (x || y) hint.moved = true;
      if (role === "guest") {
        const changed = Math.abs(x - input.sentX) > .08 || Math.abs(y - input.sentY) > .08;
        if (changed && now - input.sentT > 60 || ((x || y) && now - input.sentT > 400)) { room && room.input({k: "steer", x: +x.toFixed(2), y: +y.toFixed(2)}); input.sentX = x; input.sentY = y; input.sentT = now; }
      } else if (sim) { const p = sim.players[slot]; if (p) { p.sx = x; p.sy = y; } }
    }
    const worldPt = e => { const r = cv.getBoundingClientRect(); return {x: ((e.clientX - r.left) - vw.ox) / vw.scale, y: ((e.clientY - r.top) - vw.oy) / vw.scale}; };
    let tapDown = null, lastTap = null;
    function tapAt(wx, wy, sx, sy, ts) {
      wx = clamp(wx, 20, W - 20); wy = clamp(wy, 20, H - 20);
      if (lastTap && ts - lastTap.t < 380 && Math.hypot(sx - lastTap.x, sy - lastTap.y) < 46) { lastTap = null; order("charge", wx, wy); }
      else { lastTap = {t: ts, x: sx, y: sy}; order("rally", wx, wy); }
    }
    cv.addEventListener("contextmenu", e => e.preventDefault());
    cv.addEventListener("pointerdown", e => {
      if (!V || V.done) return;
      if (e.pointerType === "mouse" && e.button === 2) { const p = worldPt(e); order("charge", clamp(p.x, 20, W - 20), clamp(p.y, 20, H - 20)); return; }
      if (e.button !== 0) return;
      tapDown = {x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId};
    });
    cv.addEventListener("pointerup", e => {
      if (!tapDown || tapDown.id !== e.pointerId) return;
      const d = tapDown; tapDown = null;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 14 || e.timeStamp - d.t > 600) return;
      const p = worldPt(e); tapAt(p.x, p.y, e.clientX, e.clientY, e.timeStamp);
    });
    cv.addEventListener("pointercancel", () => { tapDown = null; });
    mini.addEventListener("pointerdown", e => {
      if (!V || V.done) return;
      e.preventDefault();
      const r = mini.getBoundingClientRect(), wx = (e.clientX - r.left) / r.width * W, wy = (e.clientY - r.top) / r.height * H;
      tapAt(wx, wy, e.clientX + 5000, e.clientY, e.timeStamp);
    });
    // 조이스틱
    let stickId = null;
    function stickMove(e) {
      const r = stickEl.getBoundingClientRect(), R = r.width / 2 - 8, dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / R);
      input.jx = dx / d * k; input.jy = dy / d * k;
      const knob = stickEl.firstElementChild; knob.style.transform = `translate(${input.jx * R}px, ${input.jy * R}px)`;
    }
    stickEl.addEventListener("pointerdown", e => { e.preventDefault(); stickId = e.pointerId; stickEl.setPointerCapture(e.pointerId); stickMove(e); });
    stickEl.addEventListener("pointermove", e => { if (e.pointerId === stickId) stickMove(e); });
    const stickEnd = e => { if (e.pointerId !== stickId) return; stickId = null; input.jx = input.jy = 0; stickEl.firstElementChild.style.transform = ""; };
    stickEl.addEventListener("pointerup", stickEnd); stickEl.addEventListener("pointercancel", stickEnd);
    // 키보드
    const MOVE = {KeyW: "u", KeyA: "l", KeyS: "d", KeyD: "r", ArrowUp: "u", ArrowLeft: "l", ArrowDown: "d", ArrowRight: "r"};
    const syncKeys = () => { input.kx = (keys.has("r") ? 1 : 0) - (keys.has("l") ? 1 : 0); input.ky = (keys.has("d") ? 1 : 0) - (keys.has("u") ? 1 : 0); };
    window.addEventListener("keydown", e => {
      if (!dialog.open || !V || (e.target.matches && e.target.matches("input,select,textarea"))) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const mv = MOVE[e.code];
      if (mv) { e.preventDefault(); e.stopImmediatePropagation(); keys.add(mv); syncKeys(); return; }
      const done = fn => { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) fn(); };
      if (e.code === "Space") done(() => orderHere("rally"));
      else if (e.code === "KeyF") done(() => orderHere("charge"));
      else if (e.code === "KeyB") done(() => orderHere("retreat"));
      else if (e.code === "KeyV") done(() => orderHere("follow"));
      else if (e.code === "KeyG") done(() => toggleEvo());
      else if (e.code === "Escape" && evoOpen) done(() => toggleEvo(false));
    }, true);
    window.addEventListener("keyup", e => { const mv = MOVE[e.code]; if (mv && keys.delete(mv)) syncKeys(); }, true);
    window.addEventListener("blur", () => { keys.clear(); syncKeys(); });

    /* ---------- 프레임 ---------- */
    function frame(now) {
      raf = 0;
      try {
        if (!V) return;
        const dt = Math.min(.05, (now - last) / 1000); last = now;
        fpsEma += ((now - (frame.prev || now)) / 1000 - fpsEma) * .05; frame.prev = now;
        if (!lowfx && fpsEma > .03 && ++slowFrames > 120) { lowfx = true; }
        applySteer(now);
        if (role !== "guest") {
          const scale = role === "solo" && evoOpen ? .25 : 1;
          SIM.step(sim, dt * scale);
          for (const e of sim.ev) onEvent(e);
          sim.ev.length = 0;
          if (role === "host" && room && (now - lastPub > 100 || sim.done)) { room.publish(SIM.snapshot(sim)); lastPub = now; if (sim.done) setTimeout(() => { try { room && sim && room.publish(SIM.snapshot(sim)); } catch (e) {} }, 400); }
        } else smooth(dt);
        // 카메라
        const me = V.players[slot], k = 1 - Math.exp(-dt * 6);
        if (me && me.alive) {
          const tx = me.da ? me.dx : me.bx, ty = me.da ? me.dy : me.by;
          cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
        } else { const [vx, vy] = inputVec(); cam.x = clamp(cam.x + vx * 700 * dt, 0, W); cam.y = clamp(cam.y + vy * 700 * dt, 0, H); }
        const d0 = performance.now(); draw(now / 1000, dt); perfMs += (performance.now() - d0 - perfMs) * .1;
        if (now - lastHud > 160) { lastHud = now; hud(now); renderEvo(false); }
        if (now - lastMini > 100) { lastMini = now; drawMini(); }
        if (V.done && !matchOver) finishMatch();
        else if (me && !me.alive && V.players.every(p => p.ai || !p.alive) && !V.done) { /* 곧 sim 이 종료 처리 */ }
      } catch (error) {
        console.error("blood frame", error); stopLoop();
        toSetup("경기를 진행하지 못했어요. 다시 시작해 주세요.");
        return;
      }
      if (V && !V.done) raf = requestAnimationFrame(frame);
    }
    function smooth(dt) {
      const k = 1 - Math.exp(-dt * 14);
      for (const u of V.units) { u.x += (u.tx - u.x) * k; u.y += (u.ty - u.y) * k; if (u.fl > 0) u.fl -= dt; }
      for (const p of V.players) { p.dx += (p.tdx - p.dx) * k; p.dy += (p.tdy - p.dy) * k; }
    }

    /* ---------- HUD ---------- */
    function hud() {
      const me = V.players[slot];
      if (!me) return;
      const t = nowS();
      while (banners.length && banners[0].until < t) banners.shift();
      const bh = banners.map(b => `<div class="${b.kind}">${esc(b.text)}</div>`).join("");
      if (bannerEl.innerHTML !== bh) bannerEl.innerHTML = bh;
      const left = Math.max(0, Math.ceil(V.limit - V.time)), cap = SIM.capOf(me.up, me.nodes, V.n);
      const foes = V.players.filter(p => p.id !== slot && p.alive).length, pct = Math.max(0, Math.round(me.bhp / me.bmax * 100));
      const total = V.nodes.length, hot = t < edgeUntil;
      const chip = (cls, l, v) => `<span class="bd-chip ${cls}"><small>${l}</small><b>${v}</b></span>`;
      const income = SIM.incomeOf(me.nodes, 1).toFixed(1);
      const h = chip(left <= 30 ? "warn" : "", "남은 시간", `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`) + chip("bio", "혈액", `${Math.floor(me.bio)} (+${income}/초)`) + chip("ep", "진화P", me.ep) +
        chip(me.pop >= cap ? "warn" : "", "군체", `${me.pop}/${cap}`) + chip(pct < 35 || hot ? "warn" : "", "내 기지", `${me.alive ? pct + "%" : "파괴됨"}`) + chip("", "거점", `${me.nodes}/${total}`) + chip("", "남은 적 기지", foes) + chip("", "처치", me.kills);
      if (resEl.innerHTML !== h) resEl.innerHTML = h;
      edgeEl.classList.toggle("on", hot);
      // 진화 버튼
      let can = false;
      if (me.alive) { for (let i = 0; i < 8; i++) if (!me.un[i] && me.ep >= SP[i].ep) can = true; for (let b = 0; b < 3; b++) if (me.up[b] < 3 && me.ep >= UPC[me.up[b]]) can = true; }
      const eb = $(".bd-evo-btn"); eb.classList.toggle("ready", can && !evoOpen);
      $("[data-evo-label]").textContent = can ? `진화 ◆${me.ep}` : "진화";
      // 힌트
      let text = "";
      if (hint.on && !V.done && V.time < 150) {
        if (!hint.moved) text = "조이스틱(PC는 WASD)으로 드론을 움직여 보세요";
        else if (!hint.rally) text = "맵을 한 번 탭하면 군체가 그 자리에 모여요 (집결)";
        else if (!hint.charge) text = "맵을 두 번 탭하면 돌격! 적 기지를 부수면 승리예요";
        else if (!hint.evo && can) text = "진화P가 모였어요! [진화] 버튼으로 새 종을 해금해 보세요";
      }
      if (text) { if (hintEl.textContent !== text) hintEl.textContent = text; hintEl.hidden = false; } else hintEl.hidden = true;
    }

    /* ---------- 그리기 ---------- */
    function txt(s, x, y, size, color, align) {
      ctx.font = `800 ${size}px system-ui, sans-serif`; ctx.textAlign = align || "center"; ctx.lineWidth = Math.max(2, size / 6); ctx.strokeStyle = "#0b1316"; ctx.lineJoin = "round";
      ctx.strokeText(s, x, y); ctx.fillStyle = color; ctx.fillText(s, x, y);
    }
    function bar(x, y, w, hh, ratio, color) {
      ctx.fillStyle = "#0b1316"; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, hh + 2);
      ctx.fillStyle = color; ctx.fillRect(x - w / 2, y, w * clamp(ratio, 0, 1), hh);
    }
    function draw(t, dt) {
      const w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      const dpr = lowfx ? 1 : Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const scale = clamp(w / 1000, .5, 1.25), hw = w / (2 * scale), hh = h / (2 * scale);
      cam.x = clamp(cam.x, Math.min(hw, W / 2), Math.max(W - hw, W / 2)); cam.y = clamp(cam.y, Math.min(hh, H / 2), Math.max(H - hh, H / 2));
      shake = Math.max(0, shake - dt * 22);
      const shx = shake ? (Math.random() - .5) * shake : 0, shy = shake ? (Math.random() - .5) * shake : 0;
      const ox = w / 2 - cam.x * scale + shx, oy = h / 2 - cam.y * scale + shy;
      vw = {scale, ox, oy, w, h};
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = "#0b1316"; ctx.fillRect(0, 0, w, h);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
      ctx.fillStyle = "#1a2c2e"; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "#ffffff12"; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = Math.max(0, Math.floor((cam.x - hw) / 200) * 200); x <= Math.min(W, cam.x + hw); x += 200) { ctx.moveTo(x, Math.max(0, cam.y - hh)); ctx.lineTo(x, Math.min(H, cam.y + hh)); }
      for (let y = Math.max(0, Math.floor((cam.y - hh) / 200) * 200); y <= Math.min(H, cam.y + hh); y += 200) { ctx.moveTo(Math.max(0, cam.x - hw), y); ctx.lineTo(Math.min(W, cam.x + hw), y); }
      ctx.stroke();
      ctx.strokeStyle = "#4b7a78"; ctx.lineWidth = 10; ctx.strokeRect(0, 0, W, H);
      const vis = (x, y, m) => x > cam.x - hw - m && x < cam.x + hw + m && y > cam.y - hh - m && y < cam.y + hh + m;
      const players = V.players;
      // 기지 영역
      if (!lowfx) for (const p of players) {
        if (!p.alive || !vis(p.bx, p.by, 300)) continue;
        const g = ctx.createRadialGradient(p.bx, p.by, 20, p.bx, p.by, 300); g.addColorStop(0, TEAM[p.id].c + "30"); g.addColorStop(1, TEAM[p.id].c + "00");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.bx, p.by, 300, 0, 6.2832); ctx.fill();
      }
      // 거점(바이오 샘)
      for (const nd of V.nodes) {
        if (!vis(nd.x, nd.y, 160)) continue;
        const col = nd.o >= 0 ? TEAM[nd.o].c : "#9fb3b0";
        ctx.fillStyle = col + "22"; ctx.beginPath(); ctx.arc(nd.x, nd.y, 120, 0, 6.2832); ctx.fill();
        ctx.setLineDash([16, 12]); ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.stroke(); ctx.setLineDash([]);
        if (nd.pr > 0 && nd.co >= 0) { ctx.strokeStyle = TEAM[nd.co].c; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(nd.x, nd.y, 120, -1.5708, -1.5708 + 6.2832 * nd.pr); ctx.stroke(); }
        shapePath(ctx, "diamond", nd.x, nd.y, 22); ctx.fillStyle = nd.o >= 0 ? col : "#33423f"; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = "#0b1316"; ctx.stroke();
        txt("거점", nd.x, nd.y + 50, Math.max(18, 12 / scale), "#dff", "center");
        if (nd.o >= 0) { ctx.drawImage(badges[nd.o], nd.x - 16, nd.y - 62, 32, 32); }
      }
      // 기지
      const lsz = Math.max(20, 12 / scale);
      for (const p of players) {
        if (!vis(p.bx, p.by, 120)) continue;
        const col = p.alive ? TEAM[p.id].c : "#6a6f74";
        ctx.fillStyle = p.alive ? "#15262a" : "#24262a"; ctx.beginPath(); ctx.rect(p.bx - BASE_R, p.by - BASE_R, BASE_R * 2, BASE_R * 2); ctx.fill();
        ctx.lineWidth = 7; ctx.strokeStyle = col; ctx.stroke();
        shapePath(ctx, TEAM[p.id].s, p.bx, p.by - 6, 24); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = "#0b1316"; ctx.stroke();
        txt(String(p.id + 1), p.bx, p.by + 34, 24, "#fff");
        txt((p.id === slot ? "나 · " : "") + p.name, p.bx, p.by + 54 + lsz + 10, lsz, p.alive ? "#fff" : "#9aa", "center");
        if (p.alive) { bar(p.bx, p.by + 54, 100, 9, p.bhp / p.bmax, p.bhp / p.bmax < .35 ? "#ff6a5a" : "#8be6c4"); }
        else { ctx.strokeStyle = "#cfd6d9"; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(p.bx - 36, p.by - 36); ctx.lineTo(p.bx + 36, p.by + 36); ctx.moveTo(p.bx + 36, p.by - 36); ctx.lineTo(p.bx - 36, p.by + 36); ctx.stroke(); }
        if (p.alive && V.time - p.hitT < 1.2) { ctx.strokeStyle = "#ff4a3a"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(p.bx, p.by, BASE_R + 18 + Math.sin(t * 18) * 5, 0, 6.2832); ctx.stroke(); }
      }
      // 내 명령 표시
      const me = players[slot];
      if (me && me.alive) {
        const o = me.ord;
        if (o.k === "rally" || o.k === "charge") {
          const col = o.k === "charge" ? "#ff8a78" : "#9ae6cc", r = 40 + Math.sin(t * 5) * 4;
          ctx.setLineDash([12, 9]); ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
          if (o.k === "charge") { ctx.beginPath(); ctx.moveTo(o.x - 18, o.y - 18); ctx.lineTo(o.x + 18, o.y + 18); ctx.moveTo(o.x + 18, o.y - 18); ctx.lineTo(o.x - 18, o.y + 18); ctx.stroke(); }
          txt(o.k === "charge" ? "돌격" : "집결", o.x, o.y - r - 8, lsz, col);
        } else if (o.k === "retreat") txt("후퇴 중", me.bx, me.by - 92, lsz, "#8cc8ff");
      }
      // 유닛
      const bs = clamp(13 / scale, 12, 26), hpw = 30, hh2 = clamp(4 / scale, 4, 8);
      const time = V.time;
      for (const u of V.units) {
        if (!vis(u.x, u.y, 70)) continue;
        const sp = SP[u.t], s = sp.size, tm = TEAM[u.o], img = spImg[u.t];
        ctx.strokeStyle = tm.c; ctx.lineWidth = u.o === slot ? 4 : 3; ctx.beginPath(); ctx.ellipse(u.x, u.y + s * .26, s * .36, s * .14, 0, 0, 6.2832); ctx.stroke();
        const bob = Math.sin(time * 9 + u.id) * 1.5;
        if (img && img.complete && img.naturalWidth) ctx.drawImage(img, u.x - s / 2, u.y - s * .82 + bob, s, s);
        else { ctx.fillStyle = sp.col; ctx.beginPath(); ctx.arc(u.x, u.y - s * .3, s * .32, 0, 6.2832); ctx.fill(); }
        if (u.fl > 0) { ctx.globalAlpha = Math.min(.6, u.fl * 4); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(u.x, u.y - s * .3, s * .34, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1; }
        ctx.drawImage(badges[u.o], u.x - bs / 2, u.y - s * .82 - bs * .75, bs, bs);
        if (u.hp < u.mx * .995) bar(u.x, u.y + s * .34, hpw, hh2, u.hp / u.mx, u.o === slot ? "#8be6c4" : "#ff8d7a");
      }
      // 드론
      for (const p of players) {
        if (!p.alive || !p.da || !vis(p.dx, p.dy, 90)) continue;
        const mine = p.id === slot, s = 66, img = droneImg[p.id];
        ctx.fillStyle = "#0b131688"; ctx.beginPath(); ctx.ellipse(p.dx, p.dy + 24, 22, 9, 0, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = TEAM[p.id].c; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(p.dx, p.dy + 18, 28, 12, 0, 0, 6.2832); ctx.stroke();
        if (mine) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.dx, p.dy, 36 + Math.sin(t * 6) * 3, 0, 6.2832); ctx.stroke(); }
        const hover = Math.sin(t * 7 + p.id) * 3;
        if (img && img.complete && img.naturalWidth) ctx.drawImage(img, p.dx - s / 2, p.dy - s * .62 + hover, s, s);
        else { ctx.fillStyle = TEAM[p.id].c; ctx.beginPath(); ctx.arc(p.dx, p.dy, 18, 0, 6.2832); ctx.fill(); }
        ctx.drawImage(badges[p.id], p.dx - bs / 2, p.dy - s * .62 - bs, bs, bs);
        bar(p.dx, p.dy + 32, 46, hh2 + 1, p.dhp / p.dmax, mine ? "#8be6c4" : "#ff8d7a");
        if (mine) txt("나(드론)", p.dx, p.dy - 56, lsz, "#fff");
      }
      // 효과
      const nt = nowS();
      for (let i = fx.length - 1; i >= 0; i--) {
        const e = fx[i], a = (nt - e.t0) / e.d;
        if (a >= 1) { fx.splice(i, 1); continue; }
        ctx.globalAlpha = 1 - a;
        if (e.k === "ring") { ctx.strokeStyle = e.c; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (.3 + a * .7), 0, 6.2832); ctx.stroke(); }
        else if (e.k === "line") { ctx.strokeStyle = e.c; ctx.lineWidth = e.w; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x2, e.y2); ctx.stroke(); }
        else if (e.k === "spark") { ctx.fillStyle = e.c; for (let j = 0; j < 5; j++) { const an = j * 1.2566 + e.x, r = 8 + a * 26; ctx.beginPath(); ctx.arc(e.x + Math.cos(an) * r, e.y + Math.sin(an) * r, 4 * (1 - a) + 1, 0, 6.2832); ctx.fill(); } }
        else if (e.k === "burst") { ctx.fillStyle = e.c; for (let j = 0; j < 18; j++) { const an = j * .349 + e.x, r = 20 + a * (90 + (j % 3) * 40); ctx.beginPath(); ctx.arc(e.x + Math.cos(an) * r, e.y + Math.sin(an) * r, 9 * (1 - a) + 2, 0, 6.2832); ctx.fill(); } ctx.strokeStyle = "#fff"; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(e.x, e.y, 30 + a * 160, 0, 6.2832); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      // 화면 가장자리 표시: 공격받는 내 기지가 화면 밖일 때
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (me && me.alive && t < edgeUntil && !vis(me.bx, me.by, 40)) {
        const sx = me.bx * scale + ox, sy = me.by * scale + oy, cx = w / 2, cy = h / 2, dx = sx - cx, dy = sy - cy, k = Math.min((w / 2 - 30) / Math.abs(dx || 1), (h / 2 - 60) / Math.abs(dy || 1)), px = cx + dx * k, py = cy + dy * k, an = Math.atan2(dy, dx);
        ctx.save(); ctx.translate(px, py); ctx.rotate(an); ctx.fillStyle = "#ff4a3a"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -13); ctx.lineTo(-10, 13); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        ctx.font = "800 13px system-ui"; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "#0b1316"; ctx.strokeText("내 기지!", px, py - 18); ctx.fillStyle = "#ffd4cc"; ctx.fillText("내 기지!", px, py - 18);
      }
    }
    function drawMini() {
      const w = mini.width, h = mini.height, sx = w / W, sy = h / H;
      mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.fillStyle = "#12211f"; mctx.fillRect(0, 0, w, h);
      for (const nd of V.nodes) { shapePath(mctx, "diamond", nd.x * sx, nd.y * sy, 6); mctx.fillStyle = nd.o >= 0 ? TEAM[nd.o].c : "#5b6c69"; mctx.fill(); }
      for (const u of V.units) { mctx.fillStyle = TEAM[u.o].c; const r = u.o === slot ? 2.6 : 2; mctx.fillRect(u.x * sx - r / 2, u.y * sy - r / 2, r, r); }
      for (const p of V.players) {
        const hot = p.alive && V.time - p.hitT < 1.2 && Math.floor(nowS() * 4) % 2 === 0;
        shapePath(mctx, TEAM[p.id].s, p.bx * sx, p.by * sy, 9); mctx.fillStyle = p.alive ? TEAM[p.id].c : "#555"; mctx.fill(); mctx.lineWidth = 2; mctx.strokeStyle = hot ? "#ff4a3a" : "#0b1316"; mctx.stroke();
        if (p.id === slot && p.alive) { mctx.strokeStyle = "#fff"; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(p.bx * sx, p.by * sy, 13, 0, 6.2832); mctx.stroke(); }
        if (p.alive && p.da && p.id === slot) { mctx.fillStyle = "#fff"; mctx.beginPath(); mctx.arc(p.dx * sx, p.dy * sy, 4, 0, 6.2832); mctx.fill(); }
      }
      const me = V.players[slot];
      if (me && me.alive && (me.ord.k === "rally" || me.ord.k === "charge")) { mctx.strokeStyle = me.ord.k === "charge" ? "#ff8a78" : "#9ae6cc"; mctx.lineWidth = 2; mctx.strokeRect(me.ord.x * sx - 6, me.ord.y * sy - 6, 12, 12); }
      mctx.strokeStyle = "#fff"; mctx.lineWidth = 2; mctx.strokeRect((cam.x - vw.w / 2 / vw.scale) * sx, (cam.y - vw.h / 2 / vw.scale) * sy, vw.w / vw.scale * sx, vw.h / vw.scale * sy);
    }

    /* ---------- 버튼 · 연결 ---------- */
    let exitArm = 0;
    dialog.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-exit")) {
        if (V && !V.done && role) {
          if (!exitArm) { exitArm = setTimeout(() => { exitArm = 0; b.textContent = "나가기"; b.removeAttribute("data-arm"); }, 3000); b.textContent = "정말 나가기"; b.setAttribute("data-arm", "1"); return; }
          clearTimeout(exitArm); exitArm = 0; b.textContent = "나가기"; b.removeAttribute("data-arm");
        }
        dialog.close(); return;
      }
      if (b.hasAttribute("data-snd")) { muted = !muted; store("mute", muted ? "1" : "0"); syncSnd(); if (!muted) snd("click"); return; }
      if (b.hasAttribute("data-go")) { disconnect(); begin(true); return; }
      if (b.hasAttribute("data-host")) { connect("host"); return; }
      if (b.hasAttribute("data-join")) { connect("guest"); return; }
      if (b.hasAttribute("data-online-start") && role === "host") { begin(false); return; }
      if (b.dataset.cmd) { orderHere(b.dataset.cmd); return; }
      if (b.hasAttribute("data-evo-open")) { toggleEvo(); return; }
      if (b.hasAttribute("data-evo-close")) { toggleEvo(false); return; }
      if (b.hasAttribute("data-sp")) { send({k: "evo", i: +b.dataset.sp}); snd("click"); evoSig = ""; if (role !== "guest") renderEvo(true); return; }
      if (b.hasAttribute("data-up")) { send({k: "up", b: +b.dataset.up}); snd("click"); evoSig = ""; if (role !== "guest") renderEvo(true); return; }
      if (b.hasAttribute("data-again")) { if (role === "solo") begin(true); else if (role === "host") begin(false); return; }
      if (b.hasAttribute("data-setup-back")) { abandon(); const keep = role === "host" || role === "guest"; if (keep) toSetup(role === "host" ? "[온라인 경기 시작]으로 다시 시작할 수 있어요" : "방장이 시작하기를 기다리는 중이에요"); else { disconnect(); msg(""); } return; }
      if (b.hasAttribute("data-leave")) { dialog.close(); }
    });
    dialog.addEventListener("close", () => { abandon(); disconnect(); if (exitArm) { clearTimeout(exitArm); exitArm = 0; const x = $("[data-exit]"); x.textContent = "나가기"; x.removeAttribute("data-arm"); } msg(""); });
    window.roundbRooms && window.roundbRooms.register("blood", code => { dialog.showScreen(); $(".bd-online").open = true; $("[data-code]").value = code; connect("guest"); });
    games.register({id: "blood", name: "진화 블러드", tag: "드론 지휘 · 진화하는 군체로 적 기지 파괴", kind: "main", open: () => dialog.showScreen()});
    document.querySelector("[data-open-blood]")?.addEventListener("click", () => games.open("blood"));
    // 시험·점검용(콘솔에서 확인): 상태만 읽는다
    window.__bloodDebug = () => ({role, slot, sim, V, lowfx, perfMs});
  }
})();
