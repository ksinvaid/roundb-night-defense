/* 라운드비 대난투 — 코어(시뮬레이션·봇·스냅샷). 화면(DOM)을 전혀 쓰지 않아 노드에서 그대로 시험할 수 있다.
   브라우저: window.BrawlCore / 노드: module.exports.  좌표는 '월드 단위'(전장 800 x 1162), 시간은 초. */
(function (root) {
"use strict";
const S = 2.42, MW = 800, MH = 1162, R = 20, NC = 20;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hyp = Math.hypot, rnd = Math.random;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/* ---------------- 전장: 3층·4층 배치도(roadview/plan3f·4f.jpg, 331x480)를 2.42배. 좌표는 배치도 픽셀로 적고 불러올 때 월드로 바꾼다 ---------------- */
const MAPDEF = {
  "3f": {name:"3층 라운지", plan:"roadview/plan3f.jpg", bounds:[14,50,320,464],
    solids:[["wall",12,52,148,88,"창고"],["wall",222,48,100,140,"스튜디오"],["wall",220,188,5,44],["wall",220,268,5,62],["wall",12,192,44,48,"실외기실"],
      ["desk",66,145,104,11],
      ["desk",75,197,40,13],["desk",135,197,40,13],["desk",75,236,40,13],["desk",135,236,40,13],
      ["desk",27,273,45,13],["desk",108,273,67,13],["desk",27,313,67,13],["desk",130,313,45,13],
      ["desk",27,353,45,13],["desk",108,353,67,13],["desk",75,389,40,13],["desk",135,389,40,13],
      ["desk",198,285,20,75],["wall",165,418,100,52],["wall",265,362,57,108]],
    spawns:[[30,165],[110,172],[185,100],[270,215],[290,300],[35,432],[100,425],[150,445],[240,395],[60,255]],
    items:[[110,261],[95,300],[150,377],[30,258],[190,150],[270,260],[255,345],[90,445]],
    purifier:[208,375], printers:[[180,300],[270,250]], zc:[130,300]},
  "4f": {name:"4층 공유오피스", plan:"roadview/plan4f.jpg", bounds:[14,50,320,464],
    solids:[["wall",12,52,112,62,"휴게공간"],["wall",222,48,100,135,"회의실"],["wall",220,188,5,44],["wall",220,268,5,62],["wall",10,210,38,40,"실외기실"],
      ["desk",20,137,112,43],["desk",57,188,62,44],["desk",20,288,112,44],["desk",20,365,112,44],
      ["wall",160,118,8,92],["wall",160,250,8,106],["desk",197,272,22,78],["wall",165,418,100,52],["wall",265,362,57,108]],
    spawns:[[150,100],[190,130],[270,215],[290,300],[185,230],[45,440],[110,440],[150,390],[240,395],[290,335]],
    items:[[145,270],[80,255],[80,348],[146,152],[180,380],[270,260],[255,345],[80,450]],
    purifier:[208,365], printers:[[185,300],[270,250]], zc:[140,300]}
};
const MAPS = {};
for (const id in MAPDEF) {
  const d = MAPDEF[id], P = a => ({x:a[0] * S, y:a[1] * S});
  MAPS[id] = {id, name:d.name, plan:d.plan, w:MW, h:MH, bounds:d.bounds.map(v => v * S),
    solids:d.solids.map(s => ({kind:s[0], x:s[1] * S, y:s[2] * S, w:s[3] * S, h:s[4] * S, label:s[5] || ""})),
    spawns:d.spawns.map(P), items:d.items.map(P), purifier:P(d.purifier), printers:d.printers.map(P), zc:P(d.zc), nav:null};
}
function blocked(map, x, y, r) {
  const b = map.bounds;
  if (x - r < b[0] || x + r > b[2] || y - r < b[1] || y + r > b[3]) return true;
  const ss = map.solids;
  for (let i = 0; i < ss.length; i++) {
    const s = ss[i], dx = x - clamp(x, s.x, s.x + s.w), dy = y - clamp(y, s.y, s.y + s.h);
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}
function los(map, x0, y0, x1, y1, r) {
  const d = hyp(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / 14));
  for (let i = 1; i < n; i++) { const t = i / n; if (blocked(map, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r || 3)) return false; }
  return true;
}
const losWide = (map, x0, y0, x1, y1) => los(map, x0, y0, x1, y1, R * .8);

/* ---------------- 길찾기(20단위 격자 너비 우선) ---------------- */
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
function navGrid(map) {
  if (map.nav) return map.nav;
  const cols = Math.ceil(MW / NC), rows = Math.ceil(MH / NC), pass = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) pass[j * cols + i] = blocked(map, (i + .5) * NC, (j + .5) * NC, R - 2) ? 0 : 1;
  return map.nav = {cols, rows, pass, prev:new Int16Array(cols * rows), q:new Int16Array(cols * rows), stamp:new Uint32Array(cols * rows), ver:0};
}
function nearestPass(g, c) {
  const cx = c % g.cols, cy = (c / g.cols) | 0;
  for (let rad = 1; rad < 9; rad++) for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
    const x = cx + dx, y = cy + dy;
    if (x < 0 || y < 0 || x >= g.cols || y >= g.rows) continue;
    if (g.pass[x + y * g.cols]) return x + y * g.cols;
  }
  return c;
}
function navNext(map, x0, y0, x1, y1) {
  const g = navGrid(map), {cols, rows, pass, prev, q, stamp} = g;
  const ci = (x, y) => clamp(Math.floor(x / NC), 0, cols - 1) + clamp(Math.floor(y / NC), 0, rows - 1) * cols;
  let s = ci(x0, y0), t = ci(x1, y1);
  if (!pass[t]) t = nearestPass(g, t);
  if (!pass[s]) s = nearestPass(g, s);
  const v = ++g.ver; stamp[s] = v; prev[s] = -1;
  let h = 0, tl = 0, found = false; q[tl++] = s;
  while (h < tl) {
    const c = q[h++];
    if (c === t) { found = true; break; }
    const cx = c % cols, cy = (c / cols) | 0;
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX[d], ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const n = nx + ny * cols;
      if (stamp[n] === v || !pass[n]) continue;
      if (d >= 4 && (!pass[nx + cy * cols] || !pass[cx + ny * cols])) continue;
      stamp[n] = v; prev[n] = c; q[tl++] = n;
    }
  }
  if (!found) return null;
  const path = [];
  for (let c = t; c !== -1; c = prev[c]) path.push(c);
  path.reverse();
  const pt = c => ({x:(c % cols + .5) * NC, y:(((c / cols) | 0) + .5) * NC});
  for (let k = Math.min(path.length - 1, 14); k >= 1; k--) { const p = pt(path[k]); if (losWide(map, x0, y0, p.x, p.y)) return p; }
  return path.length > 1 ? pt(path[1]) : null;
}

/* ---------------- 기사 10인: 역할·기본공격·고유 4스킬(① 기본기 ② 이동기 ③ 광역·제어 ④ 궁극기) ----------------
   t: proj 투사체 · cone 부채꼴 근접 · dash 돌진 · blink 순간이동 · leap 표적 뒤로 도약 · circle 원형 폭발 · zone 바닥 지속 영역 · beam 직선 · trap 덫 · self 자기 강화
   me: 쓰는 순간 나에게 거는 효과 {shield:[양,초] dr:[비율,초] haste:[배,초] amp:[비율,초] invis:초 inv:초 refl:[비율,초] heal:양}
   knock 는 '밀려나는 거리(단위)'. */
