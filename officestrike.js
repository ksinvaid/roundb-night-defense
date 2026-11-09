/* 라운드비 총격전 — officestrike.js
   ① 핵심(RB_OFFICE_CORE): 아레나 4개·무기·구매·설치/해체·봇 AI·판 진행 (화면 없이 노드에서 시험 가능)
   ② 화면: 레이캐스트 3D 렌더러·폰/PC 조작·온라인(createArenaRoom, 방장 권위)·점수판·결과·RP 보상 */
(() => {
"use strict";
const TAU = Math.PI * 2, rnd = Math.random;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dst = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const adiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;

/* ---------- 아레나 4개 (open → solid → doors 순서로 깎는다. 1 벽 · 2 유리 · 3 사물함/집기 · 4 기둥) ---------- */
const MAP_SPECS = [
  {id:"office", name:"4층 공유오피스", note:"좌우 큰 사무실이 A·B 지점. 가운데 라운지로 빠르게 돌 수 있어요.", w:30, h:30, k:1.7, scatter:{step:7, ox:4, oy:4},
   open:[[12,1,17,4],[2,5,27,7],[2,9,9,21],[11,9,18,21],[20,9,27,21],[2,23,27,25],[12,26,17,28]],
   solid:[[10,9,10,21,2],[19,9,19,21,2],[3,11,5,12,3],[7,14,8,15,3],[3,17,5,18,3],[7,19,8,19,3],[24,11,26,12,3],[21,14,22,15,3],[24,17,26,18,3],[21,19,22,19,3],
     [13,12,13,12,4],[16,12,16,12,4],[13,18,13,18,4],[16,18,16,18,4],[14,15,15,15,3],[8,6,8,6,4],[21,6,21,6,4],[8,24,8,24,4],[21,24,21,24,4]],
   doors:[[3,8,4,8],[8,8,8,8],[13,8,16,8],[25,8,26,8],[21,8,21,8],[10,13,10,14],[10,19,10,20],[19,13,19,14],[19,19,19,20],[4,22,5,22],[13,22,16,22],[24,22,25,22]],
   A:[5,15], B:[24,15], atk:[12,1,17,4], def:[12,26,17,28],
   pal:{wall:[176,168,150], glass:[120,172,196], crate:[156,112,64], pillar:[122,128,140], ceil:"#27323f", floor:"#3b414b"}},
  {id:"meeting", name:"3층 회의실 복도", note:"유리 회의실이 둘러싼 복도. 로비 양끝이 A·B 지점이고 복도로 크게 돌아 들어가요.", w:28, h:28, k:1.7, scatter:{step:7, ox:4, oy:4},
   pre:[[5,5,22,22,2]],
   open:[[2,2,25,4],[2,23,25,25],[2,5,4,22],[23,5,25,22],[6,6,12,10],[15,6,21,10],[6,17,12,21],[15,17,21,21],[6,12,21,15]],
   solid:[[10,13,11,14,3],[16,13,17,14,3],[13,3,14,3,3],[13,24,14,24,3],[3,13,3,14,3],[24,13,24,14,3]],
   doors:[[8,11,9,11],[18,11,19,11],[8,16,9,16],[18,16,19,16],[8,5,9,5],[18,5,19,5],[8,22,9,22],[18,22,19,22],[5,13,5,14],[22,13,22,14],[13,8,14,8],[13,19,14,19]],
   A:[7,14], B:[20,13], atk:[11,2,16,3], def:[11,24,16,25],
   pal:{wall:[204,204,210], glass:[132,184,210], crate:[150,108,72], pillar:[140,146,158], ceil:"#2d3a4a", floor:"#454c5a"}},
  {id:"garage", name:"지하 주차장", note:"탁 트인 기둥 숲. 차량 뒤에 숨어 가운데 코어를 끼고 위·아래 길로 돌아요.", w:32, h:24, k:1.7, scatter:{step:7, ox:4, oy:4},
   open:[[1,1,30,22]],
   solid:[[8,1,8,7,1],[8,16,8,22,1],[23,1,23,7,1],[23,16,23,22,1],[13,9,18,14,4],
     [4,4,6,5,3],[4,18,6,19,3],[10,10,11,13,3],[20,10,21,13,3],[25,4,27,5,3],[25,18,27,19,3],[14,3,17,4,3],[14,19,17,20,3],[19,17,20,17,3],[11,6,12,6,3],
     [11,4,11,4,4],[20,4,20,4,4],[11,19,11,19,4],[20,19,20,19,4]],
   doors:[],
   A:[15,6], B:[16,17], atk:[1,9,3,14], def:[28,9,30,14],
   pal:{wall:[116,118,124], glass:[120,160,180], crate:[70,102,150], pillar:[150,142,96], ceil:"#1e232b", floor:"#30343b"}},
  {id:"cafe", name:"1층 로비 카페", note:"카운터를 낀 가운데 길, 유리 방 두 개가 A·B 지점. 위쪽 통로로 돌아갈 수 있어요.", w:28, h:28, k:1.7, scatter:{step:7, ox:4, oy:4},
   open:[[1,1,26,26]],
   solid:[[1,5,10,5,1],[17,5,26,5,1],[1,22,10,22,1],[17,22,26,22,1],
     [1,8,8,8,2],[1,19,8,19,2],[9,8,9,11,2],[9,16,9,19,2],[19,8,26,8,2],[19,19,26,19,2],[18,8,18,11,2],[18,16,18,19,2],
     [12,11,15,16,3],[6,3,6,3,4],[21,3,21,3,4],[6,24,6,24,4],[21,24,21,24,4],[13,7,14,7,3],
     [3,11,4,12,3],[6,15,7,16,3],[23,11,24,12,3],[20,15,21,16,3]],
   doors:[[3,8,4,8],[3,19,4,19],[23,8,24,8],[23,19,24,19]],
   A:[4,14], B:[23,14], atk:[10,1,17,3], def:[10,24,17,26],
   pal:{wall:[168,128,98], glass:[128,176,190], crate:[110,80,60], pillar:[132,120,110], ceil:"#33281f", floor:"#4a3f36"}}
];
function buildMap(sp) {
  const k = sp.k || 1, sx = v => Math.round(v * k), ex = v => Math.round((v + 1) * k) - 1;
  const R = r => [sx(r[0]), sx(r[1]), ex(r[2]), ex(r[3])].concat(r.slice(4));
  const pt = c => [Math.round((c[0] + .5) * k - .5), Math.round((c[1] + .5) * k - .5)];
  const w = sx(sp.w), h = sx(sp.h), g = new Uint8Array(w * h).fill(1);
  const fill = (x1, y1, x2, y2, t) => { for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) if (x > 0 && y > 0 && x < w - 1 && y < h - 1) g[y * w + x] = t; };
  const free = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !g[y * w + x];
  (sp.pre || []).map(R).forEach(r => fill(r[0], r[1], r[2], r[3], r[4]));
  sp.open.map(R).forEach(r => fill(r[0], r[1], r[2], r[3], 0));
  (sp.solid || []).map(R).forEach(r => fill(r[0], r[1], r[2], r[3], r[4] === 3 ? 5 : r[4] || 1));   // 5 = 낮은 엄폐(책상·상자): 앉으면 숨고, 서면 넘겨다보고, 점프로 넘는다
  const aS = pt(sp.A), bS = pt(sp.B), atkR = R(sp.atk), defR = R(sp.def);
  if (sp.scatter) {  // 큰 방에 엄폐물(2×2 상자·기둥)을 규칙적으로 흩뿌린다 — 사방 6칸이 비어 있을 때만, 지점·스폰 근처는 피한다
    const st = sp.scatter, ok = (x, y) => { for (let yy = y - 2; yy <= y + 3; yy++) for (let xx = x - 2; xx <= x + 3; xx++) if (!free(xx, yy)) return false; return true; };
    const away = (x, y) => [aS, bS].every(s => Math.hypot(x + 1 - s[0], y + 1 - s[1]) > 6) && [atkR, defR].every(r => !(x > r[0] - 4 && x < r[2] + 4 && y > r[1] - 4 && y < r[3] + 4));
    let n = 0;
    for (let y = st.oy; y < h - 4; y += st.step) for (let x = st.ox + (Math.floor(y / st.step) % 2 ? Math.floor(st.step / 2) : 0); x < w - 4; x += st.step) if (ok(x, y) && away(x, y)) { const m3 = n++ % 3; if (m3 === 2) fill(x, y, x + 1, y + 1, 4); else if (m3 === 1) fill(x, y, x + 1, y, 5); else fill(x, y, x, y + 1, 5); }
  }
  for (const st of [aS, bS]) for (let a = 0; a < 6; a++) {  // 설치 지점 둘레에 낮은 엄폐
    const cx = Math.round(st[0] + Math.cos(a * 1.0472 + .3) * 3.6), cy = Math.round(st[1] + Math.sin(a * 1.0472 + .3) * 3.6);
    if (free(cx, cy) && free(cx + 1, cy) && free(cx - 1, cy) && free(cx, cy - 1) && free(cx, cy + 1) && free(cx + 2, cy)) fill(cx, cy, cx + 1, cy, 5);
  }
  (sp.doors || []).map(R).forEach(r => fill(r[0], r[1], r[2], r[3], 0));
  const cellsOf = r => { const o = []; for (let y = r[1]; y <= r[3]; y++) for (let x = r[0]; x <= r[2]; x++) if (free(x, y)) o.push({x: x + .5, y: y + .5}); return o; };
  const pick = (c, n) => Array.from({length: n}, (_, i) => c[Math.min(c.length - 1, Math.floor((i + .5) * c.length / n))]);
  const sees = (ax, ay, bx, by) => { const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 6); for (let i = 1; i < n; i++) if (!free(Math.floor(ax + (bx - ax) * i / n), Math.floor(ay + (by - ay) * i / n))) return false; return true; };
  const mk = (l, c) => {
    const s = {l, x: c[0] + .5, y: c[1] + .5, posts: [], escorts: []};
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!free(x, y)) continue; const d = Math.hypot(x + .5 - s.x, y + .5 - s.y);
      if (d >= 2 && d <= 9 && sees(x + .5, y + .5, s.x, s.y)) { if (d >= 4) s.posts.push({x: x + .5, y: y + .5}); if (d <= 6.5) s.escorts.push({x: x + .5, y: y + .5}); }
    }
    return s;
  };
  return {id: sp.id, name: sp.name, note: sp.note, w, h, grid: g, pal: sp.pal, A: mk("A", aS), B: mk("B", bS), atk: pick(cellsOf(atkR), 10), def: pick(cellsOf(defR), 10), cx: w / 2, cy: h / 2};
}
const MAPS = MAP_SPECS.map(buildMap);

/* ---------- 무기 (계열 5종 + 권총 + 단검) ---------- */
const WP = {
  pistol:{n:"권총", f:"권총", price:0, dmg:26, cd:.19, mag:13, res:52, sp:.006, mv:.05, rc:.9, rng:14, fall:.5, auto:0, rl:1.5, spd:1, pel:1, head:2.3, fov:.95, t:"p"},
  smg:{n:"제비 기관단총", f:"기관단총", price:1000, dmg:18, cd:.075, mag:30, res:120, sp:.011, mv:.05, rc:.5, rng:9, fall:.7, auto:1, rl:1.8, spd:1.06, pel:1, head:2, fov:.95, t:"s"},
  shot:{n:"성광 산탄총", f:"산탄총", price:1200, dmg:10, cd:.78, mag:7, res:28, sp:.05, mv:.03, rc:2.4, rng:7, fall:.9, auto:0, rl:2.5, spd:1, pel:9, head:1.4, fov:.95, t:"g"},
  rifle:{n:"파수 돌격소총", f:"돌격소총", price:2000, dmg:28, cd:.1, mag:30, res:90, sp:.006, mv:.1, rc:.85, rng:22, fall:.25, auto:1, rl:2.3, spd:.96, pel:1, head:2.4, fov:.74, t:"r"},
  lmg:{n:"전술 경기관총", f:"경기관총", price:2500, dmg:24, cd:.085, mag:80, res:160, sp:.01, mv:.11, rc:.5, rng:20, fall:.25, auto:1, rl:4.2, spd:.86, pel:1, head:2, fov:.82, t:"l"},
  sniper:{n:"별빛 저격총", f:"저격총", price:2800, dmg:92, cd:1.15, mag:5, res:20, sp:.003, mv:.32, rc:3, rng:45, fall:0, auto:0, rl:2.6, spd:.9, pel:1, head:3, fov:.34, scope:1, t:"n"},
  knife:{n:"전술 단검", f:"근접", price:0, dmg:42, cd:.55, mag:0, res:0, rng:1.5, spd:1.12, fov:1, t:"k"},
  nade:{n:"투척물", f:"투척", price:0, dmg:0, cd:.8, mag:0, res:0, sp:0, mv:0, rc:0, rng:0, fall:0, auto:0, rl:0, spd:1.04, pel:0, head:1, fov:1, t:"x"},
  bomb:{n:"폭탄", f:"폭탄", price:0, dmg:0, cd:.5, mag:0, res:0, sp:0, mv:0, rc:0, rng:0, fall:0, auto:0, rl:0, spd:1, pel:0, head:1, fov:1, t:"b"}
};
const PRIM = ["smg", "shot", "rifle", "lmg", "sniper"];
const BUYS = [  // 구매 목록 (키 1~9, 0)
  {id:"rifle", n:WP.rifle.n, price:2000, key:"1"}, {id:"smg", n:WP.smg.n, price:1000, key:"2"}, {id:"shot", n:WP.shot.n, price:1200, key:"3"},
  {id:"lmg", n:WP.lmg.n, price:2500, key:"4"}, {id:"sniper", n:WP.sniper.n, price:2800, key:"5"},
  {id:"armor", n:"방탄복", price:400, key:"6"}, {id:"kit", n:"해체 키트", price:350, key:"7", def:true},
  {id:"frag", n:"수류탄", price:250, key:"8"}, {id:"smoke", n:"연막탄", price:200, key:"9"}, {id:"flash", n:"섬광탄", price:200, key:"0"}
];
const DIFF = {
  easy:{n:"쉬움", react:.95, aim:.085, turn:3.2, acc:.5, nades:.12, hearing:.3, peek:.15, plantWait:26},
  normal:{n:"보통", react:.5, aim:.04, turn:5.5, acc:.8, nades:.5, hearing:.6, peek:.5, plantWait:20},
  hard:{n:"어려움", react:.26, aim:.02, turn:8.5, acc:1, nades:.9, hearing:.9, peek:.85, plantWait:14}
};
const CFG = {startCredits:1000, cap:6500, winPay:1500, losePay:1000, killPay:200, objPay:300, buyT:12, liveT:120, postT:4.5, bombT:40, plantT:4, defT:7, kitT:4, maxRounds:7, toWin:4, swapAfter:3, speed:3.3};

