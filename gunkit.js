/* GunKit — 라운드비 공용 총기 그림 · 스킨 · 총소리 (window.GunKit). 외부 파일·유료 에셋 없이 캔버스 벡터 + WebAudio 합성만 쓴다.
 *
 * GunKit.weapons                      [{id,name,kind,type}]  id = pistol smg shot rifle lmg sniper knife frag smoke flash bomb kit armor
 *                                     kind = gun|melee|throw|item, type = 총소리 분류(p s g r l n k …)
 * GunKit.skins                        [{id,name,desc,base:[css..]}]  전부 무료. GunKit.skinIds = id 배열
 * GunKit.getSkin(wid) / setSkin(wid,id) / skinMap()   장착 스킨 (localStorage "roundb.gunskin.v1" = {wid:skinId})
 * GunKit.art(wid, skinId?)            → {cv,w,h,gx,gy,fx,fy,mx,my,ex,ey,mag:{x,y,w,h}|null}  총구가 오른쪽(+x)인 옆모습 캔버스(캐시). gx,gy=손잡이 기준점, fx,fy=받침손, mx,my=총구, ex,ey=탄피 배출구
 * GunKit.drawSide(ctx, wid, skinId, x, y, scale, opts)   옆모습 그리기. (x,y)=손잡이 기준점. opts:{yaw,roll,flip,alpha,shadow,sheen,anchor:"grip"|"center",tilt}
 *                                     yaw(라디안)=2D 의사 회전(가로 축소+원근 기울임+반사 하이라이트 이동), 구경·미리보기용
 * GunKit.drawTop(ctx, wid, skinId, x, y, size, angle)    탑다운(위에서 본) 손에 든 모양. angle=총구 방향(라디안)
 * GunKit.icon(wid, skinId, maxW, maxH) → dataURL(캐시)   구매창·HUD 아이콘용 작은 그림
 * GunKit.inspectLen(wid) / GunKit.inspect(wid, t) → {rot,yaw,tx,ty,sc}   F 구경 애니메이션 자세(t 초), 총마다 다름
 * GunKit.sfx.play(kind, wid, {pan,dist,vol,prio})   kind: shot reload1 reload2 reload3 dry draw pin bounce boom smoke flash swing stab step land hit head armor hurt kill
 * GunKit.sfx.setEnabled(b) / enabled() / volume(v) / getVolume() / unlock()   동시 발음 24개 상한, 거리 감쇠(저역 통과)+좌우 패닝
 */
(() => {
"use strict";
if (window.GunKit) return;
const TAU = Math.PI * 2, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const LSK = "roundb.gunskin.v1";
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

/* ---------------- 무기 목록 ---------------- */
const weapons = [
  {id: "pistol", name: "권총", kind: "gun", type: "p"}, {id: "smg", name: "제비 기관단총", kind: "gun", type: "s"}, {id: "shot", name: "성광 산탄총", kind: "gun", type: "g"},
  {id: "rifle", name: "파수 돌격소총", kind: "gun", type: "r"}, {id: "lmg", name: "전술 경기관총", kind: "gun", type: "l"}, {id: "sniper", name: "별빛 저격총", kind: "gun", type: "n"},
  {id: "knife", name: "전술 단검", kind: "melee", type: "k"}, {id: "frag", name: "수류탄", kind: "throw", type: "x"}, {id: "smoke", name: "연막탄", kind: "throw", type: "x"}, {id: "flash", name: "섬광탄", kind: "throw", type: "x"},
  {id: "bomb", name: "폭탄", kind: "item", type: "b"}, {id: "kit", name: "해체 키트", kind: "item", type: "b"}, {id: "armor", name: "방탄복", kind: "item", type: "b"}];
const TYPE2ID = {p: "pistol", s: "smg", g: "shot", r: "rifle", l: "lmg", n: "sniper", k: "knife"};

/* ---------------- 그리기 도구 ---------------- */
const mkc = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const lgr = (g, x0, y0, x1, y1, st) => { const q = g.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of st) q.addColorStop(o, c); return q; };
const ST_STEEL = [[0, "#8793a5"], [.16, "#505b6c"], [.58, "#2a313e"], [1, "#12161e"]], ST_POLY = [[0, "#4b5464"], [.5, "#292f3a"], [1, "#14181f"]], ST_WOOD = [[0, "#c98d50"], [.45, "#8f5b2d"], [1, "#573318"]];
function rrect(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
function blk(g, x, y, w, h, r, st) {
  rrect(g, x, y, w, h, r); g.fillStyle = lgr(g, 0, y, 0, y + h, st || ST_STEEL); g.fill(); g.lineWidth = 1.6; g.strokeStyle = "rgba(0,0,0,.7)"; g.stroke();
  g.beginPath(); g.moveTo(x + r, y + 2.2); g.lineTo(x + w - r, y + 2.2); g.strokeStyle = "rgba(255,255,255,.36)"; g.lineWidth = 1.6; g.stroke();   // 윗면 정반사 선
  g.beginPath(); g.moveTo(x + r, y + h - 2); g.lineTo(x + w - r, y + h - 2); g.strokeStyle = "rgba(0,0,0,.42)"; g.stroke();
}
function poly(g, pts, st, y0, y1) { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fillStyle = lgr(g, 0, y0, 0, y1, st); g.fill(); g.lineWidth = 1.6; g.strokeStyle = "rgba(0,0,0,.7)"; g.stroke(); }
function grain(g, x, y, w, h) { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.strokeStyle = "rgba(60,30,10,.42)"; g.lineWidth = 1; for (let i = 0; i < 9; i++) { const yy = y + (i + .5) * h / 9; g.beginPath(); g.moveTo(x, yy); g.bezierCurveTo(x + w * .3, yy - 3, x + w * .6, yy + 4, x + w, yy - 1); g.stroke(); } g.restore(); }
function lens(g, cx, cy, r) { const q = g.createRadialGradient(cx - r * .3, cy - r * .3, 1, cx, cy, r); q.addColorStop(0, "#d6f4ff"); q.addColorStop(.5, "#3b82b8"); q.addColorStop(1, "#0b2036"); g.fillStyle = q; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill(); g.strokeStyle = "#0a0d12"; g.lineWidth = 2; g.stroke(); g.fillStyle = "rgba(255,255,255,.65)"; g.beginPath(); g.arc(cx - r * .35, cy - r * .35, r * .22, 0, TAU); g.fill(); }
function guard(g, cx, cy, r) { g.strokeStyle = "#0b0e13"; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, r, .1, Math.PI * 1.05); g.stroke(); g.strokeStyle = "#566176"; g.lineWidth = 1.4; g.beginPath(); g.arc(cx, cy - 1, r, .2, Math.PI); g.stroke(); }
function ticks(g, x, y, n, step) { for (let i = 0; i < n; i++) { g.fillStyle = "#171c25"; g.fillRect(x + i * step, y, step * .6, 6); } }
function screws(g, pts) { for (const [x, y] of pts) { g.fillStyle = "#9aa6b8"; g.beginPath(); g.arc(x, y, 2.4, 0, TAU); g.fill(); g.strokeStyle = "#10141b"; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 1.6, y - 1.6); g.lineTo(x + 1.6, y + 1.6); g.stroke(); } }
function knurl(g, x, y, w, h) { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.strokeStyle = "rgba(0,0,0,.4)"; g.lineWidth = 1.4; for (let i = -h; i < w; i += 5) { g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + h, y); g.stroke(); } g.strokeStyle = "rgba(255,255,255,.1)"; for (let i = -h + 2; i < w; i += 5) { g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + h, y); g.stroke(); } g.restore(); }

