/* 진화 블러드 — 순수 시뮬레이션(화면·네트워크 없음). 브라우저에서는 window.BloodSim, 노드에서는 require() 로 쓴다.
   방장(또는 혼자 하기)만 step 을 돌리고, 손님은 snapshot 을 받아 그리기만 한다. */
(function (root) {
  "use strict";
  const W = 3600, H = 2400, MAXU = 300, CELL = 128, BHP = 3000, DHP = 260, START_BIO = 110, BASE_R = 46;
  const COLS = Math.ceil(W / CELL), ROWS = Math.ceil(H / CELL);
  /* 8종: 이름, 체력, 공격, 사거리, 속도, 쿨, 혈액값, 해금 진화P, 그림 모양, 색, 설명, 특수 */
  const SP = [
    {n: "보병", hp: 60, dmg: 8, reach: 34, spd: 95, cd: .8, cost: 20, ep: 0, shape: "humanoid", col: "#e6d08a", size: 40, info: "균형 잡힌 기본 병사"},
    {n: "크롤러", hp: 34, dmg: 6, reach: 26, spd: 150, cd: .45, cost: 12, ep: 1, shape: "bug", col: "#9be37a", size: 34, info: "싸고 빠름 · 몸이 약함"},
    {n: "저격수", hp: 42, dmg: 14, reach: 175, spd: 85, cd: 1, cost: 30, ep: 1, shape: "bird", col: "#7ac7ff", size: 40, info: "멀리서 쏨 · 앞줄 필요"},
    {n: "블롭", hp: 150, dmg: 9, reach: 34, spd: 80, cd: .9, cost: 40, ep: 2, shape: "blob", col: "#c39bff", size: 50, info: "튼튼함 · 주변까지 피해", splash: 56},
    {n: "중장갑병", hp: 230, dmg: 14, reach: 36, spd: 68, cd: 1, cost: 55, ep: 2, shape: "golem", col: "#9aa7b8", size: 52, info: "받는 피해 30% 감소", armor: .7},
    {n: "브루트", hp: 190, dmg: 38, reach: 40, spd: 86, cd: 1.1, cost: 75, ep: 3, shape: "jaws", col: "#ff9a6b", size: 56, info: "한 방이 아주 강함"},
    {n: "공성 전차", hp: 280, dmg: 24, reach: 130, spd: 54, cd: 1.5, cost: 95, ep: 3, shape: "stamp", col: "#d8c25a", size: 60, info: "기지에 3배 피해 · 느림", bm: 3, um: .7, pb: 1},
    {n: "돌연변이", hp: 420, dmg: 40, reach: 48, spd: 105, cd: .8, cost: 140, ep: 4, shape: "spike", col: "#ff7bb0", size: 64, info: "최강 · 스스로 회복", regen: 6}
  ];
  const UPC = [2, 3, 5];   // 업그레이드 1·2·3단계 진화P
  const ATK = [1, 1.15, 1.3, 1.5], HPM = [1, 1.2, 1.4, 1.7], SPAWN = [1, .85, .7, .55], CAPB = [0, 8, 16, 26];
  const UP = [
    {n: "송곳니", lv: ["공격 +15%", "공격 +30%", "공격 +50%"]},
    {n: "외골격", lv: ["체력 +20%", "체력 +40%", "체력 +70%"]},
    {n: "번식", lv: ["생산 빨라짐 · 군체 +8", "생산 더 빨라짐 · 군체 +16", "생산 최고 · 군체 +26"]}
  ];
  const TEAM = [
    {c: "#56b4e9", s: "circle"}, {c: "#e69f00", s: "tri"}, {c: "#f0e442", s: "square"}, {c: "#cc79a7", s: "diamond"}, {c: "#ffffff", s: "star"},
    {c: "#2fbf8f", s: "pent"}, {c: "#e8603a", s: "cross"}, {c: "#9aa5b1", s: "tridown"}, {c: "#4d7cff", s: "hex"}, {c: "#b388ff", s: "half"}
  ];
  const KIND = ["rally", "charge", "retreat", "follow"];
  const PERS = [
    {n: "공격형", send: [18, 12, 8], first: [190, 110, 70], build: [["u", 1], ["g", 0], ["u", 5], ["g", 2], ["g", 0], ["u", 7], ["g", 2], ["g", 0], ["u", 3], ["g", 1]]},
    {n: "수비형", send: [36, 28, 22], first: [320, 250, 190], build: [["g", 1], ["u", 4], ["g", 1], ["u", 2], ["u", 6], ["g", 0], ["u", 3], ["g", 1], ["u", 5], ["g", 2]]},
    {n: "확장형", send: [30, 22, 16], first: [290, 210, 150], build: [["g", 2], ["u", 2], ["g", 1], ["u", 3], ["u", 5], ["g", 2], ["g", 0], ["u", 4], ["g", 0], ["u", 7]]}
  ];
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const maskOf = arr => arr.reduce((m, v, i) => m | (v ? 1 << i : 0), 0);
  const unmask = m => Array.from({length: 8}, (_, i) => (m >> i) & 1);

  function layout(n) {
    const cx = W / 2, cy = H / 2, rx = W * .4, ry = H * .38, out = [];
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + i * 2 * Math.PI / n;
      out.push({x: Math.round(cx + Math.cos(a) * rx), y: Math.round(cy + Math.sin(a) * ry)});
    }
    return out;
  }
  function layoutNodes(n, bases) {
    const cx = W / 2, cy = H / 2, pts = [{x: cx, y: cy}];
    if (n === 2) pts.push({x: cx - W * .3, y: cy}, {x: cx + W * .3, y: cy});
    else for (let i = 0; i < n; i++) {
      const a = bases[i], b = bases[(i + 1) % n];
      pts.push({x: Math.round(cx + ((a.x + b.x) / 2 - cx) * .64), y: Math.round(cy + ((a.y + b.y) / 2 - cy) * .64)});
    }
    return pts.map(p => ({x: p.x, y: p.y, o: -1, co: -1, pr: 0, fc: {}}));
  }
  const capOf = (up, nodes, n) => Math.min(26 + nodes * 4 + CAPB[up[2]], Math.floor(MAXU / n) + 6);
  const incomeOf = (nodes, mul) => (4.5 + 2 * nodes) * (mul || 1);
  const scoreOf = (p, nodes) => p.destroyed * 500 + p.kills * 2 + nodes * 30 + (p.alive ? 300 : 0);

  function create(cfg) {
    cfg = cfg || {};
    const n = clamp(cfg.n | 0 || 4, 2, 10), diff = clamp(cfg.diff | 0, 0, 2), time = cfg.rule === "time";
    const humans = new Set(cfg.humans || [0]), bases = layout(n);
    const S = {n, diff, rule: time ? "time" : "elim", limit: time ? 300 : 600, time: 0, done: false, winner: -1, rank: [], score: [], units: [], ev: [],
      nextId: 1, mid: cfg.mid || 1, bases, nodes: layoutNodes(n, bases), players: [], cells: Array.from({length: COLS * ROWS}, () => [])};
    const order = [0, 1, 2].sort(() => Math.random() - .5);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const ai = !humans.has(i), per = ai ? order[k++ % 3] : -1, hm = ai ? [.7, 1, 1.15][diff] : 1;
      const b = bases[i], tc = {x: W / 2 - b.x, y: H / 2 - b.y}, L = Math.hypot(tc.x, tc.y) || 1;
      const home = {x: b.x + tc.x / L * 240, y: b.y + tc.y / L * 240};
      S.players.push({id: i, ai, persona: per, name: (cfg.names && cfg.names[i]) || (ai ? "AI " + PERS[per].n : "플레이어 " + (i + 1)),
        bx: b.x, by: b.y, alive: true, bmax: Math.round(BHP * hm), bhp: Math.round(BHP * hm), hitT: -99, hitBy: -1, evT: -9, outT: 0,
        dx: b.x, dy: b.y - 60, dhp: DHP, dmax: DHP, da: true, dres: 0, dcd: 0, dfl: 0, sx: 0, sy: 0, tcd: .5,
        bio: START_BIO, ep: 1, epT: 0, kills: 0, kc: 0, destroyed: 0, deaths: 0,
        un: [1, 0, 0, 0, 0, 0, 0, 0], on: [1, 0, 0, 0, 0, 0, 0, 0], up: [0, 0, 0], rr: 0, spawnT: 1.2, pop: 0, nodes: 0,
        ord: {k: "rally", x: home.x, y: home.y}, oseq: 1, home, aiT: 4 + i * .4, bi: 0, defT: 0, rtT: 0, ctgt: -1});
    }
    return S;
  }

  const ev = (S, e) => { if (S.ev.length < 400) S.ev.push(e); };
  function buildGrid(S) {
    for (const c of S.cells) c.length = 0;
    for (const u of S.units) {
      if (u.dead) continue;
      const cx = clamp((u.x / CELL) | 0, 0, COLS - 1), cy = clamp((u.y / CELL) | 0, 0, ROWS - 1);
      S.cells[cy * COLS + cx].push(u);
    }
  }
  const T = {k: -1, r: null, x: 0, y: 0, rad: 0};
  /* 가장 가까운 적(유닛 0 · 드론 1 · 기지 2). prefBase 면 사거리 안의 기지를 먼저 */
  function nearestFoe(S, o, x, y, range, prefBase) {
    let best = range * range, k = -1, r = null, rad = 0, tx = 0, ty = 0;
    const x0 = clamp(((x - range) / CELL) | 0, 0, COLS - 1), x1 = clamp(((x + range) / CELL) | 0, 0, COLS - 1);
    const y0 = clamp(((y - range) / CELL) | 0, 0, ROWS - 1), y1 = clamp(((y + range) / CELL) | 0, 0, ROWS - 1);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const c = S.cells[cy * COLS + cx];
      for (let i = 0; i < c.length; i++) {
        const v = c[i];
        if (v.o === o || v.dead) continue;
        const d2 = (v.x - x) * (v.x - x) + (v.y - y) * (v.y - y);
        if (d2 < best) { best = d2; k = 0; r = v; rad = 9; tx = v.x; ty = v.y; }
      }
    }
    let baseBest = 1e18;
    for (const q of S.players) {
      if (q.id === o || !q.alive) continue;
      if (q.da) {
        const d2 = (q.dx - x) * (q.dx - x) + (q.dy - y) * (q.dy - y);
        if (d2 < best && !(prefBase && baseBest < 1e18)) { best = d2; k = 1; r = q; rad = 13; tx = q.dx; ty = q.dy; }
      }
      const dd = Math.hypot(q.bx - x, q.by - y) - BASE_R;
      if (dd < range) {
        const d2 = dd <= 0 ? 0 : dd * dd;
        if (prefBase ? d2 < baseBest : d2 < best) { baseBest = d2; if (!prefBase) best = d2; k = 2; r = q; rad = BASE_R; tx = q.bx; ty = q.by; }
      }
    }
    T.k = k; T.r = r; T.x = tx; T.y = ty; T.rad = rad;
    return k >= 0;
  }

  function hurt(S, v, dmg, kp) {
    if (v.dead) return;
    const sp = SP[v.t];
    if (sp.armor) dmg *= sp.armor;
    v.hp -= dmg; v.fl = .14;
    if (v.hp <= 0) {
      v.dead = true; kp.kills++; kp.bio += sp.cost * .45;
      if (++kp.kc % 8 === 0) kp.ep++;
      ev(S, {k: "die", x: v.x, y: v.y, o: v.o, by: kp.id});
    }
  }
  function hurtDrone(S, q, dmg, kp) {
    if (!q.da) return;
    q.dhp -= dmg; q.dfl = .14;
    if (q.dhp <= 0) {
      q.da = false; q.dres = S.time + 7; q.deaths++;
      ev(S, {k: "drone", o: q.id, x: q.dx, y: q.dy, by: kp.id});
    }
  }
  function destroyBase(S, q, kp) {
    q.alive = false; q.bhp = 0; q.outT = S.time; q.da = false;
    for (const u of S.units) if (u.o === q.id) u.dead = true;
    for (const nd of S.nodes) if (nd.o === q.id) nd.o = -1;
    if (kp && kp !== q) { kp.destroyed++; kp.ep += 4; kp.bio += 200; }
    ev(S, {k: "boom", o: q.id, x: q.bx, y: q.by, by: kp ? kp.id : -1});
  }
  function hurtBase(S, q, dmg, kp) {
    if (!q.alive) return;
    q.bhp -= dmg; q.hitT = S.time; q.hitBy = kp.id;
    if (S.time - q.evT > .7) { q.evT = S.time; ev(S, {k: "bhit", o: q.id}); }
    if (q.bhp <= 0) destroyBase(S, q, kp);
  }
  function strike(S, u, sp, kp) {
    const dmg = sp.dmg * ATK[kp.up[0]];
    if (sp.reach > 100) ev(S, {k: "shot", x: u.x, y: u.y, x2: T.x, y2: T.y, o: u.o});
    if (T.k === 0) {
      const v = T.r, vx = v.x, vy = v.y;
      hurt(S, v, dmg * (sp.um || 1), kp);
      if (sp.splash) {
        const x0 = clamp(((vx - sp.splash) / CELL) | 0, 0, COLS - 1), x1 = clamp(((vx + sp.splash) / CELL) | 0, 0, COLS - 1);
        const y0 = clamp(((vy - sp.splash) / CELL) | 0, 0, ROWS - 1), y1 = clamp(((vy + sp.splash) / CELL) | 0, 0, ROWS - 1);
        for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) for (const w of S.cells[cy * COLS + cx]) {
          if (w === v || w.o === u.o || w.dead) continue;
          if ((w.x - vx) * (w.x - vx) + (w.y - vy) * (w.y - vy) < sp.splash * sp.splash) hurt(S, w, dmg * .55, kp);
        }
        ev(S, {k: "ring", x: vx, y: vy, r: sp.splash, o: u.o});
      }
    } else if (T.k === 1) hurtDrone(S, T.r, dmg, kp);
    else if (T.k === 2) hurtBase(S, T.r, dmg * (sp.bm || 1), kp);
  }

  function nearestBase(S, u) {
    let bq = null, bd = 1e12;
    for (const q of S.players) {
      if (q.id === u.o || !q.alive) continue;
      const d = (q.bx - u.x) ** 2 + (q.by - u.y) ** 2;
      if (d < bd) { bd = d; bq = q; }
    }
    return bq;
  }

  function stepUnits(S, dt) {
    const P = S.players;
    for (const u of S.units) {
      if (u.dead) continue;
      const p = P[u.o], sp = SP[u.t], od = p.ord;
      if (u.fl > 0) u.fl -= dt;
      u.cd -= dt;
      if (sp.regen && u.hp < u.mx) u.hp = Math.min(u.mx, u.hp + sp.regen * dt);
      if (u.os !== p.oseq) { u.os = p.oseq; u.pu = 0; }
      let mode = od.k;
      if (mode === "retreat" && (u.x - p.bx) ** 2 + (u.y - p.by) ** 2 < 170 * 170) mode = "rally";
      const aggro = mode === "charge" ? 250 : mode === "retreat" ? 0 : 170;
      let has = false;
      if (aggro > 0) has = nearestFoe(S, u.o, u.x, u.y, Math.max(aggro, sp.reach + 24), !!sp.pb);
      if (has && (mode === "rally" || mode === "follow") && (T.x - od.x) ** 2 + (T.y - od.y) ** 2 > 400 * 400) has = false;
      if (has) {
        const dx = T.x - u.x, dy = T.y - u.y, dc = Math.hypot(dx, dy) || 1, de = dc - T.rad;
        if (de <= sp.reach) {
          if (u.cd <= 0) { u.cd = sp.cd * (.9 + Math.random() * .2); strike(S, u, sp, p); }
        } else {
          const stop = sp.reach > 100 ? sp.reach * .85 : 0, step = Math.min(sp.spd * dt, Math.max(0, de - stop));
          u.x += dx / dc * step; u.y += dy / dc * step;
        }
      } else {
        let gx, gy, hold = 14;
        if (mode === "charge") {
          if (!u.pu && (od.x - u.x) ** 2 + (od.y - u.y) ** 2 < 170 * 170) u.pu = 1;
          const b = u.pu ? nearestBase(S, u) : null;
          if (b) { gx = b.bx; gy = b.by; hold = 30; } else { gx = od.x; gy = od.y; }
        } else {
          gx = od.x + ((u.id % 9) - 4) * 17; gy = od.y + ((((u.id / 9) | 0) % 5) - 2) * 17;
        }
        const dx = gx - u.x, dy = gy - u.y, dc = Math.hypot(dx, dy);
        if (dc > hold) {
          const step = Math.min(sp.spd * (mode === "retreat" ? 1.3 : 1) * dt, dc - hold);
          u.x += dx / dc * step; u.y += dy / dc * step;
        }
      }
      // 살짝 밀어내기(겹침 방지)
      const cx = clamp((u.x / CELL) | 0, 0, COLS - 1), cy = clamp((u.y / CELL) | 0, 0, ROWS - 1);
      let seen = 0;
      for (let yy = Math.max(0, cy - 1); yy <= Math.min(ROWS - 1, cy + 1) && seen < 10; yy++) for (let xx = Math.max(0, cx - 1); xx <= Math.min(COLS - 1, cx + 1) && seen < 10; xx++) {
        for (const w of S.cells[yy * COLS + xx]) {
          if (w === u || w.dead) continue;
          const ex = u.x - w.x, ey = u.y - w.y, d2 = ex * ex + ey * ey;
          if (d2 < 169 && d2 > .01) { const d = Math.sqrt(d2), f = (13 - d) * .35; u.x += ex / d * f; u.y += ey / d * f; seen++; }
          else if (d2 <= .01) { u.x += Math.random() - .5; u.y += Math.random() - .5; }
          if (seen >= 10) break;
        }
      }
      u.x = clamp(u.x, 10, W - 10); u.y = clamp(u.y, 10, H - 10);
    }
  }

  function stepDrone(S, p, dt) {
    if (!p.alive) return;
    if (!p.da) {
      if (S.time >= p.dres) { p.da = true; p.dhp = p.dmax; p.dx = p.bx; p.dy = p.by - 60; ev(S, {k: "dback", o: p.id}); }
      return;
    }
    if (p.dfl > 0) p.dfl -= dt;
    let sx = p.sx, sy = p.sy;
    const m = Math.hypot(sx, sy);
    if (m > 1) { sx /= m; sy /= m; }
    p.dx = clamp(p.dx + sx * 210 * dt, 20, W - 20); p.dy = clamp(p.dy + sy * 210 * dt, 20, H - 20);
    p.dcd -= dt;
    if (p.dcd <= 0 && nearestFoe(S, p.id, p.dx, p.dy, 160, false)) {
      p.dcd = .5;
      const dmg = 16 * ATK[p.up[0]];
      ev(S, {k: "shot", x: p.dx, y: p.dy, x2: T.x, y2: T.y, o: p.id, d: 1});
      if (T.k === 0) hurt(S, T.r, dmg, p); else if (T.k === 1) hurtDrone(S, T.r, dmg, p); else hurtBase(S, T.r, dmg * 1.5, p);
    }
    // 드론 주변 아군 회복
    const x0 = clamp(((p.dx - 230) / CELL) | 0, 0, COLS - 1), x1 = clamp(((p.dx + 230) / CELL) | 0, 0, COLS - 1);
    const y0 = clamp(((p.dy - 230) / CELL) | 0, 0, ROWS - 1), y1 = clamp(((p.dy + 230) / CELL) | 0, 0, ROWS - 1);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) for (const u of S.cells[cy * COLS + cx]) {
      if (u.o !== p.id || u.dead || u.hp >= u.mx) continue;
      if ((u.x - p.dx) ** 2 + (u.y - p.dy) ** 2 < 230 * 230) u.hp = Math.min(u.mx, u.hp + 4 * dt);
    }
  }

  function evo(S, p, i) {
    if (!p.alive || !(i >= 0 && i < 8)) return false;
    if (!p.un[i]) {
      if (p.ep < SP[i].ep) return false;
      p.ep -= SP[i].ep; p.un[i] = 1; p.on[i] = 1; ev(S, {k: "evo", o: p.id, i});
      return true;
    }
    if (p.on[i] && p.on.reduce((a, b) => a + b, 0) <= 1) return false;
    p.on[i] = p.on[i] ? 0 : 1;
    return true;
  }
  function upg(S, p, b) {
    if (!p.alive || !(b >= 0 && b < 3)) return false;
    const lv = p.up[b];
    if (lv >= 3 || p.ep < UPC[lv]) return false;
    p.ep -= UPC[lv]; p.up[b]++;
    if (b === 1) { const r = HPM[p.up[1]] / HPM[p.up[1] - 1]; for (const u of S.units) if (u.o === p.id) { u.mx *= r; u.hp *= r; } }
    ev(S, {k: "up", o: p.id, b});
    return true;
  }
  function setOrder(S, p, k, x, y) {
    if (!KIND.includes(k)) return;
    if (k === "retreat") { x = p.bx; y = p.by; }
    else if (k === "follow") { x = p.da ? p.dx : p.bx; y = p.da ? p.dy : p.by; }
    else if (!(Number.isFinite(x) && Number.isFinite(y))) {
      if (k === "charge") { const b = nearestBase(S, {o: p.id, x: p.dx, y: p.dy}); x = b ? b.bx : p.dx; y = b ? b.by : p.dy; }
      else { x = p.da ? p.dx : p.bx; y = p.da ? p.dy : p.by; }
    }
    p.ord = {k, x: clamp(x, 20, W - 20), y: clamp(y, 20, H - 20)};
    p.oseq++;
  }
  /* 사람이 보낸 명령 처리 (손님 메시지도 여기로 온다) */
  function issue(S, slot, m) {
    const p = S.players[slot];
    if (!p || !m || S.done || !p.alive) return;
    switch (m.k) {
      case "steer": p.sx = clamp(+m.x || 0, -1, 1); p.sy = clamp(+m.y || 0, -1, 1); break;
      case "order": setOrder(S, p, m.o, m.x == null ? NaN : +m.x, m.y == null ? NaN : +m.y); break;
      case "evo": evo(S, p, m.i | 0); break;
      case "up": upg(S, p, m.b | 0); break;
    }
  }

  /* ---------- AI ---------- */
  function aiEvolve(S, p) {
    const per = PERS[p.persona];
    while (p.bi < per.build.length) {
      const b = per.build[p.bi], k = b[0], i = b[1];
      if (k === "u") { if (p.un[i]) { p.bi++; continue; } if (p.ep >= SP[i].ep) { evo(S, p, i); p.bi++; continue; } break; }
      if (p.up[i] >= 3) { p.bi++; continue; }
      if (p.ep >= UPC[p.up[i]]) { upg(S, p, i); p.bi++; continue; }
      break;
    }
    if (p.bi >= per.build.length && p.ep >= 3) for (let b = 0; b < 3; b++) if (p.up[b] < 3 && upg(S, p, b)) break;
  }
  function aiThink(S, p) {
    const df = S.diff, per = PERS[p.persona], t = S.time, A = p.pop;
    p.aiT = t + [2.6, 1.4, .9][df] * (.8 + Math.random() * .4);
    aiEvolve(S, p);
    const foes = S.players.filter(q => q.alive && q.id !== p.id);
    if (!foes.length) return;
    // 드론: 군체 중심을 따라다니고, 다치면 기지로
    let mx = 0, my = 0, c = 0;
    for (const u of S.units) if (u.o === p.id && !u.dead) { mx += u.x; my += u.y; c++; }
    const gx = c ? mx / c : p.home.x, gy = c ? my / c : p.home.y;
    p.aiDrone = p.dhp < p.dmax * .35 ? {x: p.bx, y: p.by} : {x: gx, y: gy};
    // 기지가 맞고 있으면 방어
    if (t - p.hitT < 3) {
      let near = 0;
      for (const u of S.units) if (u.o !== p.id && !u.dead && (u.x - p.bx) ** 2 + (u.y - p.by) ** 2 < 420 * 420) near++;
      if (near >= 2 || t - p.hitT < .8) {
        if (p.ord.k !== "rally" || Math.hypot(p.ord.x - p.bx, p.ord.y - p.by) > 480) setOrder(S, p, "rally", p.home.x, p.home.y);
        p.defT = t + 9;
        return;
      }
    }
    if (t < p.defT || t < p.rtT) return;
    const need = per.send[df];
    if (p.ord.k === "charge") {
      if (A <= Math.max(3, need * .25)) { setOrder(S, p, "retreat"); p.rtT = t + 7; return; }
      const tg = S.players[p.ctgt];
      if (tg && tg.alive) return;
    }
    const ready = t >= per.first[df] && A >= need && !(p.ord.k === "retreat" && A < need * .8);
    if (ready) {
      let best = null, bs = 1e12;
      for (const q of foes) {
        const s = Math.hypot(q.bx - p.bx, q.by - p.by) + (q.bhp / q.bmax) * 500 + (df === 0 && !q.ai ? 900 : 0) + Math.random() * 250;
        if (s < bs) { bs = s; best = q; }
      }
      p.ctgt = best.id; setOrder(S, p, "charge", best.bx, best.by);
      return;
    }
    let r = p.home;
    if (p.persona === 2 && t < per.first[df] + 200 || p.persona === 0 && t < 110 || p.persona === 1 && t < 170) {
      let bn = null, bd = 1e12;
      for (const nd of S.nodes) if (nd.o !== p.id) { const d = Math.hypot(nd.x - p.bx, nd.y - p.by) + (nd.o >= 0 ? 600 : 0); if (d < bd) { bd = d; bn = nd; } }
      if (bn) r = bn;
    }
    if (p.ord.k !== "rally" || Math.hypot(p.ord.x - r.x, p.ord.y - r.y) > 60) setOrder(S, p, "rally", r.x, r.y);
  }
  function stepAIDrone(p) {
    const g = p.aiDrone;
    if (!g) return;
    const dx = g.x - p.dx, dy = g.y - p.dy, d = Math.hypot(dx, dy);
    if (d > 60) { p.sx = dx / d * .9; p.sy = dy / d * .9; } else { p.sx = 0; p.sy = 0; }
  }

  function stepNodes(S, dt) {
    const pres = new Array(S.n);
    for (const nd of S.nodes) {
      pres.fill(0);
      const x0 = clamp(((nd.x - 130) / CELL) | 0, 0, COLS - 1), x1 = clamp(((nd.x + 130) / CELL) | 0, 0, COLS - 1);
      const y0 = clamp(((nd.y - 130) / CELL) | 0, 0, ROWS - 1), y1 = clamp(((nd.y + 130) / CELL) | 0, 0, ROWS - 1);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) for (const u of S.cells[cy * COLS + cx]) {
        if ((u.x - nd.x) ** 2 + (u.y - nd.y) ** 2 < 120 * 120) pres[u.o]++;
      }
      for (const q of S.players) if (q.da && (q.dx - nd.x) ** 2 + (q.dy - nd.y) ** 2 < 130 * 130) pres[q.id] += 3;
      let who = -1, cnt = 0;
      for (let i = 0; i < S.n; i++) if (pres[i] > 0) { cnt++; who = i; }
      if (cnt === 1 && nd.o !== who) {
        if (nd.co !== who) { nd.co = who; nd.pr = 0; }
        nd.pr += dt / 4 * Math.min(2, 1 + (pres[who] - 1) * .1);
        if (nd.pr >= 1) {
          nd.o = who; nd.pr = 0; nd.co = -1;
          if (!nd.fc[who]) { nd.fc[who] = 1; S.players[who].ep++; }
          ev(S, {k: "node", o: who, x: nd.x, y: nd.y});
        }
      } else if (cnt === 0 && nd.pr > 0) nd.pr = Math.max(0, nd.pr - dt / 8);
    }
  }

  function rankNow(S, lastStanding) {
    const nodes = S.players.map(() => 0);
    for (const nd of S.nodes) if (nd.o >= 0) nodes[nd.o]++;
    const sc = S.players.map(p => scoreOf(p, nodes[p.id]));
    const ids = S.players.map(p => p.id).sort((a, b) => {
      if (lastStanding && S.players[a].alive !== S.players[b].alive) return S.players[a].alive ? -1 : 1;
      if (lastStanding && !S.players[a].alive && !S.players[b].alive) return S.players[b].outT - S.players[a].outT;
      return sc[b] - sc[a];
    });
    return {ids, sc};
  }
  function finish(S, lastStanding) {
    const r = rankNow(S, lastStanding);
    S.rank = r.ids; S.score = r.sc; S.winner = r.ids[0]; S.done = true;
    ev(S, {k: "end", w: S.winner});
  }

  function step(S, dt) {
    if (S.done) return;
    S.time += dt;
    const P = S.players;
    buildGrid(S);
    for (const p of P) { p.pop = 0; p.nodes = 0; }
    for (const u of S.units) if (!u.dead) P[u.o].pop++;
    for (const nd of S.nodes) if (nd.o >= 0) P[nd.o].nodes++;
    for (const p of P) {
      if (!p.alive) continue;
      const mul = p.ai ? [.55, 1, 1.25][S.diff] : 1;
      p.bio = Math.min(700, p.bio + incomeOf(p.nodes, mul) * dt);
      if ((p.epT += dt) >= 20) { p.epT -= 20; p.ep++; }
      if (p.ai && S.time >= p.aiT) aiThink(S, p);
      if (p.ai) stepAIDrone(p);
      if (p.ord.k === "follow") { p.ord.x = p.da ? p.dx : p.bx; p.ord.y = p.da ? p.dy : p.by; }
      stepDrone(S, p, dt);
      // 기지 포탑
      if ((p.tcd -= dt) <= 0 && nearestFoe(S, p.id, p.bx, p.by, 250, false) && T.k !== 2) {
        p.tcd = .6;
        ev(S, {k: "shot", x: p.bx, y: p.by, x2: T.x, y2: T.y, o: p.id, d: 2});
        if (T.k === 0) hurt(S, T.r, 22, p); else hurtDrone(S, T.r, 22, p);
      }
      // 자동 생산
      if ((p.spawnT -= dt) <= 0) {
        const cap = capOf(p.up, p.nodes, S.n);
        if (p.pop < cap && S.units.length < MAXU) {
          let t = p.rr % 8, g = 0;
          while (!p.on[t] && g++ < 8) t = (t + 1) % 8;
          const sp = SP[t];
          if (p.bio >= sp.cost) {
            p.bio -= sp.cost; p.rr = (t + 1) % 8; p.pop++;
            const a = Math.random() * 6.283, d = 52 + Math.random() * 22, hp = sp.hp * HPM[p.up[1]];
            S.units.push({id: S.nextId++, o: p.id, t, x: clamp(p.bx + Math.cos(a) * d, 10, W - 10), y: clamp(p.by + Math.sin(a) * d, 10, H - 10), hp, mx: hp, cd: Math.random() * .5, fl: 0, dead: false, os: 0, pu: 0});
            p.spawnT = 1.5 * SPAWN[p.up[2]];
          } else p.spawnT = .25;
        } else p.spawnT = .5;
      }
    }
    stepNodes(S, dt);
    stepUnits(S, dt);
    if (S.units.some(u => u.dead)) S.units = S.units.filter(u => !u.dead);
    // 종료 판정
    const alive = P.filter(p => p.alive), humansAlive = alive.filter(p => !p.ai).length, humans = P.filter(p => !p.ai).length;
    if (alive.length <= 1) finish(S, true);
    else if (humans && !humansAlive) finish(S, S.rule === "elim");
    else if (S.time >= S.limit) finish(S, false);
  }

  /* ---------- 손님에게 보내는 스냅샷 (14,000자 미만) ---------- */
  function snapshot(S) {
    const ps = S.players.map(p => [Math.round(p.dx), Math.round(p.dy), p.da ? Math.max(1, Math.round(p.dhp / p.dmax * 100)) : 0, p.da ? 0 : Math.max(0, Math.ceil(p.dres - S.time)),
      Math.round(p.bhp), p.kills, p.destroyed, p.alive ? 1 : 0, Math.round(p.bio), p.ep, maskOf(p.un), maskOf(p.on), p.up[0] * 100 + p.up[1] * 10 + p.up[2],
      KIND.indexOf(p.ord.k), Math.round(p.ord.x), Math.round(p.ord.y), p.bmax, S.time - p.hitT < 3 ? 1 : 0, p.deaths]);
    const un = [];
    for (const u of S.units) if (!u.dead) un.push(u.id, Math.round(u.x), Math.round(u.y), (u.o * 8 + u.t) * 100 + clamp(Math.round(u.hp / u.mx * 99), 1, 99));
    const nd = [];
    for (const n of S.nodes) nd.push(n.o, n.co, Math.round(n.pr * 100));
    return {v: 4, t: Math.round(S.time * 10) / 10, d: S.done ? 1 : 0, w: S.winner, ru: S.rule === "time" ? 1 : 0, df: S.diff, n: S.n, mid: S.mid,
      nm: S.players.map(p => p.name), ai: S.players.map(p => p.ai ? p.persona + 1 : 0), pl: ps, nd, un, rk: S.done ? S.rank : 0, sc: S.done ? S.score : 0};
  }

  const api = {W, H, MAXU, BASE_R, SP, UP, UPC, ATK, HPM, TEAM, PERS, KIND, DHP, layout, layoutNodes, capOf, incomeOf, scoreOf, maskOf, unmask,
    create, step, issue, snapshot, evo, upg, setOrder, rankNow};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.BloodSim = api;
})(typeof window !== "undefined" ? window : globalThis);