/* ---------- 판 하나 ---------- */
function createMatch(o) {
  const map = MAPS[o.map | 0] || MAPS[0], W = map.w, H = map.h, G = map.grid, DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const per = clamp(o.per | 0 || 5, 1, 10), N = per * 2;
  const humans = new Map(); for (const s of (o.humans || [])) if (s >= 0 && s < N) humans.set(s, {});
  const S = {id: Math.random().toString(36).slice(2, 8), mi: o.map | 0, map, diff: DIFF[o.diff] ? o.diff : "easy", t: 0, phase: "buy", phaseEnd: 0, ro: 0, atk: 0, score: [0, 0], players: [], nades: [], smokes: [], feed: [], ev: [], evId: 0,
    notice: "", done: false, winner: -1, intel: [{}, {}], loss: [0, 0], plan: null, liveT0: 0, lastEnd: null, defuser: -1, final: false, spotAt: 0, n: N,
    bomb: {st: "carried", holder: -1, x: 0, y: 0, site: "", t0: 0, end: 0}};
  for (let i = 0; i < N; i++) S.players.push({i, k: (i + (o.me | 0)) % 10, team: i % 2, human: humans.has(i), kills: 0, deaths: 0, assists: 0, hs: 0, plants: 0, defuses: 0, credits: CFG.startCredits, ready: false,
    x: 1.5, y: 1.5, a: 0, hp: 100, armor: 0, kit: false, pw: null, w: 1, clip: [0, 13], res: [0, 52], gren: [0, 0, 0], cd: 0, load: 0, rec: 0, mf: 0, zoom: false, fireHeld: false, alive: true, blind: 0,
    prog: 0, job: 0, hitAt: -9, hitDir: 0, shotAt: -9, dmgBy: {}, spot: [-9, -9], acc: 1, ai: null,
    st: 0, z: 0, vz: 0, rollT: 0, rollCd: 0, rdx: 0, rdy: 1, gsel: 0, lastW: 1, throwAt: -9, landT: 0, jumpHeld: false, lf: 0, ls: 0, gx: 1.5, gy: 1.5});
  const ev = (ty, x, y, a, b, c) => { S.ev.push([++S.evId, ty, r1(x), r1(y), a == null ? 0 : a, b == null ? 0 : b, S.t, c | 0]); if (S.ev.length > 60) S.ev.shift(); };
  const cell = (x, y) => { if (x < 0 || y < 0) return 1; const cx = Math.floor(x), cy = Math.floor(y); return cx >= W || cy >= H ? 1 : G[cy * W + cx]; };
  const solid = (x, y) => { const c = cell(x, y); return c !== 0 && c !== 5; };   // 낮은 엄폐(5)는 시선·수류탄은 통과
  const wkey = p => p.w === 2 ? "knife" : p.w === 3 ? "nade" : p.w === 4 ? "bomb" : (p.w === 0 && p.pw) ? p.pw : "pistol";
  const wdef = p => WP[wkey(p)];
  const ci = p => wkey(p) === "pistol" ? 1 : 0;
  const alivesOf = t => S.players.filter(p => p.alive && p.team === t);

  function cast(x, y, dx, dy) {  // DDA — 첫 벽까지
    let cx = Math.floor(x), cy = Math.floor(y), n = 0, d = 0, side = 0;
    const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1, tdx = dx === 0 ? 1e9 : Math.abs(1 / dx), tdy = dy === 0 ? 1e9 : Math.abs(1 / dy);
    let tx = dx === 0 ? 1e9 : (dx > 0 ? cx + 1 - x : x - cx) * tdx, ty = dy === 0 ? 1e9 : (dy > 0 ? cy + 1 - y : y - cy) * tdy;
    while (n++ < 90) {
      const t = cell(cx, cy); if (t && t !== 5) return {d, side, t, cx, cy};
      if (tx < ty) { d = tx; tx += tdx; cx += sx; side = 0; } else { d = ty; ty += tdy; cy += sy; side = 1; }
    }
    return {d: 99, side: 0, t: 1, cx, cy};
  }
  function los(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy); if (d < 1e-6) return true; return cast(ax, ay, dx / d, dy / d).d >= d - .03; }
  function smokeR(s) { return s.r * Math.min(1, (S.t - s.t0) / .9 + .15); }
  function smoked(ax, ay, bx, by) {
    for (const s of S.smokes) {
      if (S.t >= s.end) continue; const r = smokeR(s) * .86, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const u = l2 < 1e-9 ? 0 : clamp(((s.x - ax) * dx + (s.y - ay) * dy) / l2, 0, 1);
      if (Math.hypot(ax + dx * u - s.x, ay + dy * u - s.y) < r) return true;
    }
    return false;
  }
  const blocked = (x, y, z) => { const c = cell(x, y); return c === 0 ? false : c === 5 ? z < .11 : true; };
  const fits = (x, y, z = 0) => !blocked(x - .2, y - .2, z) && !blocked(x + .2, y - .2, z) && !blocked(x - .2, y + .2, z) && !blocked(x + .2, y + .2, z);
  function moveP(p, vx, vy, dt) { const nx = p.x + vx * dt, ny = p.y + vy * dt; if (fits(nx, p.y, p.z)) p.x = nx; if (fits(p.x, ny, p.z)) p.y = ny; }
  const eyeH = p => (p.st === 2 ? .17 : p.st === 1 ? .4 : .575) + p.z, topH = q => (q.st === 2 ? .2 : q.st === 1 ? .46 : .66) + q.z;   // 눈높이·머리 꼭대기(표시 단위, 벽 높이 1.15)
  function lowHit(ax, ay, bx, by) {  // 두 점 사이에서 처음 만나는 낮은 엄폐까지의 거리(없으면 -1)
    const dx = bx - ax, dy = by - ay, D = Math.hypot(dx, dy); if (D < 1e-6) return -1; const ux = dx / D, uy = dy / D;
    let cx = Math.floor(ax), cy = Math.floor(ay), n = 0, d = 0;
    const sx = ux < 0 ? -1 : 1, sy = uy < 0 ? -1 : 1, tdx = ux === 0 ? 1e9 : Math.abs(1 / ux), tdy = uy === 0 ? 1e9 : Math.abs(1 / uy);
    let tx = ux === 0 ? 1e9 : (ux > 0 ? cx + 1 - ax : ax - cx) * tdx, ty = uy === 0 ? 1e9 : (uy > 0 ? cy + 1 - ay : ay - cy) * tdy;
    while (n++ < 90 && d < D) { if (cell(cx, cy) === 5) return d; if (tx < ty) { d = tx; tx += tdx; cx += sx; } else { d = ty; ty += tdy; cy += sy; } }
    return -1;
  }
  function exposure(p, q) {  // 2 몸통까지 보임 · 1 머리만 보임 · 0 엄폐 뒤에 숨음
    const dl = lowHit(p.x, p.y, q.x, q.y); if (dl < 0) return 2;
    const D = Math.max(.1, dst(p, q)), he = eyeH(p), top = topH(q), chest = top * .66;
    const clear = ht => Math.min(he + (ht - he) * dl / D, he + (ht - he) * Math.min(1, (dl + 1) / D)) > .36;
    return clear(chest) ? 2 : clear(top) ? 1 : 0;
  }

  /* --- 길찾기: 목표 칸에서 퍼지는 거리장 + 직선으로 갈 수 있는 가장 먼 지점 --- */
  const fcache = new Map();
  function field(tx, ty) {
    const key = ty * W + tx, c = fcache.get(key); if (c && S.t - c.t < 2) return c.d;
    const d = new Int16Array(W * H).fill(-1), q = new Int16Array(W * H); let hd = 0, tl = 0;
    if (G[key]) return d;
    d[key] = 0; q[tl++] = key;
    while (hd < tl) {
      const cc = q[hd++], cx = cc % W, cy = (cc / W) | 0, dc = d[cc];
      for (const [ox, oy] of DIRS) {
        const nx = cx + ox, ny = cy + oy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx; if (G[ni] || d[ni] >= 0) continue;
        if (ox && oy && (G[cy * W + nx] || G[ny * W + cx])) continue;
        d[ni] = dc + (ox && oy ? 14 : 10); q[tl++] = ni;
      }
    }
    if (fcache.size > 48) fcache.clear();
    fcache.set(key, {d, t: S.t}); return d;
  }
  function wide(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l * .24, ny = dx / l * .24;
    return los(ax, ay, bx, by) && los(ax + nx, ay + ny, bx + nx, by + ny) && los(ax - nx, ay - ny, bx - nx, by - ny);
  }
  function nav(p, f) {
    let cx = Math.floor(p.x), cy = Math.floor(p.y), best = f[cy * W + cx]; if (best < 0) return null;
    let out = null;
    for (let s = 0; s < 6; s++) {
      let bx = -1, by = -1, bv = best;
      for (const [ox, oy] of DIRS) {
        const nx = cx + ox, ny = cy + oy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const v = f[ny * W + nx]; if (v < 0 || v >= bv) continue;
        if (ox && oy && (G[cy * W + nx] || G[ny * W + cx])) continue;
        bv = v; bx = nx; by = ny;
      }
      if (bx < 0) break;
      best = bv; cx = bx; cy = by;
      if (s === 0 || wide(p.x, p.y, cx + .5, cy + .5)) out = {x: cx + .5, y: cy + .5}; else break;
    }
    return out;
  }

  /* --- 무기 · 사격 --- */
  function spreadNow(p) {
    const d = wdef(p); if (!d.sp && d.sp !== 0) return 0;
    let s = (d.sp + d.mv * p.mf + p.rec * .0035) * [1, .8, .55][p.st | 0] + (p.z > .02 ? .08 : 0);
    if (p.zoom) s *= d.scope ? (p.mf > .2 ? 1.5 : .12) : .6; else if (d.scope) s += .03;
    return s * p.acc;
  }
  function startReload(p) {
    const d = wdef(p); if (d.t === "k" || d.t === "x" || d.t === "b" || p.load > 0) return;
    const c = ci(p); if (p.clip[c] >= d.mag || p.res[c] <= 0) return;
    p.load = d.rl; p.zoom = false; ev("rl", p.x, p.y, p.i, d.t);
  }
  function setWeapon(p, n) {
    if (n === 0 && !p.pw) return; if (p.w === n) return;
    if (p.w !== 3 && p.w !== 4) p.lastW = p.w;
    p.w = n; p.load = 0; p.zoom = false; p.cd = Math.max(p.cd, .3); p.fireHeld = true;
  }
  function harm(src, q, dmg, head, wn, from) {
    if (!q.alive || S.phase !== "live" && S.phase !== "post") return;
    if (q.armor > 0) { q.armor = Math.max(0, q.armor - dmg * .5); dmg *= head ? .8 : .6; }
    dmg = Math.round(dmg); q.hp -= dmg; q.hitAt = S.t; q.hitDir = from;
    if (src && src !== q) q.dmgBy[src.i] = S.t;
    ev("ht", q.x, q.y, q.i, (head ? 100 : 0) + (src && src !== q ? src.i : 99), dmg);
    if (q.hp > 0) return;
    q.hp = 0; q.alive = false; q.deaths++; q.prog = 0; q.job = 0; q.zoom = false;
    if (src && src !== q) {
      src.kills++; if (head) src.hs++; src.credits = Math.min(CFG.cap, src.credits + CFG.killPay);
      for (const [i, t] of Object.entries(q.dmgBy)) if (+i !== src.i && S.t - t < 7) S.players[+i].assists++;
    }
    S.feed.unshift([src ? src.k : q.k, q.k, wn, head ? 1 : 0, src ? src.team : 1 - q.team, q.team, S.t]); S.feed.length = Math.min(S.feed.length, 6);
    ev("kl", q.x, q.y, q.i, src ? src.i : -1);
    if (S.bomb.st === "carried" && S.bomb.holder === q.i) { S.bomb.st = "dropped"; S.bomb.x = q.x; S.bomb.y = q.y; S.bomb.holder = -1; ev("bd", q.x, q.y); }
  }
  function hitscan(p, a, d) {
    const dx = Math.cos(a), dy = Math.sin(a), wall = cast(p.x, p.y, dx, dy).d; let best = null;
    for (const q of S.players) {
      if (!q.alive || q.team === p.team) continue;
      const rx = q.x - p.x, ry = q.y - p.y, al = rx * dx + ry * dy;
      if (al <= 0 || al > wall || al > d.rng * 2.4) continue;
      if (Math.abs(rx * dy - ry * dx) > .3) continue;
      const ex = exposure(p, q); if (ex === 0) continue;
      if (!best || al < best.al) best = {q, al, only: ex === 1};
    }
    return best;
  }
  function fireGun(p, bot) {
    const d = wdef(p), c = ci(p);
    if (d.t === "x") {  // 든 수류탄·연막·섬광을 던진다
      if (p.cd > 0 || !p.gren[p.gsel]) return; throwNade(p, p.gsel); p.cd = .8;
      if (!p.gren[p.gsel]) { const own = [0, 1, 2].filter(t => p.gren[t] > 0); if (own.length) p.gsel = own[0]; else setWeapon(p, p.lastW == null || (p.lastW === 0 && !p.pw) || p.lastW > 2 ? 1 : p.lastW); }
      return;
    }
    if (d.t === "b") return;
    if (d.t === "k") { if (p.cd > 0) return; p.cd = d.cd; p.shotAt = S.t; ev("kn", p.x, p.y, p.i);
      for (const q of S.players) if (q.alive && q.team !== p.team && dst(p, q) < d.rng && Math.abs(adiff(angTo(p, q), p.a)) < .7 && los(p.x, p.y, q.x, q.y)) harm(p, q, d.dmg, false, d.n, p.a); return; }
    if (p.cd > 0 || p.load > 0) return;
    if (p.clip[c] <= 0) { startReload(p); return; }
    p.clip[c]--; p.cd = d.cd; p.shotAt = S.t;
    const sp = spreadNow(p); let chance = clamp(.2 - sp * 2.5 + (p.zoom ? .06 : 0), .04, .22);
    if (d.scope) chance = p.zoom && p.mf < .15 ? .55 : .15;
    p.rec = Math.min(6, p.rec + d.rc);
    ev("sh", p.x, p.y, d.t, p.i);
    const hit = new Map();
    for (let k = 0; k < d.pel; k++) {
      const a = p.a + (rnd() * 2 - 1) * sp * (d.pel > 1 ? 1 : 1.3), h = hitscan(p, a, d); if (!h) continue;
      const head = rnd() < chance; if (h.only && !head) continue;
      const mult = head ? d.head : rnd() < .15 ? .8 : 1;
      const dm = d.dmg * mult * (1 - d.fall * clamp((h.al - d.rng) / d.rng, 0, 1));
      const e = hit.get(h.q) || {dm: 0, head: false}; e.dm += dm; e.head = e.head || head; hit.set(h.q, e);
    }
    for (const [q, e] of hit) harm(p, q, e.dm, e.head, d.n, p.a + Math.PI);
    if (p.clip[c] <= 0 && p.res[c] > 0) startReload(p);
  }
  function throwNade(p, type, a, speed) {
    if (!p.alive || S.phase !== "live" || !p.gren[type]) return false;
    p.gren[type]--; p.throwAt = S.t; const v = speed || 9; a = a == null ? p.a : a;
    let nx0 = p.x + Math.cos(a) * .4, ny0 = p.y + Math.sin(a) * .4; if (solid(nx0, ny0) || !los(p.x, p.y, nx0, ny0)) { nx0 = p.x; ny0 = p.y; }
    S.nades.push({type, x: nx0, y: ny0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: S.t, fuse: type === 0 ? 1.8 : type === 1 ? 1.7 : 1.25, owner: p.i, team: p.team});
    ev("th", p.x, p.y, type, p.i); return true;
  }
  function explode(n) {
    const owner = S.players[n.owner];
    if (n.type === 1) { S.smokes.push({x: n.x, y: n.y, r: 2.5, t0: S.t, end: S.t + 11}); ev("sm", n.x, n.y); return; }
    if (n.type === 0) {
      ev("bm", n.x, n.y);
      for (const q of S.players) { if (!q.alive) continue; const d = Math.hypot(q.x - n.x, q.y - n.y); if (d > 3.7 || !los(n.x, n.y, q.x, q.y)) continue;
        if (q.team === n.team && q !== owner) continue; harm(owner, q, Math.max(10, 105 * Math.pow(1 - d / 3.7, 1.25)), false, "수류탄", Math.atan2(n.y - q.y, n.x - q.x)); }
      return;
    }
    ev("fl", n.x, n.y);
    for (const q of S.players) {
      if (!q.alive) continue; const d = Math.hypot(q.x - n.x, q.y - n.y); if (d > 11 || !los(n.x, n.y, q.x, q.y)) continue;
      if (q.team === n.team && q !== owner) continue;  // 아군 섬광은 무효
      const face = Math.cos(adiff(q.a, angTo(q, n))); if (face < -.25) continue;
      q.blind = Math.max(q.blind, (1.6 + 2.6 * clamp(face, 0, 1)) * (1 - d / 11 * .55) * (q === owner ? .4 : 1));
    }
  }
  function stepNades(dt) {
    for (const n of S.nades) {
      const sp = Math.hypot(n.vx, n.vy);
      if (sp > .05) {
        const nx = n.x + n.vx * dt, ny = n.y + n.vy * dt;
        if (solid(nx, n.y)) n.vx *= -.45; else n.x = nx;
        if (solid(n.x, ny)) n.vy *= -.45; else n.y = ny;
        const k = Math.exp(-dt * .95); n.vx *= k; n.vy *= k;
      }
      if (S.t - n.t0 >= n.fuse) { n.dead = true; explode(n); }
    }
    S.nades = S.nades.filter(n => !n.dead); S.smokes = S.smokes.filter(s => S.t < s.end + 1);
  }

  /* --- 구매 --- */
  function buy(p, id) {
    if (S.phase !== "buy" || !p.alive) return false;
    const it = BUYS.find(b => b.id === id); if (!it || p.credits < it.price) return false;
    if (PRIM.includes(id)) { if (p.pw === id) return false; p.pw = id; p.clip[0] = WP[id].mag; p.res[0] = WP[id].res; p.w = 0; }
    else if (id === "armor") { if (p.armor >= 100) return false; p.armor = 100; }
    else if (id === "kit") { if (p.kit || p.team === S.atk) return false; p.kit = true; }
    else if (id === "frag") { if (p.gren[0] >= 1) return false; p.gren[0] = 1; }
    else if (id === "smoke") { if (p.gren[1] >= 1) return false; p.gren[1] = 1; }
    else if (id === "flash") { if (p.gren[2] >= 2) return false; p.gren[2]++; }
    else return false;
    p.credits -= it.price; ev("by", p.x, p.y, p.i); return true;
  }
  function botBuy(p) {
    const c = () => p.credits;
    if (!p.pw) {
      const roll = rnd();
      const want = c() >= 3000 ? (roll < .12 ? "sniper" : roll < .22 ? "lmg" : "rifle") : c() >= 2000 ? (roll < .1 ? "lmg" : "rifle") : c() >= 1200 ? (roll < .5 ? "shot" : "smg") : c() >= 1000 && roll < .7 ? "smg" : null;
      if (want) buy(p, want);
    }
    if (c() >= 450) buy(p, "armor");
    if (p.team !== S.atk && c() >= 400) buy(p, "kit");
    if (c() >= 250 && rnd() < .55) buy(p, "frag");
    if (c() >= 200) buy(p, "smoke");
    if (c() >= 200) buy(p, "flash");
  }

  /* --- 라운드 --- */
  function resetGear(p) { Object.assign(p, {gsel: 0, lastW: 1, pw: null, w: 1, clip: [0, 13], res: [0, 52], armor: 0, kit: false, gren: [0, 0, 0]}); }
  function nextRound() {
    S.ro++; S.phase = "buy"; S.phaseEnd = S.t + (S.ro === 1 ? CFG.buyT + 3 : CFG.buyT); S.nades = []; S.smokes = []; S.notice = ""; S.plan = null; S.defuser = -1; S.intel = [{}, {}]; S.lastEnd = null;
    if (S.ro === CFG.swapAfter + 1) { S.atk = 1; for (const p of S.players) { p.credits = CFG.startCredits; resetGear(p); } S.loss = [0, 0]; }
    const ord = [[], []]; for (const p of S.players) ord[p.team].push(p);
    for (const p of S.players) {
      if (!p.alive) resetGear(p);
      const k = ord[p.team].indexOf(p), sp = (p.team === S.atk ? map.atk : map.def)[k % 10];
      Object.assign(p, {x: sp.x, y: sp.y, hp: 100, alive: true, blind: 0, load: 0, rec: 0, mf: 0, cd: .5, zoom: false, prog: 0, job: 0, ready: false, dmgBy: {}, fireHeld: true, st: 0, z: 0, vz: 0, rollT: 0, landT: 0, rollCd: 0, gx: sp.x, gy: sp.y, hitAt: -9, shotAt: -9, spot: [-9, -9]});
      p.a = Math.atan2(map.cy - sp.y, map.cx - sp.x) + (rnd() - .5) * .2;
      p.w = p.pw ? 0 : 1; p.clip[0] = p.pw ? Math.max(p.clip[0], 1) : 0;
      if (p.pw) { p.clip[0] = WP[p.pw].mag; p.res[0] = Math.max(p.res[0], WP[p.pw].res); } p.clip[1] = 13; p.res[1] = Math.max(p.res[1], 52);
      p.ai = null; p.acc = p.human ? 1 : 1 / botD(p).acc;
    }
    const as = alivesOf(S.atk), pickBearer = as[Math.floor(rnd() * as.length)];
    S.bomb = {st: "carried", holder: pickBearer.i, x: 0, y: 0, site: "", t0: 0, end: 0};
    for (const p of S.players) if (!p.human) botBuy(p);
    ev("rn", 0, 0, S.ro, S.atk);
  }
  function startLive() {
    S.phase = "live"; S.phaseEnd = S.t + CFG.liveT; S.liveT0 = S.t; S.notice = "";
    const pickSite = rnd() < .5 ? map.A : map.B;
    S.plan = {site: pickSite, other: pickSite === map.A ? map.B : map.A, smoked: false, exec: 44 + rnd() * 20};
    const roles = {}, atk = S.players.filter(p => p.team === S.atk && !p.human && S.bomb.holder !== p.i), def = S.players.filter(p => p.team !== S.atk && !p.human);
    for (let l = Math.floor(atk.length / 4) + (rnd() < DIFF[S.diff].peek ? 1 : 0); l > 0 && atk.length > 1; l--) roles[atk[Math.floor(rnd() * atk.length)].i] = "lurk";
    const rots = def.length >= 6 ? 2 : def.length > 2 ? 1 : 0;
    def.forEach((p, i) => { roles[p.i] = i >= def.length - rots ? "rot" : "hold"; p.site = i % 2 ? map.B : map.A; });
    const used = [];
    for (const p of S.players) {
      if (p.human) continue; p.ai = mkAI(p); p.ai.role = roles[p.i] || (p.team === S.atk ? (S.bomb.holder === p.i ? "plant" : "escort") : "hold");
      const site = p.team === S.atk ? (p.ai.role === "lurk" ? S.plan.other : S.plan.site) : (p.site || map.A), list = p.team === S.atk ? site.escorts : site.posts;
      if (list.length) { let best = null; for (let t = 0; t < 6; t++) { const c = list[Math.floor(rnd() * list.length)]; if (!used.some(u => Math.hypot(u.x - c.x, u.y - c.y) < 1.8)) { best = c; break; } best = c; } p.ai.post = best; used.push(best); }
      p.ai.look = Math.atan2((p.team === S.atk ? site.y - p.y : map.atk[2].y - (p.ai.post || p).y), (p.team === S.atk ? site.x - p.x : map.atk[2].x - (p.ai.post || p).x));
    }
    ev("lv", 0, 0, S.ro);
  }
  function endRound(team, reason) {
    if (S.phase !== "live") return;
    S.phase = "post"; S.phaseEnd = S.t + CFG.postT; S.score[team]++; S.notice = reason; S.lastEnd = {team, reason};
    for (const p of S.players) p.credits = Math.min(CFG.cap, p.credits + (p.team === team ? CFG.winPay : CFG.losePay + Math.min(3, S.loss[p.team]) * 200));
    S.loss[team] = 0; S.loss[1 - team]++;
    S.final = S.score[team] >= CFG.toWin || S.ro >= CFG.maxRounds;
    ev("re", 0, 0, team, S.final ? 1 : 0);
  }
  function checkRound() {
    if (S.phase !== "live") return;
    const B = S.bomb, a = alivesOf(S.atk).length, d = alivesOf(1 - S.atk).length;
    if (B.st === "planted" && S.t >= B.end) { B.st = "exploded"; ev("bx", B.x, B.y); for (const q of S.players) if (q.alive && dst(q, B) < 6) harm(null, q, 150, false, "폭탄", 0); endRound(S.atk, "폭탄이 터졌어요"); return; }
    if (d === 0) return endRound(S.atk, "수비팀 전멸");
    if (a === 0 && B.st !== "planted") return endRound(1 - S.atk, "공격팀 전멸");
    if (B.st !== "planted" && S.t >= S.phaseEnd) return endRound(1 - S.atk, "시간 초과 · 설치 실패");
  }
  function siteNear(p) { for (const s of [map.A, map.B]) if (Math.hypot(p.x - s.x, p.y - s.y) < 2.3) return s; return null; }
  function doJob(p, dt, use) {
    const B = S.bomb;
    if (S.phase !== "live" || !p.alive || !use || p.mf > .14) { p.prog = 0; p.job = 0; return; }
    if (p.team === S.atk && B.st === "carried" && B.holder === p.i) {
      const s = siteNear(p);
      if (s) { p.job = 1; p.prog += dt / CFG.plantT; if (p.prog >= 1) { B.st = "planted"; B.x = p.x; B.y = p.y; B.site = s.l; B.t0 = S.t; B.end = S.t + CFG.bombT; B.holder = -1; p.plants++; p.credits = Math.min(CFG.cap, p.credits + CFG.objPay); p.prog = 0; p.job = 0; S.notice = s.l + " 지점 폭탄 설치"; ev("pl", p.x, p.y, p.i); } return; }
    }
    if (p.team !== S.atk && B.st === "planted" && Math.hypot(p.x - B.x, p.y - B.y) < 1.7) {
      p.job = 2; p.prog += dt / (p.kit ? CFG.kitT : CFG.defT);
      if (p.prog >= 1) { B.st = "defused"; p.defuses++; p.credits = Math.min(CFG.cap, p.credits + CFG.objPay); p.prog = 0; p.job = 0; ev("df", B.x, B.y, p.i); endRound(1 - S.atk, "폭탄 해체 성공"); }
      return;
    }
    p.prog = 0; p.job = 0;
  }

  /* --- 봇 --- */
  function botD(p) { return S.diff === "easy" && p.team === 0 ? DIFF.normal : DIFF[S.diff]; }
  function mkAI(p) { return {D: botD(p), nextThink: S.t + rnd() * .2, wp: null, wantA: p.a, tgt: -1, seenT: -9, react: 0, aimErr: 0, errT: 0, strafe: 0, ph: 0, phT: 0, burst: 3, pause: 0, fire: false, stop: false, zoom: false, use: false, walk: false,
    role: "hold", post: null, look: p.a, lastPos: null, nadeAt: S.t + 4, lx: p.x, ly: p.y, lt: S.t, jit: 0, fireTol: .1, scan: rnd() * 6}; }
  function canSee(p, q, d) {
    if (d > 2.4 && Math.abs(adiff(angTo(p, q), p.a)) > 1.3) return false;
    return los(p.x, p.y, q.x, q.y) && !smoked(p.x, p.y, q.x, q.y) && exposure(p, q) > 0;
  }
  function goTo(p, x, y, near) {
    const b = p.ai; if (Math.hypot(x - p.x, y - p.y) < (near || .4)) { b.wp = null; return true; }
    const w = nav(p, field(Math.floor(x), Math.floor(y))); b.wp = w || {x, y}; return false;
  }
  function pickStage(p, site) {
    const f = field(Math.floor(site.x), Math.floor(site.y));
    let cx = Math.floor(p.x), cy = Math.floor(p.y); const v0 = f[cy * W + cx]; if (v0 < 0) return {x: p.x, y: p.y};
    const goal = v0 * (.4 + rnd() * .25);
    for (let s = 0; s < 500; s++) {
      let bv = f[cy * W + cx], bx = -1, by = -1; if (bv <= goal) break;
      for (const [ox, oy] of DIRS) { const nx = cx + ox, ny = cy + oy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const v = f[ny * W + nx]; if (v < 0 || v >= bv) continue; if (ox && oy && (G[cy * W + nx] || G[ny * W + cx])) continue; bv = v; bx = nx; by = ny; }
      if (bx < 0) break; cx = bx; cy = by;
    }
    for (let t = 0; t < 10; t++) { const x = cx + Math.round((rnd() - .5) * 7), y = cy + Math.round((rnd() - .5) * 7); if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && !G[y * W + x]) return {x: x + .5, y: y + .5}; }
    return {x: cx + .5, y: cy + .5};
  }
  function botThink(p) {
    const b = p.ai, T = S.t, D = b.D, foe = 1 - p.team, B = S.bomb, wd = wdef(p), c = ci(p);
    b.fire = false; b.use = false; b.stop = false; b.walk = false; b.zoom = false; b.strafe = 0; b.crouch = false;
    // 막힘 감지
    if (T - b.lt > .9) { if (b.wp && Math.hypot(p.x - b.lx, p.y - b.ly) < .25) b.jit = T + .6 + rnd() * .4; b.lx = p.x; b.ly = p.y; b.lt = T; }
    // 시야
    let tgt = null, td = 1e9;
    if (p.blind < .4) for (const q of S.players) { if (!q.alive || q.team !== foe) continue; const d = dst(p, q); if (d < td && d < 30 && canSee(p, q, d)) { tgt = q; td = d; } }
    if (tgt) {
      if (b.tgt !== tgt.i) { b.tgt = tgt.i; b.react = T + D.react * (.7 + rnd() * .6); }
      b.seenT = T; b.lastPos = {x: tgt.x, y: tgt.y}; S.intel[p.team][tgt.i] = {x: tgt.x, y: tgt.y, t: T};
    } else if (T - b.seenT > 1.5) b.tgt = -1;
    if (!tgt) for (const q of S.players) if (q.alive && q.team === foe && q.mf > .6 && dst(p, q) < 10 && rnd() < D.hearing * .35) { b.lastPos = {x: q.x + (rnd() - .5) * 3, y: q.y + (rnd() - .5) * 3}; b.seenT = T - 1; S.intel[p.team][q.i] = {x: b.lastPos.x, y: b.lastPos.y, t: T}; break; }
    // 장전·무기 교체
    if (p.w === 0 && p.pw && p.clip[0] <= 0 && p.res[0] <= 0) setWeapon(p, 1);
    if (!tgt && wd.t !== "k" && p.clip[c] < wd.mag * .4 && p.res[c] > 0) startReload(p);
    if (tgt) {
      const ang = angTo(p, tgt) + (T > b.errT ? (b.aimErr = (rnd() * 2 - 1) * D.aim * (.6 + td / 12), b.errT = T + .28 + rnd() * .2, 0) : 0);
      b.wantA = angTo(p, tgt) + b.aimErr; b.fireTol = .06 + D.aim * 1.2;
      b.zoom = wd.scope ? td > 6 : (wd.t === "r" || wd.t === "l") && td > 13 && D.peek > .4;
      if (T >= b.phT) { b.ph = b.ph ? 0 : 1; b.phT = T + (b.ph ? .3 + rnd() * .3 : .35 + rnd() * .35) * (D.peek > .6 ? .8 : 1.1); b.strafe = 0; b.dir = rnd() < .5 ? -1 : 1; }
      const close = td < 5.5 || wd.t === "s" || wd.t === "g";
      if (D.peek < .3) b.stop = true;
      if (b.ph === 1) { b.strafe = b.dir || 1; b.stop = false; if (!close && D.peek < .8) b.fire = false; }
      else b.stop = true;
      b.fire = T >= b.react && p.blind < 1 && (b.ph === 0 || close || D.peek < .3 || b.ph === 1 && D.peek > .8);
      if (b.fire && T < b.pause) b.fire = false;
      else if (b.fire && wd.auto) { b.burst -= .12 / wd.cd; if (b.burst <= 0) { b.pause = T + .25 + rnd() * .35 / D.peek; b.burst = 3 + rnd() * 4 * D.peek; } }
      if (td > wd.rng * 1.3 && !wd.scope && D.peek > .4 && (B.st === "planted" || p.team === S.atk && T - S.liveT0 >= S.plan.exec)) { b.stop = false; goTo(p, tgt.x, tgt.y, 4); }
      else if (b.stop) b.wp = null;
      b.crouch = b.stop && !b.wp && td > 8 && wd.t !== "g" && wd.t !== "s" && D.peek > .45;
      if (p.hp < 30 && td > 5 && b.ph) { const sp = (p.team === S.atk ? map.atk : map.def)[2]; goTo(p, sp.x, sp.y, 1); b.stop = false; }
      if (p.gren[0] && T > b.nadeAt && T - S.liveT0 > 6 && td > 5.5 && td < 13 && rnd() < D.nades && T > b.react + .6) { throwNade(p, 0, angTo(p, tgt), clamp(td * .85, 5, 11)); b.nadeAt = T + 9; }
      return;
    }
    // 목표 행동 (시야에 적 없음)
    b.wantA = b.wp ? Math.atan2(b.wp.y - p.y, b.wp.x - p.x) : b.look + Math.sin(T * .9 + b.scan) * .5;
    if (b.lastPos && T - b.seenT < 3.5 && D.peek > .35 && (p.team !== S.atk || T - S.liveT0 >= S.plan.exec || B.st === "planted") && (b.role === "escort" || b.role === "plant" || b.role === "lurk" || B.st === "planted" && p.team !== S.atk)) {
      goTo(p, b.lastPos.x, b.lastPos.y, 1.2); b.wantA = b.wp ? Math.atan2(b.wp.y - p.y, b.wp.x - p.x) : b.wantA; return;
    }
    if (p.team === S.atk) {
      const site = S.plan.site;
      if (B.st === "planted") {
        if (!b.post || b.postFor !== "bomb") { const list = (B.site === "A" ? map.A : map.B).posts; b.post = list.length ? list[Math.floor(rnd() * list.length)] : null; b.postFor = "bomb"; b.look = Math.atan2(map.def[2].y - B.y, map.def[2].x - B.x); }
        if (b.post && !goTo(p, b.post.x, b.post.y, .5)) return; b.stop = true; b.wp = null; return;
      }
      if (B.st === "dropped") { const near = alivesOf(S.atk).filter(q => !q.human || true).sort((x, y) => dst(x, B) - dst(y, B))[0]; if (near === p) { goTo(p, B.x, B.y, .5); return; } }
      if (T - S.liveT0 < S.plan.exec + (b.role === "lurk" ? 6 : 0) && B.st !== "dropped") {  // 곧바로 지점으로 달려가지 않고 맵 중간에서 자리를 잡는다
        if (!b.stage) b.stage = pickStage(p, b.role === "lurk" ? S.plan.other : site);
        if (!goTo(p, b.stage.x, b.stage.y, 1.2)) return;
        b.stop = true; b.wantA = b.look + Math.sin(T * .7 + b.scan) * .8; return;
      }
      if (B.st === "carried" && B.holder === p.i) {
        const mates = alivesOf(S.atk).filter(q => q !== p && dst(q, site) < 8).length, ready = mates >= 2 || alivesOf(S.atk).length <= 2 || T - S.liveT0 > D.plantWait;
        if (!ready) { if (b.post) { if (!goTo(p, b.post.x, b.post.y, 1)) return; } b.stop = true; return; }
        if (!S.plan.smoked && p.gren[1] && T - S.liveT0 > 12 && dst(p, site) < 9 && dst(p, site) > 4 && los(p.x, p.y, site.x, site.y)) { throwNade(p, 1, angTo(p, site), clamp(dst(p, site) * .8, 4, 9)); S.plan.smoked = true; }
        if (dst(p, site) < 1.3) { b.use = true; b.stop = true; b.wp = null; b.walk = true; b.wantA = b.look; return; }
        goTo(p, site.x, site.y, .6); return;
      }
      const target = b.role === "lurk" ? S.plan.other : site, util = T - S.liveT0 > 12;
      if (b.role === "lurk" && T - S.liveT0 < S.plan.exec + 14) { if (b.post && !goTo(p, b.post.x, b.post.y, 1)) return; b.stop = true; return; }
      if (b.post && T - S.liveT0 < 105) {
        if (!goTo(p, b.post.x, b.post.y, .8)) return;  // 이동 중에는 도구를 쓰지 않는다
        if (util && dst(p, target) < 10 && los(p.x, p.y, target.x, target.y)) {
          if (!S.plan.smoked && p.gren[1] && rnd() < .3) { throwNade(p, 1, angTo(p, target), clamp(dst(p, target) * .8, 4, 9)); S.plan.smoked = true; }
          if (p.gren[2] && !b.flashed && D.nades > .3) { b.flashed = true; throwNade(p, 2, angTo(p, target), clamp(dst(p, target) * .8, 4, 9)); }
        }
        b.stop = true; b.wantA = b.look + Math.sin(T * .7 + b.scan) * .6; return;
      }
      goTo(p, target.x, target.y, 1.5); return;
    }
    // 수비
    if (B.st === "planted") {
      const dfn = S.players.filter(q => q.alive && q.team !== S.atk);
      if (S.defuser < 0 || !S.players[S.defuser].alive || S.players[S.defuser].team === S.atk) S.defuser = (dfn.sort((x, y) => dst(x, B) - dst(y, B) - (y.kit - x.kit) * 4)[0] || p).i;
      if (S.defuser === p.i) {
        if (dst(p, B) < 1.3) { b.use = true; b.stop = true; b.wp = null; b.walk = true; b.wantA = Math.atan2(B.y - p.y, B.x - p.x) + Math.PI * .1; return; }
        const covered = !alivesOf(S.atk).some(q => dst(q, B) < 9 && los(q.x, q.y, B.x, B.y)) || T - B.t0 > 12 || D.peek > .7;
        if (!covered) { b.stop = true; return; }
        goTo(p, B.x, B.y, .6); return;
      }
      const list = (B.site === "A" ? map.A : map.B).posts;
      if (!b.post || b.postFor !== "retake") { b.post = list.length ? list[Math.floor(rnd() * list.length)] : null; b.postFor = "retake"; }
      if (b.post && !goTo(p, b.post.x, b.post.y, .6)) return; b.stop = true; b.wantA = Math.atan2(B.y - p.y, B.x - p.x); return;
    }
    if (b.role === "rot") {
      let hot = null; for (const [, e] of Object.entries(S.intel[p.team])) if (T - e.t < 6 && (!hot || e.t > hot.t)) hot = e;
      if (hot) { const s = Math.hypot(hot.x - map.A.x, hot.y - map.A.y) < Math.hypot(hot.x - map.B.x, hot.y - map.B.y) ? map.A : map.B; const l = s.posts; if (l.length && b.rotSite !== s) { b.rotSite = s; b.post = l[Math.floor(rnd() * l.length)]; } }
    } else if (b.role === "hold" && T - S.liveT0 > 35) {
      let hot = null; for (const [, e] of Object.entries(S.intel[p.team])) if (T - e.t < 5) hot = e;
      if (hot && p.site && Math.hypot(hot.x - p.site.x, hot.y - p.site.y) > 12 && rnd() < .02 * D.peek) { const o = p.site === map.A ? map.B : map.A; p.site = o; b.post = o.posts[Math.floor(rnd() * o.posts.length)] || b.post; }
    }
    if (b.post && !goTo(p, b.post.x, b.post.y, .6)) return;
    b.stop = true; b.wantA = b.look + Math.sin(T * .8 + b.scan) * .55;
    if (rnd() < .01 && p.gren[2] && D.nades > .4) { /* 수비 섬광은 아끼기 */ }
  }
  function botInput(p, dt) {
    if (!p.ai) p.ai = mkAI(p);
    const b = p.ai; if (S.t >= b.nextThink) { botThink(p); b.nextThink = S.t + .1 + rnd() * .06; }
    const diff = adiff(b.wantA, p.a), rate = b.D.turn;
    p.a += clamp(diff, -rate * dt, rate * dt);
    let f = 0, s = 0;
    if (!b.stop && b.wp) { const dx = b.wp.x - p.x, dy = b.wp.y - p.y, dd = Math.hypot(dx, dy); if (dd > .1) { const ux = dx / dd, uy = dy / dd; f = ux * Math.cos(p.a) + uy * Math.sin(p.a); s = -ux * Math.sin(p.a) + uy * Math.cos(p.a); } }
    if (b.strafe) s += b.strafe * .9;
    if (S.t < b.jit) { s += Math.sin(S.t * 9) * .9; f = f * .6; }
    return {f, s, a: p.a, fire: b.fire && Math.abs(diff) < b.fireTol, zoom: b.zoom, use: b.use, walk: b.walk, crouch: !!b.crouch, bot: true};
  }

  /* --- 한 걸음 --- */
  function stepPlayer(p, dt, inp) {
    p.cd -= dt; p.blind = Math.max(0, p.blind - dt); p.rec = Math.max(0, p.rec - dt * 3.2);
    if (p.load > 0) { p.load -= dt; if (p.load <= 0) { const c = ci(p), d = wdef(p), n = Math.min(p.res[c], d.mag - p.clip[c]); p.clip[c] += n; p.res[c] -= n; p.load = 0; } }
    if (!p.alive) { p.mf = 0; return; }
    p.rollCd = Math.max(0, p.rollCd - dt); p.landT = Math.max(0, p.landT - dt);
    if (p.w === 0 && !p.pw) p.w = 1;
    if (Number.isFinite(inp.a)) p.a = inp.a;
    const live = S.phase === "live";
    if (p.st !== 2) p.st = inp.crouch && p.rollT <= 0 ? 1 : 0;   // 앉기는 누르는 동안, 엎드리기는 토글(act "prone")
    if (live && inp.jump && !p.jumpHeld && p.z <= .001 && p.rollT <= 0) { if (p.st === 2) p.st = 0; else { p.st = 0; p.vz = 1.15; p.landT = 0; ev("jp", p.x, p.y, p.i); } }
    p.jumpHeld = !!inp.jump;
    if (p.z > 0 || p.vz > 0) {
      p.vz -= 3.2 * dt; p.z += p.vz * dt;
      if (p.z <= 0) { p.z = 0; p.vz = 0; p.landT = .18; ev("ld", p.x, p.y, p.i); if (!fits(p.x, p.y, 0)) { p.x = p.gx; p.y = p.gy; } }   // 엄폐 안쪽에 내려앉으면 밟고 오른 자리로 되돌림
    } else if (fits(p.x, p.y, 0)) { p.gx = p.x; p.gy = p.y; }
    let f = clamp(+inp.f || 0, -1, 1), s = clamp(+inp.s || 0, -1, 1), mag = Math.min(1, Math.hypot(f, s));
    p.lf = f; p.ls = s;
    const d = wdef(p), walk = inp.walk ? .5 : 1, stMul = [1, .55, .28][p.st | 0];
    let tmf = 0;
    if (p.rollT > 0) {  // 구르기: 방향을 정해 빠르게 구른다(사격·조준 불가)
      p.rollT -= dt; moveP(p, p.rdx * CFG.speed * 2.3, p.rdy * CFG.speed * 2.3, dt); p.zoom = false; p.mf += (1 - p.mf) * Math.min(1, dt * 10); doJob(p, dt, false); return;
    }
    if (mag > .01 && live) {
      const n = Math.max(1, Math.hypot(f, s)); f /= n; s /= n;
      const spd = CFG.speed * d.spd * walk * stMul * (p.zoom ? .72 : 1) * (p.z > 0 ? .9 : 1) * (p.landT > 0 ? .55 : 1) * mag;
      moveP(p, (Math.cos(p.a) * f - Math.sin(p.a) * s) * spd, (Math.sin(p.a) * f + Math.cos(p.a) * s) * spd, dt);
      tmf = mag * walk * d.spd * stMul;
    }
    p.mf += (tmf - p.mf) * Math.min(1, dt * 10);
    p.zoom = !!inp.zoom && p.load <= 0 && d.t !== "k" && d.t !== "x" && d.t !== "b";
    if (live) {
      const want = !!inp.fire; const edge = want && (!p.fireHeld || inp.bot);
      if (want && (d.auto || edge)) fireGun(p, inp.bot);
      p.fireHeld = want;
      doJob(p, dt, !!inp.use);
      if (S.bomb.st === "dropped" && p.team === S.atk && dst(p, S.bomb) < .9) { S.bomb.st = "carried"; S.bomb.holder = p.i; ev("bp", p.x, p.y, p.i); }
    }
  }
  function act(i, a) {
    const p = S.players[i]; if (!p || typeof a !== "string") return;
    if (a.startsWith("buy:")) return void buy(p, a.slice(4));
    if (a === "ready") { if (S.phase === "buy") p.ready = true; return; }
    if (!p.alive) return;
    if (a === "reload") startReload(p);
    else if (a === "w0" || a === "w1" || a === "w2") { if (S.phase === "live" || S.phase === "buy") setWeapon(p, +a[1]); }
    else if (a === "swap") { const n = (p.w + 1) % 3; setWeapon(p, n === 0 && !p.pw ? 1 : n); }
    else if (a === "g") {  // 4번: 투척물 꺼내기 / 다시 누르면 수류탄→연막→섬광 순환
      const own = [0, 1, 2].filter(t => p.gren[t] > 0); if (!own.length) { ev("ng", p.x, p.y, p.i); return; }
      let t = p.gsel; if (p.w === 3) t = own[(own.indexOf(p.gsel) + 1) % own.length]; else if (!own.includes(t)) t = own[0];
      p.gsel = t; setWeapon(p, 3);
    }
    else if (a === "w4") { if (p.team === S.atk && S.bomb.holder === p.i || p.kit) setWeapon(p, 4); }
    else if (a === "prone") { if (S.phase === "live" || S.phase === "buy") p.st = p.st === 2 ? 0 : 2; }
    else if (a === "roll") {
      if (S.phase === "live" && p.rollCd <= 0 && p.z <= .001 && p.rollT <= 0) {
        let f = p.lf, s = p.ls; if (Math.hypot(f, s) < .1) { f = 1; s = 0; } const n = Math.hypot(f, s); f /= n; s /= n;
        p.rdx = Math.cos(p.a) * f - Math.sin(p.a) * s; p.rdy = Math.sin(p.a) * f + Math.cos(p.a) * s; p.rollT = .42; p.rollCd = 2.4; p.st = 0; p.load = 0; ev("rlr", p.x, p.y, p.i);
      }
    }
    else if (a === "frag") throwNade(p, 0); else if (a === "smoke") throwNade(p, 1); else if (a === "flash") throwNade(p, 2);
  }
  function step(dt) {
    if (S.done) return;
    S.t += dt;
    if (S.phase === "buy") {
      const hs = S.players.filter(p => p.human);
      if (S.t >= S.phaseEnd || hs.length && hs.every(p => p.ready) && S.t > 1) startLive();
    } else if (S.phase === "post" && S.t >= S.phaseEnd) {
      if (S.final) { S.done = true; S.phase = "end"; S.winner = S.score[0] === S.score[1] ? -1 : S.score[0] > S.score[1] ? 0 : 1; ev("end", 0, 0, S.winner); return; }
      nextRound();
    }
    for (const p of S.players) {
      let inp;
      if (p.human) { inp = humans.get(p.i); if (!inp) { p.human = false; inp = {}; } } else if (S.phase === "live") inp = botInput(p, dt);
      stepPlayer(p, dt, inp || {});
    }
    // 겹침 밀어내기
    if (S.phase === "live") for (let i = 0; i < N; i++) { const p = S.players[i]; if (!p.alive) continue; for (let j = i + 1; j < N; j++) { const q = S.players[j]; if (!q.alive) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy); if (d < .46 && d > 1e-4) { const k = (.46 - d) * .5 / d; if (fits(q.x + dx * k, q.y + dy * k)) { q.x += dx * k; q.y += dy * k; } if (fits(p.x - dx * k, p.y - dy * k)) { p.x -= dx * k; p.y -= dy * k; } } } }
    stepNades(dt);
    if (S.t > S.spotAt) { S.spotAt = S.t + .2; if (S.phase === "live") for (const p of S.players) if (p.alive) for (const q of S.players) if (q.alive && q.team !== p.team && dst(p, q) < 30 && canSee(p, q, dst(p, q))) q.spot[p.team] = S.t; }
    checkRound();
    while (S.ev.length && S.t - S.ev[0][6] > 3) S.ev.shift();
  }
  nextRound();
  return {S, map, step, act, humans, setHuman(i, on) { const p = S.players[i]; if (!p) return; if (on) { humans.set(i, humans.get(i) || {}); p.human = true; } else { humans.delete(i); p.human = false; p.ai = null; } },
    input(i, v) { const h = humans.get(i); if (!h || !v) return; h.f = +v.f || 0; h.s = +v.s || 0; if (Number.isFinite(v.a)) h.a = v.a; h.fire = v.fire === true; h.zoom = v.zoom === true; h.use = v.use === true; h.walk = v.walk === true; h.jump = v.jump === true; h.crouch = v.crouch === true; },
    spreadNow, wdef, wkey, cast};
}