const SIZE = {pistol: [300, 190], smg: [420, 200], shot: [540, 200], rifle: [560, 210], lmg: [600, 220], sniper: [640, 210], knife: [360, 140], frag: [170, 210], smoke: [150, 220], flash: [150, 220], bomb: [280, 190], kit: [230, 170], armor: [200, 200]};
const DRAW = {
  pistol(g) {
    poly(g, [[92, 86], [200, 86], [190, 106], [168, 110], [150, 172], [96, 178], [104, 120]], ST_POLY, 86, 178); knurl(g, 100, 124, 44, 46);
    guard(g, 168, 108, 14); g.fillStyle = "#a5b0c0"; g.fillRect(163, 94, 5, 15);
    blk(g, 70, 50, 176, 36, 9); for (let i = 0; i < 6; i++) { g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(86 + i * 7, 58, 3, 22); g.fillStyle = "rgba(255,255,255,.14)"; g.fillRect(89 + i * 7, 58, 1.5, 22); }
    g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(150, 58, 40, 14); g.fillStyle = "#0a0c10"; g.fillRect(150, 60, 38, 10);   // 배출구
    blk(g, 246, 58, 24, 16, 4); g.fillStyle = "#07090c"; g.fillRect(268, 62, 5, 8);
    blk(g, 74, 42, 16, 10, 2); blk(g, 226, 42, 12, 10, 2); g.fillStyle = "#e6eef8"; g.fillRect(80, 44, 3, 5); g.fillRect(231, 44, 3, 5);
    blk(g, 94, 172, 58, 10, 3); screws(g, [[120, 140], [176, 70]]);
    return {gx: 120, gy: 130, fx: null, fy: null, mx: 274, my: 66, ex: 168, ey: 64, mag: {x: 98, y: 118, w: 52, h: 60}};
  },
  smg(g) {
    g.strokeStyle = "#2b323d"; g.lineWidth = 7; g.lineCap = "round"; g.beginPath(); g.moveTo(98, 70); g.lineTo(38, 72); g.lineTo(32, 112); g.lineTo(96, 98); g.stroke();
    g.strokeStyle = "#7d889a"; g.lineWidth = 2; g.beginPath(); g.moveTo(98, 69); g.lineTo(38, 71); g.lineTo(32, 111); g.lineTo(96, 97); g.stroke();
    poly(g, [[110, 104], [150, 104], [142, 162], [112, 162]], ST_POLY, 104, 162); knurl(g, 116, 112, 28, 46);
    blk(g, 168, 104, 38, 80, 6, ST_POLY); for (let i = 0; i < 5; i++) { g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(172, 114 + i * 14, 30, 3); }
    guard(g, 160, 106, 13); poly(g, [[316, 92], [338, 92], [334, 128], [318, 128]], ST_POLY, 92, 128);
    blk(g, 96, 56, 200, 50, 8); ticks(g, 120, 50, 14, 10); g.fillStyle = "#0a0c10"; g.fillRect(230, 66, 34, 8);
    blk(g, 296, 66, 64, 26, 5); for (let i = 0; i < 5; i++) { g.fillStyle = "rgba(0,0,0,.6)"; g.beginPath(); g.ellipse(310 + i * 10, 79, 3, 7, 0, 0, TAU); g.fill(); }
    blk(g, 358, 70, 34, 18, 4); g.fillStyle = "#07090c"; g.fillRect(388, 74, 6, 10);
    blk(g, 180, 32, 62, 24, 7, ST_POLY); g.fillStyle = "#ff5a4a"; g.beginPath(); g.arc(236, 44, 5, 0, TAU); g.fill(); g.fillStyle = "rgba(255,255,255,.5)"; g.fillRect(190, 36, 30, 3); screws(g, [[110, 70], [280, 92]]);
    return {gx: 130, gy: 136, fx: 327, fy: 118, mx: 394, my: 79, ex: 248, ey: 70, mag: {x: 168, y: 104, w: 38, h: 80}};
  },
  shot(g) {
    poly(g, [[126, 66], [44, 82], [34, 138], [56, 150], [130, 108]], ST_WOOD, 66, 150); grain(g, 40, 70, 90, 76);
    poly(g, [[134, 100], [172, 100], [162, 150], [136, 150]], ST_WOOD, 100, 150); grain(g, 136, 102, 34, 46); guard(g, 174, 104, 13);
    blk(g, 216, 66, 292, 14, 3); blk(g, 216, 86, 232, 13, 3);
    blk(g, 120, 58, 100, 42, 7); g.fillStyle = "#0a0c10"; g.fillRect(150, 72, 32, 8); g.fillStyle = "#c33a2a"; g.fillRect(150, 72, 12, 8); screws(g, [[134, 70], [206, 90]]);
    blk(g, 262, 76, 98, 32, 6, ST_WOOD); grain(g, 264, 78, 94, 28); for (let i = 0; i < 6; i++) { g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(272 + i * 14, 80, 3, 24); }
    blk(g, 500, 62, 14, 22, 3); g.fillStyle = "#f0e2b0"; g.beginPath(); g.arc(504, 63, 4, 0, TAU); g.fill();
    return {gx: 150, gy: 126, fx: 310, fy: 96, mx: 514, my: 73, ex: 166, ey: 76, mag: null};
  },
  rifle(g) {
    poly(g, [[112, 68], [40, 72], [34, 126], [112, 110]], ST_POLY, 68, 126); knurl(g, 44, 80, 60, 40);
    poly(g, [[190, 104], [236, 104], [250, 178], [206, 184]], ST_POLY, 104, 184); for (let i = 0; i < 4; i++) { g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 2; g.beginPath(); g.moveTo(198 + i * 3, 120 + i * 14); g.lineTo(240 + i * 3, 120 + i * 14); g.stroke(); }
    poly(g, [[126, 104], [160, 104], [150, 168], [120, 168]], ST_POLY, 104, 168); knurl(g, 128, 112, 26, 50); guard(g, 176, 108, 13);
    blk(g, 112, 60, 140, 46, 6); g.fillStyle = "#0a0c10"; g.fillRect(190, 72, 34, 9); screws(g, [[124, 76], [240, 96]]);
    blk(g, 250, 64, 130, 40, 5); for (let i = 0; i < 6; i++) { g.fillStyle = "rgba(0,0,0,.6)"; g.beginPath(); g.ellipse(268 + i * 18, 84, 5, 11, 0, 0, TAU); g.fill(); }
    blk(g, 378, 72, 70, 14, 3); blk(g, 446, 66, 44, 26, 4); for (let i = 0; i < 3; i++) { g.fillStyle = "#05070a"; g.fillRect(452 + i * 11, 70, 5, 18); }
    ticks(g, 124, 54, 20, 13); blk(g, 176, 30, 70, 26, 8, ST_POLY); lens(g, 241, 43, 9); lens(g, 185, 43, 6); blk(g, 424, 46, 10, 22, 2);
    return {gx: 142, gy: 134, fx: 312, fy: 100, mx: 490, my: 79, ex: 206, ey: 76, mag: {x: 192, y: 104, w: 56, h: 80}};
  },
  lmg(g) {
    poly(g, [[116, 70], [40, 74], [34, 130], [116, 114]], ST_POLY, 70, 130); knurl(g, 46, 84, 60, 40);
    poly(g, [[130, 108], [166, 108], [156, 172], [124, 172]], ST_POLY, 108, 172); guard(g, 182, 112, 13);
    g.strokeStyle = "#1b2029"; g.lineWidth = 5; g.beginPath(); g.moveTo(452, 90); g.lineTo(430, 156); g.moveTo(466, 90); g.lineTo(492, 156); g.stroke();
    blk(g, 170, 108, 96, 74, 9, ST_POLY); for (let i = 0; i < 9; i++) { g.fillStyle = "#c19a45"; g.fillRect(180 + i * 9, 120, 6, 42); g.fillStyle = "#6b4a1a"; g.fillRect(180 + i * 9, 150, 6, 12); }
    blk(g, 116, 60, 150, 50, 6); screws(g, [[130, 74], [250, 96]]); blk(g, 264, 62, 172, 44, 8); for (let i = 0; i < 8; i++) { g.fillStyle = "rgba(0,0,0,.65)"; g.beginPath(); g.ellipse(284 + i * 19, 84, 5, 12, 0, 0, TAU); g.fill(); }
    blk(g, 434, 72, 104, 16, 3); blk(g, 536, 64, 42, 30, 4);
    g.strokeStyle = "#242b36"; g.lineWidth = 10; g.beginPath(); g.moveTo(196, 62); g.quadraticCurveTo(246, 20, 300, 62); g.stroke(); g.strokeStyle = "#8793a5"; g.lineWidth = 2; g.beginPath(); g.moveTo(196, 59); g.quadraticCurveTo(246, 17, 300, 59); g.stroke();
    ticks(g, 130, 54, 8, 13);
    return {gx: 146, gy: 140, fx: 344, fy: 108, mx: 578, my: 79, ex: 240, ey: 70, mag: {x: 170, y: 108, w: 96, h: 74}};
  },
  sniper(g) {
    poly(g, [[130, 68], [50, 66], [34, 92], [40, 132], [70, 138], [130, 104]], ST_POLY, 66, 138); knurl(g, 60, 84, 60, 40);
    poly(g, [[134, 102], [170, 102], [158, 160], [128, 160]], ST_POLY, 102, 160); guard(g, 182, 106, 13);
    g.strokeStyle = "#1b2029"; g.lineWidth = 5; g.beginPath(); g.moveTo(336, 86); g.lineTo(316, 140); g.moveTo(348, 86); g.lineTo(372, 140); g.stroke();
    blk(g, 196, 98, 32, 48, 5, ST_POLY); blk(g, 128, 60, 170, 36, 5); screws(g, [[140, 72], [284, 84]]); blk(g, 296, 72, 232, 13, 3);
    blk(g, 520, 64, 102, 26, 8, ST_POLY); for (let i = 0; i < 6; i++) { g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(532 + i * 14, 68, 3, 18); }
    blk(g, 160, 22, 172, 28, 12, ST_POLY); blk(g, 150, 17, 28, 38, 6); blk(g, 318, 15, 34, 42, 8); lens(g, 160, 36, 12); lens(g, 336, 36, 14); blk(g, 200, 50, 12, 12, 2); blk(g, 270, 50, 12, 12, 2);
    g.strokeStyle = "#a3aebe"; g.lineWidth = 5; g.beginPath(); g.moveTo(236, 78); g.lineTo(252, 108); g.stroke(); g.fillStyle = "#d3dae6"; g.beginPath(); g.arc(254, 110, 7, 0, TAU); g.fill();
    return {gx: 150, gy: 128, fx: 342, fy: 94, mx: 622, my: 77, ex: 232, ey: 68, mag: {x: 196, y: 98, w: 32, h: 48}};
  },
  knife(g) {
    g.beginPath(); g.moveTo(130, 64); g.lineTo(300, 62); g.quadraticCurveTo(334, 70, 348, 82); g.lineTo(130, 88); g.closePath(); g.fillStyle = lgr(g, 0, 62, 0, 88, [[0, "#f6f9fd"], [.5, "#aeb9c9"], [1, "#5c6879"]]); g.fill(); g.strokeStyle = "rgba(0,0,0,.65)"; g.lineWidth = 1.6; g.stroke();
    g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(136, 66); g.lineTo(300, 64); g.stroke();   // 날 반사선
    g.strokeStyle = "rgba(40,50,64,.7)"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(140, 74); g.lineTo(300, 73); g.stroke();
    blk(g, 118, 52, 16, 46, 4); blk(g, 30, 58, 92, 32, 12, ST_POLY); for (let i = 0; i < 6; i++) { g.strokeStyle = "rgba(255,255,255,.14)"; g.lineWidth = 2; g.beginPath(); g.moveTo(44 + i * 13, 60); g.lineTo(52 + i * 13, 88); g.stroke(); }
    g.fillStyle = "#a3aebe"; g.beginPath(); g.arc(32, 74, 9, 0, TAU); g.fill(); g.strokeStyle = "rgba(0,0,0,.7)"; g.stroke();
    return {gx: 76, gy: 74, fx: null, fy: null, mx: 346, my: 82, ex: 0, ey: 0, mag: null};
  },
  frag(g) {
    const q = g.createRadialGradient(68, 108, 6, 85, 124, 72); q.addColorStop(0, "#9aa862"); q.addColorStop(.5, "#4f5c2b"); q.addColorStop(1, "#1f270f"); g.fillStyle = q; g.beginPath(); g.ellipse(85, 128, 56, 66, 0, 0, TAU); g.fill(); g.strokeStyle = "rgba(0,0,0,.75)"; g.lineWidth = 2.5; g.stroke();
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 2; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(35, 128 + i * 22); g.quadraticCurveTo(85, 128 + i * 22 + 12, 135, 128 + i * 22); g.stroke(); g.beginPath(); g.moveTo(85 + i * 20, 66); g.quadraticCurveTo(85 + i * 20 + 8, 128, 85 + i * 20, 190); g.stroke(); }
    g.fillStyle = "rgba(255,255,255,.28)"; g.beginPath(); g.ellipse(64, 100, 14, 24, -.5, 0, TAU); g.fill();
    blk(g, 64, 38, 42, 32, 4, [[0, "#d4dae3"], [1, "#586272"]]); g.strokeStyle = "#d8dee7"; g.lineWidth = 6; g.beginPath(); g.moveTo(106, 50); g.quadraticCurveTo(150, 34, 140, 94); g.stroke();
    g.strokeStyle = "#c19a45"; g.lineWidth = 4; g.beginPath(); g.arc(56, 46, 13, 0, TAU); g.stroke();
    return {gx: 85, gy: 130, fx: null, fy: null, mx: 85, my: 40, ex: 0, ey: 0, mag: null};
  },
  smoke(g) {
    blk(g, 36, 52, 78, 146, 16, [[0, "#d9dee6"], [.5, "#8f98a6"], [1, "#454d5a"]]); g.fillStyle = "#2a303a"; g.fillRect(36, 104, 78, 30); g.fillStyle = "#f2f4f8"; g.font = "bold 17px sans-serif"; g.fillText("SMOKE", 44, 126);
    blk(g, 52, 34, 46, 24, 7, [[0, "#c9d0da"], [1, "#59626f"]]); g.fillStyle = "#3a414d"; g.fillRect(70, 20, 10, 18); g.strokeStyle = "#cfd5de"; g.lineWidth = 5; g.beginPath(); g.moveTo(98, 42); g.quadraticCurveTo(136, 30, 128, 74); g.stroke();
    return {gx: 75, gy: 125, fx: null, fy: null, mx: 75, my: 30, ex: 0, ey: 0, mag: null};
  },
  flash(g) {
    blk(g, 36, 52, 78, 146, 16, [[0, "#fff8cf"], [.5, "#ead37c"], [1, "#8f7a2e"]]); g.fillStyle = "#14171d"; g.fillRect(36, 70, 78, 18); g.fillRect(36, 160, 78, 18);
    g.fillStyle = "#14171d"; g.beginPath(); g.moveTo(80, 96); g.lineTo(56, 134); g.lineTo(72, 134); g.lineTo(64, 156); g.lineTo(96, 120); g.lineTo(80, 120); g.closePath(); g.fill(); g.fillStyle = "#ffe36a"; g.beginPath(); g.moveTo(79, 100); g.lineTo(61, 131); g.lineTo(75, 131); g.lineTo(69, 150); g.lineTo(92, 122); g.lineTo(78, 122); g.closePath(); g.fill();
    blk(g, 52, 34, 46, 24, 7, [[0, "#c9d0da"], [1, "#59626f"]]); g.strokeStyle = "#cfd5de"; g.lineWidth = 5; g.beginPath(); g.moveTo(98, 42); g.quadraticCurveTo(136, 30, 128, 74); g.stroke();
    return {gx: 75, gy: 125, fx: null, fy: null, mx: 75, my: 30, ex: 0, ey: 0, mag: null};
  },
  bomb(g) {
    blk(g, 28, 62, 224, 112, 12, [[0, "#667184"], [1, "#222934"]]); g.fillStyle = "#07090c"; g.fillRect(52, 82, 112, 40); g.fillStyle = "#ff4a3a"; g.font = "bold 26px monospace"; g.fillText("00:40", 64, 112);
    g.fillStyle = "#c19a45"; for (let i = 0; i < 3; i++) g.fillRect(184 + i * 18, 84, 12, 70); g.strokeStyle = "#ff4a3a"; g.lineWidth = 3; g.beginPath(); g.moveTo(40, 140); g.bezierCurveTo(80, 190, 150, 120, 200, 168); g.stroke(); g.strokeStyle = "#3ea6ff"; g.beginPath(); g.moveTo(56, 150); g.bezierCurveTo(100, 180, 130, 150, 176, 166); g.stroke();
    return {gx: 140, gy: 120, fx: null, fy: null, mx: 140, my: 62, ex: 0, ey: 0, mag: null};
  },
  kit(g) {
    g.strokeStyle = "#39414e"; g.lineWidth = 8; g.beginPath(); g.moveTo(76, 62); g.quadraticCurveTo(115, 14, 154, 62); g.stroke();
    blk(g, 28, 58, 174, 96, 12, [[0, "#e0e5ec"], [1, "#7d8798"]]); g.fillStyle = "#1f5fa8"; g.fillRect(104, 76, 22, 60); g.fillRect(85, 95, 60, 22);
    return {gx: 115, gy: 110, fx: null, fy: null, mx: 115, my: 58, ex: 0, ey: 0, mag: null};
  },
  armor(g) {
    poly(g, [[48, 30], [86, 22], [100, 44], [114, 22], [152, 30], [176, 66], [160, 96], [160, 178], [40, 178], [40, 96], [24, 66]], [[0, "#5f7ea6"], [1, "#233349"]], 22, 178);
    g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = 3; g.beginPath(); g.moveTo(100, 44); g.lineTo(100, 178); g.stroke();
    blk(g, 56, 104, 40, 34, 4, [[0, "#3c4c63"], [1, "#1a2332"]]); blk(g, 104, 104, 40, 34, 4, [[0, "#3c4c63"], [1, "#1a2332"]]); g.fillStyle = "rgba(255,255,255,.28)"; g.fillRect(60, 52, 30, 3); g.fillRect(110, 52, 30, 3);
    return {gx: 100, gy: 100, fx: null, fy: null, mx: 100, my: 30, ex: 0, ey: 0, mag: null};
  }
};