const KITS = [
 {n:"서아", role:"근접 딜러", col:"#ffd36b", hp:300, spd:240, pref:[0,80], kr:1,
  basic:{t:"cone", rng:82, ang:110, dmg:17, rate:2, knock:8},
  skills:[{n:"일섬", d:"앞을 크게 베어 밀쳐냅니다", t:"cone", cd:3.2, rng:100, ang:100, dmg:36, knock:60},
          {n:"돌진 베기", d:"돌진하며 부딪힌 적을 벱니다", t:"dash", cd:7, dist:230, spd:950, dmg:26, knock:70},
          {n:"전장 호령", d:"주변을 밀쳐내고 잠깐 빨라집니다", t:"circle", cd:11, r:150, dmg:28, knock:110, stun:.6, me:{haste:[1.3,3]}},
          {n:"기사단 필살", d:"앞 일직선을 꿰뚫는 큰 검기", t:"beam", cd:26, len:420, w:90, dmg:105, knock:150, delay:.4}]},
 {n:"하윤", role:"암살자", col:"#c19bff", hp:230, spd:268, pref:[40,100], kr:1,
  basic:{t:"cone", rng:64, ang:80, dmg:13, rate:3.2, knock:0},
  skills:[{n:"표창 투척", d:"표창 3개를 부채꼴로 던집니다", t:"proj", cd:3.4, spd:800, rng:400, r:9, dmg:20, count:3, spread:26},
          {n:"그림자 걸음", d:"순간이동 후 잠깐 모습을 감춥니다", t:"blink", cd:6.5, dist:260, inv:.25, me:{invis:1.4}},
          {n:"연막탄", d:"연막으로 적을 느리게 하고 숨습니다", t:"circle", cd:11, r:135, slow:[.5,3], me:{invis:2.4}},
          {n:"암습", d:"가까운 적 뒤로 도약해 치명타", t:"leap", cd:24, rng:460, dmg:125, stun:.5}]},
 {n:"지유", role:"서포터", col:"#8fe3ff", hp:270, spd:238, pref:[200,330], kr:1,
  basic:{t:"proj", spd:620, rng:340, r:11, dmg:12, rate:1.8, ha:10},
  skills:[{n:"치유의 빛", d:"적은 다치게, 아군은 치유. 나도 회복", t:"proj", cd:3.2, spd:560, rng:440, r:16, dmg:26, ha:45, leech:.5},
          {n:"성스러운 걸음", d:"잠깐 아주 빨라지고 보호막", t:"self", cd:8, me:{haste:[1.6,2.6], shield:[40,3]}},
          {n:"성역", d:"안의 아군은 치유, 적은 느려짐", t:"zone", cd:13, r:135, dur:5, dps:9, hps:17, slow:.75},
          {n:"부활의 종", d:"아군 큰 치유·보호막, 적은 기절", t:"circle", cd:30, r:240, dmg:25, stun:.8, knock:120, heal:85, shield:60}]},
 {n:"아린", role:"원거리", col:"#7dffb0", hp:240, spd:240, pref:[260,420], kr:1,
  basic:{t:"proj", spd:900, rng:520, r:8, dmg:15, rate:2.2},
  skills:[{n:"속사", d:"화살 3발을 빠르게 쏩니다", t:"proj", cd:3, spd:950, rng:520, r:8, dmg:17, count:3, spread:14},
          {n:"후방 구르기", d:"뒤로 구르며 잠깐 무적", t:"dash", cd:5.5, dist:200, spd:800, back:true, inv:.3},
          {n:"덫 설치", d:"밟은 적을 기절시키는 덫", t:"trap", cd:10, r:70, dmg:32, stun:1.2, life:14},
          {n:"관통 사격", d:"모두 꿰뚫는 긴 저격", t:"beam", cd:25, len:720, w:40, dmg:125, delay:.55}]},
 {n:"채원", role:"원거리·제어", col:"#ffb36b", hp:255, spd:235, pref:[240,380], kr:1,
  basic:{t:"proj", spd:640, rng:430, r:10, dmg:13, rate:2},
  skills:[{n:"전술 지시", d:"지정한 곳을 타격하고 느리게", t:"circle", at:"aim", cd:4, rng:380, r:95, dmg:32, slow:[.5,2], delay:.45},
          {n:"진형 이동", d:"순간이동하며 보호막", t:"blink", cd:7, dist:210, me:{shield:[30,3]}},
          {n:"포위망", d:"지정한 곳에 둔화 지대 설치", t:"zone", at:"aim", cd:12, rng:380, r:150, dur:4.5, dps:11, slow:.45},
          {n:"총공격 명령", d:"넓은 범위를 폭격해 기절", t:"circle", at:"aim", cd:26, rng:440, r:190, dmg:100, stun:.8, delay:.85}]},
 {n:"이솔", role:"근접 딜러", col:"#ff7a8a", hp:280, spd:245, pref:[0,90], kr:1,
  basic:{t:"cone", rng:84, ang:100, dmg:18, rate:2, knock:8},
  skills:[{n:"붉은 별 검기", d:"관통하는 검기를 날립니다", t:"proj", cd:3.4, spd:700, rng:440, r:18, dmg:31, pierce:true},
          {n:"별빛 도약", d:"순간이동 후 착지 충격", t:"blink", cd:7, dist:250, end:{r:85, dmg:22, knock:70}},
          {n:"마검 개방", d:"5초간 공격력과 속도 증가", t:"self", cd:14, me:{amp:[.35,5], haste:[1.15,5]}},
          {n:"유성 낙하", d:"지정한 곳에 유성을 떨어뜨림", t:"circle", at:"aim", cd:27, rng:400, r:170, dmg:110, knock:130, delay:.9}]},
 {n:"다온", role:"근접 딜러", col:"#ff9d4d", hp:340, spd:250, pref:[0,80], kr:.7,
  basic:{t:"cone", rng:80, ang:120, dmg:19, rate:1.7, knock:10},
  skills:[{n:"한 방 펀치", d:"강하게 때려 멀리 날립니다", t:"cone", cd:4, rng:92, ang:70, dmg:46, knock:130},
          {n:"돌격", d:"앞으로 돌진해 받아치고 기절", t:"dash", cd:8, dist:320, spd:850, dmg:35, knock:140, stun:.5},
          {n:"대지 강타", d:"바닥을 내려쳐 주변 기절", t:"circle", cd:12, r:140, dmg:35, stun:1, knock:90},
          {n:"전군 돌격", d:"멈추지 않는 긴 돌격", t:"dash", cd:26, dist:560, spd:720, dmg:70, knock:220, stun:1, inv:.8, me:{dr:[.5,2]}}]},
 {n:"소율", role:"탱커", col:"#9fd0ff", hp:400, spd:220, pref:[0,75], kr:.5,
  basic:{t:"cone", rng:74, ang:120, dmg:15, rate:1.8, knock:6},
  skills:[{n:"방패 가격", d:"방패로 쳐서 기절시킵니다", t:"cone", cd:5, rng:82, ang:80, dmg:26, stun:.8},
          {n:"수호 돌진", d:"짧게 돌진해 적을 밀어냅니다", t:"dash", cd:7, dist:190, spd:700, dmg:18, knock:80},
          {n:"철벽 태세", d:"3.5초간 받는 피해 크게 감소", t:"self", cd:13, me:{dr:[.55,3.5], shield:[40,3.5]}},
          {n:"도발의 외침", d:"주변 적을 끌어당기고 기절", t:"circle", cd:28, r:230, pull:140, dmg:40, stun:.6, me:{dr:[.4,4]}}]},
 {n:"이안", role:"원거리", col:"#b8c6ff", hp:255, spd:245, pref:[250,400], kr:1,
  basic:{t:"proj", spd:880, rng:500, r:8, dmg:16, rate:2},
  skills:[{n:"정밀 사격", d:"빠르고 강한 한 발", t:"proj", cd:3.6, spd:1100, rng:650, r:9, dmg:42},
          {n:"도약 후퇴", d:"뒤로 순간이동하고 빨라짐", t:"blink", cd:5.5, dist:220, back:true, me:{haste:[1.3,2]}},
          {n:"섬광탄", d:"지정한 곳을 눈부시게 해 기절", t:"circle", at:"aim", cd:11, rng:380, r:110, stun:1.1, delay:.3},
          {n:"필중 저격", d:"체력 낮은 적에게 더 큰 피해", t:"proj", cd:24, spd:1600, rng:950, r:12, dmg:135, exec:.5}]},
 {n:"태오", role:"탱커", col:"#d0c07a", hp:390, spd:222, pref:[0,75], kr:.5,
  basic:{t:"cone", rng:74, ang:120, dmg:15, rate:1.8, knock:6},
  skills:[{n:"방패 치기", d:"방패로 쳐서 멀리 밀어냅니다", t:"cone", cd:4, rng:80, ang:90, dmg:28, knock:150},
          {n:"방패 돌진", d:"방패를 앞세워 돌진", t:"dash", cd:6, dist:170, spd:650, dmg:20, knock:130},
          {n:"걱정 마!", d:"아군 보호막, 나는 반격 태세", t:"circle", cd:12, r:200, shield:70, me:{dr:[.7,2], refl:[.3,2]}},
          {n:"내가 다 막는다", d:"4초간 피해 대부분 막고 되돌림", t:"self", cd:28, me:{dr:[.8,4], refl:[.5,4]}, also:{r:200, pull:100, dmg:20}}]}
];
const MODES = {ffa:{label:"개인 난투", limit:180}, team:{label:"팀전", limit:180}, surv:{label:"서바이벌", limit:240}};
const DIFF = [
  {label:"쉬움", react:.5, err:.30, skillP:.2, dmgMul:.55, spdMul:.86, cdMul:1.4, atkP:.7, dodge:0, flee:0},
  {label:"보통", react:.28, err:.12, skillP:.55, dmgMul:.9, spdMul:.95, cdMul:1.1, atkP:.9, dodge:.3, flee:1},
  {label:"어려움", react:.14, err:.04, skillP:.9, dmgMul:1.1, spdMul:1.02, cdMul:1, atkP:1, dodge:.65, flee:1}
];
const ITEM_KINDS = ["heal", "speed", "shield"];
const HPM = {ffa:1.2, team:1.2, surv:2.6};   // 서바이벌은 체력 2배(한 판이 너무 빨리 끝나지 않게)

