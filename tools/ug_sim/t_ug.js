/* t_ug.js — 지하던전 밸런스 시뮬(봇 3인 파티). index.html 의 엔진을 그대로 뽑아 돌린다.
   node t_ug.js farm  <층> <레벨> [분=3] [시드] [구성 k,k,k]   : 사냥 — 처치/분·XP%/분·체력손실·사망·서브보스
   node t_ug.js boss  <층> <레벨> [시드…]    [구성]            : 보스방 — 클리어 여부·시간·남은 체력
   층: 1001~1003 (지하) 또는 일반 층.  예) node t_ug.js boss 1001 100 1 2 3 */
const path = require("path"), {boot} = require("./load.js");
const HTML = process.env.HTML || path.join(__dirname, "../../index.html");
const [mode, floorS, lvS, ...rest] = process.argv.slice(2); const FL = +floorS, LV = +lvS;
const DT = 1 / 60, IDLE = {mx: 0, my: 0, aim: null, atk: false, cast: Array(8).fill(false), interact: false, potion: false, dash: false};
function parse() { let comp = [7, 3, 5], seeds = [], mins = 3; const nums = []; for (const a of rest) { if (a.includes(",")) comp = a.split(",").map(Number); else nums.push(Number(a)); }
  if (mode === "farm") { mins = nums[0] || 3; seeds = [nums[1] || 1]; } else seeds = nums.length ? nums : [1]; return {comp, seeds, mins}; }