/* ---------- 상태 직렬화: 손님마다 '관심 영역'만 보내 10:10(20명)도 가볍게 ---------- */
const SNAP_V = 8;
const encFull = p => [p.k, p.team, r2(p.x), r2(p.y), r3(p.a), p.hp, Math.round(p.armor), p.w, p.pw ? PRIM.indexOf(p.pw) : -1, p.clip[0], p.clip[1], p.res[0], p.res[1], p.gren[0] * 100 + p.gren[1] * 10 + p.gren[2],
  p.alive ? 1 : 0, p.kills, p.deaths, p.assists, p.credits, r2(p.prog), r1(p.blind), p.hs, p.human ? 1 : 0, r2(p.shotAt), p.kit ? 1 : 0, p.zoom ? 1 : 0, r2(p.load), r2(p.mf), r2(p.hitAt), r2(p.hitDir), p.job, r1(p.spot[0]), r1(p.spot[1]), p.ready ? 1 : 0, p.plants, p.defuses, p.st, r2(p.z), r2(p.rollT), p.gsel, r2(p.throwAt), r1(p.rollCd)];
const rosterOf = S => S.players.map(p => [p.k, p.team, p.human ? 1 : 0, p.kills, p.deaths, p.assists, p.hs, p.plants, p.defuses, p.credits, p.alive ? 1 : 0, p.ready ? 1 : 0]);
const GLOBAL_EV = {rn: 1, lv: 1, re: 1, pl: 1, df: 1, bx: 1, bd: 1, bp: 1, end: 1};
function encodeFor(S, g, withRoster, mem) {
  const gp = S.players[g], team = gp.team, lite = [];
  for (const p of S.players) {
    if (p.i === g || !p.alive) continue;
    const mate = p.team === team, spot = !mate && S.t - p.spot[team] < 1.4;
    if (mate || spot || Math.hypot(p.x - gp.x, p.y - gp.y) < 34) lite.push([p.i, r2(p.x), r2(p.y), r2(p.a), p.hp, 1 | (p.zoom ? 2 : 0) | (spot ? 4 : 0), p.w, r2(p.shotAt), p.st, r2(p.z), p.rollT > 0 ? 1 : 0, p.gsel, r2(p.throwAt), p.pw ? PRIM.indexOf(p.pw) : -1]);
  }
  if (mem.id !== S.id) { mem.id = S.id; mem.ev = 0; }
  const evs = S.ev.filter(e => e[0] > mem.ev && (GLOBAL_EV[e[1]] || Math.hypot(e[2] - gp.x, e[3] - gp.y) < 36 || (e[1] === "kl" || e[1] === "ht") && (e[4] === g || e[5] % 100 === g)));
  mem.ev = S.evId;
  const o = {v: SNAP_V, id: S.id, mi: S.mi, g, ph: S.phase, t: r2(S.t), pe: r2(S.phaseEnd), ro: S.ro, at: S.atk, sc: S.score, dn: S.done ? 1 : 0, wn: S.winner, nt: S.notice, le: S.lastEnd ? [S.lastEnd.team, S.lastEnd.reason] : null,
    bm: [S.bomb.st, r2(S.bomb.x), r2(S.bomb.y), S.bomb.holder, S.bomb.site, r2(S.bomb.t0), r2(S.bomb.end)], me: encFull(gp), l: lite,
    n: S.nades.map(n => [n.type, r2(n.x), r2(n.y), r2(n.t0)]), sm: S.smokes.map(s => [r2(s.x), r2(s.y), s.r, r2(s.t0), r2(s.end)]), fd: S.feed.filter(f => S.t - f[6] < 6).slice(0, 4), ev: evs};
  if (withRoster) o.rs = rosterOf(S);
  return o;
}
function applyFull(p, a) {
  Object.assign(p, {x: a[2], y: a[3], a: a[4], hp: a[5], armor: a[6], w: a[7], pw: a[8] < 0 ? null : PRIM[a[8]], clip: [a[9], a[10]], res: [a[11], a[12]], gren: [Math.floor(a[13] / 100), Math.floor(a[13] / 10) % 10, a[13] % 10],
    alive: !!a[14], kills: a[15], deaths: a[16], assists: a[17], credits: a[18], prog: a[19], blind: a[20], hs: a[21], shotAt: a[23], kit: !!a[24], zoom: !!a[25], load: a[26], mf: a[27], hitAt: a[28], hitDir: a[29], job: a[30], ready: !!a[33], plants: a[34], defuses: a[35], st: a[36], z: a[37], rollT: a[38], gsel: a[39], throwAt: a[40], rollCd: a[41]});
}
function decodeSnap(s, prev) {
  const same = prev && prev.id === s.id, ros = s.rs || (same && prev.ros); if (!ros) return null;
  const map = MAPS[s.mi] || MAPS[0], vt = ros[s.g] ? ros[s.g][1] : 0, lite = new Map((s.l || []).map(a => [a[0], a]));
  const S = {id: s.id, mi: s.mi, map, t: s.t, phase: s.ph, phaseEnd: s.pe, ro: s.ro, atk: s.at, score: s.sc, done: !!s.dn, winner: s.wn, notice: s.nt, lastEnd: s.le ? {team: s.le[0], reason: s.le[1]} : null, ros, g: s.g,
    bomb: {st: s.bm[0], x: s.bm[1], y: s.bm[2], holder: s.bm[3], site: s.bm[4], t0: s.bm[5], end: s.bm[6]}, feed: s.fd || [], ev: s.ev || [], n: ros.length,
    nades: (s.n || []).map(a => ({type: a[0], x: a[1], y: a[2], t0: a[3]})), smokes: (s.sm || []).map(a => ({x: a[0], y: a[1], r: a[2], t0: a[3], end: a[4]}))};
  S.players = ros.map((r, i) => {
    const o = same && prev.players[i];
    const p = {i, k: r[0], team: r[1], human: !!r[2], kills: r[3], deaths: r[4], assists: r[5], hs: r[6], plants: r[7], defuses: r[8], credits: r[9], alive: !!r[10], ready: !!r[11],
      x: o ? o.x : 1.5, y: o ? o.y : 1.5, a: o ? o.a : 0, hp: o ? o.hp : 100, armor: 0, w: 1, pw: null, clip: [0, 0], res: [0, 0], gren: [0, 0, 0], blind: 0, prog: 0, job: 0, mf: 0, zoom: false, load: 0, shotAt: -9, hitAt: -9, hitDir: 0, kit: false, spot: [-9, -9], hidden: true, st: 0, z: 0, rollT: 0, gsel: 0, throwAt: -9, rollCd: 0};
    const L = lite.get(i);
    if (i === s.g && s.me) { applyFull(p, s.me); p.hidden = false; }
    else if (L) { p.x = L[1]; p.y = L[2]; p.a = L[3]; p.hp = L[4]; p.alive = !!(L[5] & 1); p.zoom = !!(L[5] & 2); if (L[5] & 4) p.spot[vt] = s.t; p.w = L[6]; p.shotAt = L[7]; p.st = L[8]; p.z = L[9]; p.rollT = L[10] ? .3 : 0; p.gsel = L[11]; p.throwAt = L[12]; p.pw = L[13] < 0 ? null : PRIM[L[13]]; p.hidden = false; }
    else if (p.team === vt) p.alive = false;  // 아군은 살아 있으면 항상 온다
    p.rx = o ? o.rx : p.x; p.ry = o ? o.ry : p.y; p.ra = o ? o.ra : p.a;
    return p;
  });
  return S;
}
window.RB_OFFICE_CORE = {MAPS, WP, PRIM, BUYS, DIFF, CFG, createMatch, SNAP_V, encodeFor, decodeSnap};
})();