/* ---------------- 판 만들기 ---------------- */
function mkFighter(i, kn, team, human, diff, hpm) {
  const kit = KITS[kn];
  const f = {i, id:kn, team, human, x:0, y:0, aimX:1, aimY:0, aimD:260, aimAng:0, vx:0, vy:0, hp:kit.hp * hpm, maxhp:kit.hp * hpm, spd:kit.spd, alive:true, respT:0,
    kills:0, deaths:0, dmg:0, assists:0, heal:0, place:0, cd:[0, 0, 0, 0], bcd:0, stun:0, slowM:1, slowT:0, hasteM:1, hasteT:0, shieldV:0, shieldT:0,
    drV:0, drT:0, ampV:0, ampT:0, invisT:0, invulT:0, reflV:0, reflT:0, kx:0, ky:0, dash:null, lastHit:null, hits:{}, combo:0, comboT:0, flash:0, leech:0,
    inp:{mx:0, my:0, atk:0, casts:[]}, bot:null};
  if (!human) makeBot(f, diff);
  return f;
}
function makeBot(f, diff) {
  const D = DIFF[clamp(diff | 0, 0, 2)];
  f.human = false;
  f.bot = {d:clamp(diff | 0, 0, 2), dmgMul:D.dmgMul, spdMul:D.spdMul, cdMul:D.cdMul, t:rnd() * .3, mx:0, my:0, dx:0, dy:0, dodgeT:0, tgt:-1, err:0, atk:0, lx:0, ly:0, stuck:0, sg:rnd() < .5 ? 1 : -1, sgT:1, hold:0};
}
function createMatch(cfg) {
  const mode = MODES[cfg.mode] ? cfg.mode : "ffa", map = MAPS[cfg.map] || MAPS["3f"];
  const players = (cfg.players || [{slot:0, kn:0}]).slice(0, 10);
  let n = mode === "team" ? (cfg.teamSize === 3 ? 6 : 4) : clamp(cfg.size | 0 || 10, 2, 10);
  const maxSlot = players.reduce((a, p) => Math.max(a, p.slot), 0);
  n = Math.max(n, maxSlot + 1, players.length);
  if (mode === "team" && n % 2) n++;
  n = Math.min(10, n);
  const used = new Set(), pick = new Map();
  for (const p of players) { let k = clamp(p.kn | 0, 0, 9); while (used.has(k)) k = (k + 1) % 10; used.add(k); pick.set(p.slot, k); }
  const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(k => !used.has(k)).sort(() => rnd() - .5);
  const diff = clamp(cfg.diff | 0, 0, 2);
  const fighters = [];
  for (let i = 0; i < n; i++) {
    const human = pick.has(i), kn = human ? pick.get(i) : pool.pop();
    fighters.push(mkFighter(i, kn, mode === "team" ? i % 2 : i, human, diff, HPM[mode]));
  }
  const m = {id:Math.random().toString(36).slice(2, 9), cfg:{mode, map:map.id, diff, teamSize:cfg.teamSize === 3 ? 3 : 2, size:n}, map, t:0, phase:"ready", readyT:2.6,
    limit:MODES[mode].limit + (mode === "team" && n >= 6 ? 30 : 0), fighters, proj:[], zones:[], traps:[], tele:[], items:[], objs:[], ev:[], score:[0, 0], zone:null, over:false, res:null, nextItem:4, zs:0, ctr:0};
  m.objs.push({k:"w", x:map.purifier.x, y:map.purifier.y, cd:0, arm:0, by:-1});
  for (const p of map.printers) m.objs.push({k:"p", x:p.x, y:p.y, cd:0, arm:0, by:-1});
  const order = map.spawns.map((p, i) => i);
  if (mode !== "team") order.sort(() => rnd() - .5);
  fighters.forEach((f, i) => {
    const sp = mode === "team" ? map.spawns[(f.team ? 5 : 0) + Math.floor(i / 2) % 5] : map.spawns[order[i % order.length]];
    f.x = sp.x; f.y = sp.y; f.aimAng = Math.atan2(MH / 2 - f.y, MW / 2 - f.x); f.aimX = Math.cos(f.aimAng); f.aimY = Math.sin(f.aimAng);
    f.invulT = 3;
  });
  for (let k = 0; k < 3; k++) spawnItem(m);
  if (mode === "surv") m.zone = {x:map.zc.x, y:map.zc.y, r:760};
  return m;
}
const emit = (m, ...a) => { if (m.ev.length < 240) m.ev.push(a); };
const same = (a, b) => a === b || a.team === b.team;

/* ---------------- 피해·치유·상태 ---------------- */
function hurt(m, src, dst, amt, o) {
  o = o || {};
  if (!dst.alive || dst.invulT > 0 || m.over) return 0;
  if (src && src !== dst && src.team === dst.team) return 0;
  let a = amt;
  if (src) {
    if (src.bot) a *= src.bot.dmgMul;
    if (src.ampT > 0) a *= 1 + src.ampV;
    if (src.combo > 1 && !o.env && !o.refl) a *= 1 + Math.min(.2, (src.combo - 1) * .025);
  }
  if (dst.drT > 0) a *= 1 - dst.drV;
  if (o.exec && dst.hp < dst.maxhp * .4) a *= 1 + o.exec;
  a = Math.max(1, a);
  let take = a;
  if (dst.shieldT > 0 && dst.shieldV > 0) { const ab = Math.min(dst.shieldV, take); dst.shieldV -= ab; take -= ab; if (dst.shieldV <= 0) dst.shieldT = 0; }
  dst.hp -= take; dst.flash = .16;
  if (src && src !== dst) {
    src.dmg += a; dst.lastHit = {by:src.i, t:m.t}; dst.hits[src.i] = m.t;
    if (!o.dot) { src.combo = (src.comboT > 0 ? src.combo : 0) + 1; src.comboT = 2.2; }
  }
  if (!o.quiet) emit(m, "hit", dst.i, Math.round(dst.x), Math.round(dst.y), Math.round(a), src ? src.i : -1);
  if (dst.reflT > 0 && dst.reflV > 0 && src && src !== dst && !o.refl) hurt(m, dst, src, a * dst.reflV, {refl:1});
  if (dst.hp <= 0) kill(m, dst, src);
  return a;
}
function healF(m, src, dst, amt) {
  if (!dst.alive) return 0;
  const a = Math.min(dst.maxhp - dst.hp, amt);
  if (a <= 0) return 0;
  dst.hp += a;
  if (src) src.heal += a;
  emit(m, "heal", dst.i, Math.round(a));
  return a;
}
function knockF(f, dx, dy, dist) {
  if (!dist) return;
  const d = hyp(dx, dy) || 1, v = Math.min(1500, dist * 8 * (KITS[f.id].kr || 1));
  f.kx += dx / d * v; f.ky += dy / d * v;
}
const slowF = (f, mul, t) => { f.slowM = f.slowT > 0 ? Math.min(f.slowM, mul) : mul; f.slowT = Math.max(f.slowT, t); };
const hasteF = (f, mul, t) => { f.hasteM = f.hasteT > 0 ? Math.max(f.hasteM, mul) : mul; f.hasteT = Math.max(f.hasteT, t); };
function shieldF(f, v, t) { f.shieldV = f.shieldT > 0 ? Math.max(f.shieldV, v) : v; f.shieldT = Math.max(f.shieldT, t); }
function selfFx(m, f, me) {
  if (me.shield) shieldF(f, me.shield[0], me.shield[1]);
  if (me.dr) { f.drV = me.dr[0]; f.drT = me.dr[1]; }
  if (me.haste) hasteF(f, me.haste[0], me.haste[1]);
  if (me.amp) { f.ampV = me.amp[0]; f.ampT = me.amp[1]; }
  if (me.invis) f.invisT = Math.max(f.invisT, me.invis);
  if (me.inv) f.invulT = Math.max(f.invulT, me.inv);
  if (me.refl) { f.reflV = me.refl[0]; f.reflT = me.refl[1]; }
  if (me.heal) healF(m, f, f, me.heal);
}
function kill(m, v, src) {
  v.hp = 0; v.alive = false; v.deaths++; v.dash = null; v.stun = 0; v.slowT = v.hasteT = v.shieldT = v.drT = v.ampT = v.invisT = v.reflT = 0; v.shieldV = 0; v.combo = 0;
  let killer = src && src !== v ? src : null;
  if (!killer && v.lastHit && m.t - v.lastHit.t < 5) killer = m.fighters[v.lastHit.by];
  if (killer && killer.team !== v.team) { killer.kills++; if (m.cfg.mode === "team") m.score[killer.team]++; }
  for (const k in v.hits) { const a = m.fighters[k]; if (a && a !== killer && a.team !== v.team && m.t - v.hits[k] < 6) a.assists++; }
  v.hits = {};
  if (m.cfg.mode === "surv") { v.place = m.fighters.filter(f => f.alive).length + 1; v.respT = 0; m.items.push({x:v.x, y:v.y, k:0, t:0}); }
  else v.respT = 3;
  emit(m, "kill", killer && killer !== v ? killer.i : -1, v.i, Math.round(v.x), Math.round(v.y));
}
function respawn(m, f) {
  let best = null, bd = -1;
  const cand = m.map.spawns.slice().sort(() => rnd() - .5);
  for (const sp of cand) {
    let md = 1e9;
    for (const o of m.fighters) if (o.alive && o !== f && o.team !== f.team) md = Math.min(md, hyp(o.x - sp.x, o.y - sp.y));
    if (md > bd) { bd = md; best = sp; }
  }
  f.x = best.x; f.y = best.y; f.alive = true; f.hp = f.maxhp; f.invulT = 1.8; f.kx = f.ky = 0; f.dash = null; f.lastHit = null; f.bcd = .3;
  emit(m, "respawn", f.i, Math.round(f.x), Math.round(f.y));
}