/* ---------------- 스킨: 파라미터로 코드가 그리는 무늬 (새 이미지 없음, 전부 무료) ---------------- */
const skins = [
  {id: "default", name: "기본", desc: "공장 출고 그대로", base: ["#4a5566", "#2a313e"]},
  {id: "camo", name: "정글 카모", desc: "초록·갈색 얼룩 위장", base: ["#4a5a30", "#8a7a4a"]},
  {id: "carbon", name: "카본 파이버", desc: "검은 격자 결에 광택", base: ["#1a1d24", "#3a4150"]},
  {id: "gold", name: "금도금", desc: "번쩍이는 황금빛", base: ["#f4d47a", "#a8741c"]},
  {id: "neon", name: "네온 야간", desc: "청록·분홍 형광 줄", base: ["#18e0ff", "#ff2fd2"]},
  {id: "marble", name: "대리석", desc: "흰 돌에 회색 결", base: ["#eef2f6", "#9aa6b6"]},
  {id: "roundb", name: "라운드비 에디션", desc: "라운드비 블루·오렌지 + RB 로고", base: ["#1e6bd6", "#ff8a1e"]},
  {id: "knight", name: "기사단 금장", desc: "하양·붉은 띠에 금 테두리", base: ["#ecebf1", "#b3202c"]},
  {id: "coffee", name: "야근 커피", desc: "진한 갈색에 커피잔 자국", base: ["#6a4326", "#d9b48a"]},
  {id: "swirl", name: "소용돌이 보라", desc: "보라 소용돌이 무늬", base: ["#7a3fd6", "#d9a8ff"]}];