/* ================= ② 화면 · 조작 · 온라인 ================= */
(() => {
"use strict";
const C = window.RB_OFFICE_CORE, games = window.knx && window.knx.games;
if (!C || !games) return;
const {MAPS, WP, PRIM, BUYS, DIFF, CFG, createMatch} = C;
const ID = "office-strike", NAME = "라운드비 총격전", VER = C.SNAP_V, TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const adiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const LS = {get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }};
const kname = i => (typeof KNIGHTS !== "undefined" && KNIGHTS[i] && KNIGHTS[i].n) || "기사" + i;
const WALLH = 1.15;
let imgs = null;
function loadImgs() {
  if (imgs) return;
  imgs = Array.from({length: 10}, (_, i) => { const im = new Image(); try { im.src = typeof kSrc === "function" ? kSrc(i, false) : "img/knights_fixed/" + KNIGHTS[i].k + ".webp"; } catch (e) {} return im; });
}

/* ---------- 소리 (WebAudio, 파일 없음) ---------- */
const AU = {ctx: null, out: null, noise: null, on: LS.get("roundb-office-mute") !== "1"};
function ac() {
  if (!AU.on) return null;
  if (!AU.ctx) {
    try {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return null;
      AU.ctx = new A(); const comp = AU.ctx.createDynamicsCompressor(); AU.out = AU.ctx.createGain(); AU.out.gain.value = .6; AU.out.connect(comp); comp.connect(AU.ctx.destination);
      const n = AU.ctx.sampleRate, b = AU.ctx.createBuffer(1, n, n), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; AU.noise = b;
    } catch (e) { AU.ctx = null; return null; }
  }
  if (AU.ctx.state === "suspended") AU.ctx.resume(); return AU.ctx;
}
function mk(c, pan, v) {
  const g = c.createGain(); g.gain.value = v;
  if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(AU.out); } else g.connect(AU.out);
  return g;
}
function tone(f0, f1, d, type, v, at, pan) {
  const c = ac(); if (!c) return; const t = c.currentTime + (at || 0), o = c.createOscillator(), g = mk(c, pan || 0, 0);
  o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, v), t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g); o.start(t); o.stop(t + d + .03);
}
function hiss(d, v, f0, f1, type, at, pan) {
  const c = ac(); if (!c) return; const t = c.currentTime + (at || 0), s = c.createBufferSource(), f = c.createBiquadFilter(), g = mk(c, pan || 0, 0);
  f.type = type || "lowpass"; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + d); f.Q.value = .8;
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, v), t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  s.buffer = AU.noise; s.connect(f); f.connect(g); s.start(t, Math.random() * .5); s.stop(t + d + .03);
}
function sfx(name, vol, pan) {
  const v = vol == null ? 1 : vol; if (v < .03 || !ac()) return;
  switch (name) {
    case "p": hiss(.07, .22 * v, 2200, 900, "bandpass", 0, pan); tone(170, 70, .08, "sine", .22 * v, 0, pan); break;
    case "s": hiss(.05, .2 * v, 3000, 1200, "bandpass", 0, pan); tone(210, 90, .05, "sine", .14 * v, 0, pan); break;
    case "g": hiss(.22, .4 * v, 1400, 250, "lowpass", 0, pan); tone(110, 45, .2, "sine", .36 * v, 0, pan); break;
    case "r": hiss(.09, .26 * v, 1800, 500, "bandpass", 0, pan); tone(140, 55, .11, "sine", .26 * v, 0, pan); break;
    case "l": hiss(.1, .28 * v, 1500, 400, "bandpass", 0, pan); tone(110, 48, .13, "sine", .3 * v, 0, pan); break;
    case "n": hiss(.34, .42 * v, 2600, 220, "lowpass", 0, pan); tone(95, 38, .3, "sine", .42 * v, 0, pan); break;
    case "k": hiss(.12, .12 * v, 4500, 1500, "highpass", 0, pan); break;
    case "hit": tone(1250, 900, .05, "square", .08 * v); break;
    case "head": tone(1700, 1700, .06, "square", .1 * v); tone(2300, 2300, .08, "sine", .08 * v, .04); break;
    case "hurt": tone(120, 55, .18, "sawtooth", .25 * v); hiss(.1, .12 * v, 700, 300, "lowpass"); break;
    case "kill": tone(520, 880, .09, "triangle", .12 * v); tone(880, 1320, .12, "triangle", .1 * v, .08); break;
    case "rl": hiss(.05, .08 * v, 3200, 2800, "highpass", 0, pan); hiss(.05, .1 * v, 2400, 2000, "highpass", .6, pan); break;
    case "th": hiss(.1, .08 * v, 800, 400, "bandpass", 0, pan); break;
    case "bm": hiss(.5, .6 * v, 900, 90, "lowpass", 0, pan); tone(80, 30, .45, "sine", .55 * v, 0, pan); break;
    case "bx": hiss(1.1, .8 * v, 700, 60, "lowpass", 0, pan); tone(60, 24, 1, "sine", .7 * v, 0, pan); break;
    case "sm": hiss(.7, .2 * v, 2400, 600, "bandpass", 0, pan); break;
    case "ring": tone(2300, 2100, 1.1, "sine", .03 * v); break;
    case "pop": hiss(.07, .12 * v, 3500, 1500, "bandpass", 0, pan); break;
    case "pl": tone(880, 880, .1, "square", .1 * v); tone(1320, 1320, .16, "square", .1 * v, .12); break;
    case "df": tone(660, 1320, .25, "triangle", .14 * v); break;
    case "bp": tone(1500, 1500, .04, "square", .05 * v); break;
    case "by": tone(900, 1200, .06, "triangle", .08 * v); break;
    case "win": tone(523, 523, .14, "triangle", .13 * v); tone(659, 659, .14, "triangle", .13 * v, .13); tone(784, 784, .3, "triangle", .13 * v, .26); break;
    case "lose": tone(330, 330, .2, "triangle", .12 * v); tone(247, 247, .4, "triangle", .12 * v, .2); break;
    case "go": tone(740, 740, .08, "square", .08 * v); tone(988, 988, .14, "square", .08 * v, .1); break;
  }
}

/* ---------- 피아 색(보는 사람 기준): 아군 파랑 ● / 적 주황빨강 ▼ — 색 + 모양 + 글자 ---------- */
let myTeam = 0;
const ALLY = "#3ea6ff", FOE = "#ff5a36", LOWH = .36;
const TEAM = [0, 1].map(t => ({get n() { return t === myTeam ? "우리" : "상대"; }, get c() { return t === myTeam ? ALLY : FOE; }, get g() { return t === myTeam ? "●" : "▼"; }}));

/* ---------- 총기·장비 그림: 벡터로 한 번 그려 캔버스에 보관하고 구매창·HUD·1인칭·3인칭에서 같이 쓴다 ---------- */
const ART_LEN = {pistol: .30, smg: .46, shot: .62, rifle: .62, lmg: .72, sniper: .8, knife: .3, frag: .15, smoke: .16, flash: .16, bomb: .24, kit: .24};   // 3인칭에서 키(1.0) 대비 길이
const heldKey = (p, atk) => p.w === 2 ? "knife" : p.w === 3 ? ["frag", "smoke", "flash"][p.gsel | 0] : p.w === 4 ? (p.team === atk ? "bomb" : "kit") : (p.w === 0 && p.pw) ? p.pw : "pistol";
const wpKey = p => p.w === 2 ? "knife" : p.w === 3 ? "nade" : p.w === 4 ? "bomb" : (p.w === 0 && p.pw) ? p.pw : "pistol";