/* ---------------- 스킬 ---------------- */
function applyCircle(m, f, x, y, c) {
  emit(m, "ring", Math.round(x), Math.round(y), c.r, f.id);
  for (const o of m.fighters) {
    if (!o.alive) continue;
    const dx = o.x - x, dy = o.y - y, d = hyp(dx, dy);
    if (d > c.r + R * .7) continue;
    if (o.team !== f.team) {
      if (c.dmg) hurt(m, f, o, c.dmg, {});
      if (c.stun) o.stun = Math.max(o.stun, c.stun);
      if (c.slow) slowF(o, c.slow[0], c.slow[1]);
      const ux = d > 1 ? dx / d : 1, uy = d > 1 ? dy / d : 0;
      if (c.knock) knockF(o, ux, uy, c.knock);
      if (c.pull) knockF(o, -ux, -uy, Math.min(c.pull, Math.max(0, d - 30)));
    } else {
      if (c.heal) healF(m, f, o, c.heal);
      if (c.shield) shieldF(o, c.shield, 4);
      if (c.haste) hasteF(o, c.haste[0], c.haste[1]);
    }
  }
}
function fireProj(m, f, sk, ang) {
  const n = sk.count || 1, spread = (sk.spread || 0) * Math.PI / 180;
  for (let k = 0; k < n; k++) {
    const a = ang + (n > 1 ? (k / (n - 1) - .5) * spread : 0), c = Math.cos(a), s = Math.sin(a);
    m.proj.push({x:f.x + c * (R + 4), y:f.y + s * (R + 4), vx:c * sk.spd, vy:s * sk.spd, r:sk.r, life:sk.rng / sk.spd, dmg:sk.dmg, by:f.i, team:f.team, id:f.id,
      pierce:!!sk.pierce, hit:[], ha:sk.ha || 0, leech:sk.leech || 0, ex:sk.exec || 0, big:sk.dmg >= 40 || sk.r >= 16 ? 1 : 0});
  }
  emit(m, "shot", f.i);
}
function coneHit(m, f, c, ang) {
  const half = (c.ang || 90) * Math.PI / 360;
  emit(m, "sw", f.i, +ang.toFixed(2), c.rng, c.ang || 90);
  for (const o of m.fighters) {
    if (!o.alive || o.team === f.team) continue;
    const dx = o.x - f.x, dy = o.y - f.y, d = hyp(dx, dy);
    if (d > c.rng + R * .6) continue;
    if (d > R && Math.abs(angDiff(Math.atan2(dy, dx), ang)) > half + Math.asin(Math.min(1, R * .8 / d))) continue;
    if (!los(m.map, f.x, f.y, o.x, o.y)) continue;
    hurt(m, f, o, c.dmg, {});
    knockF(o, dx, dy, c.knock || 0);
    if (c.stun) o.stun = Math.max(o.stun, c.stun);
    if (c.slow) slowF(o, c.slow[0], c.slow[1]);
  }
}
function fireBeam(m, f, c, ang) {
  if (!f.alive) return;
  const cx = Math.cos(ang), cy = Math.sin(ang);
  let len = c.len;
  for (let d = 20; d <= c.len; d += 12) if (blocked(m.map, f.x + cx * d, f.y + cy * d, 4)) { len = d; break; }
  emit(m, "beam", Math.round(f.x), Math.round(f.y), +ang.toFixed(3), Math.round(len), c.w, f.id);
  for (const o of m.fighters) {
    if (!o.alive || o.team === f.team) continue;
    const dx = o.x - f.x, dy = o.y - f.y, along = dx * cx + dy * cy;
    if (along < 0 || along > len + R || Math.abs(-dx * cy + dy * cx) > c.w / 2 + R * .8) continue;
    hurt(m, f, o, c.dmg, {});
    knockF(o, cx, cy, c.knock || 0);
    if (c.stun) o.stun = Math.max(o.stun, c.stun);
  }
}
function aimPoint(m, f, ang, rng) {
  let d = Math.min(rng || 300, Math.max(60, f.aimD || 260)), x, y;
  for (; d > 0; d -= 15) { x = f.x + Math.cos(ang) * d; y = f.y + Math.sin(ang) * d; if (!blocked(m.map, x, y, 6)) break; }
  if (d <= 0) { x = f.x; y = f.y; }
  return {x, y};
}
function cast(m, f, slot) {
  const sk = KITS[f.id].skills[slot];
  if (!sk || f.cd[slot] > 0 || f.stun > 0 || !f.alive || f.dash || m.phase !== "play") return false;
  const ang = Math.atan2(f.aimY, f.aimX);
  let ok = true;
  switch (sk.t) {
    case "proj": fireProj(m, f, sk, ang); break;
    case "cone": coneHit(m, f, sk, ang); break;
    case "dash": {
      const dir = sk.back ? ang + Math.PI : ang;
      f.dash = {vx:Math.cos(dir) * sk.spd, vy:Math.sin(dir) * sk.spd, t:sk.dist / sk.spd, dmg:sk.dmg || 0, kb:sk.knock || 0, stun:sk.stun || 0, hit:[]};
      if (sk.inv) f.invulT = Math.max(f.invulT, sk.inv);
      emit(m, "dash", f.i);
      break;
    }
    case "blink": {
      const dir = sk.back ? ang + Math.PI : ang, cx = Math.cos(dir), cy = Math.sin(dir), ox = f.x, oy = f.y;
      let d = 0;
      while (d < sk.dist) { const nd = Math.min(sk.dist, d + 10); if (blocked(m.map, ox + cx * nd, oy + cy * nd, R)) break; d = nd; }
      if (d < 24) { ok = false; break; }
      f.x = ox + cx * d; f.y = oy + cy * d;
      emit(m, "blink", Math.round(ox), Math.round(oy), Math.round(f.x), Math.round(f.y), f.id);
      if (sk.inv) f.invulT = Math.max(f.invulT, sk.inv);
      if (sk.end) applyCircle(m, f, f.x, f.y, sk.end);
      break;
    }
    case "leap": {
      let best = null, bs = 1e9;
      for (const o of m.fighters) {
        if (!o.alive || o.team === f.team) continue;
        const dx = o.x - f.x, dy = o.y - f.y, d = hyp(dx, dy), da = Math.abs(angDiff(Math.atan2(dy, dx), ang));
        if (d > sk.rng || da > 1.2) continue;
        const sc = d * (1 + da * .9);
        if (sc < bs) { bs = sc; best = o; }
      }
      if (!best) { ok = false; break; }
      const dx = best.x - f.x, dy = best.y - f.y, d = hyp(dx, dy) || 1, ux = dx / d, uy = dy / d, g = R * 2.1;
      const cands = [[best.x + ux * g, best.y + uy * g], [best.x - ux * g, best.y - uy * g], [best.x - uy * g, best.y + ux * g], [best.x + uy * g, best.y - ux * g]];
      const spot = cands.find(p => !blocked(m.map, p[0], p[1], R));
      if (!spot) { ok = false; break; }
      emit(m, "blink", Math.round(f.x), Math.round(f.y), Math.round(spot[0]), Math.round(spot[1]), f.id);
      f.x = spot[0]; f.y = spot[1];
      f.aimAng = Math.atan2(best.y - f.y, best.x - f.x); f.aimX = Math.cos(f.aimAng); f.aimY = Math.sin(f.aimAng);
      hurt(m, f, best, sk.dmg, {exec:sk.exec});
      if (sk.stun) best.stun = Math.max(best.stun, sk.stun);
      break;
    }
    case "circle": {
      const p = sk.at === "aim" ? aimPoint(m, f, ang, sk.rng) : {x:f.x, y:f.y};
      if (sk.delay) { m.tele.push({k:"c", x:p.x, y:p.y, r:sk.r, t:sk.delay, dur:sk.delay, by:f.i, c:sk}); emit(m, "warn", Math.round(p.x), Math.round(p.y), sk.r, f.id); }
      else applyCircle(m, f, p.x, p.y, sk);
      break;
    }
    case "zone": {
      const p = sk.at === "aim" ? aimPoint(m, f, ang, sk.rng) : {x:f.x, y:f.y};
      m.zones.push({x:p.x, y:p.y, r:sk.r, t:sk.dur, dur:sk.dur, by:f.i, team:f.team, id:f.id, dps:sk.dps || 0, hps:sk.hps || 0, slow:sk.slow || 1, acc:0});
      emit(m, "ring", Math.round(p.x), Math.round(p.y), sk.r, f.id);
      break;
    }
    case "beam":
      if (sk.delay) { m.tele.push({k:"b", by:f.i, ang, t:sk.delay, dur:sk.delay, c:sk}); emit(m, "warn2", f.i); }
      else fireBeam(m, f, sk, ang);
      break;
    case "trap":
      m.traps.push({x:f.x, y:f.y, r:sk.r, t:sk.life, arm:.7, dmg:sk.dmg, stun:sk.stun, by:f.i, team:f.team, id:f.id});
      emit(m, "trap", Math.round(f.x), Math.round(f.y));
      break;
    case "self": break;
  }
  if (!ok) return false;
  if (sk.me) selfFx(m, f, sk.me);
  if (sk.also) applyCircle(m, f, f.x, f.y, sk.also);
  f.cd[slot] = sk.cd * (f.bot ? f.bot.cdMul : 1);
  emit(m, "cast", f.i, slot);
  return true;
}
function basicAttack(m, f) {
  const b = KITS[f.id].basic, ang = Math.atan2(f.aimY, f.aimX);
  f.bcd = 1 / b.rate;
  if (b.t === "cone") coneHit(m, f, b, ang);
  else fireProj(m, f, b, ang);
}

