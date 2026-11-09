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
  const cols = Math.ceil(map.w / NC), rows = Math.ceil(map.h / NC), pass = new Uint8Array(cols * rows);
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
  skills:[{n:"일섬", d:"앞을 크게 베어 밀쳐냅니다", t:"cone", cd:3.2, rng:100, ang:100, dmg:36, knock:60, delay:.22},
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
  basic:{t:"proj", spd:900, rng:470, r:8, dmg:15, rate:2.2},
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
  skills:[{n:"한 방 펀치", d:"강하게 때려 멀리 날립니다", t:"cone", cd:4, rng:92, ang:70, dmg:46, knock:130, delay:.3},
          {n:"돌격", d:"앞으로 돌진해 받아치고 기절", t:"dash", cd:8, dist:320, spd:850, dmg:35, knock:140, stun:.5},
          {n:"대지 강타", d:"바닥을 내려쳐 주변 기절", t:"circle", cd:12, r:140, dmg:35, stun:1, knock:90},
          {n:"전군 돌격", d:"멈추지 않는 긴 돌격", t:"dash", cd:26, dist:560, spd:720, dmg:70, knock:220, stun:1, inv:.8, me:{dr:[.5,2]}}]},
 {n:"소율", role:"탱커", col:"#9fd0ff", hp:400, spd:220, pref:[0,75], kr:.5,
  basic:{t:"cone", rng:74, ang:120, dmg:15, rate:1.8, knock:6},
  skills:[{n:"방패 가격", d:"방패로 쳐서 기절시킵니다", t:"cone", cd:5, rng:82, ang:80, dmg:26, stun:.8, delay:.22},
          {n:"수호 돌진", d:"짧게 돌진해 적을 밀어냅니다", t:"dash", cd:7, dist:190, spd:700, dmg:18, knock:80},
          {n:"철벽 태세", d:"3.5초간 받는 피해 크게 감소", t:"self", cd:13, me:{dr:[.55,3.5], shield:[40,3.5]}},
          {n:"도발의 외침", d:"주변 적을 끌어당기고 기절", t:"circle", cd:28, r:230, pull:140, dmg:40, stun:.6, me:{dr:[.4,4]}}]},
 {n:"이안", role:"원거리", col:"#b8c6ff", hp:255, spd:245, pref:[250,400], kr:1,
  basic:{t:"proj", spd:880, rng:460, r:8, dmg:16, rate:2},
  skills:[{n:"정밀 사격", d:"빠르고 강한 한 발", t:"proj", cd:3.6, spd:1100, rng:650, r:9, dmg:42},
          {n:"도약 후퇴", d:"뒤로 순간이동하고 빨라짐", t:"blink", cd:5.5, dist:220, back:true, me:{haste:[1.3,2]}},
          {n:"섬광탄", d:"지정한 곳을 눈부시게 해 기절", t:"circle", at:"aim", cd:11, rng:380, r:110, stun:1.1, delay:.3},
          {n:"필중 저격", d:"체력 낮은 적에게 더 큰 피해", t:"proj", cd:24, spd:1600, rng:950, r:12, dmg:135, exec:.5}]},
 {n:"태오", role:"탱커", col:"#d0c07a", hp:390, spd:222, pref:[0,75], kr:.5,
  basic:{t:"cone", rng:74, ang:120, dmg:15, rate:1.8, knock:6},
  skills:[{n:"방패 치기", d:"방패로 쳐서 멀리 밀어냅니다", t:"cone", cd:4, rng:80, ang:90, dmg:28, knock:150, delay:.22},
          {n:"방패 돌진", d:"방패를 앞세워 돌진", t:"dash", cd:6, dist:170, spd:650, dmg:20, knock:130},
          {n:"걱정 마!", d:"아군 보호막, 나는 반격 태세", t:"circle", cd:12, r:200, shield:70, me:{dr:[.7,2], refl:[.3,2]}},
          {n:"내가 다 막는다", d:"4초간 피해 대부분 막고 되돌림", t:"self", cd:28, me:{dr:[.8,4], refl:[.5,4]}, also:{r:200, pull:100, dmg:20}}]}
];
const MODES = {ffa:{label:"개인 난투", limit:180}, team:{label:"팀전", limit:180}, surv:{label:"서바이벌", limit:240}, aram:{label:"4길 전선", limit:600}};
const DIFF = [
  {label:"쉬움", react:.5, err:.30, skillP:.2, dmgMul:.65, spdMul:.86, cdMul:1.4, atkP:.7, dodge:0, flee:0},
  {label:"보통", react:.28, err:.12, skillP:.55, dmgMul:.9, spdMul:.95, cdMul:1.1, atkP:.9, dodge:.3, flee:1},
  {label:"어려움", react:.14, err:.04, skillP:.9, dmgMul:1.1, spdMul:1.02, cdMul:1, atkP:1, dodge:.65, flee:1}
];
const ITEM_KINDS = ["heal", "speed", "shield"];
const HPM = {ffa:1.2, team:1.2, surv:2.6, aram:1};   // 서바이벌은 체력 2배(한 판이 너무 빨리 끝나지 않게)

/* ---------------- 판 만들기 ---------------- */
function mkFighter(i, kn, team, human, diff, hpm) {
  const kit = KITS[kn];
  const f = {i, id:kn, team, human, x:0, y:0, aimX:1, aimY:0, aimD:260, aimAng:0, vx:0, vy:0, hp:kit.hp * hpm, maxhp:kit.hp * hpm, spd:kit.spd, alive:true, respT:0,
    kills:0, deaths:0, dmg:0, assists:0, heal:0, place:0, cd:[0, 0, 0, 0], bcd:0, stun:0, slowM:1, slowT:0, hasteM:1, hasteT:0, shieldV:0, shieldT:0,
    drV:0, drT:0, ampV:0, ampT:0, invisT:0, invulT:0, reflV:0, reflT:0, kx:0, ky:0, dash:null, lastHit:null, hits:{}, combo:0, comboT:0, flash:0, leech:0, armor:0, adM:1, apM:1, ls:0, sil:0, ccImm:0, aram:false,
    inp:{mx:0, my:0, atk:0, prio:0, casts:[]}, bot:null};
  if (!human) makeBot(f, diff);
  return f;
}
function makeBot(f, diff) {
  const D = DIFF[clamp(diff | 0, 0, 2)];
  f.human = false;
  f.bot = {d:clamp(diff | 0, 0, 2), dmgMul:D.dmgMul, spdMul:D.spdMul, cdMul:D.cdMul, t:rnd() * .3, mx:0, my:0, dx:0, dy:0, dodgeT:0, tgt:-1, err:0, atk:0, lx:0, ly:0, stuck:0, sg:rnd() < .5 ? 1 : -1, sgT:1, hold:0};
}
function createMatch(cfg) {
  const mode = MODES[cfg.mode] ? cfg.mode : "ffa", map = mode === "aram" ? MAPS.aram : (MAPS[cfg.map] || MAPS["3f"]);
  const players = (cfg.players || [{slot:0, kn:0}]).slice(0, 10);
  let n = mode === "aram" ? clamp(cfg.teamSize | 0 || 5, 1, 5) * 2 : mode === "team" ? (cfg.teamSize === 3 ? 6 : 4) : clamp(cfg.size | 0 || 10, 2, 10);
  const maxSlot = players.reduce((a, p) => Math.max(a, p.slot), 0);
  n = Math.max(n, maxSlot + 1, players.length);
  if ((mode === "team" || mode === "aram") && n % 2) n++;
  n = Math.min(10, n);
  const used = new Set(), pick = new Map();
  for (const p of players) { let k = clamp(p.kn | 0, 0, 9); while (used.has(k)) k = (k + 1) % 10; used.add(k); pick.set(p.slot, k); }
  const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(k => !used.has(k)).sort(() => rnd() - .5);
  const diff = clamp(cfg.diff | 0, 0, 2);
  const fighters = [];
  for (let i = 0; i < n; i++) {
    const human = pick.has(i), kn = human ? pick.get(i) : pool.pop();
    fighters.push(mkFighter(i, kn, (mode === "team" || mode === "aram") ? i % 2 : i, human, diff, HPM[mode]));
  }
  const m = {id:Math.random().toString(36).slice(2, 9), cfg:{mode, map:map.id, diff, teamSize:mode === "aram" ? Math.max(1, Math.round(n / 2)) : (cfg.teamSize === 3 ? 3 : 2), size:n}, map, t:0, phase:"ready", readyT:2.6,
    limit:MODES[mode].limit + (mode === "team" && n >= 6 ? 30 : 0), fighters, proj:[], zones:[], traps:[], tele:[], items:[], objs:[], ev:[], score:[0, 0], zone:null, over:false, res:null, nextItem:4, zs:0, ctr:0, all:fighters, sol:[], camps:[], bld:[], ents:[], tw:[0, 0], wave:0, wt:6, uid:100, fb:false, aram:false, winTeam:-1, tb:[0, 0], ot:false, bossDone:false};
  if (!map.aram) { m.objs.push({k:"w", x:map.purifier.x, y:map.purifier.y, cd:0, arm:0, by:-1});
  for (const p of map.printers) m.objs.push({k:"p", x:p.x, y:p.y, cd:0, arm:0, by:-1}); }
  const order = map.spawns.map((p, i) => i);
  if (mode !== "team") order.sort(() => rnd() - .5);
  fighters.forEach((f, i) => {
    if (mode === "aram") return;
    const sp = mode === "team" ? map.spawns[(f.team ? 5 : 0) + Math.floor(i / 2) % 5] : map.spawns[order[i % order.length]];
    f.x = sp.x; f.y = sp.y; f.aimAng = Math.atan2(MH / 2 - f.y, MW / 2 - f.x); f.aimX = Math.cos(f.aimAng); f.aimY = Math.sin(f.aimAng);
    f.invulT = 3;
  });
  if (!map.aram) for (let k = 0; k < 3; k++) spawnItem(m);
  if (mode === "surv") m.zone = {x:map.zc.x, y:map.zc.y, r:760};
  if (mode === "aram") aramInit(m);
  return m;
}
const emit = (m, ...a) => { if (m.ev.length < 240) m.ev.push(a); };
const same = (a, b) => a === b || a.team === b.team;