/* ---------- 3인칭 캐릭터: 기사 머리 그림 + 전술복 몸(팀 외곽선), 걷기·달리기·앉기·엎드리기·점프·구르기 자세, 손에 든 장비 ---------- */
const anim = new Map();
function animOf(q, now) {
  let a = anim.get(q.i); if (!a || a.id !== q.k + ":" + q.i) anim.set(q.i, a = {id: q.k + ":" + q.i, px: q.rx, py: q.ry, ph: Math.random() * 6, v: 0, t: now});
  const dt = Math.max(.001, Math.min(.2, (now - a.t) / 1000)), d = Math.hypot(q.rx - a.px, q.ry - a.py);
  if (d > 3) { a.px = q.rx; a.py = q.ry; a.t = now; return a; }
  a.v += (Math.min(d / dt, 7) - a.v) * Math.min(1, dt * 12); a.ph += d * 3.1; a.px = q.rx; a.py = q.ry; a.t = now; return a;
}
function headOf(k) { const im = imgs && imgs[k], hs = (typeof KNIGHTS !== "undefined" && KNIGHTS[k] && KNIGHTS[k].hs) || 112; return im && im.complete && im.naturalWidth ? {im, sx: Math.max(0, im.naturalWidth * .17), sw: im.naturalWidth * .66, sh: Math.min(im.naturalHeight, im.naturalHeight * (hs + 8) / 300)} : null; }
function limb(g, x0, y0, x1, y1, w, c, outline) { g.lineCap = "round"; g.strokeStyle = outline || c; g.lineWidth = outline ? w + 5 / outline_u : w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
let outline_u = 100;
function drawChar(g, q, o) {   // 좌표 단위 = 서 있는 키(1.0), 원점 = 발 밑
  const {sx, fy, u, col, ally, fx, fz, an, S, now, atk} = o;
  const v = clamp(an.v / 3.3, 0, 1.5), st = q.st | 0, rolling = q.rollT > 0, air = (q.z || 0) > .02, sw = Math.sin(an.ph), t = now / 1000, cs = st === 1 ? .72 : 1;
  let suit = ally ? "#244a78" : "#6a2619", vest = ally ? "#4a92d6" : "#d9552f"; const pants = "#1d242f", boot = "#0b0e14", glove = "#2a303b"; if (o.flash) { suit = "#fff0e4"; vest = "#ffffff"; }
  outline_u = u;
  g.save(); g.translate(sx, fy - (q.z || 0) * u / .66); g.scale(u, u);
  if (rolling) { g.translate(0, -.3); g.rotate((t * 11 + q.i) % TAU); g.scale(.72, .72); g.translate(0, .3); }
  const sgn = fx < 0 ? -1 : 1, Lh = Math.abs(fx) * .86 + .16, toward = fz < -.35, away = fz > .35;
  const key = heldKey(q, atk), A = GK.art(key, skinFor(q, key)), len = (ART_LEN[key] || .3), gs = A ? len / A.w : 1;
  const flashing = S.t - q.shotAt < .07 && q.w !== 2 && q.w !== 3;
  const drawGunAt = (hx, hy, rot) => {
    if (!A) return;
    g.save(); g.translate(hx, hy); if (rot) g.rotate(rot); g.scale(sgn * (toward ? .28 : Lh) * gs, gs); g.drawImage(A.cv, -A.gx, -A.gy);
    if (flashing && A.mx) { g.fillStyle = "#ffe9a6"; g.beginPath(); g.arc(A.mx - A.gx + 10, A.my - A.gy, 22, 0, TAU); g.fill(); g.fillStyle = "#fff"; g.beginPath(); g.arc(A.mx - A.gx + 10, A.my - A.gy, 9, 0, TAU); g.fill(); }
    g.restore();
    if (toward && (q.w === 0 || q.w === 1)) { g.fillStyle = "#07090c"; g.beginPath(); g.arc(hx, hy + .005, .026, 0, TAU); g.fill(); }
  };
  const throwing = q.w === 3 && S.t - q.throwAt < .4, tk = throwing ? Math.sin(Math.PI * (S.t - q.throwAt) / .4) : 0, stab = q.w === 2 && S.t - q.shotAt < .3 ? Math.sin(Math.PI * (S.t - q.shotAt) / .3) : 0;
  const hd = headOf(q.k);
  const drawHead = (cx, cy, size) => {
    const hw = size * 1.18;
    if (hd) { g.drawImage(hd.im, hd.sx, 0, hd.sw, hd.sh, cx - hw / 2, cy - size / 2, hw, size); if (away) { g.fillStyle = "rgba(8,12,20,.5)"; g.fillRect(cx - hw / 2, cy - size / 2, hw, size); } }
    else { g.fillStyle = "#e8b998"; g.beginPath(); g.arc(cx, cy, size * .42, 0, TAU); g.fill(); }
  };
  if (st === 2 && !rolling) {   // 엎드린 자세
    const hx = sgn * (toward ? 0 : .26), hy = -.11;
    for (const pass of [0, 1]) {
      const c = pass ? null : col, e = pass ? 0 : 3 / u;
      g.fillStyle = c || pants; for (const k2 of [-1, 1]) { g.beginPath(); g.ellipse(-sgn * .3, -.05 + k2 * .035, .2 + e, .035 + e, 0, 0, TAU); g.fill(); }
      g.fillStyle = c || suit; g.beginPath(); g.ellipse(0, -.075, .27 + e, .075 + e, 0, 0, TAU); g.fill();
      if (pass) { g.fillStyle = vest; g.beginPath(); g.ellipse(.02, -.095, .16, .04, 0, 0, TAU); g.fill(); }
    }
    drawHead(hx, hy, .27); drawGunAt(sgn * (toward ? .02 : .28), -.06, 0);
    g.restore(); return;
  }
  const bob = air ? 0 : Math.abs(sw) * .032 * v + Math.sin(t * 2.2 + q.i) * .006, hipY = -.31 * cs - bob, torsoC = -.52 * cs - bob, headC = (st === 1 ? -.67 : -.795) - bob;
  const swing = air || rolling ? .55 : sw * .5 * Math.min(1, v * 1.25);
  const sh = torsoC - .09 * cs, handX = sgn * (toward ? .06 : .13), handY = torsoC + .02 - (throwing ? tk * .26 : 0), lean = Math.sin(an.ph + 1) * .02 * v;
  const gunBehind = away;
  if (gunBehind) { drawGunAt(handX, handY, 0); }
  for (const pass of [0, 1]) {
    const e = pass ? 0 : 1, oc = pass ? null : col;
    // 다리
    for (const sd of [-1, 1]) {
      const ang = swing * sd, fx0 = sd * .075, foot = Math.max(0, -Math.sin(ang)) * .04;
      const kx = fx0 + Math.sin(ang) * (st === 1 ? .2 : .13), ky = -foot - (st === 1 ? 0 : 0);
      limb(g, fx0, hipY, kx, ky - (st === 1 ? .0 : 0) + (air ? -.07 : 0), .11, pass ? pants : col, oc);
      if (pass) { g.fillStyle = boot; g.beginPath(); g.ellipse(kx + sgn * .02, ky + (air ? -.07 : 0) - .008, .07, .035, 0, 0, TAU); g.fill(); }
    }
    // 몸통
    g.fillStyle = oc || suit; rrect(g, -.16 - e * .03, torsoC - .15 * cs - e * .03, .32 + e * .06, .31 * cs + e * .06, .06); g.fill();
    if (pass) { g.fillStyle = vest; rrect(g, -.13, torsoC - .13 * cs, .26, .22 * cs, .05); g.fill(); g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(-.16, torsoC + .1 * cs, .32, .028); g.fillStyle = "rgba(255,255,255,.22)"; g.fillRect(-.1, torsoC - .11 * cs, .2, .018); }
    // 가만히 있는 팔 / 받침 팔
    const sup = A && A.fx != null && (q.w === 0) && !throwing, ex = sgn * (toward ? .12 : .12 + Lh * gs * (A ? (A.fx || 0) - A.gx : 0)), ey = torsoC + .03;
    if (sup) limb(g, -sgn * .15, sh, ex, ey, .07, pass ? suit : col, oc); else limb(g, -sgn * .15, sh, -sgn * (.17 + swing * .04), torsoC + .13 * cs, .07, pass ? suit : col, oc);
    if (pass) { g.fillStyle = glove; g.beginPath(); if (sup) g.arc(ex, ey, .04, 0, TAU); else g.arc(-sgn * (.17 + swing * .04), torsoC + .13 * cs, .04, 0, TAU); g.fill(); }
    // 총 든 팔
    limb(g, sgn * .15, sh, handX, handY, .07, pass ? suit : col, oc);
    if (pass) { g.fillStyle = glove; g.beginPath(); g.arc(handX, handY, .042, 0, TAU); g.fill(); }
  }
  // 머리(기사 그림) — 팀 색 외곽 고리
  const hsz = .36;
  g.strokeStyle = col; g.lineWidth = 3.5 / u; g.beginPath(); g.ellipse(0, headC, hsz * .62, hsz * .52, 0, 0, TAU); g.stroke();
  drawHead(lean, headC, hsz);
  if (!gunBehind) { g.save(); if (stab) g.translate(sgn * stab * .12, -stab * .05); drawGunAt(handX, handY + (throwing ? 0 : 0), stab ? -sgn * stab * .9 : 0); g.restore(); }
  g.restore();
}

/* ---------- 1인칭 손·무기(뷰모델) · 사격 이펙트 · 구경(F) · 총기 보관함(스킨 미리보기) ---------- */
const GK = window.GunKit, art = (k, sk) => GK.art(k, sk || "default");
const lgr = (g, x0, y0, x1, y1, st) => { const q = g.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of st) q.addColorStop(o, c); return q; };
function rrect(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
const skinFor = (q, key) => { if (q.i === slot) return GK.getSkin(key); const ids = GK.skinIds; return (q.i * 7 + q.k * 3 + key.length) % 5 < 2 ? ids[(q.i + q.k * 2 + 1) % ids.length] : "default"; };   // 남의 스킨은 모르니 사람마다 정해진 무늬(40%)
const NAME2ID = {}; for (const w of GK.weapons) NAME2ID[w.name] = w.id;
let inspectW = -1, lastMuzzle = null, lastEject = null, shotCount = 0, inspectAt = 0, lightFlashAt = 0, myStreak = 0, killPop = null, lastCam = null, stepAcc = 0, shotEvent = false;
const hitFlash = {}, fx = [], decals = [];
const RCP = {pistol: {side: .5}, smg: {side: 1}, shot: {side: .6}, rifle: {side: .8}, lmg: {side: 1.1}, sniper: {side: .3}, knife: {side: 0}};
const easeIn = x => x * x, easeOut = x => 1 - (1 - x) * (1 - x);
function fxAdd(o) { fx.push(o); if (fx.length > 160) fx.shift(); }
function projectPt(x, y, h) { const c = lastCam; if (!c) return null; const dx = x - c.cx, dy = y - c.cy, d = Math.hypot(dx, dy), da = adiff(Math.atan2(dy, dx), c.camA), perp = d * Math.cos(da); if (perp < .1 || Math.abs(da) > 1.4) return null; return {x: c.W / 2 + Math.tan(da) * c.proj, y: c.horizon - (h - c.camH) * c.proj / perp, perp}; }
function fireFx(W, H, wk, now) {
  if (wk === "knife" || wk === "nade" || wk === "bomb") return;
  const m = lastMuzzle || {x: W * .5, y: H * .75}, e = lastEject || m; lightFlashAt = now; shotCount++;
  for (let i = 0; i < 3; i++) fxAdd({k: "smoke", x: m.x, y: m.y, vx: -20 - Math.random() * 50, vy: -30 - Math.random() * 40, r0: 5, grow: 36, t0: now, life: 600 + Math.random() * 300});
  if (wk !== "shot" || true) fxAdd({k: "shell", x: e.x, y: e.y, vx: 150 + Math.random() * 130, vy: -150 - Math.random() * 90, g: 760, rot: Math.random() * 6, vr: 10 + Math.random() * 6, t0: now, life: 900});
  fxAdd({k: "tracer", x: m.x, y: m.y, tx: W / 2, ty: H / 2, t0: now, life: 80});
}
function hitFx(q, head, dmg, now) {
  hitFlash[q.i] = now; const pt = projectPt(q.rx, q.ry, q.st === 2 ? .1 : q.st === 1 ? .3 : .45); if (!pt) return;
  for (let i = 0; i < (head ? 12 : 7); i++) { const a = Math.random() * TAU, v = 90 + Math.random() * 220; fxAdd({k: "spark", x: pt.x, y: pt.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, g: 500, t0: now, life: 260 + Math.random() * 200, c: head ? "#ffcf7a" : "#ffb24a"}); }
  if (cfg.dmgnum && dmg) fxAdd({k: "num", x: pt.x + (Math.random() - .5) * 20, y: pt.y - 8, vx: (Math.random() - .5) * 20, vy: -70, t0: now, life: 800, text: String(dmg), head});
}
function fxDraw(ctx, dt, W, H, now) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i], a = (now - f.t0) / f.life; if (a >= 1) { fx.splice(i, 1); continue; }
    if (f.k === "tracer") { ctx.strokeStyle = `rgba(255,236,170,${.75 * (1 - a)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + (f.tx - f.x) * clamp(a * 4, 0, 1), f.y + (f.ty - f.y) * clamp(a * 4, 0, 1)); ctx.stroke(); continue; }
    f.x += f.vx * dt; f.y += f.vy * dt; f.vy += (f.g || 0) * dt;
    if (f.k === "shell") { f.rot += f.vr * dt; ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.fillStyle = "#d9a94a"; ctx.fillRect(-5, -2, 10, 4); ctx.fillStyle = "#fff3c4"; ctx.fillRect(-5, -2, 10, 1.3); ctx.restore(); if (f.y > H + 20) fx.splice(i, 1); }
    else if (f.k === "smoke") { const r = f.r0 + f.grow * a, gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r); gr.addColorStop(0, `rgba(210,214,222,${.34 * (1 - a)})`); gr.addColorStop(1, "rgba(210,214,222,0)"); ctx.fillStyle = gr; ctx.fillRect(f.x - r, f.y - r, r * 2, r * 2); }
    else if (f.k === "spark") { ctx.strokeStyle = f.c; ctx.globalAlpha = 1 - a; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.vx * .035, f.y - f.vy * .035); ctx.stroke(); ctx.globalAlpha = 1; }
    else if (f.k === "num") { ctx.globalAlpha = 1 - a * a; ctx.font = `900 ${f.head ? 24 : 18}px system-ui`; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(6,10,18,.9)"; ctx.fillStyle = f.head ? "#ff8a6a" : "#fff"; ctx.strokeText(f.text, f.x, f.y); ctx.fillText(f.text, f.x, f.y); ctx.globalAlpha = 1; ctx.textAlign = "start"; }
  }
}
function drawView(ctx, W, H, p, S, now, wd, atk) {
  const key = heldKey(p, atk), skin = GK.getSkin(key), A = GK.art(key, skin); if (!A) return;
  const size = Math.min(W * .92, H * .78) * (key === "knife" ? .62 : key === "frag" || key === "smoke" || key === "flash" ? .26 : key === "bomb" || key === "kit" ? .4 : key === "pistol" ? .5 : key === "lmg" || key === "sniper" ? .98 : .86);
  const sc = size / A.w, ads = adsK, swp = clamp(1 - (now - swapAt) / 280, 0, 1), swpE = swp * swp;
  const shot = clamp(1 - (S.t - p.shotAt) / .13, 0, 1), rl = wd.rl || 0, lp = p.load > 0 && rl ? clamp(1 - p.load / rl, 0, 1) : -1, ld = lp >= 0 ? Math.sin(Math.PI * lp) : 0;
  const mv = clamp(p.mf, 0, 1), bx = Math.cos(bob) * size * .018 * mv, by = Math.abs(Math.sin(bob)) * size * .02 * mv;
  const thrown = p.w === 3 ? clamp((S.t - p.throwAt) / .5, 0, 1) : 1, thr = thrown < 1 ? Math.sin(Math.PI * thrown) : 0;
  const knt = p.w === 2 ? clamp((S.t - p.shotAt) / .38, 0, 1) : 1, stab = knt < 1 ? Math.sin(Math.PI * knt) : 0;
  const small = key === "frag" || key === "smoke" || key === "flash" || key === "bomb" || key === "kit", pat = RCP[key] || RCP.rifle;
  if (p.w === 3 && thrown > .32 && thrown < .6 && p.gren[p.gsel] <= 0) return;
  const insp = inspectAt ? (now - inspectAt) / 1000 : -1;
  const handArm = (x, y, fromX, fromY) => {
    const w = size * .12; ctx.lineCap = "round";
    ctx.strokeStyle = "#06090e"; ctx.lineWidth = w + 6; ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(x, y); ctx.stroke();
    ctx.strokeStyle = lgr(ctx, fromX, fromY, x, y, [[0, "#182940"], [1, "#35577f"]]); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(x, y); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = w * .18; ctx.beginPath(); ctx.moveTo(fromX - w * .25, fromY); ctx.lineTo(x - w * .25, y); ctx.stroke();
    ctx.strokeStyle = "#0e131b"; ctx.lineWidth = w * .26; ctx.beginPath(); ctx.moveTo(x + (fromX - x) * .14 + w * .1, y + (fromY - y) * .14 - w * .5); ctx.lineTo(x + (fromX - x) * .14 - w * .1, y + (fromY - y) * .14 + w * .5); ctx.stroke();   // 소매 끝 단
    const gr = ctx.createRadialGradient(x - w * .15, y - w * .15, 1, x, y, w * .7); gr.addColorStop(0, "#58606e"); gr.addColorStop(1, "#14181f"); ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, w * .62, w * .5, -.3, 0, TAU); ctx.fill(); ctx.strokeStyle = "#06090e"; ctx.lineWidth = 2.5; ctx.stroke();
  };
  if (insp >= 0 && insp < GK.inspectLen(key) && !shot && lp < 0) {   // F 구경: 손 위에서 총을 이리저리 돌려 본다
    const pose = GK.inspect(key, insp), x = W * .62 + pose.tx * W, y = H * .86 + pose.ty * H;
    ctx.save(); GK.drawSide(ctx, key, skin, x, y, sc * 1.1 * (pose.sc || 1), {yaw: pose.yaw, roll: pose.rot - .45, shadow: true, sheen: true, flip: true}); ctx.restore();
    handArm(x, y, W + size * .2, H + size * .5); return;
  }
  if (insp >= GK.inspectLen(key)) inspectAt = 0;
  ctx.save();
  const slideK = lp >= .86 ? Math.sin(Math.PI * (lp - .86) / .14) : 0;
  const px = W * (.78 - ads * .22) + bx + Math.sin(shotCount * 2.3) * pat.side * shot * size * .03, py = H * (.99 - ads * .03) + by + ld * size * .42 + swpE * size * .75 + shot * size * .06 + (p.z || 0) * size * .35 + (p.st === 1 ? size * .05 : p.st === 2 ? size * .1 : 0) + thr * -size * .42;
  ctx.translate(px, py);
  const rot = small ? .1 - thr * 1.1 : .5 - shot * .05 + ld * .4 - stab * 1.5 - ads * .18 + Math.sin(shotCount * 1.9) * pat.side * shot * .03;
  ctx.rotate(rot); ctx.translate(shot * size * .04 + slideK * size * .015, 0);
  ctx.scale(-1, 1);
  const m0 = ctx.getTransform();
  ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = size * .05; ctx.shadowOffsetY = size * .02;
  if (lp >= 0 && A.noMag && A.magCv && A.mag) {   // 장전: 탄창이 빠졌다가 다시 들어간다
    ctx.drawImage(A.noMag, -A.gx * sc, -A.gy * sc, A.w * sc, A.h * sc); ctx.shadowColor = "transparent";
    const mo = lp < .35 ? easeIn(lp / .35) : lp < .55 ? 1 : lp < .85 ? 1 - easeOut((lp - .55) / .3) : 0; ctx.save(); ctx.translate(0, A.mag.h * 1.3 * mo * sc); ctx.drawImage(A.magCv, -A.gx * sc, -A.gy * sc, A.w * sc, A.h * sc); ctx.restore();
  } else { ctx.drawImage(A.cv, -A.gx * sc, -A.gy * sc, A.w * sc, A.h * sc); ctx.shadowColor = "transparent"; }
  if (shot > .4 && A.mx && p.w !== 2 && !small) {   // 총구 화염
    const mx = (A.mx - A.gx) * sc + 10, my = (A.my - A.gy) * sc, rr = size * .16 * shot, gr = ctx.createRadialGradient(mx, my, 0, mx, my, rr * 1.5); gr.addColorStop(0, "rgba(255,250,220,.95)"); gr.addColorStop(.35, "rgba(255,190,80,.55)"); gr.addColorStop(1, "rgba(255,120,30,0)"); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(mx, my, rr * 1.5, 0, TAU); ctx.fill();
    ctx.fillStyle = "#ffe3a4"; ctx.beginPath(); for (let i = 0; i < 12; i++) { const a = i * TAU / 12, r = i % 2 ? rr * .26 : rr; ctx.lineTo(mx + Math.cos(a) * r, my + Math.sin(a) * r); } ctx.closePath(); ctx.fill();
  }
  const mainP = m0.transformPoint(new DOMPoint(0, 0)), foreP = A.fx != null ? m0.transformPoint(new DOMPoint((A.fx - A.gx) * sc, (A.fy - A.gy) * sc)) : null;
  if (A.mx) { const mz = m0.transformPoint(new DOMPoint((A.mx - A.gx) * sc, (A.my - A.gy) * sc)); lastMuzzle = {x: mz.x, y: mz.y}; if (A.ex) { const ep = m0.transformPoint(new DOMPoint((A.ex - A.gx) * sc, (A.ey - A.gy) * sc)); lastEject = {x: ep.x, y: ep.y}; } }
  ctx.restore();
  handArm(mainP.x, mainP.y, W + size * .2, H + size * .5);
  if (foreP && p.w === 0) handArm(foreP.x, foreP.y, W * .4, H + size * .5);
  if (lp >= 0) { const bw = Math.min(160, W * .3), bx2 = W / 2 - bw / 2, by2 = H * .56; ctx.fillStyle = "rgba(8,13,22,.78)"; ctx.fillRect(bx2, by2, bw, 10); ctx.fillStyle = "#ffd35a"; ctx.fillRect(bx2, by2, bw * lp, 10); ctx.font = "800 11px system-ui"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.8)"; ctx.strokeText("장전 중", W / 2, by2 - 4); ctx.fillStyle = "#fff"; ctx.fillText("장전 중", W / 2, by2 - 4); ctx.textAlign = "start"; }
}

/* ---------- 총기 보관함: 총 고르기 · 스킨 미리보기 · 끌어서 돌려 보기 ---------- */
let loWid = "rifle", loYaw = 0, loTilt = 0, loDrag = null, loRaf = 0, loSpin = true;
const LO_IDS = ["pistol", "smg", "shot", "rifle", "lmg", "sniper", "knife", "frag", "smoke", "flash"];
function loRender() {
  const tabs = $("[data-lotabs]"), sk = $("[data-loskins]");
  tabs.innerHTML = LO_IDS.map(id => `<button type="button" data-lowid="${id}" aria-pressed="${id === loWid}"><img alt="" src="${GK.icon(id, GK.getSkin(id), 70, 28)}"><span>${GK.weapons.find(w => w.id === id).name}</span></button>`).join("");
  sk.innerHTML = GK.skins.map(s => `<button type="button" data-loskin="${s.id}" aria-pressed="${GK.getSkin(loWid) === s.id}"><img alt="" src="${GK.icon(loWid, s.id, 96, 38)}"><b>${s.name}</b><small>${s.desc}</small></button>`).join("");
}
function loDraw() {
  const lo = $("[data-lo]"); if (lo.hidden) { loRaf = 0; return; } loRaf = requestAnimationFrame(loDraw);
  const cv = $("[data-lopv]"), g = cv.getContext("2d"), W = cv.width, H = cv.height, t = performance.now() / 1000;
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#1b2740"); bg.addColorStop(1, "#0d1422"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,255,255,.04)"; for (let i = 0; i < 8; i++) g.fillRect(0, H * .78 + i * 6, W, 1);
  const rg = g.createRadialGradient(W / 2, H * .5, 10, W / 2, H * .5, W * .5); rg.addColorStop(0, "rgba(120,160,230,.25)"); rg.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = rg; g.fillRect(0, 0, W, H);
  const skin = GK.getSkin(loWid), a = GK.art(loWid, skin); if (!a) return;
  if (!loDrag && loSpin) loYaw = Math.sin(t * .8) * .9; const sc = Math.min(W * .8 / a.w, H * .62 / a.h) * (a.w < 200 ? .75 : 1);
  g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.ellipse(W / 2, H * .82, a.w * sc * .36 * Math.abs(Math.cos(loYaw)) + 20, 10, 0, 0, TAU); g.fill();
  GK.drawSide(g, loWid, skin, W / 2, H * .46, sc, {yaw: loYaw, roll: loTilt, anchor: "center", shadow: true, sheen: true});
  g.fillStyle = "#e9f0ff"; g.font = "800 15px system-ui"; g.textAlign = "center"; g.fillText(GK.weapons.find(w => w.id === loWid).name + " · " + GK.skins.find(s => s.id === skin).name, W / 2, 22);
}
function loOpen() { const lo = $("[data-lo]"); lo.hidden = false; loRender(); if (!loRaf) loRaf = requestAnimationFrame(loDraw); if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) {} } }
function loClose() { $("[data-lo]").hidden = true; if (running() && !needMouse()) relock(); }
function loBind() {
  const cv = $("[data-lopv]");
  cv.addEventListener("pointerdown", e => { loDrag = {x: e.clientX, y: e.clientY, yaw: loYaw, tilt: loTilt}; try { cv.setPointerCapture(e.pointerId); } catch (er) {} });
  cv.addEventListener("pointermove", e => { if (!loDrag) return; loYaw = loDrag.yaw + (e.clientX - loDrag.x) * .012; loTilt = clamp(loDrag.tilt + (e.clientY - loDrag.y) * .006, -.8, .8); });
  const up = () => { if (loDrag) { loDrag = null; loSpin = false; setTimeout(() => { if (!loDrag) loSpin = true; }, 2500); } };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  $("[data-lo]").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.lowid) { loWid = b.dataset.lowid; loYaw = 0; loTilt = 0; loRender(); }
    else if (b.dataset.loskin) { GK.setSkin(loWid, b.dataset.loskin); loRender(); GK.sfx.play("draw", loWid, {vol: .6}); }
    else if (b.dataset.a === "lo-close") loClose();
  });
}


/* ---------- 화면 뼈대 ---------- */
let root, canvas, ctx2, $;
const cfg = {map: 0, diff: "easy", sens: 50, per: 5, dmgnum: false};
try { Object.assign(cfg, JSON.parse(LS.get("roundb-office-cfg") || "{}")); } catch (e) {}
cfg.map = clamp(cfg.map | 0, 0, MAPS.length - 1); if (!DIFF[cfg.diff]) cfg.diff = "easy"; cfg.sens = clamp(+cfg.sens || 50, 15, 150); cfg.per = clamp(cfg.per | 0 || 5, 1, 10); cfg.dmgnum = !!cfg.dmgnum;
const saveCfg = () => LS.set("roundb-office-cfg", JSON.stringify(cfg));
const thumbs = {};
function thumb(m) {
  if (thumbs[m.id]) return thumbs[m.id];
  const k = 6, c = document.createElement("canvas"); c.width = m.w * k; c.height = m.h * k; const g = c.getContext("2d");
  g.fillStyle = "#0d1522"; g.fillRect(0, 0, c.width, c.height);
  const col = ["", "#566581", "#5ea1c7", "#a67b4a", "#8d96a7", "#b08b5a"];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { const t = m.grid[y * m.w + x]; g.fillStyle = t ? col[t] : "#27344b"; g.fillRect(x * k, y * k, k, k); }
  const zone = (arr, color, label) => { g.fillStyle = color; for (const p of arr) g.fillRect((p.x - .5) * k, (p.y - .5) * k, k, k); g.fillStyle = "#fff"; g.font = "700 11px system-ui"; g.textAlign = "center"; const p = arr[2]; g.fillText(label, p.x * k, (p.y + (p.y < m.h / 2 ? 3.2 : -2)) * k); };
  zone(m.atk, "#ffb23d", "공격 시작"); zone(m.def, "#4aa8ff", "수비 시작");
  for (const s of [m.A, m.B]) { g.fillStyle = "#ff5a6a"; g.beginPath(); g.arc(s.x * k, s.y * k, k * 1.5, 0, TAU); g.fill(); g.fillStyle = "#fff"; g.font = "800 12px system-ui"; g.textAlign = "center"; g.fillText(s.l, s.x * k, s.y * k + 4); }
  return thumbs[m.id] = c.toDataURL();
}
function build() {
  root = document.createElement("section"); root.className = "brawl rb-office"; window.roundbArenaScreen(root);
  root.innerHTML = `
  <header class="os-top"><strong>${NAME}</strong><span class="os-hud" data-hud></span>
    <button type="button" data-a="sound" aria-pressed="true">소리 켬</button><button type="button" data-a="exit">나가기</button></header>
  <div class="os-menu" data-menu><div class="os-card">
    <span class="os-eyebrow">5대5 · 설치·해체전 · 최대 7라운드</span>
    <h2>${NAME}</h2>
    <p class="os-sum">공격팀은 폭탄을 지고 A·B 지점에 설치하고, 수비팀은 막거나 해체해요. 4라운드를 먼저 이기면 승리, 3라운드 뒤에는 공격과 수비가 바뀌어요.</p>
    <ul class="os-rules"><li><b>목표</b><span>공격: 지점에서 설치(E 길게) · 수비: 설치를 막고 해체</span></li>
      <li><b>조작</b><span>폰: 왼쪽 엄지 이동 · 오른쪽 화면 드래그 시점 · 발사/조준 버튼 / PC: WASD · 마우스 · 우클릭 조준</span></li>
      <li><b>첫 판</b><span>구매 시간에 무기를 사고 '쉬움'으로 연습해 보세요. 힌트가 화면에 떠요.</span></li></ul>
    <div class="os-label">전장</div><div class="os-maps" data-maps></div>
    <div class="os-label">난이도</div><div class="os-seg" data-diffs></div>
    <div class="os-label">인원 (한 팀) · 빈 자리는 AI</div><select data-per aria-label="한 팀 인원"></select><p class="os-hint">10:10 은 PC 방장을 권장해요. 폰 방장은 5:5 이하가 안전해요.</p>
    <button type="button" class="os-go" data-a="solo">AI와 바로 시작</button>
    <button type="button" class="os-lob" data-a="lo-open">총기 보관함 · 스킨 고르기 (전부 무료)</button>
    <details class="os-box"><summary>온라인으로 같이 하기 (최대 10명)</summary>
      <div class="os-online"><button type="button" data-a="host">방 만들기</button><label><input type="checkbox" data-public> 공개방</label>
        <input data-code maxlength="6" placeholder="초대 코드" aria-label="초대 코드"><button type="button" data-a="join">참가</button>
        <button type="button" data-a="start" hidden>온라인 시작</button></div>
      <p class="os-hint">방장이 시작하면 빈 자리는 AI가 채워요. 홀수 자리는 오렌지팀, 짝수 자리는 블루팀이에요.</p></details>
    <details class="os-box"><summary>조작 한눈에</summary><p class="os-hint">WASD 이동 · 마우스 시점(클릭하면 고정) · 좌클릭 발사 · 우클릭 조준 · R 장전 · E 설치/해체(길게) · 1 주무기 2 권총 3 단검 4 투척물(연타하면 수류탄→연막→섬광) 5 폭탄/키트 · Space 점프 · Ctrl 또는 X 앉기(누르는 동안) · Z 엎드리기 · C 구르기 · F 총 구경 · B 구매 · Enter 바로 시작 · Tab 점수판 · Shift 걷기(조용·정확)</p>
      <label class="os-sens">시점 감도 <input data-sens type="range" min="15" max="150"><output data-sensv></output></label>
      <label class="os-sens">효과음 볼륨 <input data-vol type="range" min="0" max="100"><output data-volv></output></label>
      <label class="os-sens"><input data-dmgnum type="checkbox"> 맞춘 피해 숫자 표시</label></details>
    <p class="os-msg" data-msg role="status"></p></div></div>
  <div class="os-lo" data-lo hidden><div>
    <div class="os-loh"><b>총기 보관함</b><button type="button" data-a="lo-close">닫기</button></div>
    <div class="os-lotabs" data-lotabs></div>
    <canvas class="os-lopv" data-lopv width="640" height="260" aria-label="총기 미리보기"></canvas>
    <p class="os-hint">총을 마우스(또는 손가락)로 끌어 돌려 보세요. 스킨은 고르는 즉시 적용돼요. 게임 중에는 F 키(폰은 [구경] 버튼 꾹)로 손에 든 총을 구경할 수 있어요.</p>
    <div class="os-loskins" data-loskins></div></div></div>
  <div class="os-stage" data-stage hidden>
    <canvas tabindex="0" aria-label="${NAME} 전장"></canvas>
    <div class="os-toast" data-toast role="status"></div>
    <div class="os-buy" data-buy hidden></div>
    <div class="os-score" data-score hidden></div>
    <div class="os-pad" data-pad>
      <div class="os-joy" data-joy><i></i></div>
      <button type="button" class="os-b os-fire" data-b="fire">발사</button><button type="button" class="os-b os-zoom" data-b="zoom" aria-pressed="false">조준</button>
      <button type="button" class="os-b os-reload" data-b="reload">장전</button><button type="button" class="os-b os-use" data-b="use" hidden>설치</button>
      <button type="button" class="os-b os-swap" data-b="swap">무기</button>
      <div class="os-nades"><button type="button" class="os-b" data-b="gren" aria-pressed="false">수류탄 0</button></div><button type="button" class="os-b os-insp" data-b="inspect">구경</button>
      <div class="os-mv"><button type="button" class="os-b" data-b="jump">점프</button><button type="button" class="os-b" data-b="crouch" aria-pressed="false">앉기</button><button type="button" class="os-b" data-b="prone">엎드려</button><button type="button" class="os-b" data-b="roll">구르기</button></div>
      <button type="button" class="os-b os-buyb" data-b="buy" hidden>구매</button><button type="button" class="os-b os-scoreb" data-b="score">점수</button></div>
    <section class="os-result" data-result hidden aria-labelledby="os-res-t"><div>
      <small>경기 종료</small><h2 id="os-res-t" data-rt></h2><p class="os-rs" data-rs></p><p class="os-rp" data-rp></p><div data-rtable></div>
      <div class="os-rbtns"><button type="button" data-a="again">다시 하기</button><button type="button" data-a="menu">설정 바꾸기</button><button type="button" data-a="leave">나가기</button></div></div></section>
    <div class="os-confirm" data-confirm hidden><div><p>경기를 나갈까요?</p><small data-cs></small><div class="os-rbtns"><button type="button" data-a="stay">계속하기</button><button type="button" data-a="leave2">나가기</button></div></div></div>
  </div>`;
  document.body.append(root);
  $ = s => root.querySelector(s); canvas = $("[data-stage] canvas"); ctx2 = canvas.getContext("2d");
  const mapsBox = $("[data-maps]");
  mapsBox.innerHTML = MAPS.map((m, i) => `<button type="button" data-map="${i}" aria-pressed="${i === cfg.map}"><img alt="" src="${thumb(m)}"><b>${m.name}</b><small>${m.note}</small></button>`).join("");
  $("[data-diffs]").innerHTML = ["easy", "normal", "hard"].map(k => `<button type="button" data-diff="${k}" aria-pressed="${k === cfg.diff}">${DIFF[k].n}${k === "easy" ? " · 연습" : ""}</button>`).join("");
  const pe = $("[data-per]"); pe.innerHTML = Array.from({length: 10}, (_, i) => `<option value="${i + 1}">${i + 1} : ${i + 1}${i === 9 ? " (PC 방장 권장)" : ""}</option>`).join(""); pe.value = cfg.per; pe.addEventListener("change", () => { cfg.per = clamp(+pe.value | 0, 1, 10); saveCfg(); });
  const sl = $("[data-sens]"); sl.value = cfg.sens; $("[data-sensv]").textContent = cfg.sens + "%";
  sl.addEventListener("input", () => { cfg.sens = +sl.value; $("[data-sensv]").textContent = cfg.sens + "%"; saveCfg(); });
  touchy(); matchMedia("(pointer:coarse)").addEventListener?.("change", touchy); addEventListener("resize", touchy);
}
const touchy = () => root && root.classList.toggle("os-touch", matchMedia("(pointer:coarse)").matches || (navigator.maxTouchPoints > 0 && innerWidth < 900));
let toastT = 0;
function toast(text, ms) { const t = $("[data-toast]"); t.textContent = text; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), ms || 3200); }
const setMsg = t => { $("[data-msg]").textContent = t || ""; };

/* ---------- 상태 ---------- */
let M = null, GS = null, st = null, room = null, role = "", slot = 0, frame = 0, last = 0, acc = 0, pubAt = 0, sendAt = 0, evSeen = 0, evFor = "", paid = "", shown = "";
let hd = 0, kick = 0, lastShot = -9, hitAt = -9, hitHead = false, bob = 0, banner = null, curFov = 1.15, specI = -1, buyOpen = false, buyReady = false, buyKey = "", qual = 0, slow = 0, fast = 0, errN = 0, hintOn = false, hintsDone = {}, started = 0;
const hostSlots = new Set(), keys = new Set(), acts = [], ptrs = new Map(), joy = {on: false, id: -1, ox: 0, oy: 0, f: 0, s: 0};
const ctl = {fire: false, zoom: false, use: false, padFire: false, padUse: false, padZoom: false, padJump: false, padCrouch: false};
let scoreOpen = false, pubMem = {}, rosAt = 0;

/* ---------- 레이캐스트 (화면용) ---------- */
function makeCaster(map) {
  const W = map.w, H = map.h, G = map.grid;
  const cell = (x, y) => { if (x < 0 || y < 0) return 1; const cx = Math.floor(x), cy = Math.floor(y); return cx >= W || cy >= H ? 1 : G[cy * W + cx]; };
  return (x, y, dx, dy) => {
    let cx = Math.floor(x), cy = Math.floor(y), n = 0, d = 0, side = 0, low = null;
    const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1, tdx = dx === 0 ? 1e9 : Math.abs(1 / dx), tdy = dy === 0 ? 1e9 : Math.abs(1 / dy);
    let tx = dx === 0 ? 1e9 : (dx > 0 ? cx + 1 - x : x - cx) * tdx, ty = dy === 0 ? 1e9 : (dy > 0 ? cy + 1 - y : y - cy) * tdy;
    while (n++ < 90) { const t = cell(cx, cy); if (t === 5) { if (!low) low = {d, side}; } else if (t) return {d, side, t, low}; if (tx < ty) { d = tx; tx += tdx; cx += sx; side = 0; } else { d = ty; ty += tdy; cy += sy; side = 1; } }
    return {d: 99, side: 0, t: 1, low};
  };
}
const casters = {}, luts = {};
const getCaster = m => casters[m.id] || (casters[m.id] = makeCaster(m));
function getLut(m) {
  if (luts[m.id]) return luts[m.id]; const pal = m.pal, mk2 = rgb => Array.from({length: 33}, (_, i) => { const k = i / 32; return `rgb(${rgb[0] * k | 0},${rgb[1] * k | 0},${rgb[2] * k | 0})`; });
  return luts[m.id] = [null, mk2(pal.wall), mk2(pal.glass), mk2(pal.crate), mk2(pal.pillar)];
}
function segSmoke(S, ax, ay, bx, by) {
  for (const s of S.smokes) {
    if (S.t >= s.end) continue; const r = s.r * Math.min(1, (S.t - s.t0) / .9 + .15) * .86, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, u = l2 < 1e-9 ? 0 : clamp(((s.x - ax) * dx + (s.y - ay) * dy) / l2, 0, 1);
    if (Math.hypot(ax + dx * u - s.x, ay + dy * u - s.y) < r) return true;
  }
  return false;
}

/* ---------- 입력 ---------- */
let lockErr = 0, everLocked = false, lockBlock = 0;
const isLocked = () => !!canvas && document.pointerLockElement === canvas;
const noLock = () => lockErr >= 2 && !everLocked;   // 포인터 락을 아예 못 쓰는 환경(미리보기·iframe): 클릭 즉시 사격하는 폴백
function relock() {   // 사용자 동작(클릭·키) 안에서만 호출 — 플레이 중 마우스를 화면에 고정
  if (touchOnly() || isLocked() || noLock() || performance.now() < lockBlock || !canvas.requestPointerLock) return;
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { lockErr++; lockBlock = performance.now() + 1300; }); } catch (e) { lockErr++; }
}
function syncLock() {   // 매 프레임: 선택창(구매·결과·나가기)이면 락을 풀고 커서를 보이게
  const need = needMouse();
  if (need && document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) {} }
  root.classList.toggle("os-free", need);
}
function buildInput() {
  let f = Number(keys.has("w") || keys.has("up")) - Number(keys.has("s") || keys.has("down")), s = Number(keys.has("d") || keys.has("right")) - Number(keys.has("a") || keys.has("left"));
  if (joy.on) { f = joy.f; s = joy.s; }
  return {f, s, a: hd, fire: ctl.fire || ctl.padFire, zoom: ctl.zoom || ctl.padZoom, use: keys.has("e") || ctl.padUse, walk: keys.has("shift"), jump: keys.has(" ") || ctl.padJump, crouch: keys.has("ctrl") || keys.has("x") || ctl.padCrouch};
}
function doAct(a) {
  if (!a) return;
  if (role === "guest") { room && room.input({...buildInput(), act: a}); sendAt = performance.now(); }
  else if (M) M.act(0, a);
}
function toggleBuy() { const S = st; if (!S || S.phase !== "buy") return; buyOpen = !buyOpen; buyKey = ""; if (!buyOpen) relock(); }
const needMouse = () => { const S = st; if (!S || !root) return false; const me = S.players[slot]; return !$("[data-lo]").hidden || !$("[data-result]").hidden || !$("[data-confirm]").hidden || !!(buyOpen && S.phase === "buy" && me && me.alive && !S.done); };
function keyOf(e) {
  const m = /^(?:Key|Digit)([A-Z0-9])$/.exec(e.code), al = {ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Space: " ", Tab: "tab", ShiftLeft: "shift", ShiftRight: "shift", ControlLeft: "ctrl", ControlRight: "ctrl"};
  return (m && m[1].toLowerCase()) || al[e.code] || al[e.key] || (e.key || "").toLowerCase();
}
function onKeyDown(e) {
  if (!root || !root.open || !st || $("[data-stage]").hidden || e.target.matches && e.target.matches("input,select,textarea")) return;
  const k = keyOf(e);
  if (!$("[data-result]").hidden) { if (k === "enter" || k === " ") { e.preventDefault(); e.stopImmediatePropagation(); if (role !== "guest" && !e.repeat) $('[data-a="again"]').click(); } return; }
  if (buyOpen && st.phase === "buy" && (k === "enter" || k === " ")) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) { doAct("ready"); buyOpen = false; relock(); } return; }
  if (k === "tab") { e.preventDefault(); e.stopImmediatePropagation(); scoreOpen = true; return; }
  const okKey = ("wasdeqrbzcxf1234567890".includes(k) && k.length === 1) || ["shift", " ", "ctrl", "up", "down", "left", "right"].includes(k);
  if (!okKey) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (buyOpen && st.phase === "buy" && /^[0-9]$/.test(k)) { const it = BUYS.find(b => b.key === k); if (it && !e.repeat) doAct("buy:" + it.id); return; }
  if (["w", "a", "s", "d", "e", "x", "shift", " ", "ctrl", "up", "down", "left", "right"].includes(k)) keys.add(k);
  if (!needMouse()) relock();   // 키 입력도 사용자 동작이라 이때 마우스 고정을 시도한다
  if (e.repeat) return;
  if (k === "f") { inspectAt = performance.now(); inspectW = st.players[slot] ? st.players[slot].w : -1; return; }
  const map = {r: "reload", 1: "w0", 2: "w1", 3: "w2", 4: "g", 5: "w4", q: "swap", c: "roll", z: "prone"};
  if (k === "b") toggleBuy(); else if (map[k]) doAct(map[k]);
}
function onKeyUp(e) { if (!root || !root.open) return; const k = keyOf(e); if (k === "tab") scoreOpen = false; keys.delete(k); }
function lookBy(dx, touch) { hd += dx * (touch ? .0046 : .0023) * (cfg.sens / 50); }
function bindInput() {
  addEventListener("keydown", onKeyDown, true); addEventListener("keyup", onKeyUp, true);
  addEventListener("blur", () => { keys.clear(); ctl.fire = ctl.zoom = false; ctl.padFire = ctl.padUse = ctl.padJump = false; scoreOpen = false; });
  addEventListener("beforeunload", e => { if (running() && st && !st.done && st.t > 5) { e.preventDefault(); e.returnValue = ""; } });   // Ctrl+W(앉기+전진)로 탭이 닫히는 사고 방지
  document.addEventListener("pointerlockchange", () => {
    if (isLocked()) { everLocked = true; lockErr = 0; }
    else if (running() && !touchOnly() && !needMouse() && st && !st.done && everLocked) toast("화면을 클릭하면 마우스가 다시 고정돼요", 2500);
  });
  document.addEventListener("pointerlockerror", () => { lockErr++; lockBlock = performance.now() + 1300; });
  document.addEventListener("mousemove", e => { if (!running() || touchOnly()) return; if (isLocked() || (noLock() && (e.buttons & 1) && e.target === canvas && !needMouse())) lookBy(e.movementX || 0, false); });
  const stage = $("[data-stage]");
  const mouseState = e => { ctl.fire = !!(e.buttons & 1); ctl.zoom = !!(e.buttons & 2); };   // 오른쪽 버튼을 누른 채로도 왼쪽 클릭(사격)이 들어가게 버튼 비트로 읽는다
  canvas.addEventListener("mousedown", e => {
    if (!running() || touchOnly()) return; canvas.focus({preventScroll: true});
    if (needMouse()) return;
    if (!isLocked() && !noLock() && canvas.requestPointerLock) { relock(); return; }
    const me = st.players[slot]; if (me && !me.alive && !st.done) { if (e.button === 0) specI++; return; }
    mouseState(e);
  });
  addEventListener("mouseup", mouseState);
  canvas.addEventListener("pointerdown", e => {
    if (!running() || e.pointerType === "mouse") return; canvas.focus({preventScroll: true});
    const x = e.clientX - canvas.getBoundingClientRect().left, w = canvas.clientWidth, y = e.clientY - canvas.getBoundingClientRect().top;
    const me = st.players[slot]; if (me && !me.alive && !st.done) { specI++; }
    try { stage.setPointerCapture(e.pointerId); } catch (er) {}
    if (x < w * .5 && !joy.on) { joy.on = true; joy.id = e.pointerId; joy.ox = x; joy.oy = y; joy.f = joy.s = 0; ptrs.set(e.pointerId, {t: "joy"}); const j = $("[data-joy]"); j.style.left = x + "px"; j.style.top = y + "px"; j.classList.add("on"); j.firstChild.style.transform = "translate(-50%,-50%)"; }
    else ptrs.set(e.pointerId, {t: "look", x: e.clientX});
  });
  stage.addEventListener("pointermove", e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (p.t === "joy") {
      const rect = canvas.getBoundingClientRect(), dx = e.clientX - rect.left - joy.ox, dy = e.clientY - rect.top - joy.oy, R = 56, m = Math.hypot(dx, dy), k = m > R ? R / m : 1;
      const nx = dx * k / R, ny = dy * k / R; const dz = .14, mag = Math.hypot(nx, ny);
      if (mag < dz) { joy.f = joy.s = 0; } else { const sc = (mag - dz) / (1 - dz) / mag; joy.s = nx * sc; joy.f = -ny * sc; }
      $("[data-joy]").firstChild.style.transform = `translate(calc(-50% + ${dx * k}px),calc(-50% + ${dy * k}px))`;
    } else if (p.t !== "jump" && p.t !== "insp") { lookBy(e.clientX - p.x, true); p.x = e.clientX; }
  });
  const endP = e => {
    const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId);
    if (p.t === "joy") { joy.on = false; joy.f = joy.s = 0; const j = $("[data-joy]"); j.classList.remove("on"); j.style.left = j.style.top = ""; j.firstChild.style.transform = "translate(-50%,-50%)"; }
    if (p.t === "fire") ctl.padFire = false; if (p.t === "use") ctl.padUse = false; if (p.t === "jump") ctl.padJump = false; if (p.t === "insp") inspectAt = 0;
  };
  stage.addEventListener("pointerup", endP); stage.addEventListener("pointercancel", endP);
  for (const b of root.querySelectorAll("[data-b]")) {
    const id = b.dataset.b;
    b.addEventListener("pointerdown", e => {
      e.preventDefault(); e.stopPropagation(); if (!running()) return;
      if (id === "fire" || id === "use" || id === "jump") { ctl[id === "fire" ? "padFire" : id === "use" ? "padUse" : "padJump"] = true; ptrs.set(e.pointerId, {t: id, x: e.clientX}); try { stage.setPointerCapture(e.pointerId); } catch (er) {} }
      else if (id === "inspect") { inspectAt = performance.now(); inspectW = st.players[slot] ? st.players[slot].w : -1; ptrs.set(e.pointerId, {t: "insp", x: e.clientX}); try { stage.setPointerCapture(e.pointerId); } catch (er) {} }
      else if (id === "zoom") { ctl.padZoom = !ctl.padZoom; b.setAttribute("aria-pressed", String(ctl.padZoom)); }
      else if (id === "crouch") { ctl.padCrouch = !ctl.padCrouch; b.setAttribute("aria-pressed", String(ctl.padCrouch)); }
      else if (id === "prone") { ctl.padCrouch = false; doAct("prone"); }
      else if (id === "buy") toggleBuy(); else if (id === "score") scoreOpen = !scoreOpen;
      else doAct({reload: "reload", swap: "swap", gren: "g", roll: "roll"}[id]);
    });
  }
}
const running = () => !!(root && root.open && st && !$("[data-stage]").hidden);
const touchOnly = () => root.classList.contains("os-touch") && matchMedia("(pointer:coarse)").matches;

/* ---------- 이벤트 → 소리·배너 ---------- */
function banner2(text, sub, color, ms) { banner = {text, sub: sub || "", color: color || "#fff", t0: performance.now(), dur: ms || 2200}; }
function reloadSeq(wid, rl, dist, pan, prio) { const o = {dist, pan, prio, vol: prio ? .9 : 1}; [[.22, "reload1"], [.6, "reload2"], [.93, "reload3"]].forEach(([f, k]) => setTimeout(() => GK.sfx.play(k, wid, o), f * rl * 1000)); }
function handleEvents(S, me) {
  if (evFor !== S.id) { evFor = S.id; evSeen = 0; myStreak = 0; }
  const cam = me, now = performance.now();
  for (const e of S.ev) {
    if (e[0] <= evSeen) continue; evSeen = e[0];
    const [, ty, x, y, a, b] = e, d = Math.hypot(x - cam.rx, y - cam.ry), pan = Math.sin(adiff(Math.atan2(y - cam.ry, x - cam.rx), hd)), mine = (ty === "sh" ? b : a) === me.i;
    if (ty === "sh") GK.sfx.play("shot", GK.TYPE2ID[a], {pan: mine ? 0 : pan, dist: mine ? 0 : d, vol: mine ? .95 : 1, prio: mine});
    else if (ty === "kn") GK.sfx.play("swing", "knife", {pan, dist: d, prio: mine});
    else if (ty === "ht") {
      const shooter = b % 100, head = b >= 100, victim = S.players[a], dmg = e[7] || 0;
      if (shooter === me.i && a !== me.i) { GK.sfx.play(head ? "head" : "hit", "", {prio: true}); hitAt = now; hitHead = head; if (victim) hitFx(victim, head, dmg, now); }
      else if (victim && a !== me.i && d < 22) hitFx(victim, head, 0, now);
      if (a === me.i) GK.sfx.play(me.armor > 0 ? "armor" : "hurt", "", {vol: .9, prio: true});
    }
    else if (ty === "kl") {
      if (b === me.i && a !== me.i) { GK.sfx.play("kill", "", {prio: true}); myStreak++; killPop = {t0: now, n: myStreak, name: kname(S.players[a].k)}; }
      else if (a === me.i) { myStreak = 0; banner2("쓰러졌어요", S.done ? "" : "다음 라운드까지 팀원을 관전해요", "#ff9a8a", 2000); }
    }
    else if (ty === "rl") { const wid = GK.TYPE2ID[b] || "rifle"; reloadSeq(wid, (WP[wid] || {}).rl || 2, mine ? 0 : d, mine ? 0 : pan, mine); }
    else if (ty === "th") GK.sfx.play("pin", "frag", {pan, dist: d, vol: .8});
    else if (ty === "fl") { if (me.blind > .3) GK.sfx.play("ring", "", {prio: true}); else GK.sfx.play("flash", "flash", {pan, dist: d}); }
    else if (ty === "bm" || ty === "bx") GK.sfx.play("boom", "frag", {pan, dist: d * (ty === "bx" ? .5 : 1), prio: true});
    else if (ty === "sm") GK.sfx.play("smoke", "smoke", {pan, dist: d});
    else if (ty === "jp") { if (a !== me.i && d < 14) GK.sfx.play("step", "", {pan, dist: d, vol: .6}); }
    else if (ty === "ld") { if (a === me.i) { kick = Math.min(1, kick + .45); GK.sfx.play("land", "", {vol: .7}); } else if (d < 16) GK.sfx.play("land", "", {pan, dist: d, vol: .6}); }
    else if (ty === "rlr") GK.sfx.play("swing", "knife", {pan, dist: d, vol: .5});
    else if (ty === "ng") { if (a === me.i) toast("던질 수 있는 수류탄·연막탄·섬광탄이 없어요", 1800); }
    else if (ty === "pl") { sfx("pl"); banner2(S.bomb.site + " 지점 폭탄 설치", me.team === S.atk ? "지키세요! 막으면 이겨요" : "해체하세요!", "#ff7a6a", 2400); if (hintOn && me.team !== S.atk) toast("해체: 폭탄 가까이에서 E(또는 해체 버튼)를 길게 누르세요", 4200); }
    else if (ty === "df") { sfx("df"); banner2("폭탄 해체", "", "#8fd8ff", 1800); }
    else if (ty === "bd") toast("폭탄이 떨어졌어요 — 공격팀이 줍기", 2200);
    else if (ty === "bp") sfx("bp");
    else if (ty === "by") { if (a === me.i) sfx("by"); }
    else if (ty === "rn") { buyOpen = true; buyReady = false; buyKey = ""; myStreak = 0; banner2("라운드 " + a + " / " + CFG.maxRounds, (b === me.team ? "공격" : "수비") + " · 구매 시간", "#ffe08a", 2200);
      if (hintOn && !hintsDone.buy) { hintsDone.buy = 1; toast("구매 시간! 번호 버튼으로 무기를 사고 '바로 시작'을 누르세요 (소총 2000)", 5200); } }
    else if (ty === "lv") { sfx("go"); buyOpen = false;
      if (!isLocked() && !touchOnly() && !noLock() && !(hintOn && !hintsDone.live)) toast("화면을 클릭하면 마우스 시점이 고정돼요", 2600);
      if (hintOn && !hintsDone.live) { hintsDone.live = 1; toast(me.team === S.atk ? "공격: 폭탄을 들고 A·B 지점으로! 설치는 E 길게 · F 로 총 구경" : "수비: A·B 지점을 지키고, 설치되면 해체하세요 · 앉기(Ctrl/X)로 엄폐 뒤에 숨기", 5000); } }
    else if (ty === "re") { const win = a === me.team; sfx(win ? "win" : "lose"); banner2(win ? "라운드 승리" : "라운드 패배", S.lastEnd ? S.lastEnd.reason : "", win ? "#8ff0c8" : "#ff9a8a", 3000); }
  }
}

/* ---------- 그리기 ---------- */
let eyeCur = .575, adsK = 0, heldSig = "", heldPop = null, swapAt = 0;
function draw(dt, now) {
  const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
  const sc = qual >= 2 ? .75 : 1, cw = Math.max(240, Math.round(w * sc)), ch = Math.max(160, Math.round(h * sc));
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  const ctx = ctx2, W = canvas.width, H = canvas.height;
  if (!st) { ctx.fillStyle = "#0e1624"; ctx.fillRect(0, 0, W, H); return; }
  const S = st, me = S.players[slot]; if (!me) return;
  let cp = me; if (!me.alive && !S.done) { const mates = S.players.filter(q => q.alive && !q.hidden && q.team === me.team), pool = mates.length ? mates : S.players.filter(q => q.alive && !q.hidden); if (pool.length) cp = pool[((specI % pool.length) + pool.length) % pool.length]; }
  const self = cp === me, map = S.map, cast = getCaster(map), lut = getLut(map), pal = map.pal;
  const camA = self ? hd : cp.ra, cx = cp.rx, cy = cp.ry, wd = WP[wpKey(cp)];
  const aspect = W / H, baseFov = aspect < 1 ? 1.3 : 1.12, tf = cp.zoom ? (aspect < 1 ? wd.fov * 1.12 : wd.fov) : baseFov;
  curFov += (tf - curFov) * Math.min(1, dt * 14); const fov = curFov, tanH = Math.tan(fov / 2), proj = W / (2 * tanH);
  const eyeT = cp.rollT > 0 ? .3 : cp.st === 2 ? .17 : cp.st === 1 ? .4 : .575; eyeCur += (eyeT - eyeCur) * Math.min(1, dt * 12);
  const camH = eyeCur + (cp.z || 0);
  adsK += ((self && cp.zoom ? 1 : 0) - adsK) * Math.min(1, dt * 14);
  bob += dt * 10 * cp.mf; kick = Math.max(0, kick - dt * 6);
  if (self && me.shotAt !== lastShot) { if (S.t - me.shotAt < .3 && wd.t !== "k" && wd.t !== "x" && wd.t !== "b") { kick = Math.min(1, kick + (wd.rc || 1) * .22); shotEvent = true; } lastShot = me.shotAt; }
  stepAcc += dt * cp.mf * 3.3; if (self && stepAcc > 1.2) { stepAcc = 0; if (cp.mf > .55 && !cp.st && (cp.z || 0) < .02) GK.sfx.play("step", "", {vol: .35}); }
  const sig = me.w + "|" + me.gsel + "|" + me.pw;
  if (self && sig !== heldSig) { if (heldSig) { swapAt = now; const k2 = heldKey(me, S.atk), nm = me.w === 3 ? GNAME[me.gsel | 0] + " ×" + me.gren[me.gsel | 0] : me.w === 2 ? "전술 단검" : me.w === 4 ? (me.team === S.atk ? "폭탄" : "해체 키트") : WP[wpKey(me)].n; heldPop = {text: nm, key: k2, t0: now}; } heldSig = sig; }
  const horizon = H * .5 + Math.sin(bob) * H * .006 * (cp.mf > .1 && (cp.z || 0) < .02 ? 1 : 0) - kick * H * .03;
  lastCam = {cx, cy, camA, W, H, proj, horizon, camH};
  if (shotEvent) { shotEvent = false; fireFx(W, H, wpKey(cp), now); const spr = spread(cp, wd) * 1.3, ra = hd + (Math.random() - .5) * spr, dxr = Math.cos(ra), dyr = Math.sin(ra), h2 = cast(cx, cy, dxr, dyr); if (h2.d < 45) { decals.push({x: cx + dxr * h2.d, y: cy + dyr * h2.d, h: camH + (Math.random() - .5) * .1, t0: now}); if (decals.length > 70) decals.shift(); } }
  let g = ctx.createLinearGradient(0, 0, 0, horizon); g.addColorStop(0, "#090c11"); g.addColorStop(1, pal.ceil); ctx.fillStyle = g; ctx.fillRect(0, 0, W, Math.ceil(horizon));
  g = ctx.createLinearGradient(0, horizon, 0, H); g.addColorStop(0, "#0b0e13"); g.addColorStop(1, pal.floor); ctx.fillStyle = g; ctx.fillRect(0, Math.floor(horizon), W, H - horizon + 1);
  if (qual < 2) { ctx.fillStyle = "rgba(255,255,255,.045)"; for (let d = 1.5; d < 16; d += 1.5) { ctx.fillRect(0, horizon + proj * camH / d, W, 1); ctx.fillRect(0, horizon - proj * (WALLH - camH) / d, W, 1); } }
  // 벽 + 낮은 엄폐
  const colW = Math.max(2, Math.ceil(W / (qual >= 1 ? 260 : 440))), cols = Math.ceil(W / colW), depth = new Float32Array(cols), lowD = new Float32Array(cols).fill(1e9), lowTop = new Float32Array(cols);
  for (let i = 0; i < cols; i++) {
    const ra = camA + Math.atan(((i + .5) / cols - .5) * 2 * tanH), dx = Math.cos(ra), dy = Math.sin(ra), hit = cast(cx, cy, dx, dy), cosd = Math.cos(ra - camA);
    const perp = Math.max(.06, hit.d * cosd); depth[i] = perp;
    const hg = proj * WALLH / perp, top = horizon - (WALLH - camH) * proj / perp, x = i * colW, lv = Math.round(32 * Math.max(.1, 1 - perp / 21) * (hit.side ? .8 : 1));
    ctx.fillStyle = lut[hit.t][lv]; ctx.fillRect(x, top, colW + 1, hg);
    const fr = (((hit.side ? cx + dx * hit.d : cy + dy * hit.d) % 1) + 1) % 1;
    if (qual < 2) {
      ctx.fillStyle = "rgba(0,0,0,.26)"; ctx.fillRect(x, top + hg * .9, colW + 1, hg * .1);
      if (hit.t === 2) { ctx.fillStyle = "rgba(255,255,255,.13)"; ctx.fillRect(x, top + hg * .08, colW + 1, hg * .3); if (fr < .07 || fr > .93) { ctx.fillStyle = "rgba(10,30,50,.55)"; ctx.fillRect(x, top, colW + 1, hg); } ctx.fillStyle = "rgba(10,30,50,.5)"; ctx.fillRect(x, top + hg * .5, colW + 1, Math.max(1, hg * .012)); }
      else if (hit.t === 3) { const q = (fr * 3) % 1; if (q < .06) { ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fillRect(x, top, colW + 1, hg); } else if (q > .44 && q < .56) { ctx.fillStyle = "rgba(240,230,200,.5)"; ctx.fillRect(x, top + hg * .48, colW + 1, hg * .05); } }
      else if (hit.t === 4) { if (Math.floor(fr * 6) % 2) { ctx.fillStyle = "rgba(240,200,60,.55)"; ctx.fillRect(x, top + hg * .78, colW + 1, hg * .12); } }
      else if (fr < .035) { ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fillRect(x, top, colW + 1, hg); }
    }
    const lw = hit.low;
    if (lw) {
      const pl = Math.max(.06, lw.d * cosd), lh = LOWH * proj / pl, ltop = horizon - (LOWH - camH) * proj / pl, ll = Math.round(32 * Math.max(.1, 1 - pl / 21) * (lw.side ? .8 : 1));
      lowD[i] = pl; lowTop[i] = ltop; ctx.fillStyle = lut[3][ll]; ctx.fillRect(x, ltop, colW + 1, lh);
      if (qual < 2) { ctx.fillStyle = "rgba(255,238,205,.4)"; ctx.fillRect(x, ltop, colW + 1, Math.max(1, lh * .09)); ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(x, ltop + lh * .86, colW + 1, lh * .14); }
    }
  }
  // 스프라이트
  const list = [];
  const place = (ox, oy) => { const dx = ox - cx, dy = oy - cy, d = Math.hypot(dx, dy), da = adiff(Math.atan2(dy, dx), camA), perp = d * Math.cos(da); if (perp < .12 || Math.abs(da) > 1.45 || Math.abs(da) > fov / 2 + .6) return null; return {perp, sx: W / 2 + Math.tan(da) * proj, d}; };
  for (const q of S.players) { if (!q.alive || q.hidden || q === cp) continue; const p = place(q.rx, q.ry); if (p && !segSmoke(S, cx, cy, q.rx, q.ry)) list.push({ty: 0, o: q, ...p}); }
  for (const s of S.smokes) { if (S.t >= s.end) continue; const p = place(s.x, s.y); if (p) list.push({ty: 1, o: s, ...p}); }
  for (const n of S.nades) { const p = place(n.x, n.y); if (p) list.push({ty: 2, o: n, ...p}); }
  for (const dc of decals) { if (now - dc.t0 > 9000) continue; const p = place(dc.x, dc.y); if (p) list.push({ty: 5, o: dc, ...p}); }
  if (S.bomb.st === "planted" || S.bomb.st === "dropped") { const p = place(S.bomb.x, S.bomb.y); if (p) list.push({ty: 3, o: S.bomb, ...p}); }
  for (const s of [map.A, map.B]) { const p = place(s.x, s.y); if (p) list.push({ty: 4, o: s, ...p}); }
  list.sort((a, b) => b.perp - a.perp);
  const floorY = perp => horizon + proj * camH / perp;
  for (const it of list) {
    const {perp, sx} = it, fy = floorY(perp), cc = clamp(Math.floor(sx / colW), 0, cols - 1), centerVis = depth[cc] > perp - .05;
    if (it.ty === 0) {
      const q = it.o, u = proj * .66 / perp, ally = q.team === me.team, col = ally ? ALLY : FOE, an = animOf(q, now);
      const rx = -Math.sin(camA), ry = Math.cos(camA), fxv = Math.cos(q.ra), fyv = Math.sin(q.ra), fx = fxv * rx + fyv * ry, fz = fxv * Math.cos(camA) + fyv * Math.sin(camA);
      const x0 = sx - u * .95, x1 = sx + u * .95, c0 = clamp(Math.floor(x0 / colW), 0, cols - 1), c1 = clamp(Math.floor(x1 / colW), 0, cols - 1), path = new Path2D(); let vis = 0;
      for (let c = c0; c <= c1; c++) { if (depth[c] <= perp - .05) continue; path.rect(c * colW, -400, colW + .6, (lowD[c] < perp ? lowTop[c] : H + 200) + 400); vis++; }
      const jz = (q.z || 0) * proj / perp;
      if (centerVis || vis) {   // 발밑 링: 팀 색 + 아군은 원, 적은 마름모
        ctx.save(); ctx.clip(path); ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, u * .03); ctx.globalAlpha = .9; ctx.beginPath(); ctx.ellipse(sx, fy, u * .3, u * .06 + 1, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = .28; ctx.fillStyle = "#000"; ctx.fill(); ctx.restore();
      }
      const hf = now - (hitFlash[q.i] || -9999) < 110;
      if (vis) { ctx.save(); ctx.clip(path); drawChar(ctx, q, {sx: sx + (hf ? (Math.random() - .5) * u * .05 : 0), fy, u, col, ally, fx, fz, an, S, now, atk: S.atk, flash: hf}); ctx.restore(); }
      if (centerVis) {
        const topY = fy - jz - u * (q.st === 2 ? .32 : q.st === 1 ? .95 : 1.04), fs = clamp(u * .14, 10, 18);
        ctx.textAlign = "center"; ctx.font = `800 ${fs}px system-ui`; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(6,10,18,.92)"; ctx.fillStyle = col;
        if (ally) { const lab = "● " + kname(q.k); ctx.strokeText(lab, sx, topY - 5); ctx.fillText(lab, sx, topY - 5); ctx.fillStyle = "#0a0f18"; ctx.fillRect(sx - 20, topY - fs - 11, 40, 5); ctx.fillStyle = ALLY; ctx.fillRect(sx - 20, topY - fs - 11, 40 * q.hp / 100, 5);
          if (S.bomb.st === "carried" && S.bomb.holder === q.i) { ctx.fillStyle = "#ffcf6a"; ctx.strokeText("폭탄", sx, topY - fs - 15); ctx.fillText("폭탄", sx, topY - fs - 15); } }
        else {
          const lab = "▼ " + Math.round(it.d) + "m"; ctx.font = `900 ${clamp(u * .17, 12, 22)}px system-ui`; ctx.strokeText(lab, sx, topY - 4); ctx.fillText(lab, sx, topY - 4);
        }
      }
    } else if (it.ty === 1) {
      const s = it.o; if (depth[cc] < perp - .4) continue; const age = S.t - s.t0, a = clamp(age / .5, 0, 1) * clamp((s.end - S.t) / 1.5, 0, 1), rr = s.r * Math.min(1, age / .9 + .15) * proj / perp, ry = Math.min(H * .9, proj * WALLH * .62 / perp);
      ctx.save(); ctx.translate(sx, horizon + proj * (camH - .5) / perp); ctx.scale(1, ry / Math.max(1, rr)); const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
      gr.addColorStop(0, `rgba(176,182,194,${.98 * a})`); gr.addColorStop(.7, `rgba(150,156,168,${.9 * a})`); gr.addColorStop(1, "rgba(150,156,168,0)"); ctx.fillStyle = gr; ctx.fillRect(-rr, -rr, rr * 2, rr * 2); ctx.restore();
    } else if (it.ty === 2) {
      const n = it.o, el = proj * .45 / perp * Math.sin(Math.PI * clamp((S.t - n.t0) / .75, 0, 1)), r = Math.max(3, proj * .07 / perp), a2 = art(["frag", "smoke", "flash"][n.type]);
      if (centerVis && a2) { const hh = r * 3.2, ww = hh * a2.w / a2.h; ctx.drawImage(a2.cv, sx - ww / 2, fy - hh - el, ww, hh); }
    } else if (it.ty === 3) {
      if (!centerVis) continue; const bw = proj * .36 / perp, a3 = art("bomb"), bh = bw * a3.h / a3.w, blink = it.o.st === "planted" && Math.floor(S.t * (2 + Math.max(0, 5 - (it.o.end - S.t) / 6))) % 2;
      ctx.drawImage(a3.cv, sx - bw / 2, fy - bh, bw, bh); if (blink) { ctx.fillStyle = "rgba(255,70,50,.55)"; ctx.beginPath(); ctx.arc(sx, fy - bh * .5, bw * .3, 0, TAU); ctx.fill(); }
    } else if (it.ty === 5) {
      const dc = it.o; if (depth[cc] < perp - .35) continue; const age = now - dc.t0, yy = horizon - (dc.h - camH) * proj / perp, rr = Math.max(1.6, proj * .026 / perp); ctx.fillStyle = "rgba(12,12,16,.72)"; ctx.beginPath(); ctx.arc(sx, yy, rr, 0, TAU); ctx.fill(); if (age < 140) { ctx.fillStyle = `rgba(255,200,90,${.9 * (1 - age / 140)})`; ctx.beginPath(); ctx.arc(sx, yy, rr * 3.2, 0, TAU); ctx.fill(); }
    } else if (it.ty === 4) {
      if (!centerVis || perp > 18) continue; const fs = clamp(proj * .5 / perp, 14, 56); ctx.font = `900 ${fs}px system-ui`; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "#0a0f18";
      const act = S.bomb.st === "planted" && S.bomb.site === it.o.l; ctx.fillStyle = act ? "#ff5a6a" : "#ffe08a"; ctx.globalAlpha = .85; const ly = horizon - proj * (.85 - camH) / perp; ctx.strokeText(it.o.l, sx, ly); ctx.fillText(it.o.l, sx, ly); ctx.globalAlpha = 1;
    }
  }
  ctx.textAlign = "start";
  for (const s of S.smokes) if (S.t < s.end && Math.hypot(cx - s.x, cy - s.y) < s.r * .8) { ctx.fillStyle = "rgba(160,166,178,.96)"; ctx.fillRect(0, 0, W, H); break; }
  if (self && cp.alive && !(cp.zoom && wd.scope)) drawView(ctx, W, H, cp, S, now, wd, S.atk);
  drawScope(ctx, W, H, cp, wd);
  fxDraw(ctx, dt, W, H, now);
  if (now - lightFlashAt < 60) { ctx.fillStyle = `rgba(255,224,160,${.14 * (1 - (now - lightFlashAt) / 60)})`; ctx.fillRect(0, 0, W, H); }
  if (me.hp < 35 && me.alive) { const v = ctx.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, Math.hypot(W, H) * .55); v.addColorStop(0, "rgba(220,30,50,0)"); v.addColorStop(1, `rgba(220,30,50,${.35 + .15 * Math.sin(now / 160)})`); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H); }
  if (S.t - me.hitAt < .9 && me.alive) {
    const rel = adiff(me.hitDir, camA), a = 1 - (S.t - me.hitAt) / .9, R = Math.min(W, H) * .26; ctx.strokeStyle = `rgba(255,60,70,${a})`; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(W / 2, H / 2, R, rel - Math.PI / 2 - .35, rel - Math.PI / 2 + .35); ctx.stroke();
    ctx.fillStyle = `rgba(255,60,70,${a * .25})`; ctx.fillRect(0, 0, W, H);
  }
  if (me.blind > 0) { ctx.fillStyle = `rgba(0,0,0,${clamp(me.blind / 1.3, 0, 1) * .97})`; ctx.fillRect(0, 0, W, H); }   // 섬광탄: 눈이 안 아프게 흰색 대신 검은 화면
  drawCross(ctx, W, H, cp, wd, proj, S, self);
  drawHud(ctx, W, H, S, me, cp, map, now, proj, camA);
}
function drawScope(ctx, W, H, p, wd) {
  if (!(p.zoom && wd.scope)) return; const R = Math.min(W, H) * .44; ctx.save(); ctx.fillStyle = "#000"; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(W / 2, H / 2, R, 0, TAU, true); ctx.fill("evenodd");
  ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(W / 2 - R, H / 2); ctx.lineTo(W / 2 + R, H / 2); ctx.moveTo(W / 2, H / 2 - R); ctx.lineTo(W / 2, H / 2 + R); ctx.stroke(); ctx.restore();
}
function drawCross(ctx, W, H, p, wd, proj, S, self) {
  if (!p.alive || !self || (p.zoom && wd.scope) || wd.t === "x" || wd.t === "b") return;
  const sp = wd.t === "k" ? 0 : Math.tan(Math.min(.2, spread(p, wd))) * proj, gap = clamp(4 + sp, 4, 70), x = W / 2, y = H / 2;
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * gap, y + dy * gap); ctx.lineTo(x + dx * (gap + 9), y + dy * (gap + 9)); } ctx.stroke();
  ctx.lineWidth = 1.5; ctx.strokeStyle = "#f6f2e6"; ctx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * gap, y + dy * gap); ctx.lineTo(x + dx * (gap + 9), y + dy * (gap + 9)); } ctx.stroke();
  const ha = performance.now() - hitAt; if (ha < 200) { ctx.strokeStyle = hitHead ? "#ff5a4a" : "#ffffff"; ctx.lineWidth = hitHead ? 3 : 2; const r = hitHead ? 14 : 10; ctx.beginPath(); for (const sx of [-1, 1]) for (const sy of [-1, 1]) { ctx.moveTo(x + sx * 5, y + sy * 5); ctx.lineTo(x + sx * r, y + sy * r); } ctx.stroke(); }
}
function spread(p, wd) { let s = (wd.sp || 0) + (wd.mv || 0) * p.mf; if (p.st === 1) s *= .8; else if (p.st === 2) s *= .55; if (p.zoom) s *= wd.scope ? (p.mf > .2 ? 1.5 : .12) : .6; else if (wd.scope) s += .03; return s + kick * .02 + ((p.z || 0) > .02 ? .08 : 0); }
const mmCache = {};
function drawMini(ctx, W, H, S, me, cp, map, camA, size, ox, oy) {
  let c = mmCache[map.id]; if (!c) { c = document.createElement("canvas"); const k = 5; c.width = map.w * k; c.height = map.h * k; const g = c.getContext("2d"); g.fillStyle = "rgba(8,12,20,.8)"; g.fillRect(0, 0, c.width, c.height);
    const col = ["", "#6b7a99", "#6fb4d6", "#b78a55", "#9aa3b5", "#8a6a45"]; for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) { const t = map.grid[y * map.w + x]; if (t) { g.fillStyle = col[t]; g.fillRect(x * k, y * k, k, k); } } mmCache[map.id] = c; }
  const sc = size / Math.max(map.w, map.h), mw = map.w * sc, mh = map.h * sc; ctx.save(); ctx.globalAlpha = .88; ctx.drawImage(c, ox, oy, mw, mh); ctx.globalAlpha = 1;
  ctx.strokeStyle = "#8aa0c8"; ctx.lineWidth = 1; ctx.strokeRect(ox, oy, mw, mh);
  ctx.font = "800 10px system-ui"; ctx.textAlign = "center"; for (const s of [map.A, map.B]) { ctx.fillStyle = S.bomb.st === "planted" && S.bomb.site === s.l ? "#ff5a6a" : "#ffe08a"; ctx.fillText(s.l, ox + s.x * sc, oy + s.y * sc + 3); }
  for (const q of S.players) {
    if (!q.alive || q.hidden) continue; const mine = q.team === me.team, seen = S.t - (q.spot[me.team] || -9) < 1.4; if (!mine && !seen) continue;
    const x = ox + q.rx * sc, y = oy + q.ry * sc; ctx.fillStyle = mine ? ALLY : FOE; ctx.strokeStyle = "#06090f"; ctx.lineWidth = 1.5; ctx.beginPath();
    if (mine) ctx.arc(x, y, 3.6, 0, TAU); else { ctx.moveTo(x - 4.2, y - 3.4); ctx.lineTo(x + 4.2, y - 3.4); ctx.lineTo(x, y + 4.2); ctx.closePath(); }
    ctx.fill(); ctx.stroke();
    if (q === cp) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 5.6, 0, TAU); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(camA) * 10, y + Math.sin(camA) * 10); ctx.stroke(); }
  }
  if (S.bomb.st === "dropped" || S.bomb.st === "planted") { ctx.fillStyle = "#ff5a4a"; ctx.fillRect(ox + S.bomb.x * sc - 3, oy + S.bomb.y * sc - 3, 6, 6); }
  ctx.restore();
}
const GNAME = ["수류탄", "연막탄", "섬광탄"];
function drawVitals(ctx, x, y, w, me, now, big) {
  const low = me.hp < 30, blink = low && Math.floor(now / 240) % 2, hh = big ? 24 : 18;
  ctx.save(); ctx.fillStyle = "rgba(8,13,22,.82)"; ctx.fillRect(x - 5, y - 5, w + 10, 12 + hh + 12); ctx.strokeStyle = low ? (blink ? "#ff3a4a" : "#7a1a24") : "#44577a"; ctx.lineWidth = 2; ctx.strokeRect(x - 5, y - 5, w + 10, 12 + hh + 12);
  ctx.fillStyle = "#1c2a3f"; ctx.fillRect(x, y, w, 9); ctx.fillStyle = "#74b8ff"; ctx.fillRect(x, y, w * clamp(me.armor, 0, 100) / 100, 9);
  ctx.font = "800 10px system-ui"; ctx.textAlign = "left"; ctx.fillStyle = "#e6f1ff"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.8)"; ctx.strokeText("방탄 " + Math.round(me.armor), x + 4, y + 8); ctx.fillText("방탄 " + Math.round(me.armor), x + 4, y + 8);
  const y2 = y + 12; ctx.fillStyle = "#2a1620"; ctx.fillRect(x, y2, w, hh);
  ctx.fillStyle = low ? (blink ? "#ff2f40" : "#b3202c") : me.hp < 55 ? "#f2b43a" : "#4fd47f"; ctx.fillRect(x, y2, w * clamp(me.hp, 0, 100) / 100, hh);
  ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + w * i / 4, y2); ctx.lineTo(x + w * i / 4, y2 + hh); ctx.stroke(); }
  // 모양: 정상=십자, 위험=경고 삼각형(색약 대응)
  const ix = x + hh * .6, iy = y2 + hh / 2; ctx.fillStyle = "#fff"; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.lineWidth = 3;
  if (low) { ctx.beginPath(); ctx.moveTo(ix, iy - hh * .38); ctx.lineTo(ix + hh * .42, iy + hh * .34); ctx.lineTo(ix - hh * .42, iy + hh * .34); ctx.closePath(); ctx.stroke(); ctx.fillStyle = "#ffe14a"; ctx.fill(); ctx.fillStyle = "#14181f"; ctx.fillRect(ix - 1.4, iy - hh * .14, 2.8, hh * .26); ctx.fillRect(ix - 1.4, iy + hh * .18, 2.8, 2.8); }
  else { ctx.beginPath(); ctx.rect(ix - hh * .12, iy - hh * .34, hh * .24, hh * .68); ctx.rect(ix - hh * .34, iy - hh * .12, hh * .68, hh * .24); ctx.stroke(); ctx.fill(); }
  ctx.font = `900 ${big ? 17 : 14}px system-ui`; ctx.textAlign = "right"; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.strokeText(String(Math.ceil(me.hp)), x + w - 6, y2 + hh - (big ? 5 : 4)); ctx.fillStyle = "#fff"; ctx.fillText(String(Math.ceil(me.hp)), x + w - 6, y2 + hh - (big ? 5 : 4));
  ctx.restore();
}
function drawSlots(ctx, x, y, w, h, me, S, compact) {
  const gap = compact ? 3 : 6, sw = (w - gap * 4) / 5, atk = S.atk, g3 = me.gren;
  const slots = [
    {k: "1", key: me.pw, ammo: me.pw ? me.clip[0] + "/" + me.res[0] : "", on: me.w === 0, have: !!me.pw, lab: me.pw ? WP[me.pw].f : "없음", low: me.pw && me.clip[0] === 0},
    {k: "2", key: "pistol", ammo: me.clip[1] + "/" + me.res[1], on: me.w === 1, have: true, lab: "권총", low: me.clip[1] === 0},
    {k: "3", key: "knife", ammo: "∞", on: me.w === 2, have: true, lab: "단검"},
    {k: "4", key: ["frag", "smoke", "flash"][me.gsel | 0], on: me.w === 3, have: g3[0] + g3[1] + g3[2] > 0, nade: true},
    {k: "5", key: me.team === atk ? "bomb" : "kit", on: me.w === 4, have: me.team === atk ? S.bomb.holder === me.i : !!me.kit, lab: me.team === atk ? "폭탄" : "키트"}];
  slots.forEach((s, i) => {
    const sx = x + i * (sw + gap); ctx.save();
    ctx.fillStyle = s.on ? "rgba(88,68,16,.94)" : "rgba(8,13,22,.8)"; ctx.fillRect(sx, y, sw, h); ctx.lineWidth = s.on ? 3 : 1.5; ctx.strokeStyle = s.on ? "#ffd35a" : "#4b5b7a"; ctx.strokeRect(sx + 1, y + 1, sw - 2, h - 2);
    const a = s.key && GK.art(s.key, GK.getSkin(s.key)); ctx.globalAlpha = s.have ? 1 : .35;
    if (a) { const iw = sw - 8, ih = h * .5, sc2 = Math.min(iw / a.w, ih / a.h); ctx.drawImage(a.cv, sx + (sw - a.w * sc2) / 2, y + h * .2 + (ih - a.h * sc2) / 2, a.w * sc2, a.h * sc2); }
    ctx.globalAlpha = 1; ctx.textAlign = "left"; ctx.font = `800 ${compact ? 10 : 12}px system-ui`; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.8)"; ctx.fillStyle = s.on ? "#ffe9a6" : "#c4d2ea"; ctx.strokeText(s.k, sx + 4, y + (compact ? 11 : 13)); ctx.fillText(s.k, sx + 4, y + (compact ? 11 : 13));
    ctx.textAlign = "center"; ctx.font = `800 ${compact ? 9.5 : 11}px system-ui`; const ty = y + h - (compact ? 4 : 5);
    let tx = s.ammo || s.lab || "", col = s.have ? "#f2f6ff" : "#7d8798"; if (s.low) col = "#ff8a7a";
    if (s.nade) { const n = g3[me.gsel | 0]; tx = GNAME[me.gsel | 0] + " ×" + n; col = n > 0 ? "#f2f6ff" : "#7d8798"; for (let t = 0; t < 3; t++) { ctx.fillStyle = g3[t] > 0 ? (t === (me.gsel | 0) ? "#ffd35a" : "#8fe0a0") : "#3a4558"; ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx + sw - 7 - (2 - t) * 7, y + 9, 2.8, 0, TAU); ctx.fill(); ctx.stroke(); } }
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.fillStyle = col; ctx.strokeText(tx, sx + sw / 2, ty); ctx.fillText(tx, sx + sw / 2, ty); ctx.restore();
  });
}
function drawHud(ctx, W, H, S, me, cp, map, now, proj, camA) {
  const compact = W < 640, B = S.bomb;
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  const txt = (t, x, y, size, color, align) => { ctx.font = `800 ${size}px system-ui`; ctx.textAlign = align || "center"; ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(6,10,18,.85)"; ctx.strokeText(t, x, y); ctx.fillStyle = color; ctx.fillText(t, x, y); };
  const secs = S.phase === "buy" ? Math.max(0, Math.ceil(S.phaseEnd - S.t)) : B.st === "planted" ? Math.max(0, Math.ceil(B.end - S.t)) : S.phase === "live" ? Math.max(0, Math.ceil(S.phaseEnd - S.t)) : 0;
  const bw = compact ? 166 : 260, bx = W / 2 - bw / 2, by = 8; ctx.fillStyle = "rgba(8,13,22,.78)"; ctx.fillRect(bx, by, bw, 38);
  ctx.fillStyle = ALLY; ctx.fillRect(bx, by, 4, 38); ctx.fillStyle = FOE; ctx.fillRect(bx + bw - 4, by, 4, 38);
  txt("● " + S.score[me.team], bx + bw * .2, by + 26, 20, ALLY); txt(S.score[1 - me.team] + " ▼", bx + bw * .8, by + 26, 20, FOE);
  const mm = String(Math.floor(secs / 60)), ss = String(secs % 60).padStart(2, "0"); txt(mm + ":" + ss, W / 2, by + 25, 19, B.st === "planted" ? "#ff6a5a" : "#fff");
  txt(`라운드 ${S.ro}/${CFG.maxRounds} · ${me.team === S.atk ? "공격" : "수비"}${S.phase === "buy" ? " · 구매" : ""}`, W / 2, by + 54, 11, "#cfe0f5");
  if (B.st === "planted") txt(B.site + " 지점 폭탄 · " + (me.team === S.atk ? "지키세요" : "해체하세요"), W / 2, by + 68, 12, "#ff8a7a");
  else if (S.phase === "live" && me.team === S.atk && B.st === "carried" && B.holder === me.i) txt("폭탄을 들고 있어요", W / 2, by + 68, 12, "#ffe08a");
  else if (S.phase === "live" && me.team === S.atk && B.st === "dropped") txt("폭탄이 바닥에 있어요", W / 2, by + 68, 12, "#ffe08a");
  const mini = compact ? 88 : 132; drawMini(ctx, W, H, S, me, cp, map, camA, mini, 8, 8);
  const wk = wpKey(me), d = WP[wk], ci2 = wk === "pistol" ? 1 : 0, mmH = mini * (map.h / Math.max(map.w, map.h));
  if (compact) {
    drawVitals(ctx, 12, 8 + mmH + 14, 132, me, now, false);
    const ay = 8 + mmH + 14 + 56;
    if (d.t === "x") txt(`${GNAME[me.gsel | 0]} ×${me.gren[me.gsel | 0]}`, 12, ay, 13, "#f5f1e6", "left"); else if (d.t === "b") txt(wk === "bomb" ? "폭탄" : "해체 키트", 12, ay, 13, "#f5f1e6", "left");
    else if (d.t !== "k") txt(`${d.n}  ${me.clip[ci2]} / ${me.res[ci2]}${me.load > 0 ? " · 장전" : ""}`, 12, ay, 12, me.clip[ci2] === 0 ? "#ff8a7a" : "#f5f1e6", "left"); else txt(d.n, 12, ay, 13, "#f5f1e6", "left");
    drawSlots(ctx, 104, 80, W - 112, 46, me, S, true);
  } else {
    const vw = Math.min(360, W * .42); drawVitals(ctx, 12, H - 112, vw, me, now, true);
    const sw2 = Math.min(430, W * .5); drawSlots(ctx, 12, H - 64, sw2, 54, me, S, false);
    const ax = W - 14, ay = H - 30;
    if (d.t === "x") txt(`${GNAME[me.gsel | 0]} ×${me.gren[me.gsel | 0]}`, ax, ay, 22, "#f5f1e6", "right"); else if (d.t === "b") txt(wk === "bomb" ? "폭탄" : "해체 키트", ax, ay, 22, "#f5f1e6", "right");
    else if (d.t !== "k") txt(`${d.n}  ${me.clip[ci2]} / ${me.res[ci2]}${me.load > 0 ? " · 장전 중" : ""}`, ax, ay, 22, me.clip[ci2] === 0 ? "#ff8a7a" : "#f5f1e6", "right"); else txt(d.n, ax, ay, 22, "#f5f1e6", "right");
  }
  if (heldPop && now - heldPop.t0 < 1400) { const a = clamp(Math.min((now - heldPop.t0) / 90, (1400 - (now - heldPop.t0)) / 400), 0, 1); ctx.globalAlpha = a; txt(heldPop.text, W / 2, H * (compact ? .64 : .7), compact ? 24 : 30, "#ffe9a6"); ctx.globalAlpha = 1; } else heldPop = null;
  let fy = compact ? 190 : 50, shownN = 0; ctx.textAlign = "right";
  for (const f of S.feed) {
    if (S.t - f[6] > 6 || compact && shownN >= 3) continue; shownN++; const kA = f[4] === me.team, vA = f[5] === me.team;
    const label = compact ? `${kA ? "●" : "▼"} ${kname(f[0])} ${f[3] ? "◉" : "▸"} ${vA ? "●" : "▼"} ${kname(f[1])}` : `${kA ? "●" : "▼"} ${kname(f[0])}  ${f[3] ? "헤드샷 " : ""}${f[2]} ▸ ${vA ? "●" : "▼"} ${kname(f[1])}`;
    ctx.font = "700 12px system-ui"; const wid = NAME2ID[f[2]], ic = wid && GK.art(wid, GK.getSkin(wid)), iw = ic ? 34 : 0, tw = ctx.measureText(label).width + 12 + iw; ctx.fillStyle = "rgba(8,13,22,.8)"; ctx.fillRect(W - 8 - tw, fy - 12, tw, 18); if (ic) { const ih = Math.min(14, 30 * ic.h / ic.w); ctx.drawImage(ic.cv, W - 8 - tw + 4, fy - 12 + (18 - ih) / 2, ih * ic.w / ic.h, ih); } ctx.fillStyle = kA ? ALLY : FOE; ctx.fillText(label, W - 14, fy); fy += 21;
  }
  const job = jobNow(S, cp);
  if (me.prog > 0) { const bw2 = 190, x = W / 2 - bw2 / 2, y = H * .62; ctx.fillStyle = "rgba(8,13,22,.8)"; ctx.fillRect(x, y, bw2, 16); ctx.fillStyle = me.job === 2 ? "#8fd8ff" : "#ffcf6a"; ctx.fillRect(x, y, bw2 * me.prog, 16); txt(me.job === 2 ? "해체 중..." : "설치 중...", W / 2, y - 6, 14, "#fff"); }
  else if (job && cp === me) txt(job === 1 ? "E 길게 눌러 설치 (움직이지 마세요)" : "E 길게 눌러 해체", W / 2, H * .62, 15, "#ffe08a");
  if (banner) { const t = now - banner.t0; if (t > banner.dur) banner = null; else { const a = clamp(Math.min(t / 140, (banner.dur - t) / 400), 0, 1); ctx.globalAlpha = a; txt(banner.text, W / 2, H * .3, compact ? 30 : 42, banner.color); if (banner.sub) txt(banner.sub, W / 2, H * .3 + 24, 15, "#f0f4ff"); ctx.globalAlpha = 1; } }
  if (killPop) { const t = now - killPop.t0; if (t > 1500) killPop = null; else { const a = clamp(Math.min(t / 100, (1500 - t) / 400), 0, 1), s2 = 1 + Math.max(0, .3 - t / 300); ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H * .43); ctx.scale(s2, s2); ctx.strokeStyle = "#ffd35a"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.stroke(); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-11, -11); ctx.lineTo(11, 11); ctx.moveTo(11, -11); ctx.lineTo(-11, 11); ctx.stroke(); ctx.restore(); const L = ["", "", "더블 킬", "트리플 킬", "쿼드라 킬", "에이스"][Math.min(killPop.n, 5)]; ctx.globalAlpha = a; txt(L || "처치", W / 2, H * .43 + 52, 20, "#ffd35a"); txt(killPop.name, W / 2, H * .43 + 72, 13, "#f0f4ff"); ctx.globalAlpha = 1; } }
  if (S.phase === "buy" && !me.ready && cp === me && !needMouse()) txt(`구매 시간 ${secs}초 · B 로 구매`, W / 2, H * .46, 16, "#ffe08a");
  if (cp !== me && !S.done) txt(`관전: ${kname(cp.k)} (화면을 누르면 다음)`, W / 2, H - (compact ? 160 : 140), 14, "#fff");
  if (S.phase === "post" && S.lastEnd && !banner) txt(S.lastEnd.reason, W / 2, H * .3, 24, "#fff");
  if (!compact && !isLocked() && !noLock() && !needMouse() && S.phase !== "post" && !S.done && me.alive && Math.floor(now / 500) % 2) txt("클릭하면 마우스가 화면에 고정돼요", W / 2, H * .56, 15, "#ffe08a");
  ctx.textAlign = "start";
}
function jobNow(S, p) {
  if (!p.alive || S.phase !== "live") return 0; const B = S.bomb, map = S.map;
  if (p.team === S.atk && B.st === "carried" && B.holder === p.i) { for (const s of [map.A, map.B]) if (Math.hypot(p.rx - s.x, p.ry - s.y) < 2.3) return 1; }
  if (p.team !== S.atk && B.st === "planted" && Math.hypot(p.rx - B.x, p.ry - B.y) < 1.9) return 2; return 0;
}

/* ---------- DOM 갱신: 구매창·점수판·결과·버튼 ---------- */
const score = p => p.kills * 3 + p.assists + p.plants * 2 + p.defuses * 2 + p.hs;
function tableHTML(S, meI, full) {
  const rows = t => S.players.filter(p => p.team === t).sort((a, b) => score(b) - score(a)).map(p => `<tr class="${p.i === meI ? "me" : ""}"><td>${TEAM[t].g} ${kname(p.k)}${p.i >= 10 ? " ②" : ""}${p.human ? " (사람)" : ""}${p.alive ? "" : " ✕"}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.assists}</td><td>${p.hs}</td><td>${score(p)}</td></tr>`).join("");
  return [myTeam, 1 - myTeam].map(t => `<table><caption style="color:${TEAM[t].c}">${TEAM[t].g} ${TEAM[t].n}팀 · ${S.score[t]}승${S.atk === t ? " · 공격" : " · 수비"}</caption><thead><tr><th>기사</th><th>킬</th><th>데스</th><th>어시</th><th>헤드</th><th>점수</th></tr></thead><tbody>${rows(t)}</tbody></table>`).join("");
}
function updateDom(S, me) {
  const buyEl = $("[data-buy]"), useB = $('[data-b="use"]'), buyB = $('[data-b="buy"]');
  const job = jobNow(S, me);
  if (job) { useB.hidden = false; useB.textContent = job === 1 ? "설치" : "해체"; } else useB.hidden = true;
  buyB.hidden = S.phase !== "buy" || !me.alive;
  const showBuy = buyOpen && S.phase === "buy" && me.alive && !S.done; buyEl.hidden = !showBuy;
  syncLock();   // 구매·결과·보관함·나가기 창에서는 마우스 고정을 풀어 커서로 클릭할 수 있게
  if (showBuy) {
    const sig = [me.credits, me.pw, me.armor, me.kit, me.gren.join(""), me.ready, me.team === S.atk, S.ro].join("|");
    if (sig !== buyKey) {
      buyKey = sig;
      buyEl.innerHTML = `<div class="os-bh"><b>구매 · ${me.credits} 크레딧</b><button type="button" data-a="lo-open">보관함</button><button type="button" data-x="close">닫기 B</button></div><p class="os-note">${S.ro === CFG.swapAfter + 1 ? "공수 교대: 크레딧과 장비가 처음 상태로 돌아갔어요." : "살아남으면 무기·방탄·도구가 다음 라운드로 이어져요. 죽으면 사라져서 다시 사야 해요."}</p><div class="os-bg">` + BUYS.filter(b => !b.def || me.team !== S.atk).map(b => {
        const owned = PRIM.includes(b.id) ? me.pw === b.id : b.id === "armor" ? me.armor >= 100 : b.id === "kit" ? me.kit : b.id === "frag" ? me.gren[0] >= 1 : b.id === "smoke" ? me.gren[1] >= 1 : me.gren[2] >= 2;
        return `<button type="button" data-buy="${b.id}" ${owned || me.credits < b.price ? "disabled" : ""}><kbd>${b.key}</kbd><img class="os-bi" alt="" src="${GK.icon(b.id, GK.getSkin(b.id), 64, 26)}"><span>${b.n}</span><small>${owned ? "보유" : b.price}</small></button>`;
      }).join("") + `</div><button type="button" class="os-ready" data-x="ready" ${me.ready ? "disabled" : ""}>${me.ready ? "다른 사람 기다리는 중" : "바로 시작 · 준비 완료 [Enter]"}</button>`;
    }
  }
  const sb = $("[data-score]"); sb.hidden = !scoreOpen; if (scoreOpen) { const html = tableHTML(S, me.i); if (sb.dataset.h !== html) { sb.innerHTML = html; sb.dataset.h = html; } }
  const hud = $("[data-hud]"); hud.textContent = `${TEAM[me.team].g} ${TEAM[me.team].n}팀 · ${S.score[me.team]} : ${S.score[1 - me.team]}`;
  $('[data-b="zoom"]').setAttribute("aria-pressed", String(ctl.padZoom));
  { const gb = $('[data-b="gren"]'); gb.textContent = GNAME[me.gsel | 0].slice(0, 2) + " " + me.gren[me.gsel | 0]; gb.setAttribute("aria-pressed", String(me.w === 3)); $('[data-b="crouch"]').setAttribute("aria-pressed", String(ctl.padCrouch)); }
  if (S.done && shown !== S.id) showResult(S, me);
}
function showResult(S, me) {
  shown = S.id; const win = S.winner === me.team, r = payout(S, me, false), el = $("[data-result]");
  if (hintOn) LS.set("roundb-office-seen", "1");
  el.dataset.outcome = S.winner < 0 ? "draw" : win ? "win" : "loss"; sfx(win ? "win" : "lose");
  $("[data-rt]").textContent = S.winner < 0 ? "무승부" : win ? "승리" : "패배";
  $("[data-rs]").textContent = `${TEAM[me.team].g} 우리 팀 ${S.score[me.team]} : ${S.score[1 - me.team]} 상대 팀 ${TEAM[1 - me.team].g}`;
  const mvp = S.players.filter(p => p.team === S.winner).sort((a, b) => score(b) - score(a))[0];
  $("[data-rp]").textContent = `${me.kills}킬 · ${me.deaths}데스 · ${me.assists}어시 · 헤드샷 ${me.hs}${mvp ? " · MVP " + kname(mvp.k) : ""} · +${(r && r.rp) || 0} RP`;
  $("[data-rtable]").innerHTML = tableHTML(S, me.i, true);
  const again = $('[data-a="again"]'); again.disabled = role === "guest"; again.textContent = role === "guest" ? "방장이 다시 시작해요" : "다시 하기 [Enter]";
  el.hidden = false; document.pointerLockElement && document.exitPointerLock();
}
function payout(S, me, quit) {
  if (paid === S.id) return null; if (quit && S.t < 30) return null; if (!quit && !S.done) return null; paid = S.id;
  try {
    const humans = S.players.filter(p => p.human).length, win = !quit && S.winner === me.team, g = window.knx && window.knx.reward && window.knx.reward.grant;
    return g ? window.knx.reward.grant(ID, {win, place: win ? 1 : 2, players: 10, humans: Math.max(1, humans), online: humans > 1, secs: Math.round(S.t), score: me.kills * 120 + me.plants * 100 + me.defuses * 100 + me.assists * 40, quit: !!quit, once: ID + ":" + S.id}) : null;
  } catch (e) { return null; }
}

/* ---------- 진행 루프 ---------- */
function loop(now) {
  frame = requestAnimationFrame(loop);
  try {
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    if (dt > .026) { slow += dt; fast = 0; if (slow > 2.2 && qual < 2) { qual++; slow = 0; } } else if (dt < .0185) { fast += dt; slow = Math.max(0, slow - dt); if (fast > 8 && qual > 0) { qual--; fast = 0; } } else { slow = Math.max(0, slow - dt * .5); }
    if (role === "guest") {
      if (!st) return;
      const k = 1 - Math.exp(-dt * 18);
      for (const p of st.players) { if (Math.hypot(p.x - p.rx, p.y - p.ry) > 4) { p.rx = p.x; p.ry = p.y; } else { p.rx += (p.x - p.rx) * k; p.ry += (p.y - p.ry) * k; } p.ra += adiff(p.a, p.ra) * k; }
      if (now - sendAt > 45) { sendAt = now; room && room.input(buildInput()); }
    } else if (M) {
      const S = M.S; M.input(0, buildInput()); while (acts.length) M.act(0, acts.shift());
      acc += dt; let n = 0; while (acc >= .02 && n < 4) { M.step(.02); acc -= .02; n++; } if (n === 4) acc = 0;
      for (const p of S.players) { p.rx = p.x; p.ry = p.y; p.ra = p.a; }
      st = S;
      if (role === "host" && room && (now - pubAt > (S.n > 12 ? 95 : 75) || S.done)) {
        pubAt = now; const withR = now - rosAt > 1000 || S.done; if (withR) rosAt = now;
        room.publishEach(g => { if (g >= S.n) return null; const mem = pubMem[g] || (pubMem[g] = {}); if (mem.m !== S.id) { mem.m = S.id; mem.rs = false; } const need = withR || !mem.rs; mem.rs = true; return C.encodeFor(S, g, need, mem); });
      }
    }
    if (!st) return;
    const me = st.players[slot]; if (!me) return; myTeam = me.team;
    if (inspectAt && (ctl.fire || ctl.padFire || ctl.zoom || ctl.padZoom || me.load > 0 || joy.f || joy.s || keys.has("w") || keys.has("a") || keys.has("s") || keys.has("d") || !me.alive || me.w !== inspectW)) inspectAt = 0;
    handleEvents(st, me); updateDom(st, me); draw(dt, now);
  } catch (err) {
    console.error(NAME, err); if (++errN > 30) { cancelAnimationFrame(frame); frame = 0; setMsg("경기 처리 오류가 반복돼 멈췄어요. 나갔다가 다시 들어와 주세요."); toast("오류로 멈췄어요", 4000); }
  }
}

/* ---------- 시작·접속·종료 ---------- */
function showStage(on) { $("[data-menu]").hidden = on; $("[data-stage]").hidden = !on; root.classList.toggle("os-play", on); }
function begin() {
  loadImgs(); cancelAnimationFrame(frame);
  const me = Number(window.lbDbg && window.lbDbg.ME && window.lbDbg.ME.kn) || 0;
  M = createMatch({map: cfg.map, diff: cfg.diff, humans: [0, ...hostSlots], per: cfg.per, me}); GS = null; pubMem = {}; rosAt = 0; st = M.S; slot = 0; evSeen = 0; evFor = ""; shown = ""; buyOpen = true; buyReady = false; buyKey = ""; hd = st.players[0].a; kick = 0; banner = null; errN = 0; acc = 0; paid = ""; scoreOpen = false; specI = 0;
  hintOn = !LS.get("roundb-office-seen"); hintsDone = {}; started = performance.now();
  for (const p of st.players) { p.rx = p.x; p.ry = p.y; p.ra = p.a; }
  $("[data-result]").hidden = true; showStage(true); sizeCanvas(); last = performance.now(); frame = requestAnimationFrame(loop);
  if (touchOnly() || root.classList.contains("os-touch")) toast("왼쪽 화면: 엄지로 이동 · 오른쪽 화면 드래그: 시점 · 오른쪽 버튼: 발사/조준", 5200);
  else toast("클릭하면 마우스가 고정돼요 · 좌클릭 발사 · 우클릭 조준 · B 구매 · Tab 점수판", 5200);
}
function sizeCanvas() { canvas.width = Math.max(240, canvas.clientWidth); canvas.height = Math.max(160, canvas.clientHeight); }
function disconnect(msg) {
  cancelAnimationFrame(frame); frame = 0; try { room && room.close(); } catch (e) {} room = null; role = ""; slot = 0; M = null; GS = null; st = null; hostSlots.clear(); { const pe = root && $("[data-per]"); if (pe) pe.disabled = false; } keys.clear(); ptrs.clear(); joy.on = false; ctl.fire = ctl.zoom = ctl.padFire = ctl.padUse = ctl.padZoom = false; acts.length = 0;
  document.exitPointerLock && document.pointerLockElement && document.exitPointerLock();
  if (root) { showStage(false); $("[data-result]").hidden = true; $("[data-confirm]").hidden = true; $('[data-a="start"]').hidden = true; $("[data-joy]").classList.remove("on"); setMsg(msg || ""); }
}
function connect(next) {
  disconnect(); role = next; setMsg("연결 중…");
  room = createArenaRoom(ID, {
    error(m) { disconnect(m); },
    ready(i, code) { slot = i; setMsg(i ? "방장이 시작하기를 기다리는 중 · 초대 코드 " + code : "초대 코드 " + code + " · 참가자 1명 · 준비되면 '온라인 시작'"); $('[data-a="start"]').hidden = !!i; },
    accept: i => i < 2 * cfg.per && (!M || M.S.done), join(i) { hostSlots.add(i); if (M) M.setHuman(i, true); setMsg("참가자 " + (hostSlots.size + 1) + "명 · 준비되면 '온라인 시작'"); },
    leave(i) { hostSlots.delete(i); if (M) M.setHuman(i, false); setMsg("참가자 " + (hostSlots.size + 1) + "명"); },
    input(i, v) { if (!M) return; M.input(i, v); if (v && typeof v.act === "string") M.act(i, v.act); },
    state(s) {
      if (!s || s.v !== VER) { disconnect("방장이 다른 버전이에요. 둘 다 새로고침한 뒤 다시 들어와 주세요."); return; }
      const nd = C.decodeSnap(s, GS); if (!nd) return;
      const first = !st; GS = nd; st = GS; role = "guest"; slot = s.g;
      if (first) { loadImgs(); showStage(true); sizeCanvas(); hintOn = !LS.get("roundb-office-seen"); hintsDone = {}; hd = GS.players[slot].a; started = performance.now(); cancelAnimationFrame(frame); last = performance.now(); frame = requestAnimationFrame(loop); toast("온라인 경기 시작", 2500); }
      if (shown && shown !== GS.id) { $("[data-result]").hidden = true; paid = ""; }
    }
  });
  $("[data-per]").disabled = true;
  if (next === "host") room.host({listed: $("[data-public]").checked, max: 2 * cfg.per}); else room.join($("[data-code]").value);
}
function askExit() {
  if (!running() || st.done) { root.close(); return; }
  const secs = Math.round(st.t); $("[data-cs]").textContent = secs < 30 ? "30초 안에 나가면 보상이 없어요." : "지금 나가면 이 판은 패배로 처리돼요.";
  $("[data-confirm]").hidden = false;
}
function leave() { const me = st && st.players[slot]; if (me && !st.done) payout(st, me, true); root.close(); }
function onClick(e) {
  const t = e.target.closest("button"); if (!t) return;
  const a = t.dataset.a;
  if (t.dataset.map != null) { cfg.map = +t.dataset.map; saveCfg(); for (const b of root.querySelectorAll("[data-map]")) b.setAttribute("aria-pressed", String(+b.dataset.map === cfg.map)); return; }
  if (t.dataset.diff) { cfg.diff = t.dataset.diff; saveCfg(); for (const b of root.querySelectorAll("[data-diff]")) b.setAttribute("aria-pressed", String(b.dataset.diff === cfg.diff)); return; }
  if (t.dataset.buy) { doAct("buy:" + t.dataset.buy); return; }
  if (t.dataset.x === "close") { buyOpen = false; relock(); return; }
  if (t.dataset.x === "ready") { doAct("ready"); buyOpen = false; relock(); return; }
  if (a === "exit") askExit();
  else if (a === "stay") $("[data-confirm]").hidden = true;
  else if (a === "leave" || a === "leave2") leave();
  else if (a === "lo-open") loOpen();
  else if (a === "sound") { AU.on = !AU.on; GK.sfx.setEnabled(AU.on); LS.set("roundb-office-mute", AU.on ? "0" : "1"); t.textContent = AU.on ? "소리 켬" : "소리 끔"; t.setAttribute("aria-pressed", String(AU.on)); if (AU.on) sfx("by"); }
  else if (a === "solo") { disconnect(); begin(); }
  else if (a === "host") connect("host");
  else if (a === "join") connect("guest");
  else if (a === "start") { if (role === "host") begin(); }
  else if (a === "again") { if (role === "guest") return; $("[data-result]").hidden = true; begin(); }
  else if (a === "menu") { const r = role, c = room; if (r === "host") { M = null; st = null; cancelAnimationFrame(frame); frame = 0; showStage(false); setMsg("설정을 바꾸고 '온라인 시작' 또는 'AI와 바로 시작'을 누르세요"); $('[data-a="start"]').hidden = false; } else disconnect(); }
}
function open() {
  if (!root) { try { build(); bindInput(); loBind(); { const vs = $("[data-vol]"); vs.value = Math.round(GK.sfx.getVolume() * 100); $("[data-volv]").textContent = vs.value + "%"; vs.addEventListener("input", () => { GK.sfx.volume(vs.value / 100); $("[data-volv]").textContent = vs.value + "%"; }); const dn = $("[data-dmgnum]"); dn.checked = cfg.dmgnum; dn.addEventListener("change", () => { cfg.dmgnum = dn.checked; saveCfg(); }); } root.addEventListener("click", onClick); root.addEventListener("close", () => disconnect()); addEventListener("resize", () => { if (root.open && st) sizeCanvas(); }); } catch (e) { console.error(NAME, e); return; } }
  root.showScreen(); loadImgs(); touchy();
}
try {
  games.register({id: ID, name: NAME, tag: "5대5 설치·해체전 · 최대 7라운드", kind: "main", open});
  if (window.roundbRooms) window.roundbRooms.register(ID, code => { open(); $("[data-code]").value = code; connect("guest"); });
  for (const b of document.querySelectorAll('[data-shooter="office-strike"]')) b.addEventListener("click", () => games.open(ID));
} catch (e) { console.error(NAME, e); }
window.RB_OFFICE_UI = {cfg, dbg: () => ({M, st, slot, qual, role, C, GK, ctl, keys, isLocked: isLocked(), lockErr, inspect: () => { inspectAt = performance.now(); inspectW = st.players[slot].w; }})};
try {  // 공용 단축키 안내(index.html knxKeyHints): 모서리 목록 + [⌨ 단축키] 토글, 저장키 roundb.keyhints.v1
  if (window.knxKeyHints) window.knxKeyHints({id: "officestrike", screen: () => !!(root && root.open && st && !$("[data-stage]").hidden && $("[data-lo]").hidden), corner: "bl", bottom: 196, title: "총격전 단축키",
    rows: [["WASD", "이동"], ["마우스", "시점 (클릭=고정)"], ["좌클릭", "발사"], ["우클릭", "조준"], ["R", "장전"], ["E 길게", "설치·해체"], ["1·2·3", "주무기·권총·단검"], ["4", "투척물(연타 순환)"], ["5", "폭탄·키트"], ["Space", "점프"], ["Ctrl/X", "앉기(홀드)"], ["Z", "엎드리기"], ["C", "구르기"], ["F", "총 구경"], ["B", "구매창"], ["Enter", "바로 시작"], ["Tab", "점수판"], ["Shift", "걷기"]]});
} catch (e) { console.error(NAME, e); }
})();