const skinIds = skins.map(s => s.id);
let rngS = 1; const rn = () => (rngS = (rngS * 16807) % 2147483647) / 2147483647;
const TILES = {};
function tile(id) {
  if (TILES[id]) return TILES[id]; const N = 160, c = mkc(N, N), g = c.getContext("2d"); rngS = 7 + id.length * 13;
  const fillBase = (a, b) => { g.fillStyle = lgr(g, 0, 0, 0, N, [[0, a], [1, b]]); g.fillRect(0, 0, N, N); };
  if (id === "camo") { fillBase("#4d5d33", "#3f4d28"); for (const [col, n] of [["#2c371b", 16], ["#7a8a4c", 14], ["#8d7a4a", 10], ["#1f2814", 9]]) for (let i = 0; i < n; i++) { g.fillStyle = col; g.beginPath(); const x = rn() * N, y = rn() * N, r = 12 + rn() * 20; g.ellipse(x, y, r, r * .6, rn() * 3, 0, TAU); g.fill(); } }
  else if (id === "carbon") { g.fillStyle = "#14171d"; g.fillRect(0, 0, N, N); g.lineWidth = 4; for (let i = -N; i < N * 2; i += 8) { g.strokeStyle = (i / 8) % 2 ? "#232832" : "#0e1116"; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + N, N); g.stroke(); g.strokeStyle = (i / 8) % 2 ? "#0e1116" : "#232832"; g.beginPath(); g.moveTo(i, N); g.lineTo(i + N, 0); g.stroke(); } g.fillStyle = "rgba(120,140,180,.12)"; for (let y = 0; y < N; y += 8) for (let x = (y / 8 % 2) * 4; x < N; x += 8) g.fillRect(x, y, 4, 4); }
  else if (id === "gold") { g.fillStyle = lgr(g, 0, 0, 0, N, [[0, "#fff1b0"], [.25, "#f4c850"], [.5, "#b8801f"], [.75, "#f1d072"], [1, "#8a5a10"]]); g.fillRect(0, 0, N, N); g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 1; for (let i = 0; i < 20; i++) { g.beginPath(); const y = rn() * N; g.moveTo(0, y); g.bezierCurveTo(N * .3, y + 6, N * .6, y - 6, N, y + 2); g.stroke(); } }
  else if (id === "neon") { g.fillStyle = "#08101c"; g.fillRect(0, 0, N, N); for (const [col, off] of [["#18e0ff", 0], ["#ff2fd2", 40], ["#8cff3a", 80]]) { g.save(); g.shadowColor = col; g.shadowBlur = 10; g.strokeStyle = col; g.lineWidth = 6; for (let i = -N; i < N * 2; i += 120) { g.beginPath(); g.moveTo(i + off, N); g.lineTo(i + off + N * .8, 0); g.stroke(); } g.restore(); } }
  else if (id === "marble") { g.fillStyle = lgr(g, 0, 0, N, N, [[0, "#f7f9fb"], [1, "#d9dfe8"]]); g.fillRect(0, 0, N, N); for (let i = 0; i < 9; i++) { g.strokeStyle = `rgba(${90 + rn() * 40},${100 + rn() * 40},${120 + rn() * 40},${.25 + rn() * .3})`; g.lineWidth = .8 + rn() * 2.4; g.beginPath(); let x = rn() * N, y = 0; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rn() - .5) * 50; y += N / 6; g.lineTo(x, y); } g.stroke(); } }
  else if (id === "roundb") { g.fillStyle = "#1e6bd6"; g.fillRect(0, 0, N, N); g.fillStyle = "#ff8a1e"; g.beginPath(); g.moveTo(N, 0); g.lineTo(N, N); g.lineTo(N * .35, N); g.lineTo(N * .65, 0); g.closePath(); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 5; g.beginPath(); g.arc(N * .5, N * .5, 26, 0, TAU); g.stroke(); g.fillStyle = "#fff"; g.font = "900 28px system-ui"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("RB", N * .5, N * .52); }
  else if (id === "knight") { g.fillStyle = "#ecebf1"; g.fillRect(0, 0, N, N); g.fillStyle = "#b3202c"; g.fillRect(0, N * .3, N, 22); g.fillRect(0, N * .72, N, 14); g.fillStyle = "#e3b84e"; g.fillRect(0, N * .3 - 4, N, 3); g.fillRect(0, N * .3 + 22, N, 3); g.fillRect(0, N * .72 - 4, N, 3); g.fillRect(0, N * .72 + 14, N, 3); g.strokeStyle = "#e3b84e"; g.lineWidth = 3; g.beginPath(); g.moveTo(N * .5, N * .08); g.lineTo(N * .56, N * .2); g.lineTo(N * .5, N * .26); g.lineTo(N * .44, N * .2); g.closePath(); g.stroke(); }
  else if (id === "coffee") { g.fillStyle = lgr(g, 0, 0, 0, N, [[0, "#7a4d2c"], [1, "#4a2c18"]]); g.fillRect(0, 0, N, N); for (let i = 0; i < 6; i++) { g.strokeStyle = `rgba(230,200,160,${.18 + rn() * .2})`; g.lineWidth = 3; g.beginPath(); const x = rn() * N, y = rn() * N; g.ellipse(x, y, 20 + rn() * 12, 18 + rn() * 10, rn(), 0, TAU * .85); g.stroke(); } g.fillStyle = "rgba(255,235,205,.55)"; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(rn() * N, rn() * N, 6, 3.4, rn() * 3, 0, TAU); g.fill(); } }
  else if (id === "swirl") { g.fillStyle = "#3b1d78"; g.fillRect(0, 0, N, N); g.lineWidth = 8; for (let k = 0; k < 5; k++) { g.strokeStyle = k % 2 ? "#d9a8ff" : "#8f52ff"; g.beginPath(); for (let a = 0; a < 14; a += .2) { const r = 4 + a * 5.2 + k * 3; const x = N / 2 + Math.cos(a + k * 1.2) * r, y = N / 2 + Math.sin(a + k * 1.2) * r; a ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); } }
  else { fillBase("#4a5566", "#2a313e"); }
  return TILES[id] = c;
}
const equipped = (() => { try { return JSON.parse(lsGet(LSK) || "{}") || {}; } catch (e) { return {}; } })();
const getSkin = wid => skinIds.includes(equipped[wid]) ? equipped[wid] : "default";
const setSkin = (wid, id) => { if (!skinIds.includes(id)) return; equipped[wid] = id; lsSet(LSK, JSON.stringify(equipped)); };
const skinMap = () => ({...equipped});