/* ---------------- 피해·치유·상태 ---------------- */
function hurt(m, src, dst, amt, o) {
  o = o || {};
  if (dst.ent) return hurtEnt(m, src, dst, amt, o);
  if (!dst.alive || dst.invulT > 0 || m.over) return 0;
  if (src && src !== dst && src.team === dst.team) return 0;
  let a = amt;
  if (src && !src.ent && !o.refl && !o.env) a *= o.basic ? (src.adM || 1) : (src.apM || 1);
  if (dst.armor) a *= 1 - dst.armor;
  if (src && !src.ent) {
    if (src.bot) a *= src.bot.dmgMul;
    if (m.tb && m.tb[src.team] > 0) a *= 1.25;
    if (src.ampT > 0) a *= 1 + src.ampV;
    if (src.combo > 1 && !o.env && !o.refl) a *= 1 + Math.min(.2, (src.combo - 1) * .025);
  }
  if (dst.drT > 0) a *= 1 - dst.drV;
  let kind = 0;
  if (o.exec && dst.hp < dst.maxhp * .4) { a *= 1 + o.exec; kind |= 1; }
  if (src && !src.ent && src !== dst && !o.refl && !o.env && !o.dot && Math.abs(angDiff(Math.atan2(src.y - dst.y, src.x - dst.x), dst.aimAng)) > 2.4) { a *= 1.25; kind |= 1; }   // 뒤에서 맞으면 치명타
  if (dst.drT > 0 && dst.drV >= .4) kind |= 2;
  a = Math.max(1, a);
  let take = a;
  if (dst.shieldT > 0 && dst.shieldV > 0) { const ab = Math.min(dst.shieldV, take); dst.shieldV -= ab; take -= ab; if (dst.shieldV <= 0) dst.shieldT = 0; }
  if (take <= .01) kind |= 4;
  dst.hp -= take; dst.flash = .16; dst.hitAt = m.t;
  if (src && !src.ent && src !== dst) {
    src.dmg += a; if (src.ls && !o.dot && !o.env && !o.refl) healF(m, src, src, a * src.ls, true); dst.lastHit = {by:src.i, t:m.t}; dst.hits[src.i] = m.t;
    if (!o.dot) { src.combo = (src.comboT > 0 ? src.combo : 0) + 1; src.comboT = 2.2; }
  }
  if (!o.quiet) emit(m, "hit", dst.i, Math.round(dst.x), Math.round(dst.y), Math.round(a), src ? src.i : -1, kind);
  if (dst.reflT > 0 && dst.reflV > 0 && src && src !== dst && !o.refl) hurt(m, dst, src, a * dst.reflV, {refl:1});
  if (dst.hp <= 0) kill(m, dst, src);
  return a;
}
function healF(m, src, dst, amt, quiet) {
  if (!dst.alive || dst.ent) return 0;
  const a = Math.min(dst.maxhp - dst.hp, amt);
  if (a <= 0) return 0;
  dst.hp += a;
  if (src) src.heal += a;
  if (!quiet) emit(m, "heal", dst.i, Math.round(a));
  return a;
}
function knockF(f, dx, dy, dist) {
  if (!dist || f.ent) return;
  const d = hyp(dx, dy) || 1, v = Math.min(1500, dist * 8 * (KITS[f.id].kr || 1));
  f.kx += dx / d * v; f.ky += dy / d * v;
}
const slowF = (f, mul, t) => { if (f.ent) return; f.slowM = f.slowT > 0 ? Math.min(f.slowM, mul) : mul; f.slowT = Math.max(f.slowT, t); };
const hasteF = (f, mul, t) => { if (f.ent) return; f.hasteM = f.hasteT > 0 ? Math.max(f.hasteM, mul) : mul; f.hasteT = Math.max(f.hasteT, t); };
function shieldF(f, v, t) { if (f.ent) return; f.shieldV = f.shieldT > 0 ? Math.max(f.shieldV, v) : v; f.shieldT = Math.max(f.shieldT, t); }
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
  let killer = src && !src.ent && src !== v ? src : null;
  if (!killer && v.lastHit && m.t - v.lastHit.t < 5) killer = m.fighters[v.lastHit.by];
  if (killer && killer.team !== v.team) { killer.kills++; if (m.cfg.mode === "team" || m.aram) m.score[killer.team]++; }
  for (const k in v.hits) { const a = m.fighters[k]; if (a && a !== killer && a.team !== v.team && m.t - v.hits[k] < 6) a.assists++; }
  if (m.aram) aramKill(m, v, killer);
  v.hits = {};
  if (m.cfg.mode === "surv") { v.place = m.fighters.filter(f => f.alive).length + 1; v.respT = 0; m.items.push({x:v.x, y:v.y, k:0, t:0}); }
  else v.respT = m.aram ? 4 + v.lvl * .8 : 3;
  emit(m, "kill", killer && killer !== v ? killer.i : -1, v.i, Math.round(v.x), Math.round(v.y));
}
function respawn(m, f) {
  if (m.aram) {
    const fo = m.map.fountain[f.team];
    f.x = fo.x + (rnd() - .5) * 150; f.y = fo.y + (f.team ? 52 : -52); f.alive = true; f.hp = f.maxhp; f.invulT = 1.8; f.kx = f.ky = 0; f.dash = null; f.lastHit = null; f.bcd = .3; f.recall = 0; f.inBase = true;
    emit(m, "respawn", f.i, Math.round(f.x), Math.round(f.y));
    return;
  }
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
  emit(m, "ring", Math.round(x), Math.round(y), c.r, f.id, (c.stun ? 1 : 0) | (c.pull ? 2 : 0) | (c.heal || c.shield ? 4 : 0) | (c.slow ? 8 : 0) | (c.knock ? 16 : 0) | (c.dmg ? 32 : 0));
  for (const o of m.all) {
    if (!o.alive) continue;
    const dx = o.x - x, dy = o.y - y, d = hyp(dx, dy);
    if (d > c.r + rad(o) * .7) continue;
    if (o.team !== f.team) {
      if (c.dmg) hurt(m, f, o, c.dmg, {});
      if (c.stun) stunF(m, o, c.stun);
      if (c.slow) slowF(o, c.slow[0], c.slow[1]);
      if (c.sil && !o.ent) o.sil = Math.max(o.sil || 0, c.sil);
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
function fireProj(m, f, sk, ang, slot) {
  const n = sk.count || 1, spread = (sk.spread || 0) * Math.PI / 180;
  for (let k = 0; k < n; k++) {
    const a = ang + (n > 1 ? (k / (n - 1) - .5) * spread : 0), c = Math.cos(a), s = Math.sin(a);
    m.proj.push({x:f.x + c * (R + 4), y:f.y + s * (R + 4), vx:c * sk.spd, vy:s * sk.spd, r:sk.r, life:sk.rng / sk.spd, dmg:sk.dmg, by:f.i, team:f.team, id:f.id,
      pierce:!!sk.pierce, hit:[], ha:sk.ha || 0, leech:sk.leech || 0, ex:sk.exec || 0, bas:slot < 0 ? 1 : 0, big:sk.dmg >= 40 || sk.r >= 16 ? 1 : 0});
  }
  emit(m, "shot", f.i, +ang.toFixed(2), slot === undefined ? -1 : slot);
}
function coneHit(m, f, c, ang, slot) {
  const half = (c.ang || 90) * Math.PI / 360;
  emit(m, "sw", f.i, +ang.toFixed(2), c.rng, c.ang || 90, slot === undefined ? -1 : slot);
  for (const o of m.all) {
    if (!o.alive || o.team === f.team) continue;
    const dx = o.x - f.x, dy = o.y - f.y, d = hyp(dx, dy);
    if (d > c.rng + rad(o) * .6) continue;
    if (d > rad(o) && Math.abs(angDiff(Math.atan2(dy, dx), ang)) > half + Math.asin(Math.min(1, rad(o) * .8 / d))) continue;
    if (!o.ent && !los(m.map, f.x, f.y, o.x, o.y)) continue;
    hurt(m, f, o, c.dmg, {basic:slot < 0});
    knockF(o, dx, dy, c.knock || 0);
    if (c.stun) stunF(m, o, c.stun);
    if (c.slow) slowF(o, c.slow[0], c.slow[1]);
  }
}
function fireBeam(m, f, c, ang) {
  if (!f.alive) return;
  const cx = Math.cos(ang), cy = Math.sin(ang);
  let len = c.len;
  for (let d = 20; d <= c.len; d += 12) if (blocked(m.map, f.x + cx * d, f.y + cy * d, 4)) { len = d; break; }
  emit(m, "beam", Math.round(f.x), Math.round(f.y), +ang.toFixed(3), Math.round(len), c.w, f.id);
  for (const o of m.all) {
    if (!o.alive || o.team === f.team) continue;
    const dx = o.x - f.x, dy = o.y - f.y, along = dx * cx + dy * cy;
    if (along < 0 || along > len + rad(o) || Math.abs(-dx * cy + dy * cx) > c.w / 2 + rad(o) * .8) continue;
    hurt(m, f, o, c.dmg, {});
    knockF(o, cx, cy, c.knock || 0);
    if (c.stun) stunF(m, o, c.stun);
  }
}
function aimPoint(m, f, ang, rng) {
  let d = Math.min(rng || 300, Math.max(60, f.aimD || 260)), x, y;
  for (; d > 0; d -= 15) { x = f.x + Math.cos(ang) * d; y = f.y + Math.sin(ang) * d; if (!blocked(m.map, x, y, 6)) break; }
  if (d <= 0) { x = f.x; y = f.y; }
  return {x, y};
}
function cast(m, f, slot) {
  if (slot >= 4) return slot === 6 ? startRecall(m, f) : spellCast(m, f, slot - 4);
  const base = KITS[f.id].skills[slot];
  if (f.aram && base && (!f.rk[slot] || f.sil > 0)) return false;
  const sk = f.aram && base ? scaleSkill(base, f, slot) : base;
  if (!sk || f.cd[slot] > 0 || f.stun > 0 || !f.alive || f.dash || m.phase !== "play") return false;
  const ang = Math.atan2(f.aimY, f.aimX);
  let ok = true;
  switch (sk.t) {
    case "proj": fireProj(m, f, sk, ang, slot); break;
    case "cone":
      if (sk.delay) { m.tele.push({k:"w", by:f.i, ang, t:sk.delay, dur:sk.delay, c:sk, slot, rng:sk.rng, arc:sk.ang || 90}); emit(m, "warn2", f.i); }
      else coneHit(m, f, sk, ang, slot);
      break;
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
      if (sk.stun) stunF(m, best, sk.stun);
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
      emit(m, "ring", Math.round(p.x), Math.round(p.y), sk.r, f.id, (sk.hps ? 4 : 0) | (sk.slow ? 8 : 0));
      break;
    }
    case "beam":
      if (sk.delay) { m.tele.push({k:"b", by:f.i, ang, t:sk.delay, dur:sk.delay, c:sk, len:sk.len, w:sk.w}); emit(m, "warn2", f.i); }
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
  if (f.recall > 0) f.recall = 0;
  emit(m, "cast", f.i, slot);
  return true;
}
function basicAttack(m, f, ang) {
  const b = KITS[f.id].basic;
  f.bcd = 1 / b.rate;
  if (b.t === "cone") coneHit(m, f, b, ang, -1);
  else fireProj(m, f, b, ang, -1);
}
function autoTarget(m, f, range) {
  let best = null, bs = 1e9;
  const pr = f.bot ? 3 : (f.inp.prio | 0);   // 0 가까운 적 · 1 약한 영웅 우선 · 2 병정 마무리 · 3 봇(영웅 > 막타 > 구조물)
  for (const o of m.all) {
    if (!o.alive || o.team === f.team || o.locked) continue;
    const d = hyp(o.x - f.x, o.y - f.y);
    if (d > range + rad(o) * .5 || (o.invisT > 0 && d > 130)) continue;
    if (!o.ent && !los(m.map, f.x, f.y, o.x, o.y, 6)) continue;
    let sc;
    if (!o.ent) sc = pr === 1 ? o.hp / o.maxhp * 1000 + d * .2 : pr === 2 ? 4000 + d : pr === 3 ? o.hp / o.maxhp * 300 + d * .3 : d;
    else if (o.kind !== "tower" && o.kind !== "core") sc = pr === 2 ? o.hp : pr === 3 ? 1500 + o.hp : pr === 1 ? 2500 + d : d + 30;
    else sc = (pr === 3 ? 3500 : pr === 0 ? d + 70 : 5000) + d * .1;
    if (sc < bs) { bs = sc; best = o; }
  }
  return best;
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
  if (f.stun > 0 && f.stun - dt <= 0) f.ccImm = 1.1;
  f.ccImm -= dt; f.sil -= dt;
  f.stun -= dt; f.slowT -= dt; f.hasteT -= dt; f.drT -= dt; f.ampT -= dt; f.invisT -= dt; f.invulT -= dt; f.reflT -= dt; f.shieldT -= dt; f.comboT -= dt;
  if (f.shieldT <= 0) f.shieldV = 0;
  if (f.comboT <= 0) f.combo = 0;
  const inp = f.inp;
  if (f.aram) aramTickHero(m, f, dt, inp);
  f.aimAng = Math.atan2(f.aimY, f.aimX);
  const ox = f.x, oy = f.y;
  let vx = 0, vy = 0;
  if (f.dash) {
    const d = f.dash;
    const wall = tryMove(m.map, f, d.vx * dt, d.vy * dt);
    d.t -= dt;
    if (d.dmg || d.stun) for (const o of m.all) {
      if (!o.alive || o.team === f.team || d.hit.includes(o.i) || hyp(o.x - f.x, o.y - f.y) > R + rad(o) + 4) continue;
      d.hit.push(o.i);
      hurt(m, f, o, d.dmg, {}); knockF(o, d.vx, d.vy, d.kb); if (d.stun) stunF(m, o, d.stun);
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
    if (f.bcd <= 0) {
      if (f.bot && !m.aram) { if (inp.atk) basicAttack(m, f, Math.atan2(f.aimY, f.aimX)); }
      else { const t = autoTarget(m, f, KITS[f.id].basic.rng); if (t) basicAttack(m, f, Math.atan2(t.y - f.y, t.x - f.x)); }
    }
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
      for (const f of m.all) {
        if (!f.alive || f.i === p.by || p.hit.includes(f.i)) continue;
        if (hyp(f.x - p.x, f.y - p.y) > p.r + rad(f) * .85) continue;
        const own = m.fighters[p.by];
        if (f.team === p.team) {
          if (p.ha && !f.ent) { p.hit.push(f.i); healF(m, own, f, p.ha); if (!p.pierce) { dead = true; break; } }
          continue;
        }
        p.hit.push(f.i);
        const a = hurt(m, own, f, p.dmg, {exec:p.ex, basic:p.bas});
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
    if (t.k === "c") applyCircle(m, f, t.x, t.y, t.c); else if (t.k === "b") fireBeam(m, f, t.c, t.ang); else if (f && f.alive && f.stun <= 0) coneHit(m, f, t.c, t.ang, t.slot);
    m.tele.splice(i, 1);
  }
  for (let i = m.zones.length - 1; i >= 0; i--) {
    const z = m.zones[i]; z.t -= dt; z.acc += dt;
    const tick = z.acc >= .5; if (tick) z.acc -= .5;
    for (const o of m.all) {
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
    if (t.arm <= 0) for (const o of m.all) {
      if (!o.alive || o.team === t.team || hyp(o.x - t.x, o.y - t.y) > t.r) continue;
      hurt(m, m.fighters[t.by], o, t.dmg, {}); if (t.stun) stunF(m, o, t.stun); fired = true;
    }
    if (fired) emit(m, "ring", Math.round(t.x), Math.round(t.y), t.r, t.id, 33);
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
        for (const f of m.fighters) if (f.alive && by && f.team !== by.team && hyp(f.x - o.x, f.y - o.y) < 150) { hurt(m, by, f, 38, {}); stunF(m, f, .4); knockF(f, f.x - o.x, f.y - o.y, 90); }
        o.cd = 14;
      }
    } else if (o.cd <= 0) {
      for (const f of m.fighters) if (f.alive && hyp(f.x - o.x, f.y - o.y) < 46) { o.arm = .9; o.by = f.i; emit(m, "jam", Math.round(o.x), Math.round(o.y)); break; }
    }
  }
  m.nextItem -= dt;
  if (m.nextItem <= 0) { m.nextItem = m.aram ? 14 : m.cfg.mode === "surv" ? 8 : 11; if (m.items.length < (m.aram ? 5 : m.cfg.mode === "surv" ? 5 : 4)) spawnItem(m); }
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
  if (m.aram) for (const f of F) { if (!f.alive || f.dash) continue; for (const b of m.bld) { if (!b.alive) continue; const dx = f.x - b.x, dy = f.y - b.y, d = hyp(dx, dy), md = b.rad + R; if (d < md && d > .01) tryMove(m.map, f, dx / d * (md - d), dy / d * (md - d)); } }
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
  if (m.aram) return aramBotThink(m, f, dt);
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
  if (m.aram) aramPre(m, dt);
  for (const f of m.fighters) if (f.alive && f.bot) botThink(m, f, dt);
  for (const f of m.fighters) tickF(m, f, dt);
  separate(m);
  stepProj(m, dt);
  stepWorld(m, dt);
  checkEnd(m);
}
function pts(f) { if (f.aram) return f.kills * 100 + f.assists * 40 + f.cs * 3 + Math.round(f.dmg / 10) + Math.round(f.heal / 8); return f.kills * 100 + f.assists * 40 + Math.round(f.dmg / 6) + Math.round(f.heal / 8); }
function checkEnd(m) {
  if (m.over) return;
  if (m.aram) { if (m.t >= m.limit) aramEnd(m, hpLead(m)); return; }
  const F = m.fighters, mode = m.cfg.mode;
  let end = m.t >= m.limit;
  if (mode === "surv") { if (F.filter(f => f.alive).length <= 1) end = true; }
  else if (mode === "team") { if (Math.max(m.score[0], m.score[1]) >= (m.cfg.size >= 6 ? 15 : 10)) end = true; }
  else if (F.some(f => f.kills >= 20)) end = true;
  if (end) { m.over = true; m.res = buildResult(m); emit(m, "end"); }
}
function buildResult(m) {
  const F = m.fighters, mode = m.cfg.mode;
  const rows = F.map(f => ({i:f.i, id:f.id, team:f.team, kills:f.kills, deaths:f.deaths, dmg:Math.round(f.dmg), assists:f.assists, heal:Math.round(f.heal), pts:pts(f), place:0, alive:f.alive, hp:f.hp, dplace:f.place, lvl:f.lvl || 0, cs:f.cs || 0, gold:Math.round(f.gold || 0)}));
  let winTeam = -1, order;
  if (mode === "team" || mode === "aram") {
    const sum = t => rows.filter(r => r.team === t).reduce((a, r) => a + r.dmg, 0), [a, b] = m.score;
    winTeam = m.aram ? m.winTeam : a > b ? 0 : b > a ? 1 : sum(0) > sum(1) ? 0 : sum(1) > sum(0) ? 1 : -1;
    order = rows.slice().sort((x, y) => ((y.team === winTeam) - (x.team === winTeam)) || y.pts - x.pts);
  } else if (mode === "surv") {
    order = rows.slice().sort((x, y) => (y.alive - x.alive) || (x.alive ? y.hp - x.hp : x.dplace - y.dplace) || y.pts - x.pts);
  } else order = rows.slice().sort((x, y) => y.kills - x.kills || x.deaths - y.deaths || y.pts - x.pts);
  order.forEach((r, k) => { r.place = k + 1; });
  const pool = (mode === "team" || mode === "aram") && winTeam >= 0 ? order.filter(r => r.team === winTeam) : mode === "surv" ? order.slice(0, 1) : rows;
  const mvp = pool.slice().sort((x, y) => y.pts - x.pts)[0].i;
  return {mode, winTeam, winner:order[0].i, mvp, score:m.score.slice(), t:Math.round(m.t), rows:order.map(r => [r.i, r.id, r.team, r.kills, r.deaths, r.dmg, r.assists, r.heal, r.pts, r.place, r.lvl, r.cs, r.gold])};
}
function fastForward(m) {
  for (let i = 0; i < 40000 && !m.over; i++) step(m, .05);
  m.ev.length = 0;
}

/* ---------------- 스냅샷(온라인): 방장 → 손님. 한 번에 14,000자 미만 ---------------- */
const R1 = v => Math.round(v);
function flags(f) {
  return (f.stun > 0 ? 1 : 0) | (f.slowT > 0 ? 2 : 0) | (f.hasteT > 0 ? 4 : 0) | (f.shieldT > 0 && f.shieldV > 0 ? 8 : 0) | (f.drT > 0 ? 16 : 0) | (f.ampT > 0 ? 32 : 0) |
    (f.invisT > 0 ? 64 : 0) | (f.invulT > 0 ? 128 : 0) | (f.dash ? 256 : 0) | (f.reflT > 0 ? 512 : 0) | (f.alive ? 1024 : 0) | (f.sil > 0 ? 2048 : 0) | (f.recall > 0 ? 4096 : 0) | (f.ccImm > 0 ? 8192 : 0);
}
function pack(m, evs) {
  return {v:1, id:m.id, ph:m.over ? 2 : m.phase === "play" ? 1 : 0, rt:+m.readyT.toFixed(1), t:+m.t.toFixed(1), c:[m.cfg.mode, m.cfg.map, m.cfg.diff, m.cfg.teamSize, m.limit],
    s:m.fighters.map(f => [f.id, f.team, f.human ? 1 : 0]),
    f:m.fighters.map(f => [R1(f.x), R1(f.y), Math.round(f.aimAng * 100), Math.max(0, Math.round(f.hp)), flags(f), Math.round(f.respT * 10), Math.round(f.shieldV), f.kills, f.deaths, Math.round(f.dmg), f.assists, Math.round(f.heal), f.combo,
      Math.round(f.cd[0] * 10), Math.round(f.cd[1] * 10), Math.round(f.cd[2] * 10), Math.round(f.cd[3] * 10), f.place, Math.round(f.maxhp)].concat(f.aram ? [f.lvl, Math.round(f.xp / xpNeed(f.lvl) * 100), f.sp, Math.round(f.gold), f.cs, f.rk[0], f.rk[1], f.rk[2], f.rk[3], Math.round(f.scd[0] * 10), Math.round(f.scd[1] * 10), f.items, Math.round(f.recall * 10), f.autoLearn ? 1 : 0] : [])),
    p:m.proj.slice(0, 50).map(p => [R1(p.x), R1(p.y), R1(p.vx), R1(p.vy), p.r, p.id, p.big | (p.pierce ? 2 : 0)]),
    z:m.zones.map(z => [R1(z.x), R1(z.y), z.r, +z.t.toFixed(1), z.dur, z.hps > 0 ? 1 : 0, z.id]),
    tr:m.traps.map(t => [R1(t.x), R1(t.y), t.r, t.arm > 0 ? 0 : 1, t.team]),
    te:m.tele.map(t => t.k === "c" ? [0, R1(t.x), R1(t.y), t.r, +t.t.toFixed(2), t.dur, t.by, 0, 0] : t.k === "w" ? [2, 0, 0, t.rng, +t.t.toFixed(2), t.dur, t.by, +t.ang.toFixed(2), t.arc] : [1, 0, 0, t.len, +t.t.toFixed(2), t.dur, t.by, +t.ang.toFixed(2), t.w]),
    it:m.items.map(i => [R1(i.x), R1(i.y), i.k]),
    o:m.objs.map(o => [+o.cd.toFixed(1), +o.arm.toFixed(2)]),
    zn:m.zone ? [R1(m.zone.x), R1(m.zone.y), R1(m.zone.r)] : 0, sc:m.score, e:evs || [], res:m.res,
    sl:m.aram ? m.sol.map(e => [R1(e.x), R1(e.y), e.mt, e.team, Math.round(e.hp / e.maxhp * 100), e.lane]) : 0, bd:m.aram ? m.bld.map(b => [Math.round(b.hp), b.alive ? 1 : 0, b.locked ? 1 : 0]) : 0,
    cp:m.aram ? m.camps.map(c => [R1(c.x), R1(c.y), c.ct, Math.round(c.hp / c.maxhp * 100), c.alive ? 1 : 0]) : 0, tb:m.aram ? [Math.round(m.tb[0]), Math.round(m.tb[1])] : 0, ot:m.ot ? 1 : 0, wt:Math.round(m.wt), wv:m.wave, tw:m.tw};
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
    if (a[18]) f.maxhp = a[18];
    f.sil = fl & 2048 ? 1 : 0; f.recall = fl & 4096 ? 1 : 0; f.ccImm = fl & 8192 ? 1 : 0;
    if (a.length > 19) { f.aram = true; f.lvl = a[19]; f.xpPct = a[20]; f.sp = a[21]; f.gold = a[22]; f.cs = a[23]; f.rk = [a[24], a[25], a[26], a[27]]; f.scd = [a[28] / 10, a[29] / 10]; f.items = a[30]; f.recallT = a[31] / 10; f.autoLearn = !!a[32]; }
  });
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  view.proj = sn.p.map(p => ({x:p[0], y:p[1], vx:p[2], vy:p[3], r:p[4], id:p[5], big:p[6] & 1, pierce:!!(p[6] & 2), t0:now}));
  view.zones = sn.z.map(z => ({x:z[0], y:z[1], r:z[2], t:z[3], dur:z[4], hps:z[5], id:z[6]}));
  view.traps = sn.tr.map(t => ({x:t[0], y:t[1], r:t[2], arm:t[3] ? 0 : 1, team:t[4]}));
  view.tele = sn.te.map(t => ({k:t[0] === 2 ? "w" : t[0] ? "b" : "c", x:t[1], y:t[2], r:t[3], len:t[3], rng:t[3], t:t[4], dur:t[5], by:t[6], ang:t[7], w:t[8], arc:t[8]}));
  view.items = sn.it.map(i => ({x:i[0], y:i[1], k:i[2]}));
  view.objs = view.map ? sn.o.map((o, i) => ({k:i === 0 ? "w" : "p", x:i === 0 ? view.map.purifier.x : view.map.printers[i - 1].x, y:i === 0 ? view.map.purifier.y : view.map.printers[i - 1].y, cd:o[0], arm:o[1]})) : [];
  if (sn.bd) {
    const mp = view.map;
    view.bld = sn.bd.map((b, i) => { const t = i < 5 ? 0 : 1, ln = i % 5, core = ln === 4, p = core ? mp.core[t] : mp.towers[t][ln]; return {ent:true, kind:core ? "core" : "tower", team:t, lane:ln, x:p.x, y:p.y, rad:core ? CORE_RAD : TWR.rad, hp:b[0], maxhp:core ? CORE_HP : TWR.hp, alive:!!b[1], locked:!!b[2]}; });
    view.sol = sn.sl.map(e => ({ent:true, kind:"soldier", mt:e[2], team:e[3], lane:e[5], x:e[0], y:e[1], rad:MT[e[2]].rad, hp:e[4], maxhp:100, alive:true}));
    view.camps = sn.cp.map(c => ({ent:true, kind:c[2] === 3 ? "boss" : "camp", ct:c[2], team:-1, x:c[0], y:c[1], rad:CAMP[c[2]].rad, hp:c[3], maxhp:100, alive:!!c[4]}));
    view.wt = sn.wt; view.wave = sn.wv; view.tw = sn.tw || [0, 0]; view.tb = sn.tb || [0, 0]; view.ot = !!sn.ot; view.aram = true;
  } else { view.bld = []; view.sol = []; view.camps = []; view.aram = false; }
  view.zone = sn.zn ? {x:sn.zn[0], y:sn.zn[1], r:sn.zn[2]} : null;
  return view;
}

/* ================= 4길 전선: 4개 길 · 병정 행렬 · 방어탑/라운드 코어 · 중립 캠프 · 중앙 보스 · 레벨/골드/상점 · 복귀 · 보조 기술 ================= */
const AW = 1500, AH = 2200, LANE_X = [170, 530, 970, 1330], LHW = 75, OT = 360, BOSS_AT = 150;
(function () {
  const walls = [], segs = [[380, 560], [680, 1040], [1160, 1520], [1640, 1820]];
  for (const x of [245, 455, 605, 895, 1045, 1255]) for (const [a, b] of segs) walls.push({kind:"wall", x:x - 7, y:a, w:14, h:b - a, label:""});
  MAPS.aram = {id:"aram", name:"4길 전선", plan:"", w:AW, h:AH, bounds:[95, 60, 1405, 2140], aram:true, nav:null, solids:walls,
    spawns:[], items:[{x:350, y:1580}, {x:1150, y:1580}, {x:350, y:620}, {x:1150, y:620}, {x:750, y:1610}, {x:750, y:590}], purifier:{x:-999, y:-999}, printers:[], zc:{x:750, y:1100},
    core:[{x:750, y:1950}, {x:750, y:250}], towers:[LANE_X.map(x => ({x, y:1480})), LANE_X.map(x => ({x, y:720}))], fountain:[{x:750, y:2070}, {x:750, y:130}],
    camps:[{x:350, y:1340, ct:0}, {x:350, y:860, ct:0}, {x:1150, y:1340, ct:1}, {x:1150, y:860, ct:1}, {x:750, y:1420, ct:2}, {x:750, y:780, ct:2}, {x:750, y:1100, ct:3}]};
})();
const MT = [   // 병정: 서류 병정(근접) · 볼펜 병정(원거리) · 복사기 대포
  {n:"서류 병정", hp:700, dmg:22, rng:42, rate:1.1, spd:150, rad:16, gold:20, xp:40},
  {n:"볼펜 병정", hp:430, dmg:26, rng:220, rate:1.2, spd:150, rad:13, gold:16, xp:32},
  {n:"복사기 대포", hp:1100, dmg:50, rng:280, rate:1.8, spd:130, rad:21, gold:44, xp:80}];
const CAMP = [   // 중립 캠프: 처치하면 골드·경험치·개인 강화 / 서류 거인은 팀 전체 강화
  {n:"커피잔 괴물", hp:950, dmg:30, rng:62, rate:1.2, spd:130, rad:24, gold:70, xp:110, aggro:230},
  {n:"회전의자 괴물", hp:950, dmg:30, rng:62, rate:1.2, spd:130, rad:24, gold:70, xp:110, aggro:230},
  {n:"스테이플러 괴물", hp:1150, dmg:34, rng:62, rate:1.2, spd:130, rad:26, gold:90, xp:130, aggro:230},
  {n:"서류 거인", hp:4200, dmg:70, rng:110, rate:1.7, spd:90, rad:46, gold:260, xp:300, aggro:300}];
const CAMP_BUF = ["커피 활력(체력 회복)", "의자 질주(이동 속도)", "스테이플러 분노(공격력)"];
const TWR = {hp:950, dmg:90, rng:420, rate:1.15, rad:36}, CORE_HP = 1500, CORE_RAD = 58;
const ITEMS = [
  {n:"단검", d:"기본공격 피해 +20%", cost:400, ad:.2, ic:"sword"},
  {n:"마법 지팡이", d:"스킬 피해 +20%", cost:450, ap:.2, ic:"staff"},
  {n:"전투 깃발", d:"기본공격·스킬 피해 +10%", cost:600, ad:.1, ap:.1, ic:"flag"},
  {n:"체력 구슬", d:"최대 체력 +160", cost:450, hp:160, ic:"heart"},
  {n:"사슬 갑옷", d:"받는 피해 -10%", cost:500, ar:.1, ic:"mail"},
  {n:"신속 신발", d:"이동속도 +12%", cost:350, ms:.12, ic:"boot"},
  {n:"재생 목걸이", d:"체력 재생 +4/초", cost:350, rg:4, ic:"leaf"},
  {n:"시간의 시계", d:"스킬 쿨타임 -10%", cost:500, cdr:.1, ic:"clock"},
  {n:"흡혈 반지", d:"준 피해의 8% 회복", cost:550, ls:.08, ic:"fang"}];
const GROW = [   // gd = 공격 성장 계수, gh = 체력 성장 계수, buy = 봇 구매 순서
  {gd:1.15, gh:1, buy:[0, 5, 8, 2, 3, 4]}, {gd:1.25, gh:.9, buy:[0, 5, 8, 7, 2, 3]}, {gd:1.05, gh:1.05, buy:[7, 5, 3, 6, 1, 4]}, {gd:1.2, gh:.9, buy:[0, 5, 8, 2, 7, 3]},
  {gd:1.15, gh:.95, buy:[1, 7, 5, 3, 6, 2]}, {gd:1.2, gh:.95, buy:[2, 5, 8, 1, 3, 7]}, {gd:1.05, gh:1.15, buy:[3, 4, 5, 8, 0, 6]}, {gd:.8, gh:1.3, buy:[4, 3, 5, 6, 7, 8]},
  {gd:1.2, gh:.9, buy:[0, 5, 2, 8, 7, 3]}, {gd:.8, gh:1.3, buy:[4, 3, 6, 5, 7, 8]}];
const xpNeed = l => 90 + 40 * l, XPM = .85;
const rad = o => o.rad || R;
const stunF = (m, f, t) => { if (f.ent) return; if (f.ccImm > 0) t *= .35; if (t > .05) f.stun = Math.max(f.stun, t); };   // 연속 기절 방지: 기절 직후 1.1초는 효과 35%
const ann = (m, kind, i, team) => emit(m, "ann", kind, i, team !== undefined ? team : (m.fighters[i] ? m.fighters[i].team : -1));
const otm = m => m.ot ? 1 + (m.t - OT) / 90 : 1;
function recalc(f) {
  const G = GROW[f.id], it = f.items.map(i => ITEMS[i]), sum = k => it.reduce((a, x) => a + (x[k] || 0), 0), L = f.lvl - 1;
  const mx = Math.round(KITS[f.id].hp * (1 + .075 * L * G.gh) + sum("hp"));
  if (mx > f.maxhp) f.hp += mx - f.maxhp;
  f.maxhp = mx; f.hp = Math.min(f.hp, mx);
  const g = 1 + .055 * L * G.gd;
  f.adM = g * (1 + sum("ad")); f.apM = g * (1 + sum("ap")); f.armor = Math.min(.45, sum("ar")); f.regen = sum("rg"); f.cdr = Math.min(.4, sum("cdr")); f.ls = sum("ls");
  f.spd = KITS[f.id].spd * (1 + Math.min(.4, sum("ms")));
}
function gainXp(m, f, amt) {
  if (!f.aram || f.lvl >= 12 || amt <= 0) return;
  f.xp += amt * XPM;
  while (f.lvl < 12 && f.xp >= xpNeed(f.lvl)) { f.xp -= xpNeed(f.lvl); f.lvl++; f.sp++; recalc(f); emit(m, "lvl", f.i, f.lvl); }
  if (f.lvl >= 12) f.xp = 0;
}
function learn(m, f, slot) {
  if (!f.aram || f.sp <= 0 || !(slot >= 0 && slot <= 3)) return false;
  const rk = f.rk[slot], max = slot === 3 ? (f.lvl >= 12 ? 2 : f.lvl >= 6 ? 1 : 0) : Math.min(4, Math.ceil(f.lvl / 2));
  if (rk >= max) return false;
  f.rk[slot]++; f.sp--; emit(m, "learn", f.i, slot, f.rk[slot]);
  return true;
}
function autoLearn(m, f) {
  while (f.sp > 0) {
    if (learn(m, f, 3)) continue;
    let done = false;
    for (const s of [0, 2, 1].sort((a, b) => f.rk[a] - f.rk[b])) if (learn(m, f, s)) { done = true; break; }
    if (!done) break;
  }
}
function buy(m, f, idx) {
  const it = ITEMS[idx];
  if (!f.aram || !it || f.items.length >= 6 || f.gold < it.cost || !(f.inBase || !f.alive)) return false;
  f.gold -= it.cost; f.items.push(idx); recalc(f); emit(m, "buy", f.i, idx);
  return true;
}
function sell(m, f, k) {
  if (!f.aram || !(f.inBase || !f.alive) || !(k >= 0 && k < f.items.length)) return false;
  const idx = f.items.splice(k, 1)[0]; f.gold += Math.round(ITEMS[idx].cost * .7); recalc(f);
  return true;
}
function startRecall(m, f) {   // 복귀: 7초 동안 가만히 있으면 휴게실로
  if (!f.aram || !f.alive || f.inBase || f.recall > 0 || f.stun > 0 || m.phase !== "play") return false;
  f.recall = 7; emit(m, "recall", f.i, Math.round(f.x), Math.round(f.y));
  return true;
}
function spellCast(m, f, idx) {   // 보조 기술: 0 회복 · 1 순간이동
  if (!f.aram || f.scd[idx] > 0 || f.stun > 0 || !f.alive || m.phase !== "play") return false;
  if (idx === 0) { healF(m, f, f, f.maxhp * .25); hasteF(f, 1.25, 2); emit(m, "sum", f.i, 0); f.scd[0] = 60; }
  else {
    const ang = Math.atan2(f.aimY, f.aimX), cx = Math.cos(ang), cy = Math.sin(ang), ox = f.x, oy = f.y;
    let d = 0;
    while (d < 300) { const nd = Math.min(300, d + 10); if (blocked(m.map, ox + cx * nd, oy + cy * nd, R)) break; d = nd; }
    if (d < 40) return false;
    f.x = ox + cx * d; f.y = oy + cy * d; f.dash = null;
    emit(m, "blink", Math.round(ox), Math.round(oy), Math.round(f.x), Math.round(f.y), f.id); emit(m, "sum", f.i, 1); f.scd[1] = 60;
  }
  if (f.recall > 0) f.recall = 0;
  return true;
}
function scaleSkill(sk, f, slot) {
  const rk = Math.max(1, f.rk[slot]), mul = slot === 3 ? 1 + .35 * (rk - 1) : 1 + .18 * (rk - 1), s = Object.assign({}, sk);
  for (const k of ["dmg", "heal", "shield", "dps", "hps", "ha"]) if (s[k]) s[k] = s[k] * mul;
  if (s.end) s.end = Object.assign({}, s.end, {dmg:(s.end.dmg || 0) * mul});
  if (s.also) s.also = Object.assign({}, s.also, {dmg:(s.also.dmg || 0) * mul});
  s.cd = sk.cd * (1 - .05 * (rk - 1)) * (1 - f.cdr);
  return s;
}
function aramInitHero(m, f) {
  Object.assign(f, {aram:true, lvl:1, xp:0, sp:1, rk:[0, 0, 0, 0], gold:500, cs:0, items:[], scd:[0, 0], recall:0, streak:0, mk:0, mkT:-99, inBase:true, hitAt:-9, autoLearn:true, bufHeal:0});
  recalc(f); f.hp = f.maxhp; learn(m, f, 0);
}
function mkCamp(m, d) {
  const T = CAMP[d.ct];
  return {ent:true, kind:d.ct === 3 ? "boss" : "camp", ct:d.ct, i:m.uid++, team:-1, home:{x:d.x, y:d.y}, x:d.x, y:d.y, rad:T.rad, hp:T.hp, maxhp:T.hp, alive:d.ct !== 3, respT:0, cd:1, tg:null, flash:0, locked:false,
    invulT:0, drT:0, shieldT:0, shieldV:0, stun:0, kx:0, ky:0, slowT:0, hasteT:0};
}
function aramInit(m) {
  m.aram = true; m.nextItem = 8; m.tb = [0, 0]; m.ot = false;
  const mp = m.map;
  for (let t = 0; t < 2; t++) {
    const mk = (kind, p, lane, hp, rd) => { m.bld.push({ent:true, kind, i:m.uid++, team:t, x:p.x, y:p.y, rad:rd, hp, maxhp:hp, alive:true, locked:false, lane, atkCd:1, flash:0, invulT:0, drT:0, shieldT:0, shieldV:0, stun:0, kx:0, ky:0, slowT:0, hasteT:0}); };
    for (let L = 0; L < 4; L++) mk("tower", mp.towers[t][L], L, TWR.hp, TWR.rad);
    mk("core", mp.core[t], 4, CORE_HP, CORE_RAD);
  }
  for (const d of mp.camps) m.camps.push(mkCamp(m, d));
  const cnt = [0, 0];
  for (const f of m.fighters) {
    aramInitHero(m, f);
    const k = cnt[f.team]++, fo = mp.fountain[f.team];
    f.x = fo.x + ((k % 5) - 2) * 52; f.y = fo.y + (f.team ? 52 : -52); f.aimAng = f.team ? Math.PI / 2 : -Math.PI / 2; f.aimX = Math.cos(f.aimAng); f.aimY = Math.sin(f.aimAng); f.invulT = 3;
    if (f.bot) { f.bot.lane = [1, 2, 0, 3][k % 4]; f.bot.jg = k >= 4; }
  }
  m.ents = m.bld.concat(m.camps); m.all = m.fighters.concat(m.ents);
}
function aramTickHero(m, f, dt, inp) {
  for (let i = 0; i < 2; i++) f.scd[i] = Math.max(0, f.scd[i] - dt);
  f.hp = Math.min(f.maxhp, f.hp + (f.regen + f.maxhp * .004) * dt);
  if (f.bufHeal > 0) { f.bufHeal -= dt; f.hp = Math.min(f.maxhp, f.hp + f.maxhp * .035 * dt); }
  f.gold += 3 * dt; gainXp(m, f, 1.6 * dt);
  if (f.autoLearn && f.sp > 0) autoLearn(m, f);
  if (f.recall > 0) {
    if (Math.hypot(inp.mx, inp.my) > .25 || m.t - f.hitAt < .2 || f.stun > 0) { f.recall = 0; emit(m, "recallx", f.i); }
    else {
      f.recall -= dt;
      if (f.recall <= 0) { const fo = m.map.fountain[f.team], ox = f.x, oy = f.y; f.x = fo.x + (rnd() - .5) * 150; f.y = fo.y + (f.team ? 52 : -52); f.kx = f.ky = 0; emit(m, "tele", f.i, Math.round(ox), Math.round(oy), Math.round(f.x), Math.round(f.y)); }
    }
  }
}
function aramKill(m, v, killer) {
  v.streak = 0;
  if (killer && killer.team !== v.team) {
    const first = !m.fb; m.fb = true;
    killer.gold += 300 + (killer.streak >= 3 ? 60 : 0); killer.streak++;
    killer.mk = (m.t - killer.mkT < 10 ? killer.mk : 0) + 1; killer.mkT = m.t;
    gainXp(m, killer, 90 + v.lvl * 16);
    for (const a of m.fighters) if (a.alive && a.team === killer.team && a !== killer && hyp(a.x - v.x, a.y - v.y) < 700) gainXp(m, a, 45);
    if (first) ann(m, "fb", killer.i);
    if (killer.mk >= 2) ann(m, "mk" + Math.min(5, killer.mk), killer.i);
    if (killer.streak === 3) ann(m, "spree", killer.i); else if (killer.streak === 6) ann(m, "legend", killer.i);
  }
  for (const k in v.hits) { const a = m.fighters[k]; if (a && a !== killer && a.team !== v.team && m.t - v.hits[k] < 6) { a.gold += 120; gainXp(m, a, 45); } }
  if (m.fighters.every(f => f.team !== v.team || !f.alive)) ann(m, "ace", killer ? killer.i : -1, 1 - v.team);
}
function hurtEnt(m, src, dst, amt, o) {
  if (!dst.alive || dst.locked || m.over) return 0;
  if (src && src.team === dst.team) return 0;
  const struct = dst.kind === "tower" || dst.kind === "core";
  let a = amt;
  if (src && !src.ent) {
    if (src.bot) a *= src.bot.dmgMul;
    a *= o.basic ? (src.adM || 1) : (src.apM || 1);
    if (m.tb[src.team] > 0) a *= 1.25;
    if (struct) a *= .7 * otm(m);
  } else if (struct && src && src.kind === "soldier") a *= otm(m);
  a = Math.max(1, a);
  dst.hp -= a; dst.flash = .12;
  if (src && !src.ent) {
    src.dmg += a; if (src.ls && !o.dot) healF(m, src, src, a * src.ls * .5, true);
    if (dst.kind === "camp" || dst.kind === "boss") dst.tg = src;
    if (!o.quiet) emit(m, "ehit", Math.round(dst.x), Math.round(dst.y - 20), Math.round(a), src.i, struct ? 1 : 0);
  }
  if (dst.hp <= 0) entDie(m, dst, src);
  return a;
}
function entDie(m, e, src) {
  e.alive = false; e.hp = 0;
  const hero = src && !src.ent ? src : null;
  if (e.kind === "soldier") {
    const T = MT[e.mt], near = m.fighters.filter(f => f.alive && f.team !== e.team && hyp(f.x - e.x, f.y - e.y) < 700), share = T.xp * e.scale * 1.2 / Math.max(1, near.length);
    for (const f of near) gainXp(m, f, share + (f === hero ? T.xp * .15 : 0));
    if (hero) { const g = Math.round(T.gold * (1 + .02 * m.wave)); hero.gold += g; hero.cs++; emit(m, "cs", hero.i, g, Math.round(e.x), Math.round(e.y)); }
    emit(m, "sdie", Math.round(e.x), Math.round(e.y), e.mt, e.team);
  } else if (e.kind === "camp" || e.kind === "boss") {
    const T = CAMP[e.ct], boss = e.kind === "boss";
    e.respT = 40;
    if (hero) {
      const mates = m.fighters.filter(f => f.alive && f.team === hero.team && (boss || hyp(f.x - e.x, f.y - e.y) < 700));
      for (const f of mates) { f.gold += f === hero ? T.gold : Math.round(T.gold * (boss ? 1 : .3)); gainXp(m, f, f === hero ? T.xp : T.xp * .5); }
      if (boss) { m.tb[hero.team] = 90; ann(m, "bossdie", hero.i, hero.team); }
      else if (e.ct === 0) hero.bufHeal = 25;
      else if (e.ct === 1) hasteF(hero, 1.18, 25);
      else { hero.ampV = .2; hero.ampT = 25; }
      if (!boss) emit(m, "buf", hero.i, e.ct);
    }
    emit(m, "cdie", Math.round(e.x), Math.round(e.y), e.ct, hero ? hero.i : -1);
  } else if (e.kind === "tower") {
    const win = 1 - e.team; m.tw[win]++;
    for (const f of m.fighters) if (f.team === win) { f.gold += 140; gainXp(m, f, 110); }
    emit(m, "tower", e.team, e.lane, Math.round(e.x), Math.round(e.y)); ann(m, "tower", hero ? hero.i : -1, e.team);
  } else {
    emit(m, "core", e.team, Math.round(e.x), Math.round(e.y));
    aramEnd(m, 1 - e.team);
  }
}
function aramEnd(m, winTeam) {
  if (m.over) return;
  m.winTeam = winTeam; m.over = true; m.res = buildResult(m); emit(m, "end");
}
function hpLead(m) {   // 시간 종료: 남은 방어탑·코어 체력 합이 큰 팀 승리
  const s = [0, 0];
  for (const b of m.bld) if (b.alive) s[b.team] += b.hp;
  return s[0] === s[1] ? (m.score[0] >= m.score[1] ? 0 : 1) : s[0] > s[1] ? 0 : 1;
}
function spawnWave(m, team) {
  const dirF = team ? 1 : -1, y0 = team ? 330 : 1870, types = [0, 0, 1];
  if (m.wave % 3 === 0) types.push(2);
  const sc = (1 + .045 * m.wave) * (m.ot ? 1.4 : 1) * (m.tb[team] > 0 ? 1.25 : 1);
  for (let L = 0; L < 4; L++) types.forEach((mt, j) => {
    const T = MT[mt];
    m.sol.push({ent:true, kind:"soldier", i:m.uid++, mt, team, lane:L, x:LANE_X[L] + (rnd() - .5) * 40, y:y0 - dirF * j * 34, lx:LANE_X[L] + (rnd() - .5) * 60, rad:T.rad, hp:T.hp * sc, maxhp:T.hp * sc, alive:true, cd:rnd() * T.rate, flash:0, locked:false,
      invulT:0, drT:0, shieldT:0, shieldV:0, stun:0, kx:0, ky:0, slowT:0, hasteT:0, scale:sc});
  });
}
function soldierStep(m, e, dt) {
  const T = MT[e.mt], dirF = e.team ? 1 : -1, lx = LANE_X[e.lane];
  e.cd -= dt; e.flash -= dt;
  let tg = null, bd = 1e9;
  for (const o of m.ents) {
    if (!o.alive || o.team === e.team || o.team < 0 || o.locked) continue;
    if (Math.abs(o.x - e.x) > 130 && o.kind !== "core") continue;
    const d = hyp(o.x - e.x, o.y - e.y) - o.rad;
    if (d > T.rng + 90) continue;
    const sc = d + (o.kind === "soldier" ? 0 : 140);
    if (sc < bd) { bd = sc; tg = o; }
  }
  if (!tg) for (const h of m.fighters) {
    if (!h.alive || h.team === e.team || h.invulT > 0 || Math.abs(h.x - e.x) > 130) continue;
    const d = hyp(h.x - e.x, h.y - e.y) - R;
    if (d < T.rng + 30 && d < bd) { bd = d; tg = h; }
  }
  if (tg) {
    const dist = hyp(tg.x - e.x, tg.y - e.y) - rad(tg);
    if (dist > T.rng) { const a = Math.atan2(tg.y - e.y, tg.x - e.x); e.x += Math.cos(a) * T.spd * dt; e.y += Math.sin(a) * T.spd * dt; }
    else if (e.cd <= 0) {
      e.cd = T.rate; const dm = T.dmg * (1 + .035 * m.wave) * (m.tb[e.team] > 0 ? 1.25 : 1) * (m.ot ? 1.4 : 1);
      emit(m, "ahit", Math.round(e.x), Math.round(e.y), Math.round(tg.x), Math.round(tg.y), e.mt);
      if (tg.ent) hurtEnt(m, e, tg, dm * (tg.kind === "soldier" ? 1 : 1.5), {quiet:1}); else hurt(m, e, tg, dm, {});
    }
  } else {
    const inHall = e.team ? e.y > 1780 : e.y < 420, cx = m.map.core[1 - e.team].x, tx = inHall ? cx : e.lx;
    e.y += dirF * T.spd * dt; e.x += clamp(tx - e.x, -1, 1) * 40 * dt;
  }
  if (e.y > 380 && e.y < 1820) e.x = clamp(e.x, lx - LHW + 14, lx + LHW - 14);
}
function campStep(m, e, dt) {
  const T = CAMP[e.ct];
  if (!e.alive) {
    if (e.ct === 3) { if (!m.bossDone && m.t >= BOSS_AT) { m.bossDone = true; e.alive = true; e.hp = e.maxhp; e.x = e.home.x; e.y = e.home.y; ann(m, "boss", -1, -1); } }
    else { e.respT -= dt; if (e.respT <= 0) { e.alive = true; e.hp = e.maxhp; e.x = e.home.x; e.y = e.home.y; e.tg = null; } }
    return;
  }
  e.cd -= dt; e.flash -= dt;
  let tg = e.tg && e.tg.alive && hyp(e.tg.x - e.home.x, e.tg.y - e.home.y) < 420 ? e.tg : null;
  if (!tg) { let bd = 1e9; for (const h of m.fighters) { if (!h.alive || h.invulT > 0) continue; const d = hyp(h.x - e.x, h.y - e.y); if (d < T.aggro && d < bd) { bd = d; tg = h; } } }
  e.tg = tg;
  if (tg) {
    const dx = tg.x - e.x, dy = tg.y - e.y, dist = hyp(dx, dy) - R;
    if (dist > T.rng) tryMove(m.map, e, dx / (dist + R) * T.spd * dt, dy / (dist + R) * T.spd * dt);
    else if (e.cd <= 0) {
      e.cd = T.rate; emit(m, "ahit", Math.round(e.x), Math.round(e.y), Math.round(tg.x), Math.round(tg.y), 3);
      if (e.kind === "boss") { emit(m, "ring", Math.round(e.x), Math.round(e.y), 130, 6, 32); for (const h of m.fighters) if (h.alive && hyp(h.x - e.x, h.y - e.y) < 130 + R) hurt(m, e, h, T.dmg, {}); }
      else hurt(m, e, tg, T.dmg, {});
    }
  } else {
    const dx = e.home.x - e.x, dy = e.home.y - e.y, d = hyp(dx, dy);
    if (d > 6) tryMove(m.map, e, dx / d * T.spd * dt, dy / d * T.spd * dt);
    e.hp = Math.min(e.maxhp, e.hp + e.maxhp * .06 * dt);
  }
}
function towerStep(m, b, dt) {
  b.atkCd -= dt; b.flash -= dt;
  if (b.atkCd > 0) return;
  let tg = null, bd = 1e9;
  for (const e of m.sol) if (e.alive && e.team !== b.team && Math.abs(e.x - b.x) < 150) { const d = hyp(e.x - b.x, e.y - b.y); if (d < TWR.rng + e.rad && d < bd) { bd = d; tg = e; } }
  if (!tg) for (const h of m.fighters) if (h.alive && h.team !== b.team && h.invulT <= 0) { const d = hyp(h.x - b.x, h.y - b.y); if (d < TWR.rng && d < bd && los(m.map, b.x, b.y, h.x, h.y, 4)) { bd = d; tg = h; } }
  if (!tg) { b.atkCd = .25; return; }
  b.atkCd = TWR.rate;
  const dm = TWR.dmg * (m.ot ? 1.4 : 1) * (tg.ent ? 1.25 : 1);
  emit(m, "tbolt", Math.round(b.x), Math.round(b.y - 40), Math.round(tg.x), Math.round(tg.y), b.team);
  if (tg.ent) hurtEnt(m, b, tg, dm, {quiet:1}); else hurt(m, b, tg, dm, {});
}
function aramPre(m, dt) {
  m.wt -= dt;
  if (m.wt <= 0) { m.wt = 24; m.wave++; spawnWave(m, 0); spawnWave(m, 1); emit(m, "wave", m.wave); }
  if (!m.ot && m.t >= OT) { m.ot = true; ann(m, "ot", -1, -1); }
  m.tb[0] = Math.max(0, m.tb[0] - dt); m.tb[1] = Math.max(0, m.tb[1] - dt);
  for (let t = 0; t < 2; t++) { const B = m.bld.slice(t * 5, t * 5 + 5); B[4].locked = !m.ot && B.filter(x => x.kind === "tower" && !x.alive).length < 2; }
  for (const e of m.sol) if (e.alive) soldierStep(m, e, dt);
  for (let a = 0; a < m.sol.length; a++) for (let b = a + 1; b < m.sol.length; b++) {
    const p = m.sol[a], q = m.sol[b];
    if (p.team !== q.team || !p.alive || !q.alive || Math.abs(p.y - q.y) > 40) continue;
    const dx = q.x - p.x, dy = q.y - p.y, d = hyp(dx, dy), md = p.rad + q.rad;
    if (d < md && d > .01) { const k = (md - d) * .25; p.x -= dx / d * k; q.x += dx / d * k; }
  }
  for (const c of m.camps) campStep(m, c, dt);
  for (const b of m.bld) if (b.alive && b.kind === "tower") towerStep(m, b, dt);
  for (const f of m.fighters) if (f.alive) {
    const own = m.map.fountain[f.team], en = m.map.fountain[1 - f.team];
    f.inBase = hyp(f.x - own.x, f.y - own.y) < 200;
    if (f.inBase && f.hp < f.maxhp) f.hp = Math.min(f.maxhp, f.hp + f.maxhp * .32 * dt);
    if (hyp(f.x - en.x, f.y - en.y) < 210) hurt(m, null, f, 900 * dt, {env:1, dot:1, quiet:1});
  }
  m.sol = m.sol.filter(e => e.alive);
  m.ents = m.bld.concat(m.sol, m.camps); m.all = m.fighters.concat(m.ents);
}

/* ---- 봇: 맡은 길의 병정 전선을 따라 싸우고, 길이 비면 중립 캠프·중앙 보스·보급 상자로, 체력이 낮으면 복귀 ---- */
function botBuy(m, f, G) {
  for (const idx of G.buy) {
    if (f.items.length >= 6) return;
    if (f.items.filter(x => x === idx).length >= (idx === 5 ? 1 : 2)) continue;
    if (f.gold >= ITEMS[idx].cost) { buy(m, f, idx); return; }
  }
}
function aramBotThink(m, f, dt) {
  const b = f.bot, D = DIFF[b.d];
  b.t -= dt; b.dodgeT -= dt;
  if (b.hold > 0) b.hold -= dt;
  if (b.t <= 0) { b.t = D.react * (.8 + rnd() * .4); if (b.hold <= 0) aramDecide(m, f, b, D); }
  f.inp.mx = b.dodgeT > 0 ? b.dx : b.mx; f.inp.my = b.dodgeT > 0 ? b.dy : b.my; f.inp.prio = 3;
  const t = b.te && b.te.alive ? b.te : null;
  if (t && f.alive) {
    const kit = KITS[f.id], sk = b.cast != null ? kit.skills[b.cast] : null, sp = sk && sk.spd ? sk.spd : (kit.basic.spd || 900);
    const dist = hyp(t.x - f.x, t.y - f.y), tt = (sk && sk.t === "proj") || (!sk && kit.basic.t === "proj") ? Math.min(.6, dist / sp) : 0;
    const a = Math.atan2(t.y + (t.vy || 0) * tt - f.y, t.x + (t.vx || 0) * tt - f.x) + (t.ent ? 0 : b.err);
    f.aimX = Math.cos(a); f.aimY = Math.sin(a); f.aimD = dist;
  }
  if (b.cast != null) { f.inp.casts.push(b.cast); b.cast = undefined; }
}
function aramDecide(m, f, b, D) {
  const kit = KITS[f.id], G = GROW[f.id], team = f.team, dirF = team ? 1 : -1, hpf = f.hp / f.maxhp, map = m.map, fo = map.fountain[team];
  b.cast = undefined; b.err = (rnd() * 2 - 1) * D.err;
  if (f.sp > 0) autoLearn(m, f);
  if ((f.inBase || !f.alive) && f.gold >= 350) botBuy(m, f, G);
  if (!f.alive) { b.mx = b.my = 0; b.mode = "front"; b.te = null; return; }
  const foeH = m.fighters.filter(o => o.alive && o.team !== team && o.invulT <= 0 && !(o.invisT > 0));
  const nearE = foeH.filter(o => hyp(o.x - f.x, o.y - f.y) < 560);
  const dF0 = hyp(fo.x - f.x, fo.y - f.y);
  if (!b.mode) b.mode = "front";
  if (b.mode === "front" && hpf < .27 && !f.inBase) b.mode = nearE.length || dF0 < 800 ? "flee" : "recall";
  if (b.mode === "flee" && !nearE.length && dF0 > 800) b.mode = "recall";
  if (b.mode === "recall" && nearE.length) b.mode = "flee";
  if (f.inBase && b.mode !== "front") { if (hpf < .88) { b.mode = "heal"; b.mx = b.my = 0; return; } b.mode = "front"; }
  if (b.mode === "recall") { b.mx = b.my = 0; b.te = null; if (f.recall <= 0 && D.flee) f.inp.casts.push(6); else if (f.recall <= 0) b.mode = "flee"; return; }
  if (b.mode === "flee") {
    steerTo(m, f, b, fo.x, fo.y); b.te = null;
    const dF = hyp(fo.x - f.x, fo.y - f.y) || 1;
    if (f.scd[0] <= 0 && hpf < .4) f.inp.casts.push(4);
    if (f.scd[1] <= 0 && nearE.length && dF > 320) { f.aimX = (fo.x - f.x) / dF; f.aimY = (fo.y - f.y) / dF; f.inp.casts.push(5); }
    return;
  }
  const prog = y => team ? y : -y, lane = b.lane === undefined ? 1 : b.lane, lx = LANE_X[lane], ownT = map.towers[team][lane];
  let fm = null;
  for (const e of m.sol) if (e.alive && e.team === team && e.lane === lane && (!fm || prog(e.y) > prog(fm.y))) fm = e;
  const eT = m.bld.filter(e => e.alive && e.team !== team);
  const cover = t => { let c = 0; for (const e of m.sol) if (e.alive && e.team === team && Math.abs(e.x - t.x) < 140 && hyp(e.x - t.x, e.y - t.y) < 330) c++; return c; };
  const inRange = (o, pad) => eT.some(t => t.kind === "tower" && hyp(o.x - t.x, o.y - t.y) < TWR.rng + (pad || 0) && cover(t) < 2);
  // 목표 정하기: 중앙 보스 > 중립 캠프(길이 비었거나 사냥꾼) > 길 전선
  const bossE = m.camps.find(c => c.ct === 3 && c.alive);
  const allyNearBoss = bossE ? m.fighters.filter(o => o.alive && o.team === team && hyp(o.x - bossE.x, o.y - bossE.y) < 900).length : 0;
  let obj = "lane", oe = null;
  if (bossE && hpf > .5 && (b.jg || allyNearBoss >= 2 || m.t > BOSS_AT + 20)) { obj = "boss"; oe = bossE; }
  else if (b.jg || !fm) {
    let bd = 1e9;
    for (const c of m.camps) { if (!c.alive || c.ct === 3) continue; const own = team ? c.home.y < 1100 : c.home.y > 1100; if (!own && hpf < .75) continue; const d = hyp(c.x - f.x, c.y - f.y) + (own ? 0 : 500); if (d < bd) { bd = d; oe = c; } }
    if (oe && hpf > .4) obj = "camp";
  }
  let te = null, ts = 1e9;
  for (const o of foeH) { const d = hyp(o.x - f.x, o.y - f.y); if (d > 600 || (inRange(o, 10) && o.hp > 120) || !los(map, f.x, f.y, o.x, o.y, 6)) continue; const sc = d * (o.hp < o.maxhp * .4 ? .6 : 1); if (sc < ts) { ts = sc; te = o; } }
  const myDmg = kit.basic.dmg * f.adM * 1.05;
  for (const e of m.sol) {
    if (!e.alive || e.team === team) continue;
    const d = hyp(e.x - f.x, e.y - f.y);
    if (d > 460 || inRange(e, 0) || !los(map, f.x, f.y, e.x, e.y, 6)) continue;
    const sc = d + 90 - (e.hp <= myDmg ? 90 : 0);
    if (sc < ts) { ts = sc; te = e; }
  }
  if (oe) { const d = hyp(oe.x - f.x, oe.y - f.y); if (d < 700 && d - 120 < ts) { ts = d - 120; te = oe; } }
  for (const e of m.bld) {
    if (!e.alive || e.team === team || e.locked) continue;
    const d = hyp(e.x - f.x, e.y - f.y);
    if (d > 560) continue;
    if (e.kind === "tower" && cover(e) < 1 && !(foeH.length === 0 && m.sol.every(x => !x.alive || x.team === team || hyp(x.x - e.x, x.y - e.y) > 460))) continue;
    if (d + 260 < ts) { ts = d + 260; te = e; }
  }
  b.te = te;
  const jit = (b.jit || (b.jit = (rnd() - .5) * 60));
  if (!te) {
    let gx = lx + jit, gy = fm ? fm.y - dirF * 45 : ownT.y + dirF * 100;
    if (obj === "camp" || obj === "boss") { gx = oe.x; gy = oe.y; }
    else if (hpf < .65) { let bd = 520; for (const it of m.items) { const d = hyp(it.x - f.x, it.y - f.y); if (d < bd) { bd = d; gx = it.x; gy = it.y; } } }
    for (const t of eT) if (t.kind === "tower" && cover(t) < 2 && hyp(gx - t.x, gy - t.y) < TWR.rng + 40 && obj === "lane") gy = t.y - dirF * (TWR.rng + 40);
    steerTo(m, f, b, gx, gy);
  } else {
    const dist = hyp(te.x - f.x, te.y - f.y) - rad(te), sight = te.ent || los(map, f.x, f.y, te.x, te.y, 6);
    const pref = kit.pref, want = te.ent ? Math.max(40, kit.basic.rng * .8) : Math.max(pref[1], 60);
    b.sgT -= D.react; if (b.sgT <= 0) { b.sg = -b.sg; b.sgT = 1 + rnd() * 1.4; }
    const ux = (te.x - f.x) / ((dist + rad(te)) || 1), uy = (te.y - f.y) / ((dist + rad(te)) || 1);
    if (dist > want || !sight) steerTo(m, f, b, te.x, te.y);
    else if (!te.ent && dist < pref[0] + 30 && pref[0] > 0) { const p = probe(m, f, -ux * .8 - uy * b.sg * .4, -uy * .8 + ux * b.sg * .4); b.mx = p[0]; b.my = p[1]; }
    else if (!te.ent && D.dodge) { const p = probe(m, f, -uy * b.sg + ux * .25, ux * b.sg + uy * .25); b.mx = p[0] * .7; b.my = p[1] * .7; }
    else { b.mx = b.my = 0; }
  }
  for (const t of eT) if (t.kind === "tower" && cover(t) < 2 && hyp(f.x - t.x, f.y - t.y) < TWR.rng + 15 && obj === "lane") { const dx = f.x - t.x, dy = f.y - t.y, d = hyp(dx, dy) || 1; b.mx = dx / d; b.my = dy / d; }
  if ((b.mx || b.my) && hyp(f.x - b.lx, f.y - b.ly) < 7) b.stuck++; else b.stuck = 0;
  b.lx = f.x; b.ly = f.y;
  if (b.stuck >= 3) { const a = rnd() * 6.283; b.mx = Math.cos(a); b.my = Math.sin(a); b.stuck = 0; b.hold = .3; }
  let htgt = null, hd = 1e9, nearH = 0, nearAll = 0;
  for (const o of foeH) { const d = hyp(o.x - f.x, o.y - f.y); if (d < 200) nearH++; if (d < hd && !inRange(o, 10) && los(map, f.x, f.y, o.x, o.y, 6)) { hd = d; htgt = o; } }
  if (!htgt && te && (te.kind === "camp" || te.kind === "boss")) { htgt = te; hd = hyp(te.x - f.x, te.y - f.y); }
  for (const o of m.ents) if (o.alive && o.team !== team && !o.locked && hyp(o.x - f.x, o.y - f.y) < 190) nearAll++;
  if (htgt && hd < 760 && f.sil <= 0) {
    const sight = htgt.ent || los(map, f.x, f.y, htgt.x, htgt.y, 6);
    for (let s = 0; s < 4; s++) {
      if (!f.rk[s] || f.cd[s] > 0 || rnd() > D.skillP) continue;
      if (botWants(m, f, KITS[f.id].skills[s], s, htgt, hd, sight, hpf, nearH)) { b.cast = s; b.te = htgt; break; }
    }
    if (b.cast === undefined && !htgt.ent && f.scd[1] <= 0 && htgt.hp < htgt.maxhp * .3 && hd > 260 && hd < 440 && sight && rnd() < D.skillP) { f.aimX = (htgt.x - f.x) / hd; f.aimY = (htgt.y - f.y) / hd; f.inp.casts.push(5); }
  }
  if (b.cast === undefined && nearAll >= 3 && f.sil <= 0) for (let s = 0; s < 3; s++) { const sk = KITS[f.id].skills[s]; if (f.rk[s] && f.cd[s] <= 0 && sk.t === "circle" && !sk.at && sk.dmg && rnd() < D.skillP + .2) { b.cast = s; break; } }
  if (hpf < .35 && nearE.length && f.scd[0] <= 0) f.inp.casts.push(4);
}

function setAuto(m, f, v) { if (f.aram) f.autoLearn = !!v; }
const api = {setAuto, learn, buy, sell, startRecall, ITEMS, MT, GROW, TWR, CORE_HP, CORE_RAD, CAMP, CAMP_BUF, LANE_X, LHW, OT, BOSS_AT, xpNeed, autoLearn, AW, AH, S, MW, MH, R, MAPS, KITS, MODES, DIFF, ITEM_KINDS, blocked, los, createMatch, step, cast, makeBot, hurt, pack, unpack, fastForward, buildResult, pts, tryMove, respawn, navNext};
if (typeof module !== "undefined" && module.exports) module.exports = api;
root.BrawlCore = api;
})(typeof window !== "undefined" ? window : globalThis);