/* ---------------- 한 걸음 진행 ---------------- */
function tryMove(map, f, dx, dy) {
  const n = Math.max(1, Math.ceil(hyp(dx, dy) / 12)), sx = dx / n, sy = dy / n;
  let hitWall = false;
  for (let i = 0; i < n; i++) {
    if (!blocked(map, f.x + sx, f.y, R)) f.x += sx; else if (sx) hitWall = true;
    if (!blocked(map, f.x, f.y + sy, R)) f.y += sy; else if (sy) hitWall = true;
  }
  return hitWall;
}
function tickF(m, f, dt) {
  f.flash -= dt; f.bcd -= dt;
  for (let i = 0; i < 4; i++) f.cd[i] = Math.max(0, f.cd[i] - dt);
  if (!f.alive) { if (m.cfg.mode !== "surv" && m.phase === "play") { f.respT -= dt; if (f.respT <= 0) respawn(m, f); } return; }
  f.stun -= dt; f.slowT -= dt; f.hasteT -= dt; f.drT -= dt; f.ampT -= dt; f.invisT -= dt; f.invulT -= dt; f.reflT -= dt; f.shieldT -= dt; f.comboT -= dt;
  if (f.shieldT <= 0) f.shieldV = 0;
  if (f.comboT <= 0) f.combo = 0;
  const inp = f.inp;
  f.aimAng = Math.atan2(f.aimY, f.aimX);
  const ox = f.x, oy = f.y;
  let vx = 0, vy = 0;
  if (f.dash) {
    const d = f.dash;
    const wall = tryMove(m.map, f, d.vx * dt, d.vy * dt);
    d.t -= dt;
    if (d.dmg || d.stun) for (const o of m.fighters) {
      if (!o.alive || o.team === f.team || d.hit.includes(o.i) || hyp(o.x - f.x, o.y - f.y) > R * 2.1) continue;
      d.hit.push(o.i);
      hurt(m, f, o, d.dmg, {}); knockF(o, d.vx, d.vy, d.kb); if (d.stun) o.stun = Math.max(o.stun, d.stun);
    }
    if (d.t <= 0 || wall) f.dash = null;
  } else {
    if (f.stun <= 0) {
      let mx = inp.mx, my = inp.my; const ml = hyp(mx, my);
      if (ml > 1) { mx /= ml; my /= ml; }
      const sp = f.spd * (f.slowT > 0 ? f.slowM : 1) * (f.hasteT > 0 ? f.hasteM : 1) * (f.bot ? f.bot.spdMul : 1);
      vx = mx * sp; vy = my * sp;
    }
    tryMove(m.map, f, vx * dt, vy * dt);
  }
  if (f.kx || f.ky) {
    tryMove(m.map, f, f.kx * dt, f.ky * dt);
    const fr = Math.exp(-8 * dt); f.kx *= fr; f.ky *= fr;
    if (Math.abs(f.kx) < 8 && Math.abs(f.ky) < 8) f.kx = f.ky = 0;
  }
  f.vx = (f.x - ox) / dt; f.vy = (f.y - oy) / dt;
  if (f.stun <= 0 && !f.dash) {
    while (inp.casts.length) cast(m, f, inp.casts.shift());
    if (inp.atk && f.bcd <= 0) basicAttack(m, f);
  } else inp.casts.length = 0;
}
function stepProj(m, dt) {
  const P = m.proj;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    let dead = false;
    const n = Math.max(1, Math.ceil(hyp(p.vx, p.vy) * dt / 14)), sx = p.vx * dt / n, sy = p.vy * dt / n;
    for (let k = 0; k < n && !dead; k++) {
      p.x += sx; p.y += sy;
      if (blocked(m.map, p.x, p.y, 3)) { dead = true; emit(m, "spark", Math.round(p.x), Math.round(p.y), p.id); break; }
      for (const f of m.fighters) {
        if (!f.alive || f.i === p.by || p.hit.includes(f.i)) continue;
        if (hyp(f.x - p.x, f.y - p.y) > p.r + R * .85) continue;
        const own = m.fighters[p.by];
        if (f.team === p.team) {
          if (p.ha) { p.hit.push(f.i); healF(m, own, f, p.ha); if (!p.pierce) { dead = true; break; } }
          continue;
        }
        p.hit.push(f.i);
        const a = hurt(m, own, f, p.dmg, {exec:p.ex});
        if (a && p.leech && own) healF(m, own, own, a * p.leech);
        if (!p.pierce) { dead = true; break; }
      }
    }
    p.life -= dt;
    if (dead || p.life <= 0) P.splice(i, 1);
  }
}
function spawnItem(m) {
  const spots = m.map.items.filter(s => !m.items.some(it => hyp(it.x - s.x, it.y - s.y) < 40));
  if (!spots.length) return;
  const s = spots[Math.floor(rnd() * spots.length)], r = rnd();
  m.items.push({x:s.x, y:s.y, k:r < .4 ? 0 : r < .7 ? 1 : 2, t:0});
}
function stepWorld(m, dt) {
  // 부활·처치 등 이벤트는 tickF 에서. 여기는 월드 오브젝트
  for (let i = m.tele.length - 1; i >= 0; i--) {
    const t = m.tele[i]; t.t -= dt;
    if (t.t > 0) continue;
    const f = m.fighters[t.by];
    if (t.k === "c") applyCircle(m, f, t.x, t.y, t.c); else fireBeam(m, f, t.c, t.ang);
    m.tele.splice(i, 1);
  }
  for (let i = m.zones.length - 1; i >= 0; i--) {
    const z = m.zones[i]; z.t -= dt; z.acc += dt;
    const tick = z.acc >= .5; if (tick) z.acc -= .5;
    for (const o of m.fighters) {
      if (!o.alive || hyp(o.x - z.x, o.y - z.y) > z.r) continue;
      const owner = m.fighters[z.by];
      if (o.team !== z.team) {
        if (z.slow < 1) slowF(o, z.slow, .3);
        if (tick && z.dps) hurt(m, owner, o, z.dps * .5, {dot:1, quiet:1});
      } else if (tick && z.hps) healF(m, owner, o, z.hps * .5);
    }
    if (z.t <= 0) m.zones.splice(i, 1);
  }
  for (let i = m.traps.length - 1; i >= 0; i--) {
    const t = m.traps[i]; t.t -= dt; t.arm -= dt;
    let fired = false;
    if (t.arm <= 0) for (const o of m.fighters) {
      if (!o.alive || o.team === t.team || hyp(o.x - t.x, o.y - t.y) > t.r) continue;
      hurt(m, m.fighters[t.by], o, t.dmg, {}); if (t.stun) o.stun = Math.max(o.stun, t.stun); fired = true;
    }
    if (fired) emit(m, "ring", Math.round(t.x), Math.round(t.y), t.r, t.id);
    if (fired || t.t <= 0) m.traps.splice(i, 1);
  }
  for (const o of m.objs) {
    if (o.cd > 0) o.cd -= dt;
    if (o.k === "w") {
      if (o.cd <= 0) for (const f of m.fighters) if (f.alive && hyp(f.x - o.x, f.y - o.y) < 52 && f.hp < f.maxhp) { healF(m, f, f, 55); o.cd = 18; emit(m, "water", f.i); break; }
    } else if (o.arm > 0) {
      o.arm -= dt;
      if (o.arm <= 0) {
        const by = m.fighters[o.by];
        emit(m, "boom", Math.round(o.x), Math.round(o.y), 150);
        for (const f of m.fighters) if (f.alive && by && f.team !== by.team && hyp(f.x - o.x, f.y - o.y) < 150) { hurt(m, by, f, 38, {}); f.stun = Math.max(f.stun, .4); knockF(f, f.x - o.x, f.y - o.y, 90); }
        o.cd = 14;
      }
    } else if (o.cd <= 0) {
      for (const f of m.fighters) if (f.alive && hyp(f.x - o.x, f.y - o.y) < 46) { o.arm = .9; o.by = f.i; emit(m, "jam", Math.round(o.x), Math.round(o.y)); break; }
    }
  }
  m.nextItem -= dt;
  if (m.nextItem <= 0) { m.nextItem = m.cfg.mode === "surv" ? 8 : 11; if (m.items.length < (m.cfg.mode === "surv" ? 5 : 4)) spawnItem(m); }
  for (let i = m.items.length - 1; i >= 0; i--) {
    const it = m.items[i];
    for (const f of m.fighters) {
      if (!f.alive || hyp(f.x - it.x, f.y - it.y) > R + 16) continue;
      if (it.k === 0) { if (f.hp >= f.maxhp) continue; healF(m, f, f, 90); }
      else if (it.k === 1) hasteF(f, 1.4, 6); else shieldF(f, 80, 8);
      emit(m, "item", f.i, it.k); m.items.splice(i, 1); break;
    }
  }
  if (m.zone) {
    const s0 = 30, s1 = 215;
    m.zone.r = m.t < s0 ? 760 : Math.max(110, 760 - 650 * clamp((m.t - s0) / (s1 - s0), 0, 1));
    const dps = 6 + 8 * clamp(m.t / m.limit, 0, 1);
    m.zs += dt;
    for (const f of m.fighters) if (f.alive && hyp(f.x - m.zone.x, f.y - m.zone.y) > m.zone.r) {
      hurt(m, null, f, dps * dt, {env:1, dot:1, quiet:1});
      if (m.zs >= .5 && f.alive) emit(m, "zoneHit", f.i, Math.round(f.x), Math.round(f.y), Math.round(dps * .5));
    }
    if (m.zs >= .5) m.zs = 0;
  }
}
function separate(m) {
  const F = m.fighters;
  for (let a = 0; a < F.length; a++) for (let b = a + 1; b < F.length; b++) {
    const p = F[a], q = F[b];
    if (!p.alive || !q.alive || p.dash || q.dash) continue;
    const dx = q.x - p.x, dy = q.y - p.y, d = hyp(dx, dy), md = R * 1.8;
    if (d >= md || d < .01) continue;
    const push = (md - d) * .5, ux = dx / d, uy = dy / d;
    tryMove(m.map, p, -ux * push, -uy * push); tryMove(m.map, q, ux * push, uy * push);
  }
}