/* ---------------- 총 그림 만들기(스킨 적용·캐시) ---------------- */
const BASE = {}, SKINNED = {};
function baseArt(wid) {
  let a = BASE[wid]; if (a) return a; const fn = DRAW[wid], sz = SIZE[wid]; if (!fn) return null;
  const cv = mkc(sz[0], sz[1]), meta = fn(cv.getContext("2d")); return BASE[wid] = Object.assign({cv, w: sz[0], h: sz[1]}, meta);
}
function art(wid, skinId) {
  const b = baseArt(wid); if (!b) return null; skinId = skinId || "default"; if (skinId === "default" || !skinIds.includes(skinId) || wid === "armor" || wid === "kit" || wid === "bomb") return b;
  const key = wid + ":" + skinId; if (SKINNED[key]) return SKINNED[key];
  const cv = mkc(b.w, b.h), g = cv.getContext("2d"); g.drawImage(b.cv, 0, 0);
  g.globalCompositeOperation = "source-atop"; g.globalAlpha = 1; g.fillStyle = g.createPattern(tile(skinId), "repeat"); g.fillRect(0, 0, b.w, b.h);   // 실루엣 안쪽만 무늬로 덮고
  g.globalCompositeOperation = "multiply"; g.globalAlpha = .42; g.drawImage(b.cv, 0, 0);   // 원래 그림의 음영을 살짝 입히고
  g.globalCompositeOperation = "screen"; g.globalAlpha = .34; g.drawImage(b.cv, 0, 0); g.globalAlpha = 1;   // 하이라이트 선을 다시 올린다
  if (skinId === "gold" || skinId === "neon" || skinId === "marble") { g.globalCompositeOperation = "source-atop"; g.fillStyle = lgr(g, 0, 0, 0, b.h, [[0, "rgba(255,255,255,.28)"], [.35, "rgba(255,255,255,0)"], [1, "rgba(0,0,0,.2)"]]); g.fillRect(0, 0, b.w, b.h); }
  g.globalCompositeOperation = "source-over";
  return SKINNED[key] = Object.assign({}, b, {cv});
}
function drawSide(ctx, wid, skinId, x, y, scale, o) {
  const a = art(wid, skinId); if (!a) return; o = o || {}; const sc = scale || 1, yaw = o.yaw || 0, cy = Math.cos(yaw), sy = Math.sin(yaw);
  ctx.save(); ctx.translate(x, y); if (o.roll) ctx.rotate(o.roll); if (o.alpha != null) ctx.globalAlpha = o.alpha;
  if (o.tilt) ctx.transform(1, 0, o.tilt, 1, 0, 0);
  ctx.transform(1, 0, sy * .16, 1, 0, 0); ctx.scale((o.flip ? -1 : 1) * sc * (.18 + .82 * Math.abs(cy)) * (cy < 0 ? -1 : 1), sc * (1 + Math.abs(sy) * .05));
  const ox = o.anchor === "center" ? -a.w / 2 : -a.gx, oy = o.anchor === "center" ? -a.h / 2 : -a.gy;
  if (o.shadow) { ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 14 * sc; ctx.shadowOffsetY = 6 * sc; }
  ctx.drawImage(a.cv, ox, oy); ctx.shadowColor = "transparent";
  if (o.sheen && yaw !== undefined) {   // 돌릴 때 지나가는 반사 하이라이트(실루엣 안쪽만)
    const t = mkc(a.w, a.h), g = t.getContext("2d"); g.drawImage(a.cv, 0, 0); g.globalCompositeOperation = "source-atop";
    const cx = a.w * (.5 + .55 * Math.sin(yaw * 1.3)), gr = g.createLinearGradient(cx - 70, 0, cx + 70, a.h * .4); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(.5, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, a.w, a.h);
    ctx.globalAlpha = (o.alpha == null ? 1 : o.alpha) * .75; ctx.drawImage(t, ox, oy);
  }
  ctx.restore();
}
function drawTop(ctx, wid, skinId, x, y, size, angle) {   // 탑다운: 손에 든 총을 위에서 본 단순화 모양(스킨 색 반영)
  const sk = skins.find(s => s.id === (skinId || "default")) || skins[0], len = {pistol: .55, smg: .75, shot: 1, rifle: 1, lmg: 1.1, sniper: 1.25, knife: .5, frag: .22, smoke: .24, flash: .24, bomb: .4, kit: .4}[wid] || .7, L = size * len;
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle || 0);
  const body = lgr(ctx, 0, -size * .1, 0, size * .1, [[0, sk.base[0]], [1, sk.base[1]]]);
  if (wid === "frag" || wid === "smoke" || wid === "flash") { ctx.fillStyle = wid === "frag" ? "#586a2c" : wid === "smoke" ? "#98a2b0" : "#f0dc84"; ctx.beginPath(); ctx.arc(size * .2, 0, size * .1, 0, TAU); ctx.fill(); ctx.strokeStyle = "#0b0e14"; ctx.lineWidth = 1.5; ctx.stroke(); }
  else if (wid === "knife") { ctx.fillStyle = "#d3dbe6"; ctx.beginPath(); ctx.moveTo(size * .1, -size * .03); ctx.lineTo(size * .6, 0); ctx.lineTo(size * .1, size * .04); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#0b0e14"; ctx.stroke(); ctx.fillStyle = "#222a35"; ctx.fillRect(-size * .02, -size * .035, size * .14, size * .07); }
  else { ctx.fillStyle = body; rrect(ctx, -size * .12, -size * .05, L * .55, size * .1, 3); ctx.fill(); ctx.strokeStyle = "#0b0e14"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = "#1a1f28"; ctx.fillRect(L * .4 - size * .12, -size * .02, L * .6, size * .04); ctx.fillStyle = "#0b0e14"; ctx.fillRect(L * .98 - size * .12, -size * .03, size * .04, size * .06); }
  ctx.restore();
}
const ICONS = {};
function icon(wid, skinId, maxW, maxH) {
  const key = wid + ":" + (skinId || "default") + ":" + maxW + "x" + maxH; if (ICONS[key]) return ICONS[key];
  const a = art(wid, skinId); if (!a) return ""; const sc = Math.min(maxW / a.w, maxH / a.h), c = mkc(Math.ceil(a.w * sc), Math.ceil(a.h * sc));
  const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(a.cv, 0, 0, c.width, c.height); return ICONS[key] = c.toDataURL();
}