const {comp, seeds, mins} = parse();
const GEAR = +(process.env.GEAR || 20), GF = process.env.GF ? +process.env.GF : Math.min(100, LV - 2);
function mkParty(seed) {
  const x = boot(HTML, seed), {dgnCore: core, dgr} = x; if (dgr.seed) dgr.seed(seed); if (process.env.UGT) { const o = JSON.parse(process.env.UGT); for (const k in o) core.UGT[k] = o[k]; } if (process.env.SUBT) Object.assign(core.SUBT, JSON.parse(process.env.SUBT));
  const mk = k => { const c = dgr.sim.makeChar(k, LV, Math.max(1, GF), GEAR); c.floorsOpen = 200; c.ext = {ug: FL > 1000 ? FL - 1001 : 3}; c.cons = c.cons || {}; c.cons.coffee_m = 60; c.cons.revive = 0; return c; };
  const c0 = mk(comp[0]); const G = core.create(c0, {auto: true}); G.autoTravel = true; core.refreshStats(G); c0.hp = G.st.hpMax; G.botHunt = 1e9;
  for (let i = 1; i < comp.length; i++) { const c = mk(comp[i]); const h = core.addHero(G, c, {name: "P" + i}); h.remote = false; h.inp = {mx: 0, my: 0, aim: null, atk: false, cast: [false, false, false, false], interact: false, potion: false, dash: false}; c.hp = h.st.hpMax; }
  return {x, core, dgr, G};
}
function stepParty(core, G, dt) {
  let inp0 = null;
  for (const h of G.hs) { if (core.isDead(G, h)) continue; const inp = core.H.withHero(G, h, () => core.botInput(G)); if (h.idx === 0) inp0 = inp; else { Object.assign(h.inp, inp); const st = h.st; h.rp = {x: h.P.x + inp.mx * 190 * st.moveSpd * 1.3 * dt * 2, y: h.P.y + inp.my * 190 * st.moveSpd * 1.3 * dt * 2}; } }
  core.step(G, dt, inp0 || IDLE); G.ev.length = 0; G.fx.length = 0;
}
const f1 = v => Math.round(v * 10) / 10;
function farm(seed) {
  const {core, dgr, G} = mkParty(seed); core.enterFloor(G, FL, "test"); const steps = Math.round(mins * 3600);
  const rec = G.hs.map(h => ({lv0: h.char.lv, xp0: h.char.xp, hpLost: 0, last: h.char.hp, deaths: 0, wasDead: false})); const k0 = G.kills; let subK = 0, maxMobs = 0, tms = 0;
  const kill0 = core.H.killMob;
  for (let s = 0; s < steps; s++) {
    const t1 = process.hrtime.bigint(); stepParty(core, G, DT); tms += Number(process.hrtime.bigint() - t1) / 1e6; if (G.mobs.length > maxMobs) maxMobs = G.mobs.length;
    G.hs.forEach((h, i) => { const r = rec[i], hp = h.char.hp, dead = core.isDead(G, h); if (hp < r.last) r.hpLost += r.last - hp; r.last = hp; if (dead && !r.wasDead) r.deaths++; r.wasDead = dead; });
    if (G.floor !== FL) core.enterFloor(G, FL, "test"); if (G.bs && (G.bs.state === "intro" || G.bs.state === "fight")) { G.boss = null; G.bosses = []; G.mobs = G.mobs.filter(m => !m.boss); G.bs = {state: "idle", t: 0}; G.cine = null; core.enterFloor(G, FL, "test"); }
    if (core.allDead(G)) { for (const h of G.hs) core.reviveHero(G, h, .6, null); }
  }
  const per = G.hs.map((h, i) => { const r = rec[i], c = h.char; let xp = c.xp - r.xp0; for (let l = r.lv0; l < c.lv; l++) xp += dgr.xpNeed(l); const need = dgr.xpNeed(r.lv0) || 1, hpMax = (h === G.cur ? G.st : h.st).hpMax; return {xpPct: xp / mins / need * 100, hpLostPct: r.hpLost / mins / hpMax * 100, deaths: r.deaths}; });
  const avg = k => per.reduce((s, x) => s + x[k], 0) / per.length;
  return {kills: (G.kills - k0) / mins, xpPct: avg("xpPct"), hpLost: avg("hpLostPct"), deaths: per.reduce((s, x) => s + x.deaths, 0), mobs: G.mobs.length, maxMobs, subLeft: G.mobs.filter(m => m.sub && !m.dead).length, stepMs: tms / steps};
}
function bossRun(seed) {
  const {core, dgr, G} = mkParty(seed); G.botHunt = 0; core.enterFloor(G, FL, "bossdoor"); const max = 10 * 3600; let t = 0, win = false, started = false, startT = 0, minHp = 1, bossesAtStart = 0;
  for (let s = 0; s < max; s++) {
    stepParty(core, G, DT); t += DT;
    if (!started && (G.bs.state === "intro" || G.bs.state === "fight")) { started = true; startT = t; bossesAtStart = core.bossList(G).length; }
    for (const h of G.hs) { const st = (h === G.cur ? G.st : h.st); const f = h.char.hp / st.hpMax; if (f < minHp) minHp = f; }
    if (G.bs.state === "cleared") { win = true; break; }
    if (core.allDead(G)) break;
    if (started && t - startT > 480) break;   // 8분 넘으면 실패(분노 타이머)
  }
  const alive = G.hs.filter(h => !core.isDead(G, h)).length;
  return {win, t: f1(started ? t - startT : t), started, bosses: bossesAtStart, alive, minHpPct: Math.round(minHp * 100), left: core.bossList(G).filter(b => !b.dead).map(b => Math.round(100 * b.hp / b.hpMax) + "%").join("/")};
}
function subRun(seed) {
  const {core, dgr, G} = mkParty(seed); G.botHunt = 1e9; core.enterFloor(G, FL, "test"); const sm = G.mobs.find(m => m.sub); if (!sm) return {ok: false, why: "no sub"};
  for (const h of G.hs) { h.P.x = h.P.px = sm.x - 220; h.P.y = h.P.py = sm.y + (h.idx - 1) * 30; core.forceHero(G, h); }
  G.mobs = G.mobs.filter(m => m === sm); sm.agg = true; const hp0 = sm.hpMax; let t = 0, minHp = 1, k = false;
  for (let s = 0; s < 240 * 60; s++) { stepParty(core, G, DT); t += DT; for (const h of G.hs) { const st = (h === G.cur ? G.st : h.st); minHp = Math.min(minHp, h.char.hp / st.hpMax); } if (sm.dead) { k = true; break; } if (core.allDead(G)) break; }
  return {ok: true, killed: k, t: f1(t), hpMax: Math.round(hp0), minHpPct: Math.round(minHp * 100), left: Math.round(100 * Math.max(0, sm.hp) / hp0)};
}
const label = `[${mode}] 층${FL} Lv${LV} 구성${comp.join(",")} 장비F${GF}/후보${GEAR}`;
if (mode === "farm") { const r = farm(seeds[0]); console.log(label, `${mins}분: 처치 ${f1(r.kills)}/분 · XP ${f1(r.xpPct)}%/분(레벨필요량 대비) · 체력손실 ${f1(r.hpLost)}%/분 · 사망 ${r.deaths} · 몹 ${r.mobs}(최대 ${r.maxMobs}) · 서브 남음 ${r.subLeft} · 스텝 ${r.stepMs.toFixed(2)}ms`); }
else if (mode === "sub") { const rows = seeds.map(sd => { const r = subRun(sd); return r.ok ? `#${sd}:${r.killed ? "처치" : "실패"} ${r.t}s 최저체력${r.minHpPct}% 체력 ${r.hpMax} 남음${r.left}%` : r.why; }); console.log(label, "서브보스 | " + rows.join(" · ")); }
else { let w = 0; const rows = []; for (const sd of seeds) { const r = bossRun(sd); if (r.win) w++; rows.push(`#${sd}:${r.win ? "승" : "패"} ${r.t}s 생존${r.alive} 최저체력${r.minHpPct}% ${r.win ? "" : "남은 " + r.left}`); } console.log(label, `보스 ${w}/${seeds.length} 승 | ` + rows.join(" · ")); }