/* ---------------- 봇 ---------------- */
function botWants(m, f, sk, slot, tgt, dist, sight, hpf, near) {
  const ult = slot === 3;
  switch (sk.t) {
    case "proj": return !!tgt && sight && dist < sk.rng * .95 && dist > 40;
    case "beam": return !!tgt && sight && dist < sk.len * .85;
    case "cone": return !!tgt && dist < sk.rng + 12;
    case "dash": if (sk.back) return !!tgt && (dist < 140 || (hpf < .4 && dist < 260));
      return !!tgt && sight && dist > 130 && dist < sk.dist + 50;
    case "blink": if (sk.back) return !!tgt && (dist < 140 || (hpf < .4 && dist < 260));
      if (sk.end) return !!tgt && dist > 120 && dist < sk.dist + 40;
      return !!tgt && ((dist > 200 && dist < sk.dist + 60) || (hpf < .35 && dist < 190));
    case "leap": return !!tgt && dist < sk.rng * .9 && (!ult || tgt.hp < 200);
    case "circle": if (sk.at === "aim") return !!tgt && sight && dist < sk.rng * .95 && (!ult || tgt.hp < 220 || near >= 2);
      if (sk.heal && hpf < .65) return true;
      return near >= (ult ? 2 : 1) || (ult && !!tgt && dist < sk.r && tgt.hp < 160);
    case "zone": if (sk.at === "aim") return !!tgt && sight && dist < sk.rng * .95; return near >= 1 || (!!sk.hps && hpf < .75 && !!tgt && dist < 360);
    case "self": return !!tgt && dist < 240 && (sk.me.dr || sk.me.shield || sk.me.refl ? true : sk.me.haste ? dist > 150 : true);
    case "trap": return !!tgt && dist < 260;
  }
  return false;
}
function probe(m, f, dx, dy) {
  // 막힌 방향이면 좌우로 비틀어 열린 방향을 찾는다
  const base = Math.atan2(dy, dx);
  for (const off of [0, .5, -.5, 1, -1, 1.5, -1.5, 2.2]) {
    const a = base + off;
    if (!blocked(m.map, f.x + Math.cos(a) * 46, f.y + Math.sin(a) * 46, R)) return [Math.cos(a), Math.sin(a)];
  }
  return [dx, dy];
}
function steerTo(m, f, b, gx, gy) {
  const dx = gx - f.x, dy = gy - f.y, d = hyp(dx, dy);
  if (d < 14) { b.mx = b.my = 0; return; }
  if (losWide(m.map, f.x, f.y, gx, gy)) { b.mx = dx / d; b.my = dy / d; return; }
  const p = navNext(m.map, f.x, f.y, gx, gy);
  if (p) { const px = p.x - f.x, py = p.y - f.y, pd = hyp(px, py) || 1; b.mx = px / pd; b.my = py / pd; } else { b.mx = dx / d; b.my = dy / d; }
}
function botDecide(m, f, b, D) {
  const kit = KITS[f.id], bs = kit.basic, hpf = f.hp / f.maxhp;
  let tgt = null, td = 1e9, near = 0;
  for (const o of m.fighters) {
    if (!o.alive || o.team === f.team) continue;
    const d = hyp(o.x - f.x, o.y - f.y);
    if (d < 200) near++;
    const sc = d * (o.hp < o.maxhp * .35 ? .7 : 1) * (o.invisT > 0 && d > 130 ? 3 : 1) * (o.i === b.tgt ? .8 : 1);
    if (sc < td) { td = sc; tgt = o; }
  }
  if (m.cfg.mode === "surv" && tgt && td > 380 && m.zone && m.zone.r > 430) tgt = null;   // 서바이벌 초반: 멀리 있는 적은 쫓지 않고 돌아다닌다
  b.tgt = tgt ? tgt.i : -1;
  b.err = (rnd() * 2 - 1) * D.err;
  const dist = tgt ? hyp(tgt.x - f.x, tgt.y - f.y) : 1e9, sight = !!tgt && los(m.map, f.x, f.y, tgt.x, tgt.y, 6);
  let mode = "fight", gx = 0, gy = 0;
  if (m.zone && hyp(f.x - m.zone.x, f.y - m.zone.y) > m.zone.r - 80) { mode = "zone"; gx = m.zone.x; gy = m.zone.y; }
  if (mode === "fight" && (hpf < .5 || !tgt || dist > 420)) {
    let bd = hpf < .5 ? 560 : 330, spot = null;
    for (const it of m.items) { if (it.k === 0 && f.hp >= f.maxhp) continue; const d = hyp(it.x - f.x, it.y - f.y); if (d < bd) { bd = d; spot = it; } }
    const w = m.objs[0];
    if (hpf < .55 && w.cd <= 0) { const d = hyp(w.x - f.x, w.y - f.y); if (d < bd) { bd = d; spot = w; } }
    if (spot) { mode = "seek"; gx = spot.x; gy = spot.y; }
  }
  if (mode === "fight" && D.flee && hpf < .28 && tgt && dist < 280) mode = "flee";
  if (b.dodgeT <= 0 && D.dodge && mode !== "zone") {
    for (const p of m.proj) {
      if (p.team === f.team) continue;
      const rx = f.x - p.x, ry = f.y - p.y, sp = hyp(p.vx, p.vy) || 1, tt = (rx * p.vx + ry * p.vy) / (sp * sp);
      if (tt < 0 || tt > .45) continue;
      const cr = (rx * p.vy - ry * p.vx) / sp;
      if (Math.abs(cr) < p.r + R + 8 && rnd() < D.dodge) { const s = cr > 0 ? 1 : -1; b.dx = -p.vy / sp * s * -1; b.dy = p.vx / sp * s * -1; b.dodgeT = .3; break; }
    }
  }
  if (mode === "fight") {
    if (!tgt) {
      b.wpT = (b.wpT || 0) - D.react;
      if (!b.wp || b.wpT <= 0 || hyp(f.x - b.wp.x, f.y - b.wp.y) < 40) {
        const c = m.zone || {x:m.map.zc.x, y:m.map.zc.y, r:600};
        for (let k = 0; k < 8; k++) { const a = rnd() * 6.283, d = rnd() * c.r * .7, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d; if (!blocked(m.map, x, y, R)) { b.wp = {x, y}; break; } }
        b.wpT = 4 + rnd() * 3;
      }
      if (b.wp) steerTo(m, f, b, b.wp.x, b.wp.y); else b.mx = b.my = 0;
    }
    else {
      const pref = kit.pref;
      b.sgT -= D.react;
      if (b.sgT <= 0) { b.sg = -b.sg; b.sgT = 1 + rnd() * 1.4; }
      const ux = (tgt.x - f.x) / (dist || 1), uy = (tgt.y - f.y) / (dist || 1);
      if (dist > pref[1] + 20 || !sight) steerTo(m, f, b, tgt.x, tgt.y);
      else if (dist < pref[0] + 30 && pref[0] > 0) { const p = probe(m, f, -ux * .8 + -uy * b.sg * .4, -uy * .8 + ux * b.sg * .4); b.mx = p[0]; b.my = p[1]; }
      else if (pref[0] === 0 && dist < 56) { b.mx = -uy * b.sg * .6; b.my = ux * b.sg * .6; }
      else { const p = probe(m, f, -uy * b.sg + ux * .25, ux * b.sg + uy * .25); b.mx = p[0] * .8; b.my = p[1] * .8; }
    }
  } else if (mode === "flee") {
    const ux = (f.x - tgt.x) / (dist || 1), uy = (f.y - tgt.y) / (dist || 1), p = probe(m, f, ux, uy);
    b.mx = p[0]; b.my = p[1];
  } else steerTo(m, f, b, gx, gy);
  if ((b.mx || b.my) && hyp(f.x - b.lx, f.y - b.ly) < 7) b.stuck++; else b.stuck = 0;
  b.lx = f.x; b.ly = f.y;
  if (b.stuck >= 2) { const a = rnd() * Math.PI * 2; b.mx = Math.cos(a); b.my = Math.sin(a); b.stuck = 0; b.hold = .35; }
  b.atk = tgt && sight && dist <= bs.rng * 1.05 && rnd() < D.atkP ? 1 : 0;
  if (tgt) {
    const sc = hpf < .3 ? 1.3 : 1;
    for (let s = 0; s < 4; s++) {
      if (f.cd[s] > 0 || rnd() > D.skillP * sc) continue;
      if (botWants(m, f, kit.skills[s], s, tgt, dist, sight, hpf, near)) { b.cast = s; break; }
    }
  }
}
function botThink(m, f, dt) {
  const b = f.bot, D = DIFF[b.d];
  b.t -= dt; b.dodgeT -= dt;
  if (b.hold > 0) b.hold -= dt;
  if (b.t <= 0) { b.t = D.react * (.75 + rnd() * .5); if (b.hold <= 0) botDecide(m, f, b, D); b.cast = b.hold > 0 ? undefined : b.cast; }
  f.inp.mx = b.dodgeT > 0 ? b.dx : b.mx; f.inp.my = b.dodgeT > 0 ? b.dy : b.my;
  const t = b.tgt >= 0 ? m.fighters[b.tgt] : null;
  if (t && t.alive) {
    const kit = KITS[f.id], sp = b.cast != null && kit.skills[b.cast].spd ? kit.skills[b.cast].spd : (kit.basic.spd || 900);
    const dist = hyp(t.x - f.x, t.y - f.y), tt = kit.basic.t === "proj" || (b.cast != null && kit.skills[b.cast].t === "proj") ? Math.min(.6, dist / sp) : 0;
    const a = Math.atan2(t.y + t.vy * tt - f.y, t.x + t.vx * tt - f.x) + b.err;
    f.aimX = Math.cos(a); f.aimY = Math.sin(a); f.aimD = dist;
  }
  f.inp.atk = b.atk && f.stun <= 0 ? 1 : 0;
  if (b.cast != null) { f.inp.casts.push(b.cast); b.cast = undefined; }
}