/* ---------------- 구경(인스펙트) 자세: 총마다 다른 시퀀스 ---------------- */
const INSPECT = {
  pistol: {len: 3.2, f: t => ({rot: Math.sin(t * 1.6) * .3 + (t > 1.6 ? (t - 1.6) / 1.6 * TAU : 0), yaw: Math.sin(t * 2) * .7, tx: 0, ty: -.02, sc: 1})},     // 손 위에서 한 바퀴
  smg: {len: 3, f: t => ({rot: Math.sin(t * 2.2) * .22, yaw: Math.sin(t * 1.8) * 1.0, tx: 0, ty: -.03, sc: 1})},
  shot: {len: 3.4, f: t => ({rot: -.2 + Math.sin(t * 1.5) * .25, yaw: Math.sin(t * 1.4) * 1.1, tx: Math.sin(t * 1.5) * .02, ty: -.04, sc: 1})},
  rifle: {len: 3.6, f: t => ({rot: Math.sin(t * 1.4) * .32, yaw: Math.sin(t * 1.2) * 1.2, tx: 0, ty: -.05 - (t > 2 && t < 2.8 ? .04 : 0), sc: 1.02})},               // 좌우로 기울여 보기
  lmg: {len: 3.8, f: t => ({rot: Math.sin(t * 1.1) * .22, yaw: Math.sin(t * 1.0) * 1.1, tx: 0, ty: -.04, sc: 1})},
  sniper: {len: 4, f: t => ({rot: Math.sin(t * 1.0) * .2, yaw: Math.sin(t * .9) * 1.3, tx: 0, ty: -.05, sc: 1})},
  knife: {len: 2.6, f: t => ({rot: t * 5.2 + Math.sin(t * 3) * .5, yaw: Math.sin(t * 2.4) * .5, tx: 0, ty: -.12 + Math.abs(Math.sin(t * 5.2)) * .03, sc: 1})},                // 빙글빙글
  frag: {len: 2.6, f: t => ({rot: t * 3, yaw: Math.sin(t * 2) * .5, tx: Math.sin(t * 4) * .03, ty: -.1, sc: 1})},
  smoke: {len: 2.6, f: t => ({rot: t * 2.4, yaw: Math.sin(t * 2) * .5, tx: 0, ty: -.1, sc: 1})},
  flash: {len: 2.6, f: t => ({rot: t * 2.8, yaw: Math.sin(t * 2.2) * .5, tx: 0, ty: -.1, sc: 1})},
  bomb: {len: 2.4, f: t => ({rot: Math.sin(t * 2) * .2, yaw: Math.sin(t * 1.6) * .8, tx: 0, ty: -.05, sc: 1})},
  kit: {len: 2.4, f: t => ({rot: Math.sin(t * 2) * .2, yaw: Math.sin(t * 1.6) * .8, tx: 0, ty: -.05, sc: 1})}
};
const inspectLen = wid => (INSPECT[wid] || INSPECT.rifle).len;
const inspect = (wid, t) => (INSPECT[wid] || INSPECT.rifle).f(clamp(t, 0, inspectLen(wid)));

