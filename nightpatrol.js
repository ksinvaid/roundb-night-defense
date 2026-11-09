/* 암전 순찰 (night-beam) — 손전등 · 소리 · 퓨즈 탈출. 2인 × 최대 5팀.
   구성: ① core(화면 없음 · node 시험 가능) ② UI(캔버스·조작·온라인·보상). 공용 파일은 API 로만 쓴다. */
(() => {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const TAU = Math.PI * 2, hyp = Math.hypot, clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const mulberry = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

  /* ================= core ================= */
  const C = {walk: 3, run: 4.6, sneak: 1.65, rad: .27, near: 1.75, half: .52, range: 7.8, melee: 1.4, dmg: 30, back: 60, cd: .8,
    bat: 1.05, downT: 25, reviveT: 2.2, insertT: 2.4, workT: 20, sabT: 4, escT: 2, limit: {escape: 480, survive: 300}};
  const ST = {ok: 0, down: 1, out: 2, hide: 3, esc: 4};
  const ITEM = ["배터리", "연막탄", "경보 함정", "열쇠", "퓨즈", "탄약", "소음기"];
  // 총기표: dmg=한 발(산탄은 알갱이당) pel=알갱이 cd=발사 간격 mag=탄창 rl=장전초 noise=소음 반경(타일) rng=사거리 spr=퍼짐(rad) kb=넉백 res=바닥 총의 예비탄 kick=반동
  const GUN = [
    {n: "권총", dmg: 20, pel: 1, cd: .34, mag: 10, rl: 1.2, noise: 11, rng: 9, spr: .03, auto: 0, kb: .25, res: 8, kick: .12},
    {n: "기관단총", dmg: 9, pel: 1, cd: .09, mag: 24, rl: 1.7, noise: 12, rng: 8, spr: .1, auto: 1, kb: .1, res: 24, kick: .06},
    {n: "산탄총", dmg: 9, pel: 6, cd: .9, mag: 5, rl: 2, noise: 16, rng: 5.5, spr: .26, auto: 0, kb: .6, res: 5, kick: .3},
    {n: "소총", dmg: 16, pel: 1, cd: .17, mag: 16, rl: 1.9, noise: 14, rng: 11, spr: .05, auto: 1, kb: .3, res: 16, kick: .14},
    {n: "저격총", dmg: 60, pel: 1, cd: 1.5, mag: 3, rl: 2.4, noise: 19, rng: 17, spr: 0, auto: 0, kb: .8, res: 3, kick: .4}
  ];
  const DIFF = {
    easy: {react: .95, spd: .62, aggr: .15, hear: .7, runP: .15, know: 0, think: .35, sab: .3},
    normal: {react: .55, spd: .78, aggr: .35, hear: 1, runP: .45, know: .05, think: .22, sab: .7},
    hard: {react: .28, spd: .88, aggr: .6, hear: 1.2, runP: .7, know: .1, think: .15, sab: 1}
  };
  const KIND = {
    meeting: (w, h, p) => { for (let x = 2; x < w - 2; x++) { p("d", x, 2); p("d", x, 3); } p("L", 0, 0); p("L", 1, 0); p("i", 0, h - 1); p("i", w - 1, h - 1); p("F", w - 1, 0); },
    desks: (w, h, p) => { for (const y of [1, h - 3]) for (let x = 1; x + 1 < w - 1; x += 3) { p("d", x, y); p("d", x + 1, y); } p("L", w - 1, 0); p("i", 0, h - 1); p("i", w - 1, h - 1); p("F", w >> 1, h >> 1); },
    pantry: (w, h, p) => { for (let x = 1; x < w - 1; x++) p("d", x, 0); for (let x = 3; x < w - 3; x++) p("d", x, 3); p("L", w - 1, 1); p("L", w - 1, 2); p("i", 0, h - 1); p("i", w - 1, h - 1); p("F", 1, h - 2); },
    printer: (w, h, p) => { for (const x of [1, 2, w - 3, w - 2]) p("d", x, 1); for (let x = 3; x < w - 3; x++) p("d", x, 4); p("L", w - 1, 6); p("L", w - 2, 6); p("i", 0, h - 1); p("i", w - 1, 1); p("F", w >> 1, 2); },
    storage: (w, h, p) => { for (let y = 2; y < h - 2; y++) p("#", w >> 1, y); p("d", 1, 1); p("d", 2, 1); p("d", w - 2, h - 2); p("d", w - 3, h - 2); p("L", 0, h - 1); p("L", w - 1, 0); p("i", 1, h - 2); p("i", w - 2, 1); p("F", 1, 2); p("F", w - 2, h - 3); },
    studio: (w, h, p) => { for (let y = 2; y < h - 2; y++) p("#", w >> 1, y); p("d", w - 2, 1); p("d", w - 3, 1); p("d", 1, h - 2); p("d", 2, h - 2); p("L", 0, h - 1); p("L", w - 1, h - 1); p("i", w - 1, 0); p("i", 0, h - 1); p("F", w - 2, h - 2); },
    locker: (w, h, p) => { for (let y = 1; y < h - 1; y++) p("L", 0, y); p("L", w - 1, 1); p("L", w - 1, 2); for (let x = 2; x < 5; x++) p("d", x, h - 3); p("i", w - 1, h - 1); p("i", w >> 1, 2); p("F", w - 2, h >> 1); },
    lobby: (w, h, p) => { for (const x of [6, 7, 8, 10, 11, 12]) p("d", x, 1); for (const [x, y] of [[3, 2], [15, 2], [3, 5], [15, 5]]) p("#", x, y); for (const [x, y] of [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]]) p("i", x, y); p("F", 2, h >> 1); p("F", w - 3, h >> 1); p("L", 0, 0); p("L", w - 1, h - 1); },
    vault: (w, h, p) => { for (const [x, y] of [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]]) p("j", x, y); p("f", w >> 1, h >> 1); p("L", w - 1, 0); p("L", 0, 0); },
    corr: (w, h, p) => { p("i", 2, 0); p("i", w - 3, 1); p("F", w >> 2, 1); },
    ringh: (w, h, p) => { p("i", 7, 0); p("i", w - 8, 1); p("F", w >> 1, 0); p("L", 0, 0); },
    ringv: (w, h, p) => { p("i", 0, 5); p("i", 1, h - 6); p("F", 0, h >> 1); }
  };
  const MAPS = {
    f4: {name: "4층 공유오피스", w: 40, h: 28,
      rooms: [{x: 1, y: 1, w: 9, h: 8, k: "meeting"}, {x: 11, y: 1, w: 9, h: 8, k: "desks"}, {x: 21, y: 1, w: 9, h: 8, k: "pantry"}, {x: 31, y: 1, w: 8, h: 8, k: "meeting"},
        {x: 1, y: 10, w: 9, h: 8, k: "locker"}, {x: 11, y: 10, w: 19, h: 8, k: "lobby"}, {x: 31, y: 10, w: 8, h: 8, k: "storage"},
        {x: 1, y: 19, w: 9, h: 8, k: "desks"}, {x: 11, y: 19, w: 9, h: 8, k: "printer"}, {x: 21, y: 19, w: 9, h: 8, k: "desks"}, {x: 31, y: 19, w: 8, h: 8, k: "vault"}],
      doors: [[5, 9], [15, 9], [25, 9], [34, 9], [5, 18], [15, 18], [25, 18], [34, 18, 1], [10, 4], [20, 4], [30, 4], [10, 13], [30, 13], [10, 22], [20, 22]],
      elev: [19, 13], spawn: [[2, 2], [23, 25], [36, 2], [2, 25], [33, 16]]},
    f3: {name: "3층 스튜디오", w: 36, h: 24,
      rooms: [{x: 1, y: 1, w: 34, h: 2, k: "ringh"}, {x: 1, y: 21, w: 34, h: 2, k: "ringh"}, {x: 1, y: 3, w: 2, h: 18, k: "ringv"}, {x: 33, y: 3, w: 2, h: 18, k: "ringv"},
        {x: 4, y: 4, w: 8, h: 6, k: "studio"}, {x: 13, y: 4, w: 8, h: 6, k: "desks"}, {x: 22, y: 4, w: 10, h: 6, k: "vault"},
        {x: 4, y: 14, w: 8, h: 6, k: "locker"}, {x: 13, y: 14, w: 8, h: 6, k: "meeting"}, {x: 22, y: 14, w: 10, h: 6, k: "storage"}, {x: 4, y: 11, w: 28, h: 2, k: "corr"}],
      carve: [{x: 14, y: 10, w: 7, h: 4}],
      doors: [[7, 3], [3, 6], [7, 20], [3, 16], [26, 20], [32, 16], [26, 10, 1], [8, 10], [8, 13], [26, 13], [3, 12], [32, 11], [12, 6], [12, 16], [21, 16]],
      elev: [17, 11], spawn: [[5, 5], [29, 17], [5, 15], [33, 1], [33, 21]]}
  };
  const cellOf = (M, x, y) => (x < 0 || y < 0 || x >= M.w || y >= M.h) ? 1 : M.g[y * M.w + x];
  function nearestFloor(M, x, y) {
    for (let r = 0; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && cellOf(M, x + dx, y + dy) === 0) return [x + dx + .5, y + dy + .5];
    return [x + .5, y + .5];
  }
  function buildMap(id) {
    const d = MAPS[id] || MAPS.f4, W = d.w, H = d.h, g = new Uint8Array(W * H).fill(1);
    const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y * W + x] = v; };
    const carve = r => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, 0); };
    d.rooms.forEach(carve); (d.carve || []).forEach(carve);
    const doors = d.doors.map(([x, y, k]) => ({x, y, locked: !!k}));
    doors.forEach(o => set(o.x, o.y, 4));
    const nearDoor = (x, y) => doors.some(o => Math.abs(o.x - x) <= 1 && Math.abs(o.y - y) <= 1);
    const M = {id: MAPS[id] ? id : "f4", name: d.name, w: W, h: H, g, doors, loot: [], fuse: [], prem: [], premF: [], way: [], spawn: d.spawn, elev: d.elev, doorAt: new Int16Array(W * H).fill(-1), lockers: [], hasKey: doors.some(o => o.locked)};
    const spots = [];
    for (const r of d.rooms) {
      const T = KIND[r.k]; if (!T) continue;
      const put = (ch, dx, dy) => {
        const x = r.x + dx, y = r.y + dy; if (dx < 0 || dy < 0 || dx >= r.w || dy >= r.h) return;
        if (ch === "d" || ch === "L" || ch === "#") { if (!nearDoor(x, y) && cellOf(M, x, y) === 0) set(x, y, ch === "d" ? 2 : ch === "L" ? 3 : 1); }
        else spots.push([ch, x, y]);
      };
      T(r.w, r.h, put);
      if (r.k !== "ringh" && r.k !== "ringv") M.way.push([r.x + (r.w >> 1), r.y + (r.h >> 1)]);
    }
    const [ex, ey] = d.elev; for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) set(ex + x, ey + y, 6);
    for (const [ch, x, y] of spots) { if (cellOf(M, x, y) !== 0) continue; ({i: M.loot, F: M.fuse, j: M.prem, f: M.premF})[ch].push([x + .5, y + .5]); }
    doors.forEach((o, i) => { M.doorAt[o.y * W + o.x] = i; });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cellOf(M, x, y) === 3) {
      const f = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([a, b]) => cellOf(M, x + a, y + b) === 0);
      if (f) M.lockers.push({x, y, fx: x + f[0] + .5, fy: y + f[1] + .5});
    }
    M.way = M.way.map(([x, y]) => nearestFloor(M, x, y));
    M.way.push(...[[.5, .5]].slice(0, 0));
    return M;
  }
  const elevC = M => [M.elev[0] + 1, M.elev[1] + 1];
  function genLoot(M, seed, teams, mode) {
    const rng = mulberry(seed ^ 0x5bd1e995), shuf = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const out = [], fuses = shuf(M.fuse), spots = shuf(M.loot);
    let nF = mode === "escape" ? Math.min(teams + 3, fuses.length + M.premF.length) : 0;
    for (const [x, y] of M.premF) if (nF > 0) { out.push({x, y, type: 4}); nF--; } else out.push({x, y, type: rng() < .5 ? 0 : 1});
    for (const [x, y] of fuses) if (nF > 0) { out.push({x, y, type: 4}); nF--; } else spots.push([x, y]);
    for (const [x, y] of M.prem) out.push({x, y, type: [0, 5, 5, 6][Math.floor(rng() * 4)]});
    let keys = M.hasKey ? 3 : 0;
    for (const [x, y] of shuf(spots)) { const r = rng(); out.push({x, y, type: keys-- > 0 ? 3 : r < .3 ? 0 : r < .46 ? 1 : r < .6 ? 2 : r < .88 ? 5 : 6}); }
    return out;
  }
  function genGuns(M, seed, teams, mode) {
    const rng = mulberry(seed ^ 0x9e3779b1), out = [];
    const pick = ws => { let r = rng() * ws.reduce((a, b) => a + b, 0); for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r <= 0) return i; } return 0; };
    const add = (x, y, g, f) => { const G = GUN[g]; out.push({id: out.length + 1, x, y, g, mag: Math.max(1, Math.round(G.mag * f)), res: Math.round(G.res * f * .6)}); };
    const spots = M.loot.slice().sort(() => rng() - .5), lk = M.lockers.slice().sort(() => rng() - .5), n = mode === "survive" ? teams + 3 : teams + 2, nl = Math.min(lk.length, Math.ceil(n / 3));
    for (let i = 0; i < nl; i++) add(lk[i].fx, lk[i].fy, pick([5, 4, 0, 0, 0]), .6 + rng() * .4);
    for (let i = 0; i < n - nl && i < spots.length; i++) add(spots[i][0] + .35, spots[i][1] - .3, pick([2, 3, 3, 3, 1]), .5 + rng() * .5);
    M.prem.forEach(([x, y], i) => { if (i < 2) add(x + .3, y - .3, pick([0, 0, 2, 3, 3]), .7 + rng() * .3); });
    return out;
  }
  function makeWorld(o) {
    const M = buildMap(o.map), T = clampN(o.teams | 0 || 3, 2, 5), seed = (o.seed | 0) || Math.floor(Math.random() * 1e9);
    const mode = o.mode === "survive" ? "survive" : "escape", diff = DIFF[o.diff] ? o.diff : "normal";
    const S = {id: o.id || Math.random().toString(36).slice(2, 10) + Date.now().toString(36), M, map: M.id, seed, nt: T, mode, diff, prac: !!o.practice, t: 0, ph: "play", winner: -1, reason: "",
      teams: Array.from({length: T}, (_, i) => ({id: i, ins: 0, alive: true})), players: [], loot: genLoot(M, seed, T, mode).map(l => ({...l, on: true, off: 0})),
      guns: genGuns(M, seed, T, mode), drops: [], doors: M.doors.map(d => ({x: d.x, y: d.y, open: 0, t: 0, locked: d.locked})), smokes: [], traps: [], noises: [], feed: [], events: [], evN: 0,
      elev: {st: 0, team: -1, t: 0, sab: 0, ping: 0}, limit: C.limit[mode] * (o.practice ? 1.25 : 1), seq: 0, sirenAt: 90, fuseAt: 150, occ: M.lockers.map(() => -1), rk: []};
    S.seq = S.guns.length; const cx = M.w / 2, cy = M.h / 2;
    for (let i = 0; i < T * 2; i++) {
      const team = i >> 1, sp = M.spawn[team], x = sp[0] + (i & 1) + .5, y = sp[1] + .5;
      S.players.push({i, team, k: o.knights && o.knights[i] != null ? o.knights[i] : i % 10, name: (o.names && o.names[i]) || "기사" + (i + 1), human: !!(o.humans && o.humans.has(i)),
        x, y, a: Math.atan2(cy - y, cx - x), hp: 100, st: 0, bat: 100, light: true, lightWant: true, inv: [1, 0, 0, 0], fuse: 0, cd: 0, stun: 0, slow: 0, reveal: 0, hitT: 0,
        hide: -1, px: x, py: y, dT: 0, prog: 0, pt: "", nzr: 0, nzc: 0, kills: 0, rev: 0, fi: 0, lastN: 0, esc: 0, latch: false, spd: o.practice ? .75 : 1, born: 0, diedAt: -1, gun: -1, mag: 0, res: 0, rl: 0, sil: false, flash: 0, lastF: 0, atkPrev: false});
    }
    return S;
  }
  /* ---- 시야·소리 ---- */
  function opaque(S, cx, cy) {
    const M = S.M, c = cellOf(M, cx, cy); if (c === 1 || c === 3) return true;
    if (c === 4) return !S.doors[M.doorAt[cy * M.w + cx]].open; return false;
  }
  function solidAt(S, x, y) {
    const M = S.M, c = cellOf(M, Math.floor(x), Math.floor(y)); if (c === 0 || c === 6) return false;
    if (c === 4) return !S.doors[M.doorAt[Math.floor(y) * M.w + Math.floor(x)]].open; return true;
  }
  function los(S, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, d = hyp(dx, dy), n = Math.max(1, Math.ceil(d / .25));
    for (let i = 1; i < n; i++) if (opaque(S, Math.floor(ax + dx * i / n), Math.floor(ay + dy * i / n))) return false;
    for (const s of S.smokes) { const t = clampN(((s.x - ax) * dx + (s.y - ay) * dy) / (d * d || 1), 0, 1); if (hyp(ax + dx * t - s.x, ay + dy * t - s.y) < s.r) return false; }
    return true;
  }
  function castRay(S, x, y, ang, max) {
    const dx = Math.cos(ang), dy = Math.sin(ang); let cx = Math.floor(x), cy = Math.floor(y);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, tdx = Math.abs(1 / (dx || 1e-9)), tdy = Math.abs(1 / (dy || 1e-9));
    let tx = (dx > 0 ? cx + 1 - x : x - cx) * tdx, ty = (dy > 0 ? cy + 1 - y : y - cy) * tdy, t = 0;
    while (t < max) { if (tx < ty) { t = tx; tx += tdx; cx += sx; } else { t = ty; ty += tdy; cy += sy; } if (opaque(S, cx, cy)) return Math.min(max, t + .28); }
    return max;
  }
  const rangeOf = p => C.range * (p.bat >= 25 ? 1 : .55 + p.bat / 25 * .45);
  function lit(S, p, x, y) {
    const dx = x - p.x, dy = y - p.y, d = hyp(dx, dy); if (d < .01) return true;
    if (d > (p.light ? rangeOf(p) : C.near)) return false;
    if (d > C.near && Math.abs(angDiff(Math.atan2(dy, dx), p.a)) > C.half) return false;
    return los(S, p.x, p.y, x, y);
  }
  function sees(S, p, q) { if (q.st === ST.hide || q.st === ST.out || q.st === ST.esc) return false; return q.reveal > 0 || (q.flash > 0 && hyp(q.x - p.x, q.y - p.y) < 16 && los(S, p.x, p.y, q.x, q.y)) || lit(S, p, q.x, q.y); }
  function noise(S, x, y, r, team) { S.noises.push({x, y, r, t: S.t, team}); if (S.noises.length > 40) S.noises.splice(0, 20); }
  function ev(S, type, a, b, x, y, c) { const e = [++S.evN, type, a, b, x === undefined ? 0 : Math.round(x * 10) / 10, y === undefined ? 0 : Math.round(y * 10) / 10]; if (c !== undefined) e.push(c); S.events.push(e); if (S.events.length > 44) S.events.shift(); }
  const teamName = t => "ABCDE"[t];
  function feed(S, text) { S.feed.push([text, S.t]); if (S.feed.length > 8) S.feed.shift(); }
  /* ---- 이동 ---- */
  function fits(S, x, y) { const r = C.rad; return !solidAt(S, x - r, y - r) && !solidAt(S, x + r, y - r) && !solidAt(S, x - r, y + r) && !solidAt(S, x + r, y + r); }
  function tryOpen(S, p, d) {
    if (d.open) return;
    if (d.locked) { if (p.inv[3] > 0) { p.inv[3]--; d.locked = false; ev(S, "unlock", p.i, 0, d.x + .5, d.y + .5); } else { if (p.human && S.t - (p.lockedMsg || -9) > 2) { p.lockedMsg = S.t; ev(S, "locked", p.i, 0, d.x, d.y); } return; } }
    d.open = 1; d.t = 3; const quiet = p.sneakNow; noise(S, d.x + .5, d.y + .5, quiet ? 2 : 6.5, p.team); ev(S, "door", p.i, quiet ? 1 : 0, d.x + .5, d.y + .5);
  }
  function moveActor(S, p, ux, uy, dist) {
    const nx = p.x + ux * dist, ny = p.y + uy * dist;
    if (fits(S, nx, p.y)) p.x = nx; else bump(S, p, nx, p.y);
    if (fits(S, p.x, ny)) p.y = ny; else bump(S, p, p.x, ny);
  }
  function bump(S, p, x, y) {
    const r = C.rad + .05;
    for (const [a, b] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
      const cx = Math.floor(x + a), cy = Math.floor(y + b);
      if (cellOf(S.M, cx, cy) === 4) tryOpen(S, p, S.doors[S.M.doorAt[cy * S.M.w + cx]]);
    }
  }
  /* ---- 행동 ---- */
  const NOIN = {dx: 0, dy: 0, a: NaN, run: false, sneak: false, light: undefined, atk: false, use: false, n: 0, act: ""};
  function unhide(S, p) {
    if (p.st !== ST.hide) return;
    S.occ[p.hide] = -1; p.st = ST.ok; p.x = p.px; p.y = p.py; p.hide = -1; ev(S, "hide", p.i, 0, p.x, p.y);
  }
  function lockerNear(S, p) {
    let best = null, bd = 1.35;
    S.M.lockers.forEach((l, i) => { const d = hyp(l.x + .5 - p.x, l.y + .5 - p.y); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function hurt(S, q, dmg, src, back, o) {
    o = o || {};
    if (o.iv) { if (q.iv > 0) return; q.iv = .9; }
    q.hp -= dmg; q.hitT = .3; q.stun = Math.max(q.stun, o.stun === undefined ? .45 : o.stun);
    ev(S, "hit", q.i, Math.round(dmg) * 2 + (back ? 1 : 0), q.x, q.y, src ? src.i : -1);
    noise(S, q.x, q.y, 5, q.team);
    if (o.kb && src) { const a = Math.atan2(q.y - src.y, q.x - src.x); moveActor(S, q, Math.cos(a), Math.sin(a), o.kb); }
    if (q.st === ST.hide) unhide(S, q);
    if (q.hp <= 0) down(S, q, src);
  }
  function down(S, q, src) {
    q.hp = 0; q.st = ST.down; q.dT = C.downT; q.light = false; q.prog = 0; q.diedAt = S.t;
    for (let n = 0; n < q.fuse; n++) S.drops.push({id: ++S.seq, x: q.x + rnd(-.5, .5), y: q.y + rnd(-.5, .5), type: 4});
    if (q.inv[3] > 0) { S.drops.push({id: ++S.seq, x: q.x, y: q.y, type: 3}); q.inv[3] = 0; }
    q.fuse = 0; if (q.gun >= 0) dropGun(S, q);
    if (src) { src.kills++; feed(S, `${src.name} → ${q.name} 쓰러뜨림`); } else feed(S, `${q.name} 쓰러짐`);
    ev(S, "down", q.i, src ? src.i : -1, q.x, q.y);
    checkTeam(S, q.team);
  }
  function checkTeam(S, t) {
    const ms = S.players.filter(q => q.team === t);
    if (ms.every(q => q.st === ST.down || q.st === ST.out)) { for (const q of ms) { q.st = ST.out; } S.teams[t].alive = false; feed(S, `${teamName(t)}팀 탈락`); ev(S, "elim", t, 0); }
  }
  function melee(S, p) {
    if (p.cd > 0 || p.st !== ST.ok || p.stun > 0) return;
    p.cd = C.cd; noise(S, p.x, p.y, 4, p.team); ev(S, "swing", p.i, 0, p.x, p.y);
    let best = null, bd = 9;
    for (const q of S.players) {
      if (q.team === p.team || q.st !== ST.ok) continue;
      const d = hyp(q.x - p.x, q.y - p.y); if (d > C.melee || d >= bd) continue;
      if (Math.abs(angDiff(Math.atan2(q.y - p.y, q.x - p.x), p.a)) > .95 || !los(S, p.x, p.y, q.x, q.y)) continue;
      best = q; bd = d;
    }
    if (best) { const back = Math.abs(angDiff(best.a, Math.atan2(p.y - best.y, p.x - best.x))) > 2.1; hurt(S, best, back ? C.back : C.dmg, p, back, {iv: true, kb: back ? .55 : .3, stun: .45}); if (back) ev(S, "stab", p.i, best.i, best.x, best.y); }
  }
  function gunNear(S, p) {
    let bi = -1, bd = 1.25; S.guns.forEach((g, i) => { const d = hyp(g.x - p.x, g.y - p.y); if (d < bd) { bd = d; bi = i; } }); return bi;
  }
  function dropGun(S, p) {
    if (p.gun < 0) return; S.guns.push({id: ++S.seq, x: p.x, y: p.y, g: p.gun, mag: p.mag, res: 0}); ev(S, "drop", p.i, p.gun, p.x, p.y); p.gun = -1; p.mag = 0; p.rl = 0;
  }
  function pickGun(S, p, i) {
    const g = S.guns[i]; if (!g) return; S.guns.splice(i, 1); if (p.gun >= 0) dropGun(S, p);
    p.gun = g.g; p.mag = g.mag; p.res = Math.min(80, p.res + g.res); p.rl = 0; p.latch = true; ev(S, "gunpick", p.i, g.g, p.x, p.y);
  }
  function reloadStart(S, p) {
    if (p.gun < 0 || p.rl > 0 || p.mag >= GUN[p.gun].mag || p.res <= 0) return false;
    p.rl = GUN[p.gun].rl; ev(S, "reload", p.i, p.gun, p.x, p.y); noise(S, p.x, p.y, 2.5, p.team); return true;
  }
  function fire(S, p) {
    const G = GUN[p.gun];
    if (p.cd > 0 || p.rl > 0 || p.st !== ST.ok || p.stun > 0) return false;
    if (p.mag <= 0) { if (p.res > 0) reloadStart(S, p); else if (S.t - (p.emptyAt || -9) > .6) { p.emptyAt = S.t; ev(S, "empty", p.i, 0, p.x, p.y); } return false; }
    p.mag--; p.cd = G.cd; const sil = p.sil, mv = p.nzc === 2 ? 1.9 : p.nzc === 1 ? 1.4 : p.sneakNow ? .7 : 1;
    let ex = p.x, ey = p.y, holes = 0;
    for (let k = 0; k < G.pel; k++) {
      const a = p.a + (Math.random() * 2 - 1) * G.spr * mv, wd = castRay(S, p.x, p.y, a, G.rng), wall = wd < G.rng - .01, reach = wall ? Math.max(.2, wd - .28) : G.rng, ca = Math.cos(a), sa = Math.sin(a);
      let victim = null, va = 99;
      for (const q of S.players) {
        if (q.team === p.team || q.st !== ST.ok) continue;
        const dx = q.x - p.x, dy = q.y - p.y, al = dx * ca + dy * sa; if (al < .2 || al > reach || al >= va) continue;
        if (Math.abs(-dx * sa + dy * ca) < .33) { victim = q; va = al; }
      }
      const end = victim ? va : reach;
      if (k === 0) { ex = p.x + ca * end; ey = p.y + sa * end; }
      if (victim) { const fall = G.pel > 1 ? clampN(1.25 - end / G.rng * 1.1, .2, 1) : 1 - .25 * end / G.rng; hurt(S, victim, G.dmg * fall, p, false, {kb: G.kb * .4, stun: .1}); }
      else if (wall && holes < 2) { holes++; ev(S, "hole", p.i, 0, p.x + ca * wd, p.y + sa * wd); }
    }
    noise(S, p.x, p.y, G.noise * (sil ? .35 : 1), p.team); p.flash = sil ? .05 : .25;
    ev(S, "shot", p.i, p.gun + (sil ? 10 : 0), ex, ey); return true;
  }
  function attack(S, p) { if (p.gun >= 0) return fire(S, p); return melee(S, p); }
  function useItem(S, p, act) {
    if (p.st !== ST.ok) return;
    if (act === "reload") return reloadStart(S, p);
    if (act === "drop") return dropGun(S, p);
    if (act === "melee") return melee(S, p);
    if (act === "bat" && p.inv[0] > 0 && p.bat < 90) { p.inv[0]--; p.bat = Math.min(100, p.bat + 60); ev(S, "bat", p.i, 0, p.x, p.y); }
    else if (act === "smoke" && p.inv[1] > 0) {
      p.inv[1]--; let d = .6; while (d < 3.2 && !solidAt(S, p.x + Math.cos(p.a) * (d + .4), p.y + Math.sin(p.a) * (d + .4))) d += .3;
      S.smokes.push({x: p.x + Math.cos(p.a) * d, y: p.y + Math.sin(p.a) * d, t: 7.5, r: 2.3}); noise(S, p.x, p.y, 4, p.team); ev(S, "smoke", p.i, 0, p.x, p.y);
    } else if (act === "trap" && p.inv[2] > 0) { p.inv[2]--; S.traps.push({x: p.x, y: p.y, team: p.team, id: ++S.seq}); ev(S, "trapset", p.i, p.team, p.x, p.y); }
  }
  function interact(S, p, use, dt) {
    let kind = "", need = 0, li = null, mate = null, gi = -1;
    if (use && p.st === ST.ok) {
      mate = S.players.find(q => q.team === p.team && q !== p && q.st === ST.down && hyp(q.x - p.x, q.y - p.y) < 1.3);
      if (mate) { kind = "rev"; need = C.reviveT; }
      else if (S.mode === "escape") {
        const ec = elevC(S.M), de = hyp(p.x - ec[0], p.y - ec[1]);
        if (de < 2.1) {
          if (S.elev.st === 1 && S.elev.team !== p.team) { kind = "sab"; need = C.sabT; }
          else if (S.elev.st === 0 && p.fuse > 0 && S.teams[p.team].ins < 3) { kind = "ins"; need = C.insertT; }
        }
      }
      if (!kind && !p.latch) { gi = gunNear(S, p); if (gi >= 0) { kind = "gun"; need = .01; } }
      if (!kind) {
        li = lockerNear(S, p);
        if (li !== null && !p.latch) {
          const o = S.occ[li];
          if (o < 0) { kind = "hide"; need = .01; } else if (S.players[o].team !== p.team) { kind = "search"; need = 1.2; } else li = null;
        } else li = null;
      }
    }
    if (!kind) { p.prog = 0; p.pt = ""; return; }
    if (p.pt !== kind) { p.prog = 0; p.pt = kind; }
    p.prog += dt; if (p.prog < need) return;
    p.prog = 0; p.pt = "";
    if (kind === "rev") { mate.st = ST.ok; mate.hp = 45; mate.dT = 0; mate.stun = .5; mate.light = mate.lightWant && mate.bat > 0; p.rev++; ev(S, "revive", p.i, mate.i, mate.x, mate.y); noise(S, p.x, p.y, 3, p.team); feed(S, `${p.name} → ${mate.name} 구조`); }
    else if (kind === "ins") {
      p.fuse--; p.fi++; const t = S.teams[p.team]; t.ins++; ev(S, "insert", p.i, t.ins, p.x, p.y); noise(S, p.x, p.y, 10, p.team); feed(S, `${teamName(p.team)}팀 퓨즈 ${t.ins}/3`);
      if (t.ins >= 3) { S.elev = {st: 1, team: p.team, t: 0, sab: 0, ping: 0}; feed(S, `${teamName(p.team)}팀이 엘리베이터를 가동 중! 막아야 해요`); ev(S, "start", p.team, 0); }
    } else if (kind === "sab") {
      const t = S.teams[S.elev.team]; t.ins = Math.max(0, t.ins - 1); feed(S, `${p.name} → ${teamName(S.elev.team)}팀 가동 방해 성공`); ev(S, "sabotage", p.i, S.elev.team);
      S.elev = {st: 0, team: -1, t: 0, sab: 0, ping: 0}; noise(S, p.x, p.y, 10, p.team);
    } else if (kind === "gun") {
      pickGun(S, p, gi);
    } else if (kind === "hide") {
      p.latch = true; p.px = p.x; p.py = p.y; const l = S.M.lockers[li]; p.x = l.x + .5; p.y = l.y + .5; p.st = ST.hide; p.hide = li; p.light = false; S.occ[li] = p.i; noise(S, p.x, p.y, 1.5, p.team); ev(S, "hide", p.i, 1, p.x, p.y);
    } else if (kind === "search") {
      const o = S.players[S.occ[li]]; if (o) { unhide(S, o); o.stun = .9; noise(S, p.x, p.y, 6, p.team); ev(S, "found", o.i, p.i, o.x, o.y); }
    }
  }
  function pickups(S, p) {
    const take = (type) => {
      if (type === 4) { if (p.fuse >= 2) return false; p.fuse++; return true; }
      if (type === 5) { if (p.res >= 60) return false; p.res = Math.min(60, p.res + 10); return true; }
      if (type === 6) { if (p.sil) return false; p.sil = true; return true; }
      const cap = [3, 2, 2, 1][type]; if (p.inv[type] >= cap) return false; p.inv[type]++; return true;
    };
    for (const l of S.loot) if (l.on && Math.abs(l.x - p.x) < .6 && Math.abs(l.y - p.y) < .6 && take(l.type)) { l.on = false; l.off = S.t; ev(S, "pick", p.i, l.type, l.x, l.y); noise(S, p.x, p.y, 2.5, p.team); }
    for (let i = S.drops.length - 1; i >= 0; i--) { const l = S.drops[i]; if (Math.abs(l.x - p.x) < .6 && Math.abs(l.y - p.y) < .6 && take(l.type)) { S.drops.splice(i, 1); ev(S, "pick", p.i, l.type, l.x, l.y); } }
  }
  function control(S, p, inp, dt) {
    if (p.st === ST.out || p.st === ST.esc) { p.nzr = 0; p.nzc = 0; return; }
    p.cd = Math.max(0, p.cd - dt); p.stun = Math.max(0, p.stun - dt); p.slow = Math.max(0, p.slow - dt); p.reveal = Math.max(0, p.reveal - dt); p.hitT = Math.max(0, p.hitT - dt); p.iv = Math.max(0, (p.iv || 0) - dt); p.flash = Math.max(0, (p.flash || 0) - dt);
    if (p.st === ST.down) { p.dT -= dt; p.nzr = 0; p.nzc = 0; p.light = false; if (p.dT <= 0) { p.st = ST.out; ev(S, "out", p.i, 0, p.x, p.y); checkTeam(S, p.team); } return; }
    if (Number.isFinite(inp.a)) p.a = inp.a;
    const want = inp.light === undefined ? p.lightWant : !!inp.light;
    if (want !== p.lightWant) { p.lightWant = want; if (p.st === ST.ok) ev(S, "click", p.i, want ? 1 : 0, p.x, p.y); }
    p.light = p.lightWant && p.bat > 0 && p.st === ST.ok;
    if (p.st === ST.hide) { p.nzr = 0; p.nzc = 0; if (inp.use && !p.latch) { p.latch = true; unhide(S, p); } if (!inp.use) p.latch = false; return; }
    if (!inp.use) p.latch = false;
    if (p.rl > 0) { p.rl -= dt; if (p.rl <= 0) { p.rl = 0; if (p.gun >= 0) { const G = GUN[p.gun], take = Math.min(G.mag - p.mag, p.res); p.mag += take; p.res -= take; ev(S, "reloaded", p.i, 0, p.x, p.y); } } }
    if (p.light) { p.bat = Math.max(0, p.bat - C.bat * (S.mode === "survive" && S.t > 120 ? 2.2 : 1) * dt); if (p.bat <= 0 && p.inv[0] > 0) useItem(S, p, "bat"); }
    let dx = inp.dx || 0, dy = inp.dy || 0; const len0 = hyp(dx, dy), len = Math.min(len0, 1);
    const mv = len > .15 && p.stun <= 0, sneak = !!inp.sneak, run = !!inp.run && !sneak && mv; p.sneakNow = sneak;
    if (mv) {
      const sp = (sneak ? C.sneak : run ? C.run : C.walk) * Math.min(1, .45 + len * .55) * (p.slow > 0 ? .55 : 1) * (p.rl > 0 ? .85 : 1) * (p.spd || 1);
      moveActor(S, p, dx / len0, dy / len0, sp * dt);
    }
    p.nzr = mv ? (run ? 9 : sneak ? 1.3 : 5) : 0; p.nzc = mv ? (run ? 2 : sneak ? 0 : 1) : 0;
    const auto = p.gun >= 0 ? GUN[p.gun].auto : 1, pulse = inp.f !== undefined && inp.f !== p.lastF;
    if (pulse) p.lastF = inp.f;
    if ((inp.atk && (auto || !p.atkPrev)) || pulse) attack(S, p);
    p.atkPrev = !!inp.atk;
    interact(S, p, !!inp.use, dt);
    if (inp.n !== p.lastN) { p.lastN = inp.n; useItem(S, p, inp.act); }
    pickups(S, p);
  }
  /* ---- 봇 ---- */
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function findPath(S, x0, y0, x1, y1, key) {
    const M = S.M, W = M.w, sx = Math.floor(x0), sy = Math.floor(y0), tx = Math.floor(x1), ty = Math.floor(y1);
    if (sx === tx && sy === ty) return [[x1, y1]];
    const walk = (x, y) => { const c = cellOf(M, x, y); if (c === 0 || c === 6) return true; if (c === 4) return key || !S.doors[M.doorAt[y * W + x]].locked; return false; };
    if (!walk(tx, ty)) return null;
    const prev = new Int16Array(W * M.h).fill(-1), q = [sy * W + sx]; prev[q[0]] = q[0];
    for (let i = 0; i < q.length; i++) {
      const c = q[i]; if (c === ty * W + tx) break; const cx = c % W, cy = (c / W) | 0;
      for (const [dx, dy] of D4) { const nx = cx + dx, ny = cy + dy; if (!walk(nx, ny)) continue; const n = ny * W + nx; if (prev[n] >= 0) continue; prev[n] = c; q.push(n); }
    }
    if (prev[ty * W + tx] < 0) return null;
    const path = [[x1, y1]]; let c = ty * W + tx;
    while (c !== sy * W + sx) { path.push([(c % W) + .5, ((c / W) | 0) + .5]); c = prev[c]; }
    path.reverse(); return path;
  }
  function lineFree(S, ax, ay, bx, by) { const d = hyp(bx - ax, by - ay), n = Math.max(1, Math.ceil(d / .22)); for (let i = 1; i <= n; i++) if (!fits(S, ax + (bx - ax) * i / n, ay + (by - ay) * i / n)) return false; return true; }
  function aiThink(S, p, dt) {
    const D = DIFF[S.diff] || DIFF.normal;
    let ai = p.ai;
    if (!ai) {
      ai = p.ai = {path: null, pg: null, pt: -9, tt: Math.random() * .2, tgt: -1, seen: -9, fight: false, rt: 0, heard: null, known: new Set(), hideT: 0, n: 0, goal: null, lastX: p.x, lastY: p.y, stuck: 0, sc: 0,
        visited: new Set(), wp: null, wpT: 0, trapT: 8 + Math.random() * 20, off: 0, runMode: false, sweep: Math.random() * 6, search: 0};
      S.loot.forEach((l, i) => { if (l.type === 4 && Math.random() < D.know) ai.known.add(i); });
    }
    p.spd = D.spd * (S.prac ? .85 : 1);
    const inp = {dx: 0, dy: 0, a: p.a, run: false, sneak: false, light: true, atk: false, use: false, n: ai.n, act: ""};
    if (p.st === ST.hide) { ai.hideT -= dt; inp.use = ai.hideT <= 0; return inp; }
    if (p.st !== ST.ok) return inp;
    const team = S.teams[p.team], el = S.elev, ec = elevC(S.M), mate = S.players.find(q => q.team === p.team && q !== p);
    ai.tt -= dt;
    if (ai.tt <= 0) {
      ai.tt = D.think * (.8 + Math.random() * .4);
      let best = null, bd = 99, glow = null;
      for (const q of S.players) {
        if (q.team === p.team || q.st !== ST.ok) continue;
        const d = hyp(q.x - p.x, q.y - p.y), l = d < 14 && los(S, p.x, p.y, q.x, q.y);
        if (d < bd && sees(S, p, q)) { bd = d; best = q; }
        if (q.nzr > 0 && d * (l ? 1 : 1.6) < q.nzr * D.hear) ai.heard = {x: q.x + rnd(-1.2, 1.2), y: q.y + rnd(-1.2, 1.2), t: S.t};
        if (q.light && l && d > 2) glow = q;
      }
      for (const n of S.noises) if (n.team !== p.team && S.t - n.t < 1.2 && hyp(n.x - p.x, n.y - p.y) * 1.2 < n.r * D.hear) ai.heard = {x: n.x + rnd(-1, 1), y: n.y + rnd(-1, 1), t: S.t};
      if (best) {
        if (S.t - ai.seen > 2 || ai.tgt !== best.i) { ai.rt = D.react * (.7 + Math.random() * .6); ai.fight = S.t > (ai.calm || 0) && Math.random() < D.aggr * (S.mode === "survive" ? .6 : 1) * (.5 + p.hp / 200) * (bd < 4 ? 1 : .4) + (best.fuse ? .3 : 0); }
        ai.tgt = best.i; ai.seen = S.t; ai.aimErr = (Math.random() * 2 - 1) * ({easy: .17, normal: .09, hard: .04})[S.diff];
      }
      if (glow && S.diff === "hard" && !best && Math.random() < .5) ai.off = 2.5;
      S.loot.forEach((l, i) => { if (l.on && !ai.known.has(i) && lit(S, p, l.x, l.y)) ai.known.add(i); });
      for (const l of S.drops) if (!ai.known.has("d" + l.id) && lit(S, p, l.x, l.y)) ai.known.add("d" + l.id);
      for (const l of S.guns) if (!ai.known.has("g" + l.id) && lit(S, p, l.x, l.y)) ai.known.add("g" + l.id);
      // 목표 고르기
      if (ai.fight && !ai.fightT) ai.fightT = S.t; if (ai.fight && S.t - ai.fightT > 6) { ai.fight = false; ai.calm = S.t + 9; }
      if (!ai.fight && ai.fightT && S.t - ai.seen > 3) ai.fightT = 0;
      const enemyNow = S.t - ai.seen < 1 && ai.tgt >= 0 && S.players[ai.tgt].st === ST.ok;
      const carried = S.players.filter(q => q.team === p.team && q.st !== ST.out).reduce((a, q) => a + q.fuse, 0);
      const nearestOf = (list) => { let b = null, bd2 = 1e9; for (const t of list) { const d = hyp(t.x - p.x, t.y - p.y); if (d < bd2) { bd2 = d; b = t; } } return b; };
      let g = null;
      if (mate && mate.st === ST.down && !enemyNow) g = {x: mate.x, y: mate.y, k: "rev"};
      else if (enemyNow) {
        const q = S.players[ai.tgt];
        if (ai.fight) g = {x: q.x, y: q.y, k: "fight"};
        else {
          const lk = S.M.lockers.map((l, i) => ({...l, i, x: l.fx, y: l.fy})).filter(l => S.occ[l.i] < 0 && hyp(l.x - p.x, l.y - p.y) < 6);
          const near = nearestOf(lk);
          if (near && (p.hp < 60 || S.diff !== "easy")) g = {x: near.fx, y: near.fy, k: "hidespot", li: near.i};
          else { const far = S.M.way.slice().sort((a, b) => hyp(b[0] - q.x, b[1] - q.y) - hyp(a[0] - q.x, a[1] - q.y)).slice(0, 3); const w = far[Math.floor(Math.random() * far.length)]; g = {x: w[0], y: w[1], k: "flee"}; }
        }
      } else {
        if (S.mode === "escape") {
          if (el.st === 2 && el.team === p.team) g = {x: ec[0], y: ec[1], k: "exit"};
          else if (el.st === 1 && el.team !== p.team && Math.random() < D.sab) g = {x: ec[0], y: ec[1], k: "sab"};
          else if (p.fuse > 0 && el.st === 0 && team.ins < 3 && (team.ins + carried >= 3 || S.t > S.limit - 100)) g = {x: ec[0], y: ec[1], k: "ins"};
          else if (el.st === 0 && team.ins + carried >= 3 && p.fuse === 0 && S.t - (ai.guardT || -99) > 0) g = {x: ec[0] + rnd(-1.5, 1.5), y: ec[1] + 1.5, k: "guard"};
        }
        if (!g && p.gun < 0 && S.guns.length) { let bg = null, bd2 = 1e9; for (const gn of S.guns) { if (!ai.known.has("g" + gn.id)) continue; const d = hyp(gn.x - p.x, gn.y - p.y); if (d < bd2) { bd2 = d; bg = gn; } } if (bg) g = {x: bg.x, y: bg.y, k: "gun"}; }
        if (!g && ai.heard && S.t - ai.heard.t < 5 && (p.fuse === 0 || S.diff === "hard") && Math.random() < .55) g = {x: ai.heard.x, y: ai.heard.y, k: "inv"};
        if (!g) {
          const want = [];
          if (S.mode === "escape" && team.ins + carried < 3 && p.fuse < 2) S.loot.forEach((l, i) => { if (l.on && l.type === 4 && ai.known.has(i)) want.push(l); });
          if (S.mode === "escape" && team.ins + carried < 3) for (const l of S.drops) if (l.type === 4 && ai.known.has("d" + l.id)) want.push(l);
          if (!want.length && p.bat < 40 && p.inv[0] === 0) S.loot.forEach((l, i) => { if (l.on && l.type === 0 && ai.known.has(i)) want.push(l); });
          if (!want.length) S.loot.forEach((l, i) => { if (l.on && l.type !== 4 && ai.known.has(i) && (l.type === 5 ? p.gun >= 0 && p.res < 30 : l.type === 6 ? p.gun >= 0 && !p.sil : p.inv[l.type] < [3, 2, 2, 1][l.type]) && hyp(l.x - p.x, l.y - p.y) < 7) want.push(l); });
          const t = nearestOf(want); if (t) g = {x: t.x, y: t.y, k: "loot"};
        }
        if (!g) {
          if (ai.wp && hyp(ai.wp[0] - p.x, ai.wp[1] - p.y) < 1.6 && !ai.paused) { ai.paused = true; ai.pauseT = S.t + 2.2 + Math.random() * 1.5; }
          if (ai.paused && S.t < ai.pauseT) g = {x: p.x, y: p.y, k: "look"};
          else if (!ai.wp || ai.paused || S.t - ai.wpT > 25) {
            ai.paused = false;
            if (ai.wp) ai.visited.add(ai.wp.join());
            let cand = S.M.way.filter(w => !ai.visited.has(w.join()));
            if (!cand.length) { ai.visited.clear(); cand = S.M.way; }
            cand = cand.slice().sort((a, b) => hyp(a[0] - p.x, a[1] - p.y) - hyp(b[0] - p.x, b[1] - p.y)).slice(0, 3);
            ai.wp = cand[Math.floor(Math.random() * cand.length)]; ai.wpT = S.t;
          }
          if (!g) g = {x: ai.wp[0], y: ai.wp[1], k: "explore"};
        }
      }
      if (!ai.goal || ai.goal.k !== g.k || hyp(ai.goal.x - g.x, ai.goal.y - g.y) > 1.3) { ai.runMode = Math.random() < D.runP; ai.path = null; }
      ai.goal = g;
    }
    // ----- 실행
    const g = ai.goal; ai.off = Math.max(0, ai.off - dt);
    inp.light = ai.off <= 0 && !(p.bat < 8 && p.inv[0] === 0);
    if (p.bat < 25 && p.inv[0] > 0) { inp.act = "bat"; inp.n = ++ai.n; }
    if (ai.rt > 0) { ai.rt -= dt; if (S.t - ai.seen < 1 && ai.tgt >= 0) inp.a = Math.atan2(S.players[ai.tgt].y - p.y, S.players[ai.tgt].x - p.x); return inp; }
    if (!g) return inp;
    const dd = hyp(g.x - p.x, g.y - p.y);
    let move = true;
    if (g.k === "fight") {
      const q = S.players[ai.tgt], G = p.gun >= 0 ? GUN[p.gun] : null, ta = Math.atan2(q.y - p.y, q.x - p.x);
      inp.a = ta + (G ? ai.aimErr || 0 : 0);
      if (G && (p.mag > 0 || p.res > 0)) {
        const vis = los(S, p.x, p.y, q.x, q.y), pref = Math.max(1.6, Math.min(7, G.rng * .45));
        if (vis && dd < G.rng * .95 && Math.abs(angDiff(ta, p.a)) < .25) inp.atk = true;
        move = dd > pref + 1.2 || !vis;
        if (p.mag <= 0 && p.res > 0 && p.rl <= 0) { inp.act = "reload"; inp.n = ++ai.n; }
      } else if (dd < C.melee * .85) { if (G) { inp.act = "melee"; inp.n = ++ai.n; } else inp.atk = true; move = dd > .7; }
      if (p.hp < 45 && p.inv[1] > 0 && dd < 4 && !inp.act) { inp.act = "smoke"; inp.n = ++ai.n; }
    } else if (g.k === "gun" && dd < .9) { inp.use = true; move = false; }
    else if (g.k === "rev" && dd < 1.1) { inp.use = true; move = false; }
    else if ((g.k === "ins" || g.k === "sab") && dd < 1.7) { inp.use = true; move = false; }
    else if ((g.k === "exit" || g.k === "guard") && dd < 1) move = false;
    else if (g.k === "look") { move = false; inp.a = p.a + dt * 2.4; }
    else if (g.k === "hidespot" && dd < .5) { inp.use = true; move = false; ai.hideT = rnd(5, 9); }
    else if (g.k === "inv" && dd < 1.4) {
      move = false; ai.search += dt; inp.a = p.a + Math.sin(S.t * 3) * .02 + dt * 2;
      if (ai.search > 1.6) { ai.search = 0; ai.heard = null; const lk = S.M.lockers.filter((l, i) => S.occ[i] >= 0 && hyp(l.x - p.x, l.y - p.y) < 3.5); if (lk.length && Math.random() < .5) { const l = lk[0]; ai.goal = {x: l.fx, y: l.fy, k: "check"}; } }
    } else if (g.k === "check" && dd < .8) { inp.use = true; move = false; }
    if (p.gun >= 0 && !inp.act && g.k !== "fight" && p.rl <= 0 && p.res > 0 && p.mag < GUN[p.gun].mag * .4) { inp.act = "reload"; inp.n = ++ai.n; }
    if (S.mode === "escape" && !inp.act && p.inv[2] > 0 && S.t > ai.trapT && g.k === "explore") { inp.act = "trap"; inp.n = ++ai.n; ai.trapT = S.t + 15 + Math.random() * 25; }
    if (move) {
      if (!ai.path || !ai.pg || hyp(ai.pg[0] - g.x, ai.pg[1] - g.y) > 1.2 || S.t - ai.pt > .8) {
        ai.path = findPath(S, p.x, p.y, g.x, g.y, p.inv[3] > 0); ai.pg = [g.x, g.y]; ai.pt = S.t;
        if (!ai.path) { ai.wp = null; ai.goal = null; ai.tt = 0; if (g.k === "explore") ai.visited.add(g.x + "," + g.y); return inp; }
      }
      const path = ai.path;
      while (path.length > 1 && hyp(path[0][0] - p.x, path[0][1] - p.y) < .45) path.shift();
      while (path.length > 1 && lineFree(S, p.x, p.y, path[1][0], path[1][1])) path.shift();
      const w = path[0], wd = hyp(w[0] - p.x, w[1] - p.y);
      if (wd > .05) { inp.dx = (w[0] - p.x) / wd; inp.dy = (w[1] - p.y) / wd; }
      const sneak = g.k === "flee" ? false : (g.k === "inv" && S.diff === "hard");
      inp.sneak = sneak; inp.run = !sneak && (g.k === "flee" || g.k === "fight" || (ai.runMode && dd > 7));
      if (g.k !== "fight") { ai.sweep += dt * 1.8; inp.a = Math.atan2(inp.dy, inp.dx) + Math.sin(ai.sweep) * .75; }
    }
    ai.sc += dt;
    if (ai.sc > .7) { if (move && hyp(p.x - ai.lastX, p.y - ai.lastY) < .12 && p.stun <= 0) { ai.path = null; ai.stuck++; if (ai.stuck > 2) { ai.wp = null; ai.goal = null; ai.stuck = 0; ai.tt = 0; } } else ai.stuck = 0; ai.lastX = p.x; ai.lastY = p.y; ai.sc = 0; }
    return inp;
  }
  /* ---- 한 틱 ---- */
  function teamScore(S, t) { return (S.teams[t].alive ? 10000 : 0) + S.teams[t].ins * 100 + S.players.filter(q => q.team === t && q.st !== ST.out).length * 30 + S.players.filter(q => q.team === t).reduce((a, q) => a + q.kills, 0) * 5; }
  function endGame(S, winner, reason) {
    if (S.ph === "over") return; S.ph = "over"; S.winner = winner; S.reason = reason; S.endT = S.t;
    const order = S.teams.map(t => t.id).sort((a, b) => (b === winner) - (a === winner) || teamScore(S, b) - teamScore(S, a));
    S.rk = S.teams.map(t => order.indexOf(t.id) + 1);
    ev(S, "over", winner, 0);
  }
  function step(S, dt, inputs) {
    if (S.ph !== "play") return;
    S.t += dt;
    for (const d of S.doors) if (d.open) {
      let busy = false; for (const p of S.players) if (p.st !== ST.out && p.st !== ST.hide && Math.abs(p.x - d.x - .5) < .9 && Math.abs(p.y - d.y - .5) < .9) { busy = true; break; }
      if (busy) d.t = 3; else if ((d.t -= dt) <= 0) d.open = 0;
    }
    if (S.mode === "survive" && S.t > S.sirenAt) { S.sirenAt += 25; for (const p of S.players) if (p.st === ST.ok || p.st === ST.hide) p.reveal = 2.4; feed(S, "순찰 사이렌 — 모두의 위치가 드러났어요"); ev(S, "siren", 0, 0); }
    if (S.mode === "escape" && S.t > S.fuseAt) { S.fuseAt += 30; let any = false; for (const p of S.players) if (p.fuse > 0 && (p.st === ST.ok || p.st === ST.hide)) { p.reveal = 3; any = true; } if (any) { feed(S, "정전 사이렌 — 퓨즈를 든 사람의 위치가 드러났어요"); ev(S, "siren", 1, 0); } }
    for (const p of S.players) control(S, p, p.human ? ((inputs && inputs[p.i]) || NOIN) : aiThink(S, p, dt), dt);
    for (let i = S.smokes.length - 1; i >= 0; i--) if ((S.smokes[i].t -= dt) <= 0) S.smokes.splice(i, 1);
    for (let i = S.traps.length - 1; i >= 0; i--) {
      const tr = S.traps[i], v = S.players.find(q => q.team !== tr.team && q.st === ST.ok && hyp(q.x - tr.x, q.y - tr.y) < .6);
      if (v) { S.traps.splice(i, 1); v.reveal = 5; v.slow = 3; v.stun = .5; noise(S, tr.x, tr.y, 12, tr.team); ev(S, "alarmtrap", v.i, tr.team, tr.x, tr.y); feed(S, `${v.name} 경보 함정 작동`); }
    }
    for (const l of S.loot) if (!l.on && l.type < 4 && S.t - l.off > 60 && !S.players.some(q => hyp(q.x - l.x, q.y - l.y) < 2.5)) l.on = true;
    if (S.noises.length && S.t - S.noises[0].t > 2) S.noises = S.noises.filter(n => S.t - n.t < 2);
    const el = S.elev, ec = elevC(S.M);
    if (el.st >= 1 && !S.teams[el.team].alive) { feed(S, "엘리베이터 가동이 멈췄어요"); S.elev = {st: 0, team: -1, t: 0, sab: 0, ping: 0}; }
    else if (el.st === 1) {
      el.t += dt; el.ping -= dt; if (el.ping <= 0) { el.ping = 2; noise(S, ec[0], ec[1], 13, el.team); ev(S, "alarm", el.team, 0, ec[0], ec[1]); }
      if (el.t >= C.workT) { el.st = 2; el.t = 0; feed(S, `${teamName(el.team)}팀 엘리베이터 개방!`); ev(S, "open", el.team, 0, ec[0], ec[1]); }
    } else if (el.st === 2) {
      el.o = (el.o || 0) + dt;
      if (el.o > 45) { S.teams[el.team].ins = 2; feed(S, "엘리베이터 문이 닫혔어요 — 퓨즈 하나가 타버렸어요"); ev(S, "close", el.team, 0); S.elev = {st: 0, team: -1, t: 0, sab: 0, ping: 0}; return stepEnd(S); }
      for (const p of S.players) if (p.team === el.team && p.st === ST.ok) {
        if (hyp(p.x - ec[0], p.y - ec[1]) < 1.6) { p.esc += dt; if (p.esc >= C.escT) { p.st = ST.esc; endGame(S, p.team, "escape"); return; } } else p.esc = Math.max(0, p.esc - dt * 2);
      }
    }
    stepEnd(S);
  }
  function stepEnd(S) {
    const alive = S.teams.filter(t => t.alive);
    if (alive.length <= 1) endGame(S, alive.length ? alive[0].id : -1, "last");
    else if (S.t >= S.limit) {
      const sc = S.teams.map(t => teamScore(S, t.id)), top = Math.max(...sc), n = sc.filter(v => v === top).length;
      endGame(S, n === 1 ? sc.indexOf(top) : -1, "time");
    }
  }
  /* ---- 스냅샷 ---- */
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  function encode(S) {
    return {v: 1, id: S.id, map: S.map, seed: S.seed, nt: S.nt, mode: S.mode, diff: S.diff, prac: S.prac ? 1 : 0, lim: S.limit, t: r2(S.t), ph: S.ph, w: S.winner, rs: S.reason, rk: S.rk,
      el: [S.elev.st, S.elev.team, r1(S.elev.t)], tm: S.teams.map(t => t.ins * 2 + (t.alive ? 1 : 0)),
      P: S.players.map(p => [r2(p.x), r2(p.y), r2(p.a), Math.round(p.hp), p.st, Math.round(p.bat), p.fuse, p.light ? 1 : 0, p.nzc, p.inv.join(""), p.kills, p.rev, r1(p.dT), p.reveal > 0 ? 1 : 0, p.hide, p.human ? 1 : 0, r2(p.prog), p.pt, p.k, p.name, p.fi, r1(p.hitT), r1(p.stun), r1(p.slow), r1(p.esc), p.gun, p.mag, p.res, r1(p.rl), p.sil ? 1 : 0, r2(p.cd), r1(p.flash || 0)]),
      lo: S.loot.map(l => l.on ? 1 : 0).join(""), dr: S.doors.map(d => d.locked ? 2 : d.open ? 1 : 0).join(""),
      dp: S.drops.map(d => [r1(d.x), r1(d.y), d.type, d.id]), sm: S.smokes.map(s => [r1(s.x), r1(s.y), r1(s.t)]), tr: S.traps.map(t => [r1(t.x), r1(t.y), t.team]),
      gn: S.guns.map(g => [r1(g.x), r1(g.y), g.g, g.mag, g.res, g.id]), ev: S.events.slice(-24), fd: S.feed.slice(-5)};
  }
  function decode(S, m) {
    S.t = m.t; S.ph = m.ph; S.winner = m.w; S.reason = m.rs || ""; S.rk = m.rk || []; S.limit = m.lim;
    S.elev.st = m.el[0]; S.elev.team = m.el[1]; S.elev.t = m.el[2];
    m.tm.forEach((v, i) => { if (S.teams[i]) { S.teams[i].ins = v >> 1; S.teams[i].alive = !!(v & 1); } });
    m.P.forEach((a, i) => {
      const p = S.players[i]; if (!p) return;
      const first = p.rx === undefined; p.x = a[0]; p.y = a[1]; if (first) { p.rx = a[0]; p.ry = a[1]; p.ra = a[2]; }
      p.a = a[2]; p.hp = a[3]; p.st = a[4]; p.bat = a[5]; p.fuse = a[6]; p.light = !!a[7]; p.nzc = a[8]; p.inv = String(a[9]).split("").map(Number); p.kills = a[10]; p.rev = a[11]; p.dT = a[12];
      p.reveal = a[13]; p.hide = a[14]; p.human = !!a[15]; p.prog = a[16]; p.pt = a[17]; p.k = a[18]; p.name = a[19]; p.fi = a[20]; p.hitT = a[21]; p.stun = a[22]; p.slow = a[23]; p.esc = a[24]; p.gun = a[25]; p.mag = a[26]; p.res = a[27]; p.rl = a[28]; p.sil = !!a[29]; p.cd = a[30]; p.flash = a[31];
    });
    for (let i = 0; i < S.loot.length; i++) S.loot[i].on = m.lo[i] === "1";
    for (let i = 0; i < S.doors.length; i++) { const c = m.dr[i]; S.doors[i].open = c === "1" ? 1 : 0; S.doors[i].locked = c === "2"; }
    S.drops = m.dp.map(([x, y, type, id]) => ({x, y, type, id})); S.smokes = m.sm.map(([x, y, t]) => ({x, y, t, r: 2.3})); S.traps = m.tr.map(([x, y, team]) => ({x, y, team}));
    S.events = m.ev; S.feed = m.fd; S.guns = (m.gn || []).map(([x, y, g, mag, res, id]) => ({id, x, y, g, mag, res}));
    if (S.occ) { S.occ.fill(-1); for (const p of S.players) if (p.st === ST.hide && p.hide >= 0) S.occ[p.hide] = p.i; }
  }
  const core = {C, ST, ITEM, DIFF, MAPS, TEAM: [["A", "#E69F00", "●"], ["B", "#56B4E9", "■"], ["C", "#CC79A7", "▲"], ["D", "#F0E442", "◆"], ["E", "#FFFFFF", "★"]],
    GUN, gunNear, buildMap, makeWorld, step, encode, decode, los, lit, sees, castRay, rangeOf, elevC, findPath, teamScore, teamName, endGame, opaque, solidAt, cellOf, angDiff, useItem, NOIN};
  root.roundbNightPatrolCore = core;
  /* ================= UI ================= */
  const games = root.knx && root.knx.games;
  if (!games || typeof document === "undefined") return;
  try { initUI(); } catch (e) { console.error("nightpatrol", e); }

  function initUI() {
    const TM = core.TEAM, store = {get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }};
    const KN = typeof KNIGHTS !== "undefined" ? KNIGHTS : null;
    const isTouch = () => matchMedia("(pointer:coarse)").matches || innerWidth <= 820;
    let opt = {diff: "easy", map: "f4", teams: 3, mode: "escape"};
    try { Object.assign(opt, JSON.parse(store.get("np.opt") || "{}")); } catch (e) {}
    const dialog = document.createElement("section");
    dialog.className = "np"; root.roundbArenaScreen(dialog);
    dialog.innerHTML = `
      <header class="np-head"><strong>암전 순찰</strong><span data-hud role="status"></span>
        <button type="button" data-a="sound" aria-pressed="true">소리 켬</button><button type="button" data-a="exit">나가기</button></header>
      <div class="np-stage">
        <canvas tabindex="0" aria-label="암전 순찰 전장"></canvas>
        <div class="np-hud arena-combat">
          <div class="np-left"><div class="np-bat" title="손전등 배터리"><i data-bat></i><b data-batn></b></div><div class="np-goal" data-goal></div><div class="np-gun" data-gun></div></div>
          <canvas class="np-mini" width="132" height="96" aria-label="미니맵"></canvas>
          <ol class="np-feed" data-feed></ol>
          <div class="np-prompt" data-prompt hidden></div>
          <div class="np-hint" data-hint hidden></div>
          <div class="np-warn" data-warn hidden role="alert"></div>
          <div class="np-flash" data-flash></div><div class="np-toast" data-toast hidden role="alert"></div>
          <button type="button" class="np-spec" data-a="spec" hidden>관전 대상 바꾸기</button>
        </div>
        <section class="np-result arena-combat" data-result hidden aria-live="polite"><div>
          <small data-r-sub></small><h2 data-r-title></h2><p data-r-rank></p><p data-r-stats></p><b data-r-rp></b>
          <div class="np-r-btns"><button type="button" data-a="again">다시 하기</button><button type="button" data-a="setup">설정 바꾸기</button><button type="button" data-a="exit-now">나가기</button></div>
        </div></section>
      </div>
      <div class="np-pad arena-combat">
        <div class="np-stick" data-stick aria-label="이동 조이스틱"><i></i></div>
        <div class="np-btns">
          <button type="button" data-b="use" class="np-use">사용<small>E 길게</small></button><button type="button" data-b="atk">스턴<small>J</small></button><button type="button" data-b="reload">장전<small>R</small></button><button type="button" data-b="drop">버리기<small>G</small></button>
          <button type="button" data-b="light" aria-pressed="true">손전등<small>F</small></button><button type="button" data-b="run">달리기<small>Shift</small></button><button type="button" data-b="sneak" aria-pressed="false">살금<small>C</small></button><button type="button" data-b="melee">근접<small>B</small></button>
          <button type="button" data-b="bat">배터리<small>Q</small></button><button type="button" data-b="smoke">연막<small>X</small></button><button type="button" data-b="trap">함정<small>T</small></button>
        </div>
      </div>`;
    document.body.append(dialog);
    const $ = s => dialog.querySelector(s), $$ = s => [...dialog.querySelectorAll(s)];
    const canvas = $("canvas"), ctx = canvas.getContext("2d"), mini = $(".np-mini"), mctx = mini.getContext("2d");
    const fog = document.createElement("canvas"), fx = fog.getContext("2d");
    const faces = Array.from({length: 10}, (_, i) => { const im = new Image(); try { im.src = kSrc(i, true); } catch (e) {} return im; });
    const briefing = root.roundbArenaBriefing(dialog, {
      accent: "#ffd86b", category: "2인 × 최대 5팀 · 손전등 탈출전", title: "암전 순찰",
      summary: "정전된 라운드비. 손전등은 길을 비추지만 내 위치도 알려요. 퓨즈 3개를 모아 비상 엘리베이터를 가동하고 먼저 탈출하세요. 바닥의 총을 주워 맞서되, 총소리는 멀리 들려요.",
      map: "4층 공유오피스 · 3층 스튜디오", preview: "roadview/plan4f.jpg",
      rules: [["목표", "노란 번개(퓨즈) 3개 → 엘리베이터에서 E 길게 → 20초 버티고 탈출"], ["빛과 소리", "달리면 소리가 커져요 · 살금 걷기는 조용 · 손전등을 끄면 안 보여요"], ["무기", "바닥의 총을 E로 줍고 J로 발사 · 탄약은 귀하고 총소리는 위치를 드러내요"], ["조작", "WASD 이동 · 마우스로 방향 · R 장전 · G 버리기 (폰: 왼쪽 스틱 + 화면 터치로 방향)"]],
      start: () => begin("solo")
    });
    const opts = document.createElement("div");
    opts.className = "np-opts";
    const grp = (key, label, items) => `<div role="group" aria-label="${label}"><b>${label}</b>${items.map(([v, t]) => `<button type="button" data-o="${key}" data-v="${v}" aria-pressed="false">${t}</button>`).join("")}</div>`;
    opts.innerHTML = grp("diff", "난이도", [["easy", "쉬움"], ["normal", "보통"], ["hard", "어려움"]]) + grp("map", "맵", [["f4", "4층"], ["f3", "3층"]]) +
      grp("teams", "팀 수", [[2, "2팀"], [3, "3팀"], [4, "4팀"], [5, "5팀"]]) + grp("mode", "방식", [["escape", "퓨즈 탈출"], ["survive", "마지막 생존"]]) +
      `<div class="np-online"><button type="button" data-a="practice">연습 (봇 약함 · 2팀)</button><button type="button" data-a="host">온라인 방 만들기</button>
        <label class="np-pub"><input type="checkbox" data-public> 공개방</label><input data-code maxlength="6" aria-label="초대 코드" placeholder="초대 코드"><button type="button" data-a="join">참가</button>
        <button type="button" data-a="start" hidden>온라인 시작</button></div><p data-msg role="status">처음이면 '연습'부터 눌러 보세요.</p>`;
    briefing.briefing.querySelector(".arena-launch").before(opts);
    const msg = t => { $("[data-msg]").textContent = t; };
    const syncOpts = () => {
      for (const b of $$("[data-o]")) b.setAttribute("aria-pressed", String(String(opt[b.dataset.o]) === b.dataset.v)); store.set("np.opt", JSON.stringify(opt));
      const im = briefing.briefing.querySelector(".arena-map-preview img"), sp = briefing.briefing.querySelector(".arena-map-preview span");
      if (im && sp) { im.src = opt.map === "f3" ? "roadview/plan3f.jpg" : "roadview/plan4f.jpg"; sp.textContent = (opt.map === "f3" ? "3층 스튜디오" : "4층 공유오피스") + " · 실제 배치도를 어둡게 재해석"; }
    };
    syncOpts();
    /* ---- 소리 ---- */
    let actx = null, soundOn = store.get("np.snd") !== "0";
    const aud = () => { if (!actx) { try { actx = new (root.AudioContext || root.webkitAudioContext)(); } catch (e) {} } return actx; };
    function snd(name, v = 1) {
      if (!soundOn || (typeof SAVE !== "undefined" && SAVE.mute)) return;
      const c = aud(); if (!c) return; if (c.state === "suspended") c.resume();
      const t = c.currentTime;
      const tone = (f0, f1, d, type, vol, at = 0) => { const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t + at); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + at + d); g.gain.setValueAtTime(.0001, t + at); g.gain.exponentialRampToValueAtTime(vol * v, t + at + .01); g.gain.exponentialRampToValueAtTime(.0001, t + at + d); o.connect(g); g.connect(c.destination); o.start(t + at); o.stop(t + at + d + .05); };
      const nz = (d, vol, f) => { const n = Math.floor(c.sampleRate * d), b = c.createBuffer(1, n, c.sampleRate), a = b.getChannelData(0); for (let i = 0; i < n; i++) a[i] = Math.random() * 2 - 1; const s = c.createBufferSource(), g = c.createGain(), fl = c.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = f; s.buffer = b; g.gain.setValueAtTime(vol * v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d); s.connect(fl); fl.connect(g); g.connect(c.destination); s.start(t); };
      switch (name) {
        case "click": tone(1300, 900, .04, "square", .03); break;
        case "swing": nz(.08, .06, 2200); tone(520, 200, .08, "triangle", .03); break;
        case "hit": tone(170, 55, .16, "sawtooth", .09); nz(.1, .07, 900); break;
        case "pick": tone(660, 990, .1, "sine", .06); tone(990, 1320, .1, "sine", .04, .08); break;
        case "door": tone(120, 70, .18, "sine", .09); nz(.12, .05, 500); break;
        case "insert": tone(300, 900, .25, "sawtooth", .05); tone(1500, 1500, .12, "sine", .04, .22); break;
        case "alarm": tone(880, 660, .3, "square", .035); break;
        case "ding": tone(1320, 1320, .6, "sine", .08); tone(1760, 1760, .5, "sine", .05, .12); break;
        case "down": tone(320, 60, .5, "sawtooth", .08); break;
        case "siren": tone(500, 950, .9, "sawtooth", .05); break;
        case "hide": tone(200, 140, .12, "sine", .06); break;
        case "shot0": nz(.09, .16, 3200); tone(300, 70, .12, "square", .07); break;
        case "shot1": nz(.06, .12, 3800); tone(420, 120, .06, "square", .05); break;
        case "shot2": nz(.22, .28, 1800); tone(140, 40, .25, "sawtooth", .12); break;
        case "shot3": nz(.12, .2, 2800); tone(240, 60, .14, "square", .08); break;
        case "shot4": nz(.34, .32, 1400); tone(110, 30, .38, "sawtooth", .14); break;
        case "shots": nz(.05, .06, 5000); tone(900, 300, .05, "triangle", .03); break;
        case "empty": tone(900, 900, .03, "square", .05); tone(600, 600, .03, "square", .05, .07); break;
        case "deny": tone(180, 120, .14, "sawtooth", .06); break;
        case "reload": nz(.05, .08, 2500); tone(500, 350, .07, "square", .04); tone(350, 500, .07, "square", .04, .12); break;
        case "reloaded": tone(700, 900, .06, "square", .05); nz(.05, .1, 3000); break;
        case "gunpick": tone(500, 700, .07, "square", .05); tone(800, 800, .05, "square", .05, .07); break;
        case "tick": tone(1800, 1800, .025, "square", .04); break;
        case "stab": tone(160, 50, .2, "sawtooth", .1); nz(.12, .12, 1200); break;
        case "win": [523, 659, 784, 1047].forEach((f, i) => tone(f, f, .22, "triangle", .07, i * .13)); break;
        case "lose": [392, 330, 262].forEach((f, i) => tone(f, f * .96, .3, "triangle", .06, i * .18)); break;
      }
    }
    /* ---- 상태 ---- */
    let lastFeed = 0, fN = 0, fireT = 0, hitT2 = 0, lastDeny = {t: "", at: 0}, fxs = [], decals = [];
    const kick = {x: 0, y: 0}, GN = core.GUN;
    let S = null, role = "", slot = 0, meIdx = 0, room = null, frame = 0, prev = 0, publishAt = 0, lastEv = 0, over = false, lastSnap = 0, specIdx = -1, practice = false, confirmT = 0, lastBegin = "solo";
    const humans = new Map(), hostIn = {};
    const keys = new Set(), held = new Set(), stick = {x: 0, y: 0}, mouse = {has: false, x: 0, y: 0, t: 0}, touchAim = {a: 0, until: 0};
    let aim = 0, lightOn = true, sneakOn = false, actN = 0, actName = "", lastSend = 0, lastSent = "";
    let cam = {x: 0, y: 0}, exp = null, seenF = new Set(), rings = [], tut = {step: 0, moved: 0, lx: 0, ly: 0, off: store.get("np.tut") === "1"}, hudAt = 0, lowQ = false, ema = 16, slow = 0, flashT = 0, fpsT = 0, hint2 = 0;
    const fx2 = {hit: 0};
    const tmName = t => TM[t][0] + "팀";
    /* ---- 입력 ---- */
    const KEYMAP = {KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", ArrowUp: "w", ArrowLeft: "a", ArrowDown: "s", ArrowRight: "d", ShiftLeft: "shift", ShiftRight: "shift", ControlLeft: "c", ControlRight: "c", KeyC: "c", KeyE: "e", KeyJ: "j", Space: "j", KeyF: "f", KeyQ: "q", KeyR: "r", KeyX: "x", KeyT: "t", KeyG: "g", KeyB: "b", Escape: "esc"};
    const KEYBTN = {j: "atk", e: "use", r: "reload", g: "drop", b: "melee", q: "bat", x: "smoke", t: "trap", f: "light", shift: "run", c: "sneak"};
    function flashBtn(k) { const b = KEYBTN[k] && $(`[data-b="${KEYBTN[k]}"]`); if (!b) return; b.classList.add("press"); setTimeout(() => b.classList.remove("press"), 160); }
    function deny(text) {
      const n = performance.now(); if (lastDeny.t === text && n - lastDeny.at < 500) return; lastDeny = {t: text, at: n};
      const h = $(".np-hud"), tt = $("[data-toast]"); tt.textContent = text; tt.hidden = false; clearTimeout(tt._t); tt._t = setTimeout(() => { tt.hidden = true; }, 1300);
      h.classList.remove("shake"); void h.offsetWidth; h.classList.add("shake"); snd("deny");
    }
    function attackBlock() {
      const me = S && S.players[meIdx]; if (!me || S.ph !== "play" || over) return "";
      if (me.st === ST.hide) return "숨은 중에는 공격할 수 없어요 · E로 나오기";
      if (me.st === ST.down) return "쓰러져 있어요 · 동료를 기다려요";
      if (me.st !== ST.ok) return "";
      if (me.stun > 0) return "기절 중이에요";
      if (me.gun >= 0) { if (me.rl > 0) return "재장전 중… 잠시만요"; if (me.mag <= 0) return me.res > 0 ? "탄창이 비었어요 · 자동 장전해요" : "탄약이 없어요 · 탄약을 줍거나 B(근접)"; }
      return "";
    }
    function pressAttack() { fN++; const why = attackBlock(); if (why) deny(why); }
    function actBlock(name) {
      const me = S && S.players[meIdx]; if (!me || S.ph !== "play") return "";
      if (me.st === ST.hide) return "숨은 중에는 할 수 없어요 · E로 나오기";
      if (me.st === ST.down) return "쓰러져 있어요 · 동료를 기다려요";
      if (me.st !== ST.ok) return "";
      if (name === "bat") return me.inv[0] <= 0 ? "예비 배터리가 없어요" : me.bat >= 90 ? "배터리가 아직 충분해요" : "";
      if (name === "smoke") return me.inv[1] <= 0 ? "연막탄이 없어요" : "";
      if (name === "trap") return me.inv[2] <= 0 ? "경보 함정이 없어요" : "";
      if (name === "reload") { if (me.gun < 0) return "들고 있는 총이 없어요 · 바닥의 총을 E로 줍기"; if (me.rl > 0) return "이미 장전 중이에요"; if (me.mag >= GN[me.gun].mag) return "탄창이 가득 찼어요"; if (me.res <= 0) return "예비 탄약이 없어요"; return ""; }
      if (name === "drop") return me.gun < 0 ? "버릴 총이 없어요" : "";
      if (name === "melee") return me.cd > .2 ? "스턴봉 쿨타임이에요" : "";
      return "";
    }
    function act(name) { const why = actBlock(name); if (why) { deny(why); return; } actN++; actName = name; }
    function readInput() {
      let dx = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0) + stick.x, dy = (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0) + stick.y;
      const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      return {dx, dy, a: aim, run: keys.has("shift") || held.has("run"), sneak: keys.has("c") || sneakOn, light: lightOn, atk: keys.has("j") || held.has("atk"), use: keys.has("e") || held.has("use"), n: actN, act: actName, f: fN};
    }
    function updateAim(dt, inp) {
      const now = performance.now();
      if (now < touchAim.until) aim = touchAim.a;
      else if (mouse.has && now - mouse.t < 6000) { const r = canvas.getBoundingClientRect(); aim = Math.atan2(mouse.y - (r.top + r.height / 2), mouse.x - (r.left + r.width / 2)); }
      else if (Math.hypot(inp.dx, inp.dy) > .2) { const t = Math.atan2(inp.dy, inp.dx); aim += core.angDiff(t, aim) * Math.min(1, dt * 10); }
    }
    window.addEventListener("keydown", e => {
      if (!dialog.open || e.target.matches?.("input,select,textarea")) return;
      const k = KEYMAP[e.code]; if (!k) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (k === "esc") { if (!e.repeat) pressExit(); return; }
      if (e.repeat) return;
      flashBtn(k);
      if (k === "f") toggleLight(); else if (k === "q") act("bat"); else if (k === "r") act("reload"); else if (k === "x") act("smoke"); else if (k === "t") act("trap"); else if (k === "g") act("drop"); else if (k === "b") act("melee"); else if (k === "j") { keys.add(k); pressAttack(); } else keys.add(k);
    }, true);
    window.addEventListener("keyup", e => { if (!dialog.open) return; const k = KEYMAP[e.code]; if (k) keys.delete(k); }, true);
    window.addEventListener("blur", () => { keys.clear(); held.clear(); stick.x = stick.y = 0; });
    function toggleLight() { lightOn = !lightOn; const b = $('[data-b="light"]'); b.setAttribute("aria-pressed", String(lightOn)); b.firstChild.textContent = lightOn ? "손전등 켬" : "손전등 끔"; snd("click"); }
    dialog.addEventListener("contextmenu", e => { if (!e.target.closest("input")) e.preventDefault(); });
    canvas.addEventListener("pointermove", e => { if (e.pointerType === "mouse") { mouse.has = true; mouse.x = e.clientX; mouse.y = e.clientY; mouse.t = performance.now(); } else if (touchAim.down) setTouchAim(e); });
    canvas.addEventListener("pointerdown", e => {
      if (!S || over) return; canvas.focus({preventScroll: true});
      if (e.pointerType === "mouse") { if (e.button === 0) { held.add("atk"); canvas.setPointerCapture(e.pointerId); pressAttack(); } mouse.has = true; mouse.x = e.clientX; mouse.y = e.clientY; mouse.t = performance.now(); }
      else { touchAim.down = e.pointerId; canvas.setPointerCapture(e.pointerId); setTouchAim(e); }
    });
    const endTouch = e => { held.delete("atk"); if (touchAim.down === e.pointerId) { touchAim.down = 0; touchAim.until = performance.now() + 1500; } };
    canvas.addEventListener("pointerup", endTouch); canvas.addEventListener("pointercancel", endTouch);
    function setTouchAim(e) { const r = canvas.getBoundingClientRect(); touchAim.a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); touchAim.until = performance.now() + 99999; }
    const stickEl = $("[data-stick]"), knob = stickEl.querySelector("i");
    const stickMove = e => { const r = stickEl.getBoundingClientRect(), R = r.width / 2; let vx = (e.clientX - r.left - R) / R, vy = (e.clientY - r.top - R) / R; const l = Math.hypot(vx, vy); if (l > 1) { vx /= l; vy /= l; } stick.x = Math.abs(vx) < .12 ? 0 : vx; stick.y = Math.abs(vy) < .12 ? 0 : vy; knob.style.transform = `translate(${vx * R * .55}px,${vy * R * .55}px)`; };
    stickEl.addEventListener("pointerdown", e => { stickEl.setPointerCapture(e.pointerId); stickMove(e); });
    stickEl.addEventListener("pointermove", e => { if (stickEl.hasPointerCapture(e.pointerId)) stickMove(e); });
    const stickEnd = () => { stick.x = stick.y = 0; knob.style.transform = ""; };
    stickEl.addEventListener("pointerup", stickEnd); stickEl.addEventListener("pointercancel", stickEnd);
    for (const b of $$("[data-b]")) {
      const k = b.dataset.b;
      b.addEventListener("pointerdown", e => {
        e.preventDefault(); b.classList.add("press"); setTimeout(() => b.classList.remove("press"), 160);
        if (k === "use" || k === "atk" || k === "run") { b.setPointerCapture(e.pointerId); held.add(k); b.classList.add("on"); if (k === "atk") pressAttack(); }
        else if (k === "light") toggleLight();
        else if (k === "sneak") { sneakOn = !sneakOn; b.setAttribute("aria-pressed", String(sneakOn)); b.firstChild.textContent = sneakOn ? "살금 켬" : "살금"; }
        else act(k);
      });
      const rel = () => { held.delete(k); b.classList.remove("on"); };
      b.addEventListener("pointerup", rel); b.addEventListener("pointercancel", rel); b.addEventListener("lostpointercapture", rel);
      b.addEventListener("contextmenu", e => e.preventDefault());
    }
    /* ---- 시작·종료 ---- */
    const meKnight = () => (Number(root.lbDbg && root.lbDbg.ME && root.lbDbg.ME.kn) || 0) % 10;
    function dress(w, mine) {
      const base = meKnight();
      w.players.forEach(p => { p.k = (base + p.i * 3) % 10; p.name = (KN ? KN[p.k].n : "기사" + p.i) + (p.i === mine && role !== "guest" ? " (나)" : ""); });
    }
    function resetView() {
      lastEv = 0; lastFeed = 0; over = false; rings = []; fxs = []; decals = []; kick.x = kick.y = 0; fireT = hitT2 = 0; seenF = new Set(); specIdx = -1; exp = new Uint8Array(S.M.w * S.M.h); cam = {x: S.players[meIdx].x, y: S.players[meIdx].y};
      aim = S.players[meIdx].a; tut.step = 0; tut.moved = 0; tut.lx = S.players[meIdx].x; tut.ly = S.players[meIdx].y; for (const k in hostIn) delete hostIn[k];
      $("[data-result]").hidden = true; $("[data-feed]").innerHTML = ""; $("[data-warn]").hidden = true; keys.clear(); held.clear(); lightOn = true; sneakOn = false; actN = 0; actName = "";
      $('[data-b="light"]').setAttribute("aria-pressed", "true"); $('[data-b="light"]').firstChild.textContent = "손전등 켬"; $('[data-b="sneak"]').setAttribute("aria-pressed", "false"); $('[data-b="sneak"]').firstChild.textContent = "살금"; fx2.hit = 0;
    }
    function begin(kind) {
      try {
        lastBegin = kind; practice = kind === "practice";
        if (role !== "host") { disconnect(); role = "solo"; }
        const hs = new Set([0]);
        let teams = practice ? 2 : opt.teams;
        if (role === "host") { for (const k of humans.keys()) hs.add(k); teams = Math.max(teams, Math.ceil((Math.max(...hs) + 1) / 2)); }
        S = core.makeWorld({map: opt.map, teams, mode: opt.mode, diff: practice ? "easy" : opt.diff, practice, humans: hs});
        slot = 0; meIdx = 0; dress(S, 0); resetView(); briefing.play(); msg("");
        if (!prev || !frame) { prev = performance.now(); frame = requestAnimationFrame(tick); }
        publishAt = 0; canvas.focus({preventScroll: true});
        $("[data-a=\"spec\"]").hidden = true;
        if (role === "host") room.publish(core.encode(S));
      } catch (e) { console.error("nightpatrol begin", e); msg("시작 중 오류가 났어요 · 다시 시도해 주세요"); }
    }
    function humanCount() { return S ? S.players.filter(p => p.human).length || 1 : 1; }
    function grantNow(quit) {
      if (!S || !S.id || S.granted === S.id) return null;
      const me = S.players[meIdx]; if (!me) return null;
      S.granted = S.id;
      const win = !quit && S.winner === me.team, place = Math.max(1, S.rk[me.team] || S.nt);
      let r = null;
      try {
        r = root.knx && root.knx.reward && root.knx.reward.grant("night-beam", {win, place, players: S.nt, humans: humanCount(), score: me.fi * 300 + me.kills * 150 + me.rev * 100 + (win ? 500 : 0), online: role === "host" || role === "guest", secs: S.t, quit: !!quit, once: "night-beam:" + S.id});
        if (r && !quit) root.knx.bus && root.knx.bus.emit("game:end", {id: "night-beam", result: {win, place, secs: S.t, rp: r.rp}});
      } catch (e) { console.error("reward", e); }
      return r;
    }
    function finish() {
      if (over) return; over = true;
      const me = S.players[meIdx], win = S.winner === me.team, r = grantNow(false);
      $("[data-r-sub]").textContent = S.reason === "escape" ? "엘리베이터 탈출" : S.reason === "last" ? "마지막 팀 생존" : "시간 종료";
      $("[data-r-title]").textContent = S.winner < 0 ? "무승부" : win ? "승리" : (me.st === ST.out ? "탈락" : "패배");
      $("[data-result]").dataset.outcome = S.winner < 0 ? "draw" : win ? "win" : "loss";
      const order = S.teams.map(t => t.id).sort((a, b) => (S.rk[a] || 9) - (S.rk[b] || 9));
      $("[data-r-rank]").innerHTML = order.map(t => `<span class="${t === me.team ? "me" : ""}">${S.rk[t]}위 ${TM[t][2]}${TM[t][0]}팀 · 퓨즈 ${S.teams[t].ins} · ${S.teams[t].alive ? "생존" : "탈락"}</span>`).join("");
      $("[data-r-stats]").textContent = `퓨즈 ${me.fi}개 꽂음 · 스턴 처치 ${me.kills} · 구조 ${me.rev} · ${Math.floor(S.t / 60)}분 ${Math.round(S.t % 60)}초`;
      $("[data-r-rp]").textContent = r ? `+${r.rp} RP` : "";
      const again = $('[data-a="again"]'); again.disabled = role === "guest"; again.textContent = role === "guest" ? "방장이 다시 시작해요" : "다시 하기";
      $("[data-result]").hidden = false; snd(win ? "win" : "lose");
    }
    function backToSetup() {
      over = false; $("[data-result]").hidden = true;
      if (role === "guest") disconnect(); else { S = null; cancelAnimationFrame(frame); frame = 0; briefing.show(); if (role === "host") msg("방 유지 중 · '온라인 시작'으로 다시 시작해요"); }
    }
    function disconnect() {
      if (S && S.ph === "play" && S.t >= 30) grantNow(true);
      room && room.close(); room = null; role = ""; slot = 0; humans.clear(); S = null; cancelAnimationFrame(frame); frame = 0; over = false;
      $("[data-result]").hidden = true; briefing.show(); $('[data-a="start"]').hidden = true; keys.clear(); held.clear();
    }
    function pressExit() {
      if (!S || S.ph !== "play" || over) { dialog.close(); return; }
      const b = $('[data-a="exit"]');
      if (confirmT) { clearTimeout(confirmT); confirmT = 0; dialog.close(); return; }
      b.textContent = "한 번 더 누르면 나가요"; b.classList.add("warn");
      confirmT = setTimeout(() => { confirmT = 0; b.textContent = "나가기"; b.classList.remove("warn"); }, 3000);
    }
    dialog.addEventListener("close", () => { clearTimeout(confirmT); confirmT = 0; const b = $('[data-a="exit"]'); b.textContent = "나가기"; b.classList.remove("warn"); disconnect(); });
    /* ---- 온라인 ---- */
    function receive(i, v) {
      if (!S || !v || !S.players[i] || S.ph !== "play") return;
      const num = x => Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
      hostIn[i] = {dx: num(v.dx), dy: num(v.dy), a: Number.isFinite(v.a) ? v.a : NaN, run: v.run === true, sneak: v.sneak === true, light: v.light !== false, atk: v.atk === true, use: v.use === true, n: v.n | 0, f: v.f | 0, act: ["bat", "smoke", "trap", "reload", "drop", "melee"].includes(v.act) ? v.act : ""};
    }
    function connect(next) {
      disconnect(); role = next; msg("연결 중…");
      room = root.createArenaRoom("night-beam", {
        error(m) { const keep = m; disconnect(); msg(keep); },
        ready(i, code) { slot = i; meIdx = i; msg(i ? "방장이 시작하기를 기다리는 중" : "초대 코드 " + code + " · 친구가 들어오면 '온라인 시작'"); $('[data-a="start"]').hidden = !!i; },
        accept: () => !S || S.ph === "over", join(i) { humans.set(i, true); msg(`참가자 ${humans.size + 1}명 · 초대 코드를 알려 주세요`); },
        leave(i) { humans.delete(i); if (S && S.players[i]) { S.players[i].human = false; } },
        input: receive,
        state(m) {
          if (!m || m.v !== 1 || !Array.isArray(m.P)) return;
          if (!S || S.id !== m.id) {
            S = core.makeWorld({map: m.map, teams: m.nt, mode: m.mode, diff: m.diff, practice: !!m.prac, seed: m.seed, id: m.id});
            meIdx = slot; resetView(); briefing.play(); if (!frame) { prev = performance.now(); frame = requestAnimationFrame(tick); }
          }
          const mine = S.players[meIdx]; const keepA = mine ? aim : 0;
          core.decode(S, m); lastSnap = performance.now();
          if (mine) mine.a = keepA;
        }
      });
      if (role === "host") room.host({listed: $("[data-public]").checked}); else room.join($("[data-code]").value);
    }
    /* ---- 이벤트 처리 ---- */
    function say(text, cls) {
      const ol = $("[data-feed]"), li = document.createElement("li"); li.textContent = text; if (cls) li.className = cls; ol.append(li);
      while (ol.children.length > 4) ol.firstChild.remove(); setTimeout(() => li.remove(), 6500);
    }
    function nearMe(x, y, r) { const v = viewP(); return v && Math.hypot(v.x - x, v.y - y) < r; }
    const nowS = () => performance.now() / 1000, gunEl = $("[data-gun]");
    const fxPush = o => { o.t0 = nowS(); fxs.push(o); if (fxs.length > 90) fxs.shift(); };
    function seenFrom(x, y, p, r) {
      const v = viewP(), me = S.players[meIdx]; if (!v) return false; if (me && p && p.team === me.team) return true;
      return Math.hypot(x - v.x, y - v.y) < r && core.los(S, v.x, v.y, x, y);
    }
    function nearGun(me) { const i = core.gunNear(S, me); return i >= 0 ? S.guns[i] : null; }
    function onShot(id, b, ex, ey) {
      const p = S.players[id], v = viewP(); if (!p || !v) return;
      const g = b % 10, sil = b >= 10, G = GN[g], mine = id === meIdx, sx = p.x, sy = p.y, ang = p.a, vis = seenFrom(sx, sy, p, sil ? 9 : 26), dv = Math.hypot(sx - v.x, sy - v.y);
      if (mine || dv < (sil ? 12 : 24)) snd(sil ? "shots" : "shot" + g, mine ? 1 : Math.max(.25, 1 - dv / 26));
      if (vis) {
        const mx = sx + Math.cos(ang) * .55, my = sy + Math.sin(ang) * .55, base = Math.atan2(ey - sy, ex - sx), dist = Math.hypot(ex - sx, ey - sy);
        fxPush({k: "flash", x: mx, y: my, a: ang, dur: sil ? .05 : .09, sz: sil ? .35 : G.pel > 1 ? 1.5 : g === 4 ? 1.6 : 1.1});
        for (let i = 0; i < G.pel; i++) {
          const aa = G.pel > 1 ? base + (i - (G.pel - 1) / 2) * G.spr * .75 : base, dd = dist * (G.pel > 1 && i % 2 ? .8 : 1);
          fxPush({k: "trace", x1: mx, y1: my, x2: sx + Math.cos(aa) * dd, y2: sy + Math.sin(aa) * dd, dur: sil ? .08 : .13, w: g === 4 ? .09 : .05});
        }
        if (mine || dv < 5) fxPush({k: "case", x: sx, y: sy, a: ang + 1.6, vx: Math.cos(ang + 1.6) * (1.6 + Math.random()), vy: Math.sin(ang + 1.6) * (1.6 + Math.random()), dur: .7});
      }
      if (!mine && dv > 1.8) { const r = G.noise * (sil ? .35 : 1); if (dv * (core.los(S, v.x, v.y, sx, sy) ? 1 : 1.6) < r) rings.push({x: sx + (Math.random() - .5) * .8, y: sy + (Math.random() - .5) * .8, t: 0, big: 1, rad: Math.max(1.6, Math.min(6.5, r * .38))}); }
      if (mine) { kick.x -= Math.cos(ang) * G.kick; kick.y -= Math.sin(ang) * G.kick; fireT = .16; }
    }
    function onHit(a, b, x, y, src) {
      const dmg = b >> 1, back = b & 1, q = S.players[a];
      if (a === meIdx) { fx2.hit = .35; snd("hit"); kick.x += (Math.random() - .5) * .25; kick.y += (Math.random() - .5) * .25; try { navigator.vibrate && navigator.vibrate(40); } catch (e) {} }
      else if (nearMe(x, y, 9)) snd("hit", .6);
      if (src === meIdx && a !== meIdx) { hitT2 = .25; snd("tick"); }
      if (seenFrom(x, y, q, 14)) { fxPush({k: "spark", x, y, dur: .28, n: back ? 12 : 7}); fxPush({k: "pop", x, y: y - .5, text: (back ? "뒤치기! " : "-") + dmg, dur: .85, big: back, mine: a === meIdx}); }
    }
    function onSwing(a, x, y) {
      const p = S.players[a]; if (nearMe(x, y, 7)) snd("swing", a === meIdx ? 1 : .5);
      if (p && seenFrom(p.x, p.y, p, 12)) fxPush({k: "slash", x: p.x, y: p.y, a: p.a, dur: .2});
    }
    function gunItem(c, g, t) {
      c.save(); c.translate(g.x, g.y); c.rotate((g.id * 1.7) % TAU);
      const len = [.42, .5, .62, .66, .85][g.g], k = .5 + .5 * Math.sin(t * 4 + g.id);
      c.fillStyle = `rgba(143,224,255,${.12 + .1 * k})`; c.beginPath(); c.arc(0, 0, .55, 0, TAU); c.fill();
      c.fillStyle = "#11151f"; c.fillRect(-len / 2 - .03, -.08, len + .06, .16); c.fillStyle = "#e3e9f5"; c.fillRect(-len / 2, -.05, len, .1); c.fillStyle = "#8a6a3f"; c.fillRect(-len / 2, -.05, len * .35, .1);
      c.restore();
    }
    function weaponDraw(c, p, a, down) {
      if (down || p.st === ST.hide) return;
      c.save(); c.rotate(a);
      if (p.gun >= 0) {
        const G = GN[p.gun], len = [.42, .5, .62, .66, .85][p.gun], th = [.1, .12, .13, .11, .1][p.gun], rc = Math.min(1, (p.cd || 0) / G.cd) * .12, rl = p.rl > 0;
        c.translate(.16 - rc, rl ? .14 : 0); if (rl) c.rotate(.5);
        c.fillStyle = "#11151f"; c.fillRect(0, -th / 2 - .03, len, th + .06); c.fillStyle = rl ? "#8fe0ff" : "#c9d2e2"; c.fillRect(.02, -th / 2, len - .02, th);
        if (p.gun === 2) { c.fillStyle = "#7a5b3a"; c.fillRect(0, -th / 2, len * .4, th); }
        if (p.gun === 4) { c.fillStyle = "#11151f"; c.fillRect(len * .3, -th / 2 - .08, .16, .07); }
        if (p.sil) { c.fillStyle = "#4a5568"; c.fillRect(len, -th / 2 + .01, .16, th - .02); }
      } else {
        const f = (p.cd || 0) / C.cd, ang = f > .75 ? -.9 + (1 - f) / .25 * 1.8 : .55;
        c.rotate(ang); c.fillStyle = "#11151f"; c.fillRect(.14, -.06, .5, .12); c.fillStyle = f > .75 ? "#ffffff" : "#ffd86b"; c.fillRect(.16, -.04, .46, .08);
      }
      c.restore();
    }
    function drawWorldFx(c, now) {
      const ns = now / 1000;
      for (let i = decals.length - 1; i >= 0; i--) { const d = decals[i], age = ns - d.t0; if (age > 25) { decals.splice(i, 1); continue; } c.globalAlpha = Math.min(1, (25 - age) / 5); c.fillStyle = "#06080d"; c.beginPath(); c.arc(d.x, d.y, .07, 0, TAU); c.fill(); c.strokeStyle = "#8c96a8"; c.lineWidth = .025; c.stroke(); }
      c.globalAlpha = 1;
      for (const f of fxs) if (f.k === "case") { const age = ns - f.t0, u = Math.min(1, age / f.dur); c.save(); c.translate(f.x + f.vx * age * (1 - u * .5), f.y + f.vy * age * (1 - u * .5)); c.rotate(f.a + age * 14); c.globalAlpha = 1 - u * u; c.fillStyle = "#d8b04a"; c.fillRect(-.06, -.03, .12, .06); c.restore(); }
      c.globalAlpha = 1;
    }
    function drawLightFx(c, now) {
      const ns = now / 1000; fxs = fxs.filter(f => ns - f.t0 < f.dur);
      c.save(); c.globalCompositeOperation = "lighter";
      for (const f of fxs) {
        const u = (ns - f.t0) / f.dur, al = 1 - u;
        if (f.k === "flash") {
          const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.sz * 1.7); g.addColorStop(0, `rgba(255,235,170,${.85 * al})`); g.addColorStop(1, "rgba(255,200,90,0)");
          c.fillStyle = g; c.beginPath(); c.arc(f.x, f.y, f.sz * 1.7, 0, TAU); c.fill();
          c.save(); c.translate(f.x, f.y); c.rotate(f.a); c.fillStyle = `rgba(255,248,210,${al})`; c.beginPath(); c.moveTo(0, 0); c.lineTo(f.sz * .35, -f.sz * .22); c.lineTo(f.sz * .95, 0); c.lineTo(f.sz * .35, f.sz * .22); c.closePath(); c.fill(); c.restore();
        } else if (f.k === "trace") { c.strokeStyle = `rgba(255,244,200,${.9 * al})`; c.lineWidth = f.w; c.beginPath(); c.moveTo(f.x1, f.y1); c.lineTo(f.x2, f.y2); c.stroke(); }
        else if (f.k === "spark") { c.strokeStyle = `rgba(255,${Math.round(210 - 70 * u)},120,${al})`; c.lineWidth = .04; c.beginPath(); for (let i = 0; i < f.n; i++) { const an = (i * 2.399 + f.t0 * 7) % TAU, r0 = .05 + .1 * u, r1 = .12 + .38 * u; c.moveTo(f.x + Math.cos(an) * r0, f.y + Math.sin(an) * r0); c.lineTo(f.x + Math.cos(an) * r1, f.y + Math.sin(an) * r1); } c.stroke(); }
        else if (f.k === "slash") { c.strokeStyle = `rgba(255,255,255,${.85 * al})`; c.lineWidth = .15 * (1 - u * .4); c.beginPath(); c.arc(f.x, f.y, .95, f.a - .95, f.a - .95 + 1.9 * Math.min(1, u * 2.2)); c.stroke(); }
        else if (f.k === "stab") { c.strokeStyle = `rgba(255,236,120,${al})`; c.lineWidth = .1; c.beginPath(); c.arc(f.x, f.y, .3 + u * .9, 0, TAU); c.stroke(); c.beginPath(); for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4; c.moveTo(f.x + Math.cos(an) * .2, f.y + Math.sin(an) * .2); c.lineTo(f.x + Math.cos(an) * (.5 + u * .7), f.y + Math.sin(an) * (.5 + u * .7)); } c.stroke(); }
      }
      c.restore();
    }
    function drawCrosshair(c, me, v, t) {
      if (!me || v !== me || me.st !== ST.ok || S.ph !== "play") return;
      const G = me.gun >= 0 ? GN[me.gun] : null, [mx, my] = gp(me), a = aim, dist = G ? Math.min(5.5, G.rng * .5) : 1.3, x = mx + Math.cos(a) * dist, y = my + Math.sin(a) * dist;
      const blocked = G && me.rl <= 0 && me.mag <= 0 && me.res <= 0, cool = (me.cd || 0) > .05 || me.rl > 0;
      const gap = .13 + (G ? G.spr * (me.nzc === 2 ? 1.9 : me.nzc === 1 ? 1.4 : 1) * dist * .55 : .06) + fireT * 1.1;
      c.save(); c.strokeStyle = blocked ? "#8b93a3" : cool ? "#E69F00" : "#ffffff"; c.lineWidth = .045; if (blocked) c.setLineDash([.06, .06]);
      c.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.moveTo(x + dx * gap, y + dy * gap); c.lineTo(x + dx * (gap + .16), y + dy * (gap + .16)); } c.stroke(); c.setLineDash([]);
      c.fillStyle = c.strokeStyle; c.beginPath(); c.arc(x, y, .025, 0, TAU); c.fill();
      if (me.rl > 0 && G) { c.strokeStyle = "#8fe0ff"; c.lineWidth = .07; c.beginPath(); c.arc(x, y, gap + .26, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - me.rl / G.rl)); c.stroke(); }
      else if (G && me.cd > .12) { c.strokeStyle = "#E69F00"; c.lineWidth = .06; c.beginPath(); c.arc(x, y, gap + .26, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - me.cd / G.cd)); c.stroke(); }
      if (hitT2 > 0) { c.strokeStyle = "#ffffff"; c.lineWidth = .08; c.beginPath(); c.moveTo(x - .22, y - .22); c.lineTo(x + .22, y + .22); c.moveTo(x + .22, y - .22); c.lineTo(x - .22, y + .22); c.stroke(); }
      c.restore();
      if (!G && me.cd > .1) { c.strokeStyle = "#E69F00"; c.lineWidth = .07; c.beginPath(); c.arc(mx, my, .6, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - me.cd / C.cd)); c.stroke(); }
    }
    function drawScreenFx(c, now, w, h, sc, ox, oy, v) {
      const ns = now / 1000; c.textAlign = "center";
      for (const g of S.guns) {
        const d = Math.hypot(g.x - v.x, g.y - v.y); if (d > 2.8) continue;
        const sx = ox + g.x * sc, sy = oy + g.y * sc - sc * .5, near = d < 1.25, t1 = `${GN[g.g].n} · ${g.mag}발`, t2 = near ? (isTouch() ? "줍기 버튼" : "E 줍기") : "";
        c.font = "bold 13px sans-serif"; const tw = Math.max(c.measureText(t1).width, t2 ? c.measureText(t2).width : 0) + 14, hh = t2 ? 36 : 20;
        c.fillStyle = "rgba(6,9,16,.85)"; c.fillRect(sx - tw / 2, sy - hh + 6, tw, hh); c.strokeStyle = near ? "#F0E442" : "#8fe0ff"; c.lineWidth = 1.5; c.strokeRect(sx - tw / 2, sy - hh + 6, tw, hh);
        c.fillStyle = "#fff"; c.fillText(t1, sx, sy - (t2 ? 18 : 2)); if (t2) { c.fillStyle = "#F0E442"; c.fillText(t2, sx, sy - 2); }
      }
      for (const f of fxs) if (f.k === "pop") {
        const u = (ns - f.t0) / f.dur; c.font = `bold ${f.big ? 22 : 15}px sans-serif`; c.globalAlpha = Math.max(0, 1 - u * u); const sx = ox + f.x * sc, sy = oy + (f.y - u * .9) * sc;
        c.lineWidth = 4; c.strokeStyle = "#05070d"; c.strokeText(f.text, sx, sy); c.fillStyle = f.mine ? "#ffffff" : "#F0E442"; c.fillText(f.text, sx, sy); c.globalAlpha = 1;
      }
    }
    function processEvents() {
      const me = S.players[meIdx];
      for (const evt of S.events) {
        const [id, type, a, b, x, y] = evt; if (id <= lastEv) continue; lastEv = id;
        switch (type) {
          case "hit": onHit(a, b, x, y, evt[6]); break;
          case "shot": onShot(a, b, x, y); break;
          case "hole": decals.push({x, y, t0: nowS()}); if (decals.length > 80) decals.shift(); if (nearMe(x, y, 12)) fxPush({k: "spark", x, y, dur: .2, n: 4}); break;
          case "stab": fxPush({k: "stab", x, y, dur: .35}); snd("stab"); if (a === meIdx) { kick.x += (Math.random() - .5) * .3; kick.y += (Math.random() - .5) * .3; } break;
          case "empty": if (a === meIdx) snd("empty"); break;
          case "reload": if (a === meIdx) snd("reload"); else if (nearMe(x, y, 8)) snd("reload", .3); break;
          case "reloaded": if (a === meIdx) snd("reloaded"); break;
          case "gunpick": if (a === meIdx) { snd("gunpick"); say(GN[b].n + " 장착", "ok"); } break;
          case "drop": if (nearMe(x, y, 6)) snd("gunpick", .5); break;
          case "swing": onSwing(a, x, y); break;
          case "pick": if (a === meIdx) { snd("pick"); say(core.ITEM[b] + " 획득", "ok"); if (b === 4) tut.got = true; } break;
          case "door": if (nearMe(x, y, 9)) snd("door", b ? .3 : 1); break;
          case "click": if (a === meIdx) snd("click"); break;
          case "insert": snd("insert", nearMe(x, y, 16) ? 1 : .4); break;
          case "start": say(`${tmName(a)}이 엘리베이터 가동 시작!`, "warn"); snd("siren"); break;
          case "alarm": if (nearMe(x, y, 18)) snd("alarm"); break;
          case "open": snd("ding"); break;
          case "down": snd("down", nearMe(x, y, 12) ? 1 : .3); if (a === meIdx) say("쓰러졌어요 · 동료가 구해줄 때까지 버텨요", "warn"); break;
          case "revive": if (a === meIdx || b === meIdx) say("구조 성공", "ok"); break;
          case "siren": snd("siren"); break;
          case "hide": if (a === meIdx) snd("hide"); break;
          case "found": if (a === meIdx) say("들켰어요!", "warn"); break;
          case "locked": if (a === meIdx) say("잠겨 있어요 · 열쇠가 필요해요", "warn"); break;
          case "unlock": if (a === meIdx) say("열쇠로 문을 열었어요", "ok"); break;
          case "alarmtrap": if (a === meIdx) say("경보 함정에 걸렸어요!", "warn"); break;
          case "sabotage": say("엘리베이터 가동이 방해당했어요", "warn"); break;
        }
        if ((type === "door" || type === "hit" || type === "alarm" || type === "insert" || type === "alarmtrap" || type === "swing") && x && !nearMe(x, y, 1.8) && nearMe(x, y, type === "alarm" ? 20 : 11)) rings.push({x: x + (Math.random() - .5), y: y + (Math.random() - .5), t: 0, big: type === "alarm" || type === "alarmtrap" ? 1 : 0});
      }
      if (me && me.st === ST.ok && me.hp < 100 && fx2.hit <= 0) { /* 피격 비네트는 hit 이벤트로 */ }
    }
    /* ---- 보기 ---- */
    function viewP() {
      const me = S.players[meIdx]; if (me && me.st !== ST.out && me.st !== ST.esc) return me;
      const alive = S.players.filter(p => p.st === ST.ok || p.st === ST.hide || p.st === ST.down);
      if (specIdx >= 0 && S.players[specIdx] && alive.includes(S.players[specIdx])) return S.players[specIdx];
      return alive.find(p => me && p.team === me.team) || alive[0] || me;
    }
    const gp = p => role === "guest" && p.rx !== undefined ? [p.rx, p.ry] : [p.x, p.y];
    function teamSees(team, q) {
      if (q.st === ST.out || q.st === ST.esc) return false;
      if (q.team === team) return true;
      if (q.st === ST.hide) return false;
      if (q.reveal > 0 || (q.flash > 0 && S.players.some(m => m.team === team && m.st === ST.ok && Math.hypot(q.x - m.x, q.y - m.y) < 18 && core.los(S, m.x, m.y, q.x, q.y)))) return true;
      return S.players.some(m => m.team === team && m.st === ST.ok && core.lit(S, m, q.x, q.y));
    }
    /* ---- 그리기 ---- */
    function polyOf(p, range, half, n) {
      const [px, py] = gp(p), pa = role === "guest" && p.ra !== undefined ? p.ra : p.a, pts = [[px, py]], a0 = half ? pa - half : 0, span = half ? half * 2 : TAU;
      for (let i = 0; i <= n; i++) { const a = a0 + span * i / n, d = core.castRay(S, px, py, a, range); pts.push([px + Math.cos(a) * d, py + Math.sin(a) * d]); }
      return pts;
    }
    function markExp(pts) { const M = S.M; for (let i = 1; i < pts.length; i += 2) { const [px, py] = pts[0], [qx, qy] = pts[i], d = Math.hypot(qx - px, qy - py); for (let s = 0; s <= d; s += .6) { const cx = Math.floor(px + (qx - px) * s / (d || 1)), cy = Math.floor(py + (qy - py) * s / (d || 1)); if (cx >= 0 && cy >= 0 && cx < M.w && cy < M.h) exp[cy * M.w + cx] = 1; } const cx = Math.floor(qx), cy = Math.floor(qy); if (cx >= 0 && cy >= 0 && cx < M.w && cy < M.h) exp[cy * M.w + cx] = 1; } }
    function item(c, type, x, y, t) {
      c.save(); c.translate(x, y);
      if (type === 4) {
        const k = .5 + .5 * Math.sin(t * 5); c.fillStyle = `rgba(240,228,66,${.18 + .15 * k})`; c.beginPath(); c.arc(0, 0, .5 + .08 * k, 0, TAU); c.fill();
        c.fillStyle = "#F0E442"; c.strokeStyle = "#3a3200"; c.lineWidth = .05; c.beginPath(); c.moveTo(.1, -.3); c.lineTo(-.14, .04); c.lineTo(-.01, .04); c.lineTo(-.1, .3); c.lineTo(.15, -.06); c.lineTo(.02, -.06); c.closePath(); c.fill(); c.stroke();
      } else if (type === 0) { c.fillStyle = "#8fe0ff"; c.strokeStyle = "#0b3144"; c.lineWidth = .05; c.fillRect(-.12, -.15, .24, .34); c.strokeRect(-.12, -.15, .24, .34); c.fillRect(-.05, -.22, .1, .07); c.fillStyle = "#0b3144"; c.fillRect(-.07, .02, .14, .04); c.fillRect(-.02, -.03, .04, .14); }
      else if (type === 1) { c.fillStyle = "#c5ccd8"; c.strokeStyle = "#39424f"; c.lineWidth = .05; for (const [dx, dy, r] of [[-.1, .05, .14], [.1, .05, .14], [0, -.08, .16]]) { c.beginPath(); c.arc(dx, dy, r, 0, TAU); c.fill(); c.stroke(); } }
      else if (type === 2) { c.fillStyle = "#E69F00"; c.strokeStyle = "#3d2800"; c.lineWidth = .05; c.beginPath(); c.moveTo(0, -.22); c.lineTo(.22, .17); c.lineTo(-.22, .17); c.closePath(); c.fill(); c.stroke(); c.fillStyle = "#3d2800"; c.fillRect(-.02, -.08, .04, .14); c.fillRect(-.02, .1, .04, .04); }
      else { c.strokeStyle = "#ffd98a"; c.fillStyle = "#ffd98a"; c.lineWidth = .06; c.beginPath(); c.arc(-.1, -.05, .1, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(0, -.05); c.lineTo(.22, -.05); c.moveTo(.15, -.05); c.lineTo(.15, .07); c.moveTo(.22, -.05); c.lineTo(.22, .05); c.stroke(); }
      c.restore();
    }
    function glyph(c, team, x, y, s) {
      c.save(); c.translate(x, y); c.fillStyle = TM[team][1]; c.strokeStyle = "#0a0d14"; c.lineWidth = .05; c.beginPath();
      if (team === 0) c.arc(0, 0, s, 0, TAU); else if (team === 1) c.rect(-s, -s, s * 2, s * 2);
      else if (team === 2) { c.moveTo(0, -s * 1.1); c.lineTo(s * 1.1, s); c.lineTo(-s * 1.1, s); c.closePath(); }
      else if (team === 3) { c.moveTo(0, -s * 1.2); c.lineTo(s * 1.2, 0); c.lineTo(0, s * 1.2); c.lineTo(-s * 1.2, 0); c.closePath(); }
      else for (let i = 0; i < 10; i++) { const r = i % 2 ? s * .5 : s * 1.2, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.fill(); c.stroke(); c.restore();
    }
    function token(c, p, own, t) {
      const [x, y] = gp(p), col = TM[p.team][1], down = p.st === ST.down, a = role === "guest" && p.ra !== undefined ? p.ra : p.a;
      c.save(); c.translate(x, y);
      c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(0, .08, .42, .3, 0, 0, TAU); c.fill();
      if (!down && p.st !== ST.hide) { c.fillStyle = col; c.beginPath(); c.moveTo(Math.cos(a) * .62, Math.sin(a) * .62); c.lineTo(Math.cos(a + 2.5) * .42, Math.sin(a + 2.5) * .42); c.lineTo(Math.cos(a - 2.5) * .42, Math.sin(a - 2.5) * .42); c.closePath(); c.fill(); }
      c.globalAlpha = p.st === ST.hide ? .45 : 1;
      c.beginPath(); c.arc(0, 0, .38, 0, TAU); c.fillStyle = "#1a2030"; c.fill();
      c.save(); c.clip(); const im = faces[p.k]; if (im && im.complete && im.naturalWidth) { c.filter = down ? "grayscale(1)" : "none"; c.drawImage(im, -.38, -.38, .76, .76); c.filter = "none"; } c.restore();
      c.lineWidth = .09; c.strokeStyle = down ? "#8b93a3" : col; c.beginPath(); c.arc(0, 0, .38, 0, TAU); c.stroke();
      c.globalAlpha = 1;
      if (p.hitT > 0) { c.fillStyle = `rgba(255,255,255,${Math.min(.7, p.hitT * 2.5)})`; c.beginPath(); c.arc(0, 0, .38, 0, TAU); c.fill(); }
      weaponDraw(c, p, a, down);
      glyph(c, p.team, .34, -.34, .14);
      if (down) { c.strokeStyle = "#fff"; c.lineWidth = .08; c.beginPath(); c.moveTo(-.16, 0); c.lineTo(.16, 0); c.moveTo(0, -.16); c.lineTo(0, .16); c.stroke(); c.strokeStyle = "#ffd86b"; c.lineWidth = .07; c.beginPath(); c.arc(0, 0, .5, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, p.dT) / core.C.downT); c.stroke(); }
      if (p.fuse > 0) { c.save(); c.translate(-.3, -.42); c.scale(.55, .55); item(c, 4, 0, 0, t); c.restore(); }
      if (p.hp < 100 && p.hp > 0) { c.fillStyle = "#0008"; c.fillRect(-.35, .46, .7, .09); c.fillStyle = "#ffffff"; c.fillRect(-.35, .46, .7 * p.hp / 100, .09); }
      if (p.prog > 0 && p.pt) { c.strokeStyle = "#8fe0ff"; c.lineWidth = .08; c.beginPath(); c.arc(0, 0, .58, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p.prog / ({rev: core.C.reviveT, ins: core.C.insertT, sab: core.C.sabT, search: 1.2}[p.pt] || 1))); c.stroke(); }
      c.restore();
    }
    function render(now, dt) {
      const w = canvas.clientWidth, h = canvas.clientHeight; if (w < 10 || h < 10) return;
      const dpr = lowQ ? 1 : Math.min(1.5, root.devicePixelRatio || 1);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      const fs = lowQ ? .3 : .45; if (fog.width !== Math.ceil(w * fs)) { fog.width = Math.ceil(w * fs); fog.height = Math.ceil(h * fs); }
      const v = viewP(); if (!v) return; const [vx, vy] = gp(v);
      cam.x += (vx - cam.x) * Math.min(1, dt * 9); cam.y += (vy - cam.y) * Math.min(1, dt * 9);
      const kx = kick.x, ky = kick.y; cam.x += kx; cam.y += ky; kick.x *= Math.max(0, 1 - dt * 12); kick.y *= Math.max(0, 1 - dt * 12); fireT = Math.max(0, fireT - dt); hitT2 = Math.max(0, hitT2 - dt);
      const sc = Math.max(30, Math.round(Math.min(w, h) / (w < 520 ? 8.2 : 10.5))), M = S.M, t = now / 1000, me = S.players[meIdx], myTeam = me && me.st !== ST.out && me.st !== ST.esc ? me.team : v.team;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = "#05070d"; ctx.fillRect(0, 0, w, h);
      const ox = w / 2 - cam.x * sc, oy = h / 2 - cam.y * sc;
      ctx.save(); ctx.translate(ox, oy); ctx.scale(sc, sc);
      const x0 = Math.max(0, Math.floor(cam.x - w / 2 / sc) - 1), x1 = Math.min(M.w - 1, Math.ceil(cam.x + w / 2 / sc) + 1), y0 = Math.max(0, Math.floor(cam.y - h / 2 / sc) - 1), y1 = Math.min(M.h - 1, Math.ceil(cam.y + h / 2 / sc) + 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const c = M.g[y * M.w + x];
        if (c === 1) { ctx.fillStyle = "#2f3a55"; ctx.fillRect(x, y, 1, 1); ctx.fillStyle = "#3d4a6b"; ctx.fillRect(x, y, 1, .22); continue; }
        ctx.fillStyle = (x + y) & 1 ? "#232c42" : "#273049"; ctx.fillRect(x, y, 1, 1);
        if (c === 2) { ctx.fillStyle = "#5b4a3a"; ctx.fillRect(x + .08, y + .12, .84, .76); ctx.fillStyle = "#806a52"; ctx.fillRect(x + .08, y + .12, .84, .2); }
        else if (c === 3) { ctx.fillStyle = "#44596f"; ctx.fillRect(x + .06, y + .04, .88, .92); ctx.fillStyle = "#26323f"; for (let k = 0; k < 3; k++) ctx.fillRect(x + .2, y + .16 + k * .09, .6, .04); ctx.fillStyle = "#cfd8e3"; ctx.fillRect(x + .72, y + .5, .07, .2); }
        else if (c === 6) { ctx.fillStyle = "#56667d"; ctx.fillRect(x, y, 1, 1); ctx.strokeStyle = "#0e131c"; ctx.lineWidth = .04; ctx.strokeRect(x + .03, y + .03, .94, .94); }
        else if (c === 4) {
          const d = S.doors[M.doorAt[y * M.w + x]]; ctx.fillStyle = "#7b5a3a";
          if (d.open) { ctx.fillRect(x, y, .14, 1); ctx.fillRect(x + .86, y, .14, 1); } else { ctx.fillRect(x + .04, y + .04, .92, .92); ctx.fillStyle = "#4a3320"; ctx.fillRect(x + .46, y + .1, .08, .8); }
          if (d.locked) { ctx.fillStyle = "#ffd86b"; ctx.fillRect(x + .32, y + .42, .36, .28); ctx.strokeStyle = "#ffd86b"; ctx.lineWidth = .06; ctx.beginPath(); ctx.arc(x + .5, y + .42, .13, Math.PI, 0); ctx.stroke(); }
        }
      }
      if (S.mode === "escape") { const ec = core.elevC(M), st = S.elev.st; ctx.fillStyle = st ? `rgba(240,228,66,${.45 + .3 * Math.sin(t * 6)})` : "#F0E442"; ctx.beginPath(); ctx.moveTo(ec[0], ec[1] - .55); ctx.lineTo(ec[0] + .45, ec[1] - .05); ctx.lineTo(ec[0] + .17, ec[1] - .05); ctx.lineTo(ec[0] + .17, ec[1] + .45); ctx.lineTo(ec[0] - .17, ec[1] + .45); ctx.lineTo(ec[0] - .17, ec[1] - .05); ctx.lineTo(ec[0] - .45, ec[1] - .05); ctx.closePath(); ctx.fill(); }
      for (const l of S.loot) if (l.on && l.x > x0 - 1 && l.x < x1 + 1 && l.y > y0 - 1 && l.y < y1 + 1) item(ctx, l.type, l.x, l.y, t);
      for (const l of S.drops) item(ctx, l.type, l.x, l.y, t);
      drawWorldFx(ctx, now); for (const g of S.guns) gunItem(ctx, g, t);
      for (const tr of S.traps) if (tr.team === myTeam || Math.hypot(tr.x - vx, tr.y - vy) < 1.4) { ctx.strokeStyle = "#E69F00"; ctx.lineWidth = .06; ctx.beginPath(); ctx.arc(tr.x, tr.y, .28, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(tr.x - .12, tr.y); ctx.lineTo(tr.x + .12, tr.y); ctx.stroke(); }
      for (const p of S.players) if (p.team !== myTeam && teamSees(myTeam, p)) token(ctx, p, false, t);
      ctx.restore();
      // ----- 어둠
      const polys = [];
      fx.setTransform(1, 0, 0, 1, 0, 0); fx.globalCompositeOperation = "source-over"; fx.fillStyle = "rgba(2,4,9,.955)"; fx.fillRect(0, 0, fog.width, fog.height);
      fx.globalCompositeOperation = "destination-out"; fx.setTransform(fs * sc, 0, 0, fs * sc, (w / 2 - cam.x * sc) * fs, (h / 2 - cam.y * sc) * fs);
      const viewers = S.players.filter(p => p.team === myTeam && p.st === ST.ok); if (!viewers.includes(v) && v.team === myTeam) viewers.push(v);
      if (v.team !== myTeam) viewers.push(v);
      for (const p of viewers) {
        const [qx, qy] = gp(p), np = polyOf(p, C.near, 0, lowQ ? 18 : 30), g1 = fx.createRadialGradient(qx, qy, 0, qx, qy, C.near); g1.addColorStop(0, "rgba(0,0,0,1)"); g1.addColorStop(.7, "rgba(0,0,0,.9)"); g1.addColorStop(1, "rgba(0,0,0,0)");
        fx.fillStyle = g1; fx.beginPath(); np.forEach(([x, y], i) => i ? fx.lineTo(x, y) : fx.moveTo(x, y)); fx.closePath(); fx.fill();
        if (p === v || p.team === myTeam) markExp(np);
        if (p.light && p.bat > 0) {
          const fl = p.bat < 25 ? 1 - .25 * (Math.sin(t * 31) > .5 ? 1 : 0) : 1, rg = core.rangeOf(p) * fl, cp = polyOf(p, rg, C.half, lowQ ? 14 : 26), g2 = fx.createRadialGradient(qx, qy, 0, qx, qy, rg);
          g2.addColorStop(0, "rgba(0,0,0,1)"); g2.addColorStop(.72, "rgba(0,0,0,.96)"); g2.addColorStop(1, "rgba(0,0,0,0)");
          fx.fillStyle = g2; fx.beginPath(); cp.forEach(([x, y], i) => i ? fx.lineTo(x, y) : fx.moveTo(x, y)); fx.closePath(); fx.fill(); polys.push(cp); markExp(cp);
        }
      }
      fx.globalCompositeOperation = "source-over"; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(fog, 0, 0, w, h);
      ctx.save(); ctx.translate(ox, oy); ctx.scale(sc, sc);
      if (!lowQ) { ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "rgba(255,232,170,.1)"; for (const cp of polys) { ctx.beginPath(); cp.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); } ctx.globalCompositeOperation = "source-over"; }
      // 다른 팀 빛
      for (const q of S.players) if (q.team !== myTeam && q.light && q.st === ST.ok && Math.hypot(q.x - vx, q.y - vy) < 17 && core.los(S, vx, vy, q.x, q.y)) {
        const cp = polyOf(q, core.rangeOf(q), C.half, 14); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "rgba(255,240,200,.1)"; ctx.beginPath(); cp.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); ctx.globalCompositeOperation = "source-over";
        if (!teamSees(myTeam, q)) { ctx.fillStyle = "#fff6cf"; ctx.beginPath(); ctx.arc(q.x, q.y, .13, 0, TAU); ctx.fill(); }
      }
      for (const s of S.smokes) if (Math.hypot(s.x - vx, s.y - vy) < C.near + 1 || (core.los(S, vx, vy, s.x, s.y) && Math.hypot(s.x - vx, s.y - vy) < 8)) { const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r); const al = Math.min(.92, s.t / 2); g.addColorStop(0, `rgba(120,132,152,${al})`); g.addColorStop(.8, `rgba(95,108,128,${al * .9})`); g.addColorStop(1, "rgba(95,108,128,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); }
      for (const p of S.players) if (p.team === myTeam) token(ctx, p, true, t);
      drawLightFx(ctx, now); drawCrosshair(ctx, me, v, t);
      // 소리 파동
      for (const q of S.players) if (q.team !== myTeam && q.nzc > 0 && (q.st === ST.ok)) {
        q.rt = (q.rt || 0) - dt; const d = Math.hypot(q.x - vx, q.y - vy), l = core.los(S, vx, vy, q.x, q.y), r = q.nzc === 2 ? 9 : 5;
        if (q.rt <= 0 && d * (l ? 1 : 1.6) < r && d > 1.8) { q.rt = q.nzc === 2 ? .38 : .6; rings.push({x: q.x + (Math.random() - .5) * 1.4, y: q.y + (Math.random() - .5) * 1.4, t: 0, big: q.nzc === 2 ? 1 : 0}); }
      }
      for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.t += dt; if (r.t > 1) { rings.splice(i, 1); continue; } ctx.strokeStyle = `rgba(255,255,255,${.75 * (1 - r.t)})`; ctx.lineWidth = .07; ctx.setLineDash([.18, .14]); ctx.beginPath(); ctx.arc(r.x, r.y, (r.rad || (r.big ? 1.9 : 1.2)) * r.t + .2, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      ctx.restore();
      drawScreenFx(ctx, now, w, h, sc, ox, oy, v);
      // 화면 밖 화살표
      const arrow = (x, y, col, label) => { const dx = (x - cam.x) * sc, dy = (y - cam.y) * sc; if (Math.abs(dx) < w / 2 - 20 && Math.abs(dy) < h / 2 - 20) return; const k = Math.min((w / 2 - 22) / Math.abs(dx || 1e-6), (h / 2 - 22) / Math.abs(dy || 1e-6)), ax = w / 2 + dx * k, ay = h / 2 + dy * k, a = Math.atan2(dy, dx); ctx.save(); ctx.translate(ax, ay); ctx.rotate(a); ctx.fillStyle = col; ctx.strokeStyle = "#05070d"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); ctx.fillStyle = col; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.fillText(label, ax - Math.cos(a) * 20, ay - Math.sin(a) * 20 + 4); };
      const mate = S.players.find(p => p.team === myTeam && p !== me && p.st !== ST.out); if (mate && v === me) arrow(gp(mate)[0], gp(mate)[1], TM[myTeam][1], "동료");
      { const ec = core.elevC(M); if (S.mode === "escape" && (S.elev.st > 0 || S.teams[myTeam].ins + (me ? me.fuse : 0) > 0 || S.t > 20)) arrow(ec[0], ec[1], "#F0E442", "엘리베이터"); }
      if (fx2.hit > 0) { const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .25, w / 2, h / 2, Math.max(w, h) * .7); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, `rgba(255,255,255,${Math.min(.75, fx2.hit * 2)})`); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); fx2.hit -= dt; }
      if (me && me.bat < 15 && me.light) { ctx.fillStyle = `rgba(0,0,0,${.25 + .25 * Math.sin(t * 20)})`; ctx.fillRect(0, 0, w, h); }
      cam.x -= kx; cam.y -= ky; gunEl.classList.toggle("fire", fireT > 0);
      drawMini(v, myTeam);
    }
    function drawMini(v, myTeam) {
      const M = S.M, k = Math.min(132 / M.w, 96 / M.h); mctx.clearRect(0, 0, 132, 96); mctx.fillStyle = "#070a12e0"; mctx.fillRect(0, 0, 132, 96);
      for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) if (exp[y * M.w + x]) { const c = M.g[y * M.w + x]; mctx.fillStyle = c === 1 ? "#26304a" : c === 4 ? "#7b5a3a" : c === 6 ? "#F0E442" : "#566786"; mctx.fillRect(x * k, y * k, k + .4, k + .4); }
      if (S.mode === "escape") { const ec = core.elevC(M); mctx.fillStyle = "#F0E442"; mctx.fillRect(ec[0] * k - 3, ec[1] * k - 3, 6, 6); mctx.strokeStyle = "#000"; mctx.strokeRect(ec[0] * k - 3, ec[1] * k - 3, 6, 6); }
      S.loot.forEach((l, i) => { if (l.type === 4) { if (l.on && core.lit(S, v, l.x, l.y)) seenF.add(i); if (!l.on) seenF.delete(i); if (seenF.has(i)) { mctx.fillStyle = "#F0E442"; mctx.fillRect(l.x * k - 1.5, l.y * k - 1.5, 3, 3); } } });
      for (const r of rings) { mctx.strokeStyle = `rgba(255,255,255,${1 - r.t})`; mctx.beginPath(); mctx.arc(r.x * k, r.y * k, 2 + r.t * 5, 0, TAU); mctx.stroke(); }
      for (const p of S.players) if (p.st !== ST.out && p.st !== ST.esc && (p.team === myTeam || teamSees(myTeam, p))) { const [x, y] = gp(p); mctx.save(); mctx.translate(x * k, y * k); mctx.scale(k * .6, k * .6); mctx.fillStyle = TM[p.team][1]; mctx.beginPath(); if (p.team === 1) mctx.rect(-1.5, -1.5, 3, 3); else if (p.team === 2) { mctx.moveTo(0, -2); mctx.lineTo(2, 1.6); mctx.lineTo(-2, 1.6); mctx.closePath(); } else if (p.team === 3) { mctx.moveTo(0, -2); mctx.lineTo(2, 0); mctx.lineTo(0, 2); mctx.lineTo(-2, 0); mctx.closePath(); } else mctx.arc(0, 0, 1.7, 0, TAU); mctx.fill(); mctx.strokeStyle = "#000"; mctx.lineWidth = .5; mctx.stroke(); mctx.restore(); }
    }
    /* ---- HUD ---- */
    function promptOf(me) {
      if (!me || me.st !== ST.ok) return "";
      const M = S.M;
      if (S.players.some(q => q.team === me.team && q !== me && q.st === ST.down && Math.hypot(q.x - me.x, q.y - me.y) < 1.3)) return "E 길게 · 동료 구조";
      if (S.mode === "escape") { const ec = core.elevC(M); if (Math.hypot(me.x - ec[0], me.y - ec[1]) < 2.1) { if (S.elev.st === 1 && S.elev.team !== me.team) return "E 길게 · 가동 방해(적 팀)"; if (S.elev.st === 0 && me.fuse > 0 && S.teams[me.team].ins < 3) return "E 길게 · 퓨즈 꽂기"; } }
      const gn = nearGun(me); if (gn) return `E · ${GN[gn.g].n} 줍기${me.gun >= 0 ? " (교체)" : ""} · 탄창 ${gn.mag}`;
      let bi = -1, bd = 1.35; M.lockers.forEach((l, i) => { const d = Math.hypot(l.x + .5 - me.x, l.y + .5 - me.y); if (d < bd) { bd = d; bi = i; } });
      if (bi >= 0) { const o = S.occ[bi]; return o < 0 ? "E · 로커에 숨기" : S.players[o] && S.players[o].team !== me.team ? "E 길게 · 로커 수색" : ""; }
      return "";
    }
    function hudUpdate(now) {
      const me = S.players[meIdx]; if (!me) return;
      if (now - hudAt < 110) return; hudAt = now;
      const team = S.teams[me.team], el = S.elev, left = Math.max(0, S.limit - S.t);
      const carried = S.players.filter(q => q.team === me.team && q.st !== ST.out).reduce((a, q) => a + q.fuse, 0);
      $("[data-hud]").textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")} · ${S.mode === "escape" ? "퓨즈 " + (team.ins + carried) + "/3" : "생존 " + S.teams.filter(t => t.alive).length + "팀"} · ${TM[me.team][2]}${tmName(me.team)}`;
      $("[data-bat]").style.width = me.bat + "%"; $("[data-batn]").textContent = Math.round(me.bat) + "%"; $(".np-bat").classList.toggle("low", me.bat < 25);
      let goal;
      if (S.mode !== "escape") goal = "마지막 팀으로 살아남기 · 소리를 줄이고 어둠에 숨어요";
      else if (el.st === 1) goal = el.team === me.team ? `엘리베이터 가동 중 · 지켜요! ${Math.ceil(core.C.workT - el.t)}초` : `${tmName(el.team)} 가동 중! 엘리베이터에서 E 길게 눌러 방해 · ${Math.ceil(core.C.workT - el.t)}초`;
      else if (el.st === 2) goal = el.team === me.team ? "엘리베이터 열림! 안에 들어가 2초 서 있기" : `${tmName(el.team)}가 탈출 준비 · 막아요`;
      else if (team.ins >= 3) goal = "엘리베이터 가동 대기";
      else goal = carried + team.ins >= 3 ? "퓨즈 3개 완성! 가운데 엘리베이터에서 E 길게" : `퓨즈 ${team.ins + carried}/3 · 노란 번개를 찾아요`;
      $("[data-goal]").textContent = goal;
      const pr = promptOf(me), pe = $("[data-prompt]"); pe.hidden = !pr && !(me.prog > 0); if (!pe.hidden) pe.textContent = pr + (me.prog > 0 && me.pt ? ` ${Math.round(me.prog / ({rev: core.C.reviveT, ins: core.C.insertT, sab: core.C.sabT, search: 1.2}[me.pt] || 1) * 100)}%` : "");
      const w = $("[data-warn]");
      if (el.st === 1) { w.hidden = false; w.textContent = `${TM[el.team][2]}${tmName(el.team)} 엘리베이터 가동 ${Math.ceil(core.C.workT - el.t)}초`; } else if (S.mode === "escape" && el.st === 2) { w.hidden = false; w.textContent = `${tmName(el.team)} 탈출구 개방 · 남은 ${Math.max(0, Math.ceil(45 - (el.o || 0)))}초`; } else w.hidden = true;
      const names = ["배터리", "연막", "함정"]; ["bat", "smoke", "trap"].forEach((k, i) => { const b = $(`[data-b="${k}"]`); b.firstChild.textContent = `${names[i]} ${me.inv[i]}`; b.classList.toggle("dim", me.inv[i] <= 0 || me.st !== ST.ok); });
      const gn = nearGun(me), G = me.gun >= 0 ? GN[me.gun] : null;
      $('[data-b="use"]').firstChild.textContent = gn ? "줍기" : me.fuse > 0 ? `사용 퓨즈${me.fuse}` : me.inv[3] > 0 ? "사용 열쇠" : "사용";
      $('[data-b="atk"]').firstChild.textContent = G ? (me.rl > 0 ? "장전 중" : me.mag <= 0 ? "빈 총" : "발사") : "스턴";
      $('[data-b="reload"]').classList.toggle("dim", !G || me.rl > 0 || me.mag >= G.mag || me.res <= 0); $('[data-b="drop"]').classList.toggle("dim", !G);
      gunEl.innerHTML = G ? `<b>${G.n}</b> <span>${me.mag} / ${me.res}</span>${me.sil ? " <i>소음기</i>" : ""}${me.rl > 0 ? `<em style="width:${Math.round((1 - me.rl / G.rl) * 100)}%"></em>` : ""}` : `<b>스턴봉</b> <span>근접</span> <small>총은 바닥에서 E로 줍기</small>`;
      $("[data-feed]").dataset.n = S.feed.length;
      // 피드(코어 로그의 새 줄)
      const spec = $('[data-a="spec"]'); spec.hidden = !(me.st === ST.out || me.st === ST.esc) || S.ph !== "play";
      tutorial(me, now);
    }
    function tutorial(me, now) {
      for (const f of S.feed) if (f[1] > lastFeed) { lastFeed = f[1]; say(f[0], /탈락|방해|사이렌|가동/.test(f[0]) ? "warn" : ""); }
      const hint = $("[data-hint]"); if (tut.off || S.ph !== "play") { hint.hidden = true; return; }
      tut.moved += Math.hypot(me.x - tut.lx, me.y - tut.ly); tut.lx = me.x; tut.ly = me.y;
      const t = S.t; let text = "";
      if (tut.step === 0) { text = isTouch() ? "왼쪽 스틱으로 걸어요. 화면을 누르면 손전등이 그쪽을 비춰요." : "WASD로 걸어요. 마우스를 향해 손전등이 비춰요."; if (tut.moved > 4) tut.step = 1; }
      else if (tut.step === 1) { text = "노란 번개(퓨즈)를 찾아 지나가면 주워요. 바닥의 총은 E로 줍고 J로 쏴요 — 총소리는 멀리 들려요."; if (me.fuse > 0 || t > 50) tut.step = 2; }
      else if (tut.step === 2) { text = "퓨즈 3개를 모아 가운데 엘리베이터(노란 ⇧)에서 '사용'을 길게 눌러 꽂아요."; if (S.teams[me.team].ins > 0 || t > 130) tut.step = 3; }
      else if (tut.step === 3) { text = "적이 가까우면 '스턴'으로 기절시켜요(뒤에서 하면 강해요). 로커 앞에서 '사용'을 누르면 숨어요."; if (t > 170) { tut.step = 4; } }
      else { tut.off = true; store.set("np.tut", "1"); hint.hidden = true; return; }
      hint.hidden = false; hint.textContent = text;
    }
    $("[data-hint]").addEventListener("click", () => { tut.off = true; store.set("np.tut", "1"); $("[data-hint]").hidden = true; });
    /* ---- 루프 ---- */
    function tick(now, manual) {
      if (!manual) frame = requestAnimationFrame(tick);
      try {
        if (!S) return;
        const dt = Math.min(.05, Math.max(0, (now - prev) / 1000)); prev = now;
        ema = ema * .95 + dt * 1000 * .05; if (!lowQ && ema > 27) { slow++; if (slow > 120) { lowQ = true; } } else slow = Math.max(0, slow - 1);
        if (role === "guest") {
          const me = S.players[meIdx], inp = readInput(); updateAim(dt, inp); if (me) me.a = aim;
          for (const p of S.players) if (p.rx !== undefined) { p.rx += (p.x - p.rx) * Math.min(1, dt * 12); p.ry += (p.y - p.ry) * Math.min(1, dt * 12); p.ra = p.a; }
          const sig = JSON.stringify([inp.dx.toFixed(1), inp.dy.toFixed(1), inp.run, inp.sneak, inp.light, inp.atk, inp.use, inp.n, inp.f]);
          if (room && (sig !== lastSent || now - lastSend > 150) && now - lastSend > 45) { room.input({...inp, a: Math.round(aim * 100) / 100}); lastSend = now; lastSent = sig; }
          if (S.ph === "play" && now - lastSnap > 4000) $("[data-hud]").textContent = "방장과 연결이 불안정해요…";
        } else if (S.ph === "play") {
          const inp = readInput(); updateAim(dt, inp); inp.a = aim; hostIn[meIdx] = inp;
          const hum = S.players.filter(p => p.human && p.st !== ST.out && p.st !== ST.esc).length;
          const reps = hum === 0 ? 3 : 1; for (let i = 0; i < reps; i++) core.step(S, dt, hostIn);
          if (role === "host" && now - publishAt > 85) { room.publish(core.encode(S)); publishAt = now; }
        }
        if (S.ph === "over" && role === "host" && !over) room.publish(core.encode(S));
        processEvents();
        if (S.ph === "over") { if (!over) finish(); }
        render(now, dt); hudUpdate(now);
      } catch (e) {
        console.error("nightpatrol", e); cancelAnimationFrame(frame); frame = 0;
        msg("게임 처리 중 오류가 났어요 · 나갔다가 다시 시작해 주세요"); briefing.show();
      }
    }
    /* ---- 버튼 ---- */
    dialog.addEventListener("click", e => {
      const o = e.target.closest("[data-o]"); if (o) { opt[o.dataset.o] = o.dataset.o === "teams" ? +o.dataset.v : o.dataset.v; syncOpts(); return; }
      const a = e.target.closest("[data-a]"); if (!a) return;
      switch (a.dataset.a) {
        case "exit": pressExit(); break;
        case "exit-now": dialog.close(); break;
        case "sound": soundOn = !soundOn; store.set("np.snd", soundOn ? "1" : "0"); a.setAttribute("aria-pressed", String(soundOn)); a.textContent = soundOn ? "소리 켬" : "소리 끔"; break;
        case "practice": if (role === "host") { msg("온라인 방을 닫고 연습을 시작해요"); disconnect(); } begin("practice"); break;
        case "host": connect("host"); break;
        case "join": connect("guest"); break;
        case "start": if (role === "host") begin("online"); break;
        case "again": if (role !== "guest") begin(role === "host" ? "online" : lastBegin); break;
        case "setup": backToSetup(); break;
        case "spec": { const al = S.players.filter(p => p.st === ST.ok || p.st === ST.hide || p.st === ST.down); if (al.length) { const i = al.indexOf(viewP()); specIdx = al[(i + 1) % al.length].i; } break; }
      }
    });
    $('[data-a="sound"]').setAttribute("aria-pressed", String(soundOn)); $('[data-a="sound"]').textContent = soundOn ? "소리 켬" : "소리 끔";
    if (typeof root.knxKeyHints === "function") root.knxKeyHints({id: "night-beam", screen: () => dialog.open, title: "암전 순찰 단축키", corner: "br", bottom: matchMedia("(min-width:821px)").matches ? 78 : 205,
      rows: [["WASD", "이동"], ["마우스", "방향(손전등·조준)"], ["J · Space · 클릭", "발사 / 스턴"], ["R", "장전"], ["E (길게)", "줍기·사용·숨기"], ["G", "총 버리기"], ["B", "근접 스턴봉"], ["F", "손전등"], ["Shift / C", "달리기 / 살금"], ["Q · X · T", "배터리·연막·함정"], ["Esc", "나가기"]]});
    root.roundbRooms && root.roundbRooms.register("night-beam", code => { dialog.showScreen(); $("[data-code]").value = code; connect("guest"); });
    games.register({id: "night-beam", name: "암전 순찰", tag: "손전등 퓨즈 탈출 · 2인 5팀", kind: "main", open: () => { dialog.showScreen(); }});
    root.roundbNightPatrol = {open: () => dialog.showScreen(), dialog, state: () => S, begin, tick: n => tick(n, true)};
  }
})();