function step(m, dt) {
  if (m.over) return;
  if (m.phase === "ready") {
    m.readyT -= dt;
    if (m.readyT <= 0) { m.phase = "play"; for (const f of m.fighters) f.invulT = Math.max(0, f.invulT - 2.2); emit(m, "go"); }
    return;
  }
  m.t += dt;
  for (const f of m.fighters) if (f.alive && f.bot) botThink(m, f, dt);
  for (const f of m.fighters) tickF(m, f, dt);
  separate(m);
  stepProj(m, dt);
  stepWorld(m, dt);
  checkEnd(m);
}
function pts(f) { return f.kills * 100 + f.assists * 40 + Math.round(f.dmg / 6) + Math.round(f.heal / 8); }
function checkEnd(m) {
  if (m.over) return;
  const F = m.fighters, mode = m.cfg.mode;
  let end = m.t >= m.limit;
  if (mode === "surv") { if (F.filter(f => f.alive).length <= 1) end = true; }
  else if (mode === "team") { if (Math.max(m.score[0], m.score[1]) >= (m.cfg.size >= 6 ? 15 : 10)) end = true; }
  else if (F.some(f => f.kills >= 20)) end = true;
  if (end) { m.over = true; m.res = buildResult(m); emit(m, "end"); }
}
function buildResult(m) {
  const F = m.fighters, mode = m.cfg.mode;
  const rows = F.map(f => ({i:f.i, id:f.id, team:f.team, kills:f.kills, deaths:f.deaths, dmg:Math.round(f.dmg), assists:f.assists, heal:Math.round(f.heal), pts:pts(f), place:0, alive:f.alive, hp:f.hp, dplace:f.place}));
  let winTeam = -1, order;
  if (mode === "team") {
    const sum = t => rows.filter(r => r.team === t).reduce((a, r) => a + r.dmg, 0), [a, b] = m.score;
    winTeam = a > b ? 0 : b > a ? 1 : sum(0) > sum(1) ? 0 : sum(1) > sum(0) ? 1 : -1;
    order = rows.slice().sort((x, y) => ((y.team === winTeam) - (x.team === winTeam)) || y.pts - x.pts);
  } else if (mode === "surv") {
    order = rows.slice().sort((x, y) => (y.alive - x.alive) || (x.alive ? y.hp - x.hp : x.dplace - y.dplace) || y.pts - x.pts);
  } else order = rows.slice().sort((x, y) => y.kills - x.kills || x.deaths - y.deaths || y.pts - x.pts);
  order.forEach((r, k) => { r.place = k + 1; });
  const pool = mode === "team" && winTeam >= 0 ? order.filter(r => r.team === winTeam) : mode === "surv" ? order.slice(0, 1) : rows;
  const mvp = pool.slice().sort((x, y) => y.pts - x.pts)[0].i;
  return {mode, winTeam, winner:order[0].i, mvp, score:m.score.slice(), t:Math.round(m.t), rows:order.map(r => [r.i, r.id, r.team, r.kills, r.deaths, r.dmg, r.assists, r.heal, r.pts, r.place])};
}
function fastForward(m) {
  for (let i = 0; i < 30000 && !m.over; i++) step(m, .05);
  m.ev.length = 0;
}