/* ---------------- 총소리: WebAudio 합성(크랙 + 쿵 + 꼬리 3층), 거리 감쇠·패닝·동시 24개 ---------------- */
const AU = {ctx: null, out: null, noise: null, on: true, vol: .8, voices: 0};
try { const v = lsGet("roundb.gunsfx.v1"); if (v) { const o = JSON.parse(v); AU.on = o.on !== false; AU.vol = clamp(+o.vol || .8, 0, 1); } } catch (e) {}
const saveAU = () => lsSet("roundb.gunsfx.v1", JSON.stringify({on: AU.on, vol: AU.vol}));
function actx() {
  if (!AU.on) return null;
  if (!AU.ctx) {
    try {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; const c = new A(); AU.ctx = c;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; AU.out = c.createGain(); AU.out.gain.value = AU.vol * .7; AU.out.connect(comp); comp.connect(c.destination);
      const n = c.sampleRate, b = c.createBuffer(1, n, n), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; AU.noise = b;
    } catch (e) { AU.ctx = null; return null; }
  }
  if (AU.ctx.state === "suspended") AU.ctx.resume(); return AU.ctx;
}
function lane(c, o) {   // 거리·좌우 처리된 출력 노드
  const g = c.createGain(); g.gain.value = (o.vol == null ? 1 : o.vol) / (1 + (o.dist || 0) * .13); let node = g;
  if ((o.dist || 0) > 5) { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = clamp(14000 / (1 + o.dist * .35), 900, 14000); g.connect(f); node = f; }
  if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(o.pan || 0, -1, 1); node.connect(p); p.connect(AU.out); } else node.connect(AU.out);
  return g;
}
function tn(c, dest, f0, f1, d, type, v, at) { const t = c.currentTime + (at || 0), o = c.createOscillator(), g = c.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, v), t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g); g.connect(dest); o.start(t); o.stop(t + d + .03); }
function ns(c, dest, d, v, f0, f1, type, at, q) { const t = c.currentTime + (at || 0), s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); f.type = type || "lowpass"; f.Q.value = q || .8; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + d); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, v), t + .003); g.gain.exponentialRampToValueAtTime(.0001, t + d); s.buffer = AU.noise; s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * .5); s.stop(t + d + .03); }
function echo(c, dest, delay, fb, mix) { const d = c.createDelay(1), g = c.createGain(), m = c.createGain(); d.delayTime.value = delay; g.gain.value = fb; m.gain.value = mix; d.connect(g); g.connect(d); d.connect(m); m.connect(dest); return d; }
const SHOT = {   // crack[길이, 시작Hz, 끝Hz, 음량] · thump[시작Hz, 끝Hz, 길이, 음량] · tail[길이, 시작Hz, 끝Hz, 음량]
  p: {crack: [.03, 4200, 1400, .34], thump: [230, 85, .08, .3], tail: [.16, 2000, 380, .1]},
  s: {crack: [.022, 4600, 1800, .24], thump: [180, 72, .055, .2], tail: [.1, 2400, 600, .07]},
  g: {crack: [.055, 2600, 650, .42], thump: [96, 36, .3, .6], tail: [.6, 1500, 170, .22], echo: [.11, .3, .2]},
  r: {crack: [.04, 3400, 900, .36], thump: [135, 52, .14, .4], tail: [.3, 1700, 300, .15]},
  l: {crack: [.045, 2800, 700, .36], thump: [108, 44, .17, .48], tail: [.32, 1500, 260, .17]},
  n: {crack: [.07, 3800, 700, .5], thump: [88, 30, .42, .62], tail: [1.1, 1900, 160, .22], echo: [.19, .42, .3]}
};
function playShot(c, wid, o) {
  const k = SHOT[(weapons.find(w => w.id === wid) || {}).type] || SHOT.r, L = lane(c, o), s = o.silenced;
  const d = L; if (k.echo) { const e = echo(c, L, k.echo[0], k.echo[1], k.echo[2]); L.connect(e); }
  const cr = k.crack, th = k.thump, tl = k.tail;
  ns(c, d, cr[0], cr[3] * (s ? .2 : 1), cr[1], cr[2], "highpass", 0, 1.1); tn(c, d, th[0], th[1], th[2], "sine", th[3] * (s ? .4 : 1), 0); ns(c, d, tl[0] * (s ? .5 : 1), tl[3] * (s ? .4 : 1), tl[1], tl[2], "lowpass", .012, .6);
  tn(c, d, th[0] * 2.2, th[1] * 2, th[2] * .5, "triangle", th[3] * .35, 0);
}
const SOUNDS = {
  reload1(c, wid, o) { const L = lane(c, o); if (wid === "shot") { ns(c, L, .05, .12, 2800, 1800, "bandpass", 0, 3); tn(c, L, 700, 300, .05, "square", .05, 0); } else if (wid === "sniper") { ns(c, L, .05, .12, 3200, 1800, "bandpass", 0, 3); tn(c, L, 1200, 600, .06, "square", .05, 0); tn(c, L, 160, 90, .08, "sine", .12, .02); } else { ns(c, L, .045, .13, 3000, 1600, "bandpass", 0, 3); tn(c, L, 900, 420, .05, "square", .05, 0); tn(c, L, 200, 110, .07, "sine", .1, .01); } },   // 탄창 분리 '철컥'
  reload2(c, wid, o) { const L = lane(c, o); if (wid === "shot") { tn(c, L, 420, 260, .06, "square", .06, 0); ns(c, L, .04, .1, 2400, 1500, "bandpass", .01, 3); } else { tn(c, L, 260, 130, .09, "sine", .16, 0); ns(c, L, .035, .1, 2600, 1400, "bandpass", .005, 3); tn(c, L, 1500, 800, .03, "square", .04, .03); } },   // 삽입 '딸깍'
  reload3(c, wid, o) { const L = lane(c, o); if (wid === "shot") { ns(c, L, .07, .14, 2000, 700, "bandpass", 0, 2.4); tn(c, L, 190, 90, .1, "sine", .18, .0); ns(c, L, .06, .14, 2200, 900, "bandpass", .12, 2.4); tn(c, L, 190, 90, .1, "sine", .18, .12); } else if (wid === "sniper") { ns(c, L, .06, .14, 2400, 1000, "bandpass", 0, 3); tn(c, L, 180, 80, .1, "sine", .2, 0); ns(c, L, .05, .14, 2600, 1200, "bandpass", .16, 3); tn(c, L, 160, 70, .1, "sine", .2, .16); } else { ns(c, L, .05, .16, 3400, 1800, "bandpass", 0, 3); tn(c, L, 1100, 520, .05, "square", .06, 0); tn(c, L, 210, 100, .08, "sine", .14, .015); } },   // 슬라이드/볼트/펌프 '착'
  dry(c, wid, o) { const L = lane(c, o); tn(c, L, 1600, 900, .025, "square", .07, 0); ns(c, L, .02, .06, 3500, 2000, "bandpass", 0, 3); },
  draw(c, wid, o) { const L = lane(c, o); ns(c, L, .08, .07, 1800, 900, "bandpass", 0, 1.4); tn(c, L, 600, 420, .05, "square", .03, .03); },
  pin(c, wid, o) { const L = lane(c, o); tn(c, L, 3200, 2800, .12, "sine", .06, 0); tn(c, L, 4800, 4400, .09, "sine", .03, .02); ns(c, L, .03, .08, 4500, 2500, "bandpass", 0, 3); },
  bounce(c, wid, o) { const L = lane(c, o); tn(c, L, 900, 320, .05, "square", .06, 0); tn(c, L, 180, 90, .07, "sine", .12, 0); ns(c, L, .03, .08, 3000, 1400, "bandpass", 0, 3); },
  boom(c, wid, o) { const L = lane(c, o); echo(c, L, .13, .35, .25); ns(c, L, .5, .6, 1800, 120, "lowpass", 0, .6); tn(c, L, 90, 28, .5, "sine", .6, 0); ns(c, L, .08, .35, 5000, 1500, "highpass", 0, 1); for (let i = 0; i < 5; i++) ns(c, L, .03, .12, 3500, 1200, "bandpass", .05 + i * .035, 3); },   // 저음 + 파편
  smoke(c, wid, o) { const L = lane(c, o); ns(c, L, .9, .2, 2600, 800, "bandpass", 0, .7); },
  flash(c, wid, o) { const L = lane(c, o); ns(c, L, .08, .22, 4000, 1400, "highpass", 0, 1); tn(c, L, 140, 60, .1, "sine", .2, 0); },
  ring(c, wid, o) { const L = lane(c, o); tn(c, L, 2300, 2100, 1.0, "sine", .028, 0); },
  swing(c, wid, o) { const L = lane(c, o); ns(c, L, .16, .12, 700, 4200, "bandpass", 0, 1.4); },
  stab(c, wid, o) { const L = lane(c, o); tn(c, L, 220, 90, .09, "sine", .3, 0); ns(c, L, .05, .2, 3000, 900, "bandpass", 0, 2); tn(c, L, 2400, 1800, .05, "triangle", .06, .01); },
  step(c, wid, o) { const L = lane(c, o); tn(c, L, 150, 70, .05, "sine", .08, 0); ns(c, L, .04, .06, 900, 300, "lowpass", 0, .6); },
  land(c, wid, o) { const L = lane(c, o); tn(c, L, 120, 50, .12, "sine", .2, 0); ns(c, L, .08, .12, 800, 200, "lowpass", 0, .6); },
  hit(c, wid, o) { const L = lane(c, o); tn(c, L, 1500, 1000, .04, "square", .08, 0); tn(c, L, 2400, 1800, .03, "sine", .05, .01); },   // '틱'
  head(c, wid, o) { const L = lane(c, o); tn(c, L, 2300, 2300, .09, "sine", .12, 0); tn(c, L, 3400, 3400, .12, "sine", .1, .05); tn(c, L, 1200, 900, .05, "square", .05, 0); },   // '딩'
  armor(c, wid, o) { const L = lane(c, o); tn(c, L, 420, 200, .08, "triangle", .16, 0); ns(c, L, .05, .14, 1400, 500, "bandpass", 0, 1.6); },   // 둔탁
  hurt(c, wid, o) { const L = lane(c, o); tn(c, L, 130, 55, .2, "sawtooth", .25, 0); ns(c, L, .1, .12, 700, 300, "lowpass", 0, .7); },
  kill(c, wid, o) { const L = lane(c, o); tn(c, L, 520, 880, .09, "triangle", .13, 0); tn(c, L, 880, 1320, .13, "triangle", .11, .08); tn(c, L, 1760, 1760, .16, "sine", .06, .17); }
};
function play(kind, wid, o) {
  o = o || {}; if (!AU.on) return; const c = actx(); if (!c) return;
  if (AU.voices >= 24 && !o.prio) return;   // 폴리포니 상한
  AU.voices++; setTimeout(() => { AU.voices = Math.max(0, AU.voices - 1); }, (kind === "shot" && (wid === "sniper" || wid === "shot") ? 1400 : 700));
  try { if (kind === "shot") playShot(c, wid, o); else if (SOUNDS[kind]) SOUNDS[kind](c, wid, o); } catch (e) {}
}
const sfx = {play, setEnabled(b) { AU.on = !!b; saveAU(); }, enabled: () => AU.on, volume(v) { AU.vol = clamp(+v, 0, 1); if (AU.out) AU.out.gain.value = AU.vol * .7; saveAU(); }, getVolume: () => AU.vol, unlock() { actx(); }, voices: () => AU.voices};
window.addEventListener("pointerdown", () => sfx.unlock(), {once: true, capture: true}); window.addEventListener("keydown", () => sfx.unlock(), {once: true, capture: true});

window.GunKit = {weapons, skins, skinIds, TYPE2ID, getSkin, setSkin, skinMap, art, drawSide, drawTop, icon, inspect, inspectLen, sfx, version: 1};
})();