/* ---------------- 스냅샷(온라인): 방장 → 손님. 한 번에 14,000자 미만 ---------------- */
const R1 = v => Math.round(v);
function flags(f) {
  return (f.stun > 0 ? 1 : 0) | (f.slowT > 0 ? 2 : 0) | (f.hasteT > 0 ? 4 : 0) | (f.shieldT > 0 && f.shieldV > 0 ? 8 : 0) | (f.drT > 0 ? 16 : 0) | (f.ampT > 0 ? 32 : 0) |
    (f.invisT > 0 ? 64 : 0) | (f.invulT > 0 ? 128 : 0) | (f.dash ? 256 : 0) | (f.reflT > 0 ? 512 : 0) | (f.alive ? 1024 : 0);
}
function pack(m, evs) {
  return {v:1, id:m.id, ph:m.over ? 2 : m.phase === "play" ? 1 : 0, rt:+m.readyT.toFixed(1), t:+m.t.toFixed(1), c:[m.cfg.mode, m.cfg.map, m.cfg.diff, m.cfg.teamSize, m.limit],
    s:m.fighters.map(f => [f.id, f.team, f.human ? 1 : 0]),
    f:m.fighters.map(f => [R1(f.x), R1(f.y), Math.round(f.aimAng * 100), Math.max(0, Math.round(f.hp)), flags(f), Math.round(f.respT * 10), Math.round(f.shieldV), f.kills, f.deaths, Math.round(f.dmg), f.assists, Math.round(f.heal), f.combo,
      Math.round(f.cd[0] * 10), Math.round(f.cd[1] * 10), Math.round(f.cd[2] * 10), Math.round(f.cd[3] * 10), f.place]),
    p:m.proj.slice(0, 50).map(p => [R1(p.x), R1(p.y), R1(p.vx), R1(p.vy), p.r, p.id, p.big | (p.pierce ? 2 : 0)]),
    z:m.zones.map(z => [R1(z.x), R1(z.y), z.r, +z.t.toFixed(1), z.dur, z.hps > 0 ? 1 : 0, z.id]),
    tr:m.traps.map(t => [R1(t.x), R1(t.y), t.r, t.arm > 0 ? 0 : 1, t.team]),
    te:m.tele.map(t => t.k === "c" ? [0, R1(t.x), R1(t.y), t.r, +t.t.toFixed(2), t.dur, t.by, 0, 0] : [1, 0, 0, t.c.len, +t.t.toFixed(2), t.dur, t.by, +t.ang.toFixed(2), t.c.w]),
    it:m.items.map(i => [R1(i.x), R1(i.y), i.k]),
    o:m.objs.map(o => [+o.cd.toFixed(1), +o.arm.toFixed(2)]),
    zn:m.zone ? [R1(m.zone.x), R1(m.zone.y), R1(m.zone.r)] : 0, sc:m.score, e:evs || [], res:m.res};
}
function unpack(sn, view) {
  view = view || {};
  view.id = sn.id; view.phase = sn.ph === 1 ? "play" : sn.ph === 0 ? "ready" : "over"; view.readyT = sn.rt; view.t = sn.t;
  view.cfg = {mode:sn.c[0], map:sn.c[1], diff:sn.c[2], teamSize:sn.c[3], size:sn.s.length};
  view.limit = sn.c[4]; view.map = MAPS[sn.c[1]] || MAPS["3f"]; view.over = sn.ph === 2; view.res = sn.res || null; view.score = sn.sc || [0, 0];
  const F = view.fighters = view.fighters && view.fighters.length === sn.s.length ? view.fighters : sn.s.map((s, i) => ({i, id:s[0], team:s[1], human:!!s[2], x:sn.f[i][0], y:sn.f[i][1], rx:sn.f[i][0], ry:sn.f[i][1], maxhp:KITS[s[0]].hp * (HPM[sn.c[0]] || 1), cd:[0, 0, 0, 0]}));
  sn.f.forEach((a, i) => {
    const f = F[i], s = sn.s[i], fl = a[4];
    f.id = s[0]; f.team = s[1]; f.human = !!s[2]; f.maxhp = KITS[f.id].hp * (HPM[sn.c[0]] || 1);
    f.x = a[0]; f.y = a[1]; f.aimAng = a[2] / 100; f.aimX = Math.cos(f.aimAng); f.aimY = Math.sin(f.aimAng); f.hp = a[3];
    f.stun = fl & 1 ? 1 : 0; f.slowT = fl & 2 ? 1 : 0; f.hasteT = fl & 4 ? 1 : 0; f.shieldT = fl & 8 ? 1 : 0; f.drT = fl & 16 ? 1 : 0; f.ampT = fl & 32 ? 1 : 0;
    f.invisT = fl & 64 ? 1 : 0; f.invulT = fl & 128 ? 1 : 0; f.dash = fl & 256 ? {} : null; f.reflT = fl & 512 ? 1 : 0; f.alive = !!(fl & 1024);
    f.respT = a[5] / 10; f.shieldV = a[6]; f.kills = a[7]; f.deaths = a[8]; f.dmg = a[9]; f.assists = a[10]; f.heal = a[11]; f.combo = a[12];
    f.cd = [a[13] / 10, a[14] / 10, a[15] / 10, a[16] / 10]; f.place = a[17];
  });
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  view.proj = sn.p.map(p => ({x:p[0], y:p[1], vx:p[2], vy:p[3], r:p[4], id:p[5], big:p[6] & 1, pierce:!!(p[6] & 2), t0:now}));
  view.zones = sn.z.map(z => ({x:z[0], y:z[1], r:z[2], t:z[3], dur:z[4], hps:z[5], id:z[6]}));
  view.traps = sn.tr.map(t => ({x:t[0], y:t[1], r:t[2], arm:t[3] ? 0 : 1, team:t[4]}));
  view.tele = sn.te.map(t => ({k:t[0] ? "b" : "c", x:t[1], y:t[2], r:t[3], len:t[3], t:t[4], dur:t[5], by:t[6], ang:t[7], w:t[8]}));
  view.items = sn.it.map(i => ({x:i[0], y:i[1], k:i[2]}));
  view.objs = view.map ? sn.o.map((o, i) => ({k:i === 0 ? "w" : "p", x:i === 0 ? view.map.purifier.x : view.map.printers[i - 1].x, y:i === 0 ? view.map.purifier.y : view.map.printers[i - 1].y, cd:o[0], arm:o[1]})) : [];
  view.zone = sn.zn ? {x:sn.zn[0], y:sn.zn[1], r:sn.zn[2]} : null;
  return view;
}

const api = {S, MW, MH, R, MAPS, KITS, MODES, DIFF, ITEM_KINDS, blocked, los, createMatch, step, cast, makeBot, hurt, pack, unpack, fastForward, buildResult, pts, tryMove, respawn, navNext};
if (typeof module !== "undefined" && module.exports) module.exports = api;
root.BrawlCore = api;
})(typeof window !== "undefined" ? window : globalThis);
