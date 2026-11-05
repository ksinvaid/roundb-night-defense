import * as THREE from './lib/three.module.js';

// ============================================================
//  라운드비 4층 공유오피스 — 걸어다니는 3D 투어 (프로토타입)
//  좌표는 배치도 이미지(371x549) 픽셀 기준 → 미터로 환산
//  K = 1픽셀이 몇 미터인지. 실제 치수를 알면 이 값만 바꾸면 된다.
// ============================================================
const F3 = new URLSearchParams(location.search).get('floor') === '3';   // ?floor=3 → 3층 라운지. 없으면 4층
// 3층은 사용자가 준 배치도(381x584)를 그대로 쓴다. 문 폭(≈35px)·책상(≈51x13px) 크기로 역산한 1px≈0.05m.
const K = 0.08;   // 3층도 4층과 같은 값 → 같은 건물 크기(≈26x35m). 가구는 K 와 무관하게 실물 크기로 고정해 사이가 널찍하다   // 4층: 처음(0.04)의 2배. 책상·의자 같은 가구 크기는 거의 그대로라 통로가 넉넉해진다
const CX = F3 ? 184 : 174, CY = F3 ? 335.5 : 297;   // 배치도 중심 픽셀 (3층: 외곽선 x 20~348, y 113~558 의 중심)
const X = (px) => (px - CX) * K;
const Z = (py) => (py - CY) * K;
const PX = (x) => x / K + CX;
const PY = (z) => z / K + CY;

const params = new URLSearchParams(location.search);

// ---------------- 렌더러 / 씬 ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdff3ff);
scene.fog = new THREE.Fog(0xdff3ff, 60, 160);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 360);

scene.add(new THREE.HemisphereLight(0xffffff, 0xf1e8da, 1.45));
// 카메라를 따라다니는 보조 조명 — 캐릭터 얼굴과 색이 어둡게 죽지 않게
const fill = new THREE.DirectionalLight(0xffffff, 0.85);
fill.position.set(0, 1, 1.2);
camera.add(fill); fill.target.position.set(0, 0, -5); camera.add(fill.target);
scene.add(camera);
const sun = new THREE.DirectionalLight(0xfff4e0, 1.3);
sun.position.set(-9, 16, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(3072, 3072);
sun.shadow.camera.left = -28; sun.shadow.camera.right = 28;
sun.shadow.camera.top = 28; sun.shadow.camera.bottom = -28;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0004;
scene.add(sun);

// ---------------- 헬퍼 ----------------
const colliders = [];                    // {x1,x2,z1,z2}
const seats = [];                        // 앉을 수 있는 자리 {x,z,face,h,stx,stz,view}
const fadeWalls = [];                    // 카메라를 가리면 투명해지는 벽

// 4층 내부 물체 표시/제거 — 3층 모드에서는 4층 내부를 만든 직후 통째로 걷어낸다.
// (씬에 추가된 물체 + 충돌 + 자리 + 투명벽 목록을 mark 시점으로 되돌린다)
function markScene() { return { n: scene.children.length, c: colliders.length, s: seats.length, f: fadeWalls.length }; }
function stripSince(m) {
  scene.children.slice(m.n).forEach((o) => scene.remove(o));
  colliders.length = m.c; seats.length = m.s; fadeWalls.length = m.f;
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0, ...opts });
}

// 픽셀 사각형으로 박스 만들기. y0 = 바닥에서 띄운 높이
function pbox(x1, y1, x2, y2, h, color, { y0 = 0, collide = false, cast = true, receive = true, material, shrink = 0 } = {}) {
  const w = (x2 - x1) * K, d = (y2 - y1) * K;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material || mat(color));
  m.position.set(X((x1 + x2) / 2), y0 + h / 2, Z((y1 + y2) / 2));
  m.castShadow = cast; m.receiveShadow = receive;
  scene.add(m);
  if (collide) {
    colliders.push({ x1: X(x1) + shrink, x2: X(x2) - shrink, z1: Z(y1) + shrink, z2: Z(y2) - shrink });
  }
  return m;
}

// 월드 미터 기준 박스
function wbox(cx, cz, w, d, h, color, { y0 = 0, collide = false, material, cast = true } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material || mat(color));
  m.position.set(cx, y0 + h / 2, cz);
  m.castShadow = cast; m.receiveShadow = true;
  scene.add(m);
  if (collide) colliders.push({ x1: cx - w / 2, x2: cx + w / 2, z1: cz - d / 2, z2: cz + d / 2 });
  return m;
}

function floorRect(x1, y1, x2, y2, color, lift = 0.01) {
  const m = new THREE.Mesh(new THREE.BoxGeometry((x2 - x1) * K, 0.02, (y2 - y1) * K), mat(color, { roughness: 1 }));
  m.position.set(X((x1 + x2) / 2), lift, Z((y1 + y2) / 2));
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const FONT = "'Pretendard','Malgun Gothic',sans-serif";

function labelSprite(text, { bg = '#ffffff', fg = '#1b1b1f', size = 0.5, y = 2.3, x = 0, z = 0 } = {}) {
  const tex = canvasTexture(512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = bg;
    const r = 56;
    g.beginPath(); g.moveTo(r, 8); g.lineTo(w - r, 8); g.arc(w - r, h / 2, h / 2 - 8, -Math.PI / 2, Math.PI / 2);
    g.lineTo(r, h - 8); g.arc(r, h / 2, h / 2 - 8, Math.PI / 2, -Math.PI / 2); g.fill();
    g.fillStyle = fg; g.font = `800 52px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(size * 4.8, size * 1.2, 1);
  s.position.set(x, y, z);
  scene.add(s);
  return s;
}

// ---------------- 바닥 ----------------
// 큰 바닥 + 구역 색
// 바깥 잔디
const grassTex = canvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#8fd46f'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${50 + Math.random() * 50 | 0},${140 + Math.random() * 70 | 0},${50 + Math.random() * 40 | 0},0.38)`;
    g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
});
grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
grassTex.repeat.set(54, 54);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), mat(0xffffff, { roughness: 1, map: grassTex }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);

const mark4a = markScene();                          // ← 여기부터 4층 내부 (3층 모드에서 제거)
// ★3층으로 내려가는 계단 구멍 (로비 동쪽 끝 복도, 배치도 픽셀). 구멍 주변만 바닥을 깐다.
const HOLE4 = [306, 352, 333, 405];
function floorRectCut(x1, y1, x2, y2, color, lift, [a, b, c, d]) {
  floorRect(x1, y1, x2, b, color, lift); floorRect(x1, d, x2, y2, color, lift);
  floorRect(x1, b, a, d, color, lift); floorRect(c, b, x2, d, color, lift);
}
floorRectCut(10, 75, 338, 520, 0xeee4d2, 0.01, HOLE4);              // 기본 바닥
floorRect(10, 75, 147, 152, 0xd5ecd6, 0.012);        // 휴게공간
floorRect(235, 75, 338, 225, 0xe3daf3, 0.012);       // 회의실
floorRectCut(235, 225, 338, 410, 0xe9e9ef, 0.012, HOLE4);      // 입구 로비
floorRect(18, 165, 145, 232, 0xf6d3ca, 0.012);       // A
floorRect(56, 246, 145, 305, 0xcdebdb, 0.012);       // B
floorRect(18, 322, 145, 388, 0xdad3f2, 0.012);       // C
floorRect(18, 405, 145, 468, 0xfae7b0, 0.012);       // D
floorRect(175, 468, 277, 520, 0xcfe3f7, 0.012);      // 남자화장실
floorRect(277, 410, 338, 520, 0xf7d3de, 0.012);      // 여자화장실
floorRect(10, 250, 52, 312, 0xc9ccd2, 0.012);        // 실외기실

// ---------------- 벽 ----------------
const WALL_H = 3.0, WALL_T = 6;
const wallMat = () => mat(0xfbf9f4, { transparent: true, opacity: 1, emissive: 0x4a4740 });
function wall(x1, y1, x2, y2) {
  const horizontal = (y1 === y2);
  const [ax1, ay1, ax2, ay2] = horizontal
    ? [x1 - WALL_T / 2, y1 - WALL_T / 2, x2 + WALL_T / 2, y2 + WALL_T / 2]
    : [x1 - WALL_T / 2, y1 - WALL_T / 2, x2 + WALL_T / 2, y2 + WALL_T / 2];
  const m = pbox(ax1, ay1, ax2, ay2, WALL_H, 0xf8f6f1, { collide: true, material: wallMat() });
  fadeWalls.push(m);
  return m;
}
// 바깥 벽 — 창문이 있는 벽. 가로/세로 한 줄을 (기둥 + 창문 + 아래턱 + 위턱)으로 쪼갠다.
const SILL = 0.8, WIN_TOP = 2.6;
const glassMat = new THREE.MeshStandardMaterial({
  color: 0xcfeaff, transparent: true, opacity: 0.26, roughness: 0.1, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false,
});
function windowWall(x1, y1, x2, y2, skip = []) {
  const horiz = y1 === y2;
  const t = WALL_T * K;
  const conv = horiz ? X : Z;
  const s0 = conv(horiz ? x1 : y1) - t / 2, s1 = conv(horiz ? x2 : y2) + t / 2;
  const c = horiz ? Z(y1) : X(x1);
  const skipM = skip.map(([a, b]) => [conv(a) - 0.5, conv(b) + 0.5]);
  const piece = (a, b, y0, h) => {
    if (b - a < 0.02) return;
    const cm = (a + b) / 2, len = b - a;
    const m = horiz
      ? wbox(cm, c, len, t, h, 0xfbf9f4, { y0, collide: true, material: wallMat() })
      : wbox(c, cm, t, len, h, 0xfbf9f4, { y0, collide: true, material: wallMat() });
    fadeWalls.push(m);
  };
  const glass = (a, b) => {
    const cm = (a + b) / 2, len = b - a, h = WIN_TOP - SILL;
    const g = horiz ? new THREE.Mesh(new THREE.BoxGeometry(len, h, 0.04), glassMat)
      : new THREE.Mesh(new THREE.BoxGeometry(0.04, h, len), glassMat);
    g.position.set(horiz ? cm : c, SILL + h / 2, horiz ? c : cm);
    scene.add(g);
    // 창틀
    const f = mat(0xffffff);
    [[0, 0.04], [h - 0.04, 0.04]].forEach(([dy, hh]) => {
      const fr = horiz ? new THREE.Mesh(new THREE.BoxGeometry(len, hh, 0.1), f) : new THREE.Mesh(new THREE.BoxGeometry(0.1, hh, len), f);
      fr.position.set(horiz ? cm : c, SILL + dy + hh / 2, horiz ? c : cm); scene.add(fr);
    });
    const mid = horiz ? new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.1), f) : new THREE.Mesh(new THREE.BoxGeometry(0.1, h, 0.05), f);
    mid.position.set(horiz ? cm : c, SILL + h / 2, horiz ? c : cm); scene.add(mid);
  };
  // 창문 구간 계산
  const WIN = 2.8, GAP = 1.0;
  const wins = [];
  let pos = s0 + 0.7;
  while (pos + WIN <= s1 - 0.7) {
    const hitSkip = skipM.some(([a, b]) => pos < b && pos + WIN > a);
    if (hitSkip) { pos += 0.3; continue; }
    wins.push([pos, pos + WIN]);
    pos += WIN + GAP;
  }
  let cur = s0;
  wins.forEach(([a, b]) => {
    piece(cur, a, 0, WALL_H);                  // 기둥
    piece(a, b, 0, SILL);                      // 아래턱
    piece(a, b, WIN_TOP, WALL_H - WIN_TOP);    // 위턱
    glass(a, b);
    cur = b;
  });
  piece(cur, s1, 0, WALL_H);
}
windowWall(10, 75, 338, 75, [[229, 241]]);                 // 위쪽 (회의실 벽 연결부 제외)
windowWall(10, 520, 175, 520, [[170, 180]]);               // 아래쪽 (화장실 앞까지)
wall(175, 520, 338, 520);                                  // 화장실 쪽은 막힌 벽
windowWall(10, 75, 10, 520, [[244, 318]]);                 // 왼쪽 (실외기실 제외)
windowWall(338, 75, 338, 410, [[219, 231]]);               // 오른쪽 (회의실·로비)
wall(338, 410, 338, 520);                                  // 여자화장실 쪽은 막힌 벽
// 회의실
wall(235, 75, 235, 225);                 // 왼쪽 벽
wall(262, 225, 338, 225);                // 아래 벽 (문: x 238~262)
// 입구 로비 벽 (입구 문: y 272~308)
wall(235, 225, 235, 272); wall(235, 308, 235, 410);
wall(235, 410, 278, 410); wall(300, 410, 338, 410);   // 로비 아래 (여자화장실 문: x 278~300)

// ★미니복도 + 3층 계단 (로비 동쪽 끝): 서쪽 벽(x=303) 하나로 폭 약 2.6m 복도를 만들고, 복도 끝 y 352~405 가 아래로 내려가는 계단.
// 복도 북쪽(y<330)은 로비로 열려 있다. 계단은 17단(단높이 0.2m) → 3.4m 내려가 3층.
wall(303, 330, 303, 410);
floorRect(306, 330, 333, 352, 0xc9d3e6, 0.016);                 // 복도 바닥(연한 파랑 러너)
{
  const cx = X((HOLE4[0] + HOLE4[2]) / 2), w = (HOLE4[2] - HOLE4[0]) * K, z0 = Z(HOLE4[1]), run = 0.254, N = 17;
  const shaft = mat(0xc8c4ba), tread = mat(0xe8e2d3);
  for (let i = 0; i < N - 1; i++) {                              // 계단: 아래로 갈수록 낮아지는 덩어리
    const top = -0.2 * (i + 1);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, top + 3.4, run), tread);
    m.position.set(cx, -3.4 + (top + 3.4) / 2, z0 + run * (i + 0.5)); m.receiveShadow = true; scene.add(m);
  }
  const len = (HOLE4[3] - HOLE4[1]) * K, cz = Z((HOLE4[1] + HOLE4[3]) / 2);
  wbox(X(HOLE4[0]) - 0.04, cz, 0.08, len, 3.4, 0xc8c4ba, { y0: -3.4, cast: false });          // 계단실 벽(서·동·남)과 바닥
  wbox(X(HOLE4[2]) + 0.04, cz, 0.08, len, 3.4, 0xc8c4ba, { y0: -3.4, cast: false });
  wbox(cx, Z(HOLE4[3]) + 0.04, w + 0.16, 0.08, 3.4, 0xc8c4ba, { y0: -3.4, cast: false });
  wbox(cx, cz, w, len, 0.1, 0x3a3d44, { y0: -3.5, cast: false });
  // 난간(복도 쪽 서벽 안쪽 손잡이) + 안내 표지
  wbox(X(HOLE4[0]) + 0.05, cz, 0.05, len, 0.05, 0x777a84, { y0: 0.9, cast: false });
  labelSprite('↓ 3층 라운지', { size: 0.4, y: 2.0, x: cx, z: Z(344), bg: '#ffd93d' });
  const tex = canvasTexture(256, 128, (g, tw, th) => {           // 복도 바닥 화살표 (아래 방향)
    g.clearRect(0, 0, tw, th); g.fillStyle = '#ff6b5e';
    g.beginPath(); g.moveTo(tw / 2, th - 8); g.lineTo(tw / 2 - 44, th / 2 - 2); g.lineTo(tw / 2 - 16, th / 2 - 2); g.lineTo(tw / 2 - 16, 6); g.lineTo(tw / 2 + 16, 6); g.lineTo(tw / 2 + 16, th / 2 - 2); g.lineTo(tw / 2 + 44, th / 2 - 2); g.closePath(); g.fill();
  });
  const ar = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  ar.rotation.x = -Math.PI / 2; ar.position.set(cx, 0.03, Z(341)); scene.add(ar);
}
wall(277, 410, 277, 520);                // 여자화장실 왼쪽
// 남자화장실 (문: x 190~215)
wall(175, 468, 190, 468); wall(215, 468, 277, 468); wall(175, 468, 175, 520);
// 실외기실 (문: y 285~303)
wall(10, 250, 52, 250); wall(10, 312, 52, 312); wall(52, 250, 52, 285); wall(52, 303, 52, 312);

// 가상벽(유리 칸막이)
{
  const glass = mat(0x9fd3ff, { transparent: true, opacity: 0.32, roughness: 0.2 });
  wbox(X(172), Z(317.5), 0.14, (385 - 250) * K, 1.9, 0x9fd3ff, { collide: true, material: glass, cast: false });
  labelSprite('가상벽', { size: 0.34, y: 2.15, x: X(172), z: Z(318), bg: '#cfe7ff' });
}

// ---------------- 책상 ----------------
function seatTexture(id, tone) {
  return canvasTexture(128, 64, (g, w, h) => {
    g.fillStyle = tone; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1b1f'; g.font = `900 40px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(id, w / 2, h / 2 + 2);
  });
}

// 열린 맥북 (사용자가 의자 쪽에 앉은 방향 기준으로 화면이 사용자를 향한다)
const macSilver = mat(0xcdd1d8, { metalness: 0.55, roughness: 0.35 });
const macScreen = new THREE.MeshBasicMaterial({
  map: canvasTexture(256, 160, (g, w, h) => {
    g.fillStyle = '#0d0d10'; g.fillRect(0, 0, w, h);                       // 베젤
    const gr = g.createLinearGradient(8, 8, w - 8, h - 8);
    gr.addColorStop(0, '#ff9ec7'); gr.addColorStop(0.5, '#ffd86b'); gr.addColorStop(1, '#7fc4ff');
    g.fillStyle = gr; g.fillRect(8, 8, w - 16, h - 16);                    // 바탕화면
    g.fillStyle = 'rgba(255,255,255,.92)'; g.font = `800 26px ${FONT}`; g.textAlign = 'center';
    g.fillText('ROUNDB', w / 2, h / 2 + 8);
  }),
});
function addMacbook(cx, cz, side) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.016, 0.23), macSilver);
  base.position.y = 0.008; base.castShadow = true; g.add(base);
  const keys = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.002, 0.1), mat(0x2b2d33)); keys.position.set(0, 0.017, -0.04); g.add(keys);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.002, 0.06), mat(0xb9bdc4)); pad.position.set(0, 0.017, 0.075); g.add(pad);
  const hinge = new THREE.Group(); hinge.position.set(0, 0.016, -0.115); hinge.rotation.x = -0.3; g.add(hinge);   // 뒤로 젖혀 열림
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.008), [macSilver, macSilver, macSilver, macSilver, macScreen, macSilver]);
  lid.position.y = 0.11; lid.castShadow = true; hinge.add(lid);
  g.position.set(cx + 0.05, 0.78, cz + side * 0.05);
  g.rotation.y = side > 0 ? 0 : Math.PI;
  scene.add(g);
}

// D1 = 매니저 자리: 맥북 + 양옆 커피 + 각종 간식 + 명패
function addManagerDesk(cx, cz, side) {
  const at = (lx, lz) => [cx + lx, cz + side * lz];       // lz 양수 = 앉는 사람 쪽
  const g = new THREE.Group(); scene.add(g);
  const TOP = 0.78;
  const put = (geo, mtl, lx, y, lz, o = {}) => {
    const [x, z] = at(lx, lz);
    const m = new THREE.Mesh(geo, mtl);
    m.position.set(x, TOP + y, z);
    if (o.rot) m.rotation.set(...o.rot);
    if (o.sc) m.scale.set(...o.sc);
    m.castShadow = true; g.add(m); return m;
  };
  const cyl = (rt, rb, h, n = 16) => new THREE.CylinderGeometry(rt, rb, h, n);
  const glass = mat(0xdff1ff, { transparent: true, opacity: 0.45, roughness: 0.1 });

  // ── 노트북 왼쪽: 아이스 아메리카노
  put(cyl(0.042, 0.033, 0.13), glass, -0.27, 0.065, -0.03);
  put(cyl(0.037, 0.03, 0.095), mat(0x4a2a17), -0.27, 0.05, -0.03);
  [[0.01, 0.1, 0.0], [-0.012, 0.095, 0.01], [0.0, 0.105, -0.012]].forEach(([dx, y, dz]) =>
    put(new THREE.BoxGeometry(0.022, 0.022, 0.022), mat(0xffffff, { transparent: true, opacity: 0.8 }), -0.27 + dx, y, -0.03 + dz, { rot: [0.4, 0.5, 0.2] }));
  put(new THREE.SphereGeometry(0.044, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass, -0.27, 0.13, -0.03);
  put(cyl(0.004, 0.004, 0.17, 6), mat(0xff7a8a), -0.262, 0.17, -0.03, { rot: [0, 0, 0.12] });

  // ── 노트북 오른쪽: 따뜻한 라떼 (종이컵 + 슬리브)
  put(cyl(0.042, 0.032, 0.115), mat(0xfdfdfd), 0.35, 0.0575, -0.02);
  put(cyl(0.0425, 0.0355, 0.05), mat(0xb27a48), 0.35, 0.05, -0.02);
  put(cyl(0.044, 0.044, 0.012), mat(0x34343a), 0.35, 0.121, -0.02);

  // ── 뒤쪽 간식들
  // 과자 봉지
  put(new THREE.BoxGeometry(0.2, 0.045, 0.28), mat(0xe0383e), -0.6, 0.0225, -0.3, { rot: [0, 0.3, 0] });
  put(new THREE.BoxGeometry(0.14, 0.003, 0.1), mat(0xffd23f), -0.6, 0.047, -0.3, { rot: [0, 0.3, 0] });
  // 쿠키 접시
  put(cyl(0.1, 0.1, 0.012, 24), mat(0xffffff), -0.28, 0.006, -0.32);
  [[-0.04, 0, -0.03], [0.045, 0, -0.02], [0, 0, 0.045], [0.0, 0.014, 0.0]].forEach(([dx, y, dz], i) =>
    put(cyl(0.035, 0.035, 0.013, 16), mat(i % 2 ? 0xb97834 : 0xa8692f), -0.28 + dx, 0.0135 + y, -0.32 + dz));
  // 도넛 두 개
  put(new THREE.TorusGeometry(0.045, 0.021, 10, 20), mat(0xff9ec7), 0.0, 0.025, -0.34, { rot: [Math.PI / 2, 0, 0] });
  put(new THREE.TorusGeometry(0.045, 0.021, 10, 20), mat(0x6b3a22), 0.02, 0.048, -0.34, { rot: [Math.PI / 2, 0, 0] });
  // 사탕·젤리 그릇
  put(new THREE.SphereGeometry(0.085, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0xffffff), 0.3, 0.085, -0.32);
  const cand = [0xff5c7a, 0xffd23f, 0x5ad2a0, 0x6aa8ff, 0xc08bff, 0xff9b4a];
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4, r = 0.012 + (i % 4) * 0.016;
    put(new THREE.SphereGeometry(0.018, 8, 6), mat(cand[i % cand.length]), 0.3 + Math.cos(a) * r, 0.045 + (i % 3) * 0.01, -0.32 + Math.sin(a) * r);
  }
  // 초콜릿 바 + 초코파이 상자
  [0, 1, 2].forEach((i) => put(new THREE.BoxGeometry(0.1, 0.012, 0.04), mat(i % 2 ? 0x5a2e1b : 0x7a4026), 0.58, 0.006 + i * 0.013, -0.18, { rot: [0, i * 0.35, 0] }));
  put(new THREE.BoxGeometry(0.15, 0.055, 0.095), mat(0xd22f2f), 0.6, 0.0275, -0.34, { rot: [0, -0.2, 0] });
  put(new THREE.BoxGeometry(0.08, 0.057, 0.097), mat(0xffffff), 0.6, 0.0285, -0.34, { rot: [0, -0.2, 0] });
  // 마카롱 세 개
  [[0xffb3d1, 0.5], [0xa8e6cf, 0.58], [0xcdb4ff, 0.66]].forEach(([c, x], i) => {
    put(cyl(0.028, 0.028, 0.01, 14), mat(c), x - 0.02, 0.005, 0.12 + (i % 2) * 0.05);
    put(cyl(0.024, 0.024, 0.01, 14), mat(0xfff4e0), x - 0.02, 0.015, 0.12 + (i % 2) * 0.05);
    put(cyl(0.028, 0.028, 0.01, 14), mat(c), x - 0.02, 0.025, 0.12 + (i % 2) * 0.05);
  });

  // 명패 (방문자 쪽을 향함)
  const plateTex = canvasTexture(256, 64, (c, w, h) => {
    c.fillStyle = '#ffd93d'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1b1b1f'; c.font = `900 34px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('🐥 매니저 자리', w / 2, h / 2 + 2);
  });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.02),
    [mat(0xffd93d), mat(0xffd93d), mat(0xffd93d), mat(0xffd93d), new THREE.MeshBasicMaterial({ map: plateTex }), mat(0xffd93d)]);
  const [px, pz] = at(-0.05, -0.4);
  plate.position.set(px, TOP + 0.06, pz); plate.rotation.set(-0.15, side < 0 ? 0 : Math.PI, 0); plate.castShadow = true; g.add(plate);

  labelSprite('🐥 매니저 자리', { size: 0.4, y: 1.9, x: cx, z: cz, bg: '#ffd93d' });
}

function desk(cxPx, cyPx, id, tone, chairSide, laptop = false) {
  const w = 1.5, d = 0.9;
  const cx = X(cxPx), cz = Z(cyPx);
  // 상판 + 다리 패널
  wbox(cx, cz, w, d, 0.06, 0xffffff, { y0: 0.72 });
  wbox(cx - w / 2 + 0.04, cz, 0.05, d - 0.1, 0.72, 0xdcdde2);
  wbox(cx + w / 2 - 0.04, cz, 0.05, d - 0.1, 0.72, 0xdcdde2);
  colliders.push({ x1: cx - w / 2, x2: cx + w / 2, z1: cz - d / 2, z2: cz + d / 2 });
  // 좌석 번호 라벨
  const isMgr = id === 'D1';
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), new THREE.MeshBasicMaterial({ map: seatTexture(isMgr ? '🐥D1' : id, tone) }));
  tag.rotation.x = -Math.PI / 2; tag.position.set(cx - 0.55, 0.78, cz + chairSide * 0.3); scene.add(tag);
  // 모니터
  const side = chairSide;                      // +1 이면 의자가 남쪽(+z)
  if (laptop || isMgr) {
    addMacbook(cx, cz, side);                                   // A구역·D1: 열린 맥북
    if (isMgr) addManagerDesk(cx, cz, side);
  } else {
    wbox(cx + 0.1, cz - side * 0.18, 0.55, 0.32, 0.03, 0x24262c, { y0: 0.98 });
    wbox(cx + 0.1, cz - side * 0.18, 0.06, 0.06, 0.2, 0x3a3d45, { y0: 0.78 });
    wbox(cx + 0.1, cz + side * 0.12, 0.42, 0.14, 0.015, 0xf2f2f5, { y0: 0.78 });   // 키보드
  }
  // 의자
  const chz = cz + side * (d / 2 + 0.34);
  const chairC = isMgr ? 0xf5b800 : 0x34363d;     // 매니저 의자는 노란색
  wbox(cx, chz, 0.46, 0.46, 0.07, chairC, { y0: 0.42 });
  wbox(cx, chz + side * 0.2, 0.46, 0.06, 0.42, chairC, { y0: 0.5 });
  wbox(cx, chz, 0.06, 0.06, 0.4, 0x777a84, { y0: 0.02 });
  seats.push({ x: cx, z: chz - side * 0.05, face: side > 0 ? Math.PI : 0, h: 0.46, stx: cx, stz: chz + side * 0.62, name: id + ' 자리' });
}

const COLS3 = [37, 71, 105];
function block(colsPx, rowsPx, ids, tone, chairFirst, laptop = false) {
  let i = 0;
  rowsPx.forEach((ry, r) => colsPx.forEach((cx) => {
    desk(cx, ry, ids[i++], tone, r === 0 ? chairFirst[0] : chairFirst[1], laptop);
  }));
}
// 위 줄은 의자가 북쪽(-1), 아래 줄은 남쪽(+1)
block(COLS3, [186, 214], ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'], '#f8d4cb', [-1, 1], true);   // A구역만 맥북
block([82, 118], [267, 289], ['B1', 'B2', 'B3', 'B4'], '#cfeadb', [-1, 1]);
block(COLS3, [343, 369], ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'], '#dcd5f3', [-1, 1]);
block(COLS3, [421, 447], ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'], '#fbe8b5', [-1, 1]);

// ---------------- 회의실 ----------------
{
  const cx = X(286), cz = Z(130);
  wbox(cx, cz, 1.9, 5.4, 0.08, 0xf4f1ea, { y0: 0.74, collide: true });
  wbox(cx, cz, 0.36, 4.4, 0.74, 0x8c8f99);
  [-1.95, -0.65, 0.65, 1.95].forEach((dz) => {
    [-1, 1].forEach((s) => {
      wbox(cx + s * 1.3, cz + dz, 0.46, 0.46, 0.07, 0x34363d, { y0: 0.42 });
      wbox(cx + s * 1.52, cz + dz, 0.06, 0.46, 0.42, 0x34363d, { y0: 0.5 });
      seats.push({ x: cx + s * 1.3 + s * 0.05, z: cz + dz, face: -s * Math.PI / 2, h: 0.46, stx: cx + s * 2.0, stz: cz + dz, name: '회의실 의자' });
    });
  });
}

// ---------------- 휴게공간 ----------------
{
  // ㄱ자 긴 의자
  pbox(12, 82, 24, 140, 0.45, 0xffffff, { collide: true });
  pbox(12, 138, 128, 150, 0.45, 0xffffff, { collide: true });
  pbox(12, 82, 17, 140, 0.9, 0xeceef2, { collide: false });
  pbox(12, 138, 128, 143, 0.9, 0xeceef2, { collide: false });
  // 긴 의자에 앉는 자리 8개 (배치도 표기 8석): 세로 3 + 가로 5. 등받이 방향을 따라 앉는다.
  [95, 110, 125].forEach((py) => seats.push({ x: X(20.5), z: Z(py), face: Math.PI / 2, h: 0.46, stx: X(20.5) + 1.4, stz: Z(py), name: '휴게공간 긴 의자' }));
  [40, 58, 76, 94, 112].forEach((px) => seats.push({ x: X(px), z: Z(144.5), face: 0, h: 0.46, stx: X(px), stz: Z(138) - 0.5, name: '휴게공간 긴 의자' }));
  // 테이블
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 28), mat(0xd9b88a));
  tb.position.set(X(65), 0.45, Z(112)); tb.castShadow = true; scene.add(tb);
  const tl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 12), mat(0x8c8f99));
  tl.position.set(X(65), 0.22, Z(112)); scene.add(tl);
  colliders.push({ x1: X(65) - 0.55, x2: X(65) + 0.55, z1: Z(112) - 0.55, z2: Z(112) + 0.55 });

  // 창가 바 카운터 + 높은 의자 (앉아서 바깥 보기) — 북쪽 창을 바라봄
  {
    const bz = Z(83), bx0 = X(78), bx1 = X(142);
    wbox((bx0 + bx1) / 2, bz, bx1 - bx0, 0.62, 0.07, 0xc99a63, { y0: 0.98, collide: true });
    wbox((bx0 + bx1) / 2, bz, bx1 - bx0 - 0.2, 0.5, 0.98, 0x8c6a45);
    [88, 108, 128].forEach((px) => {
      const sx = X(px), sz = Z(95);
      const seatM = mat(0xf2f3f6);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.07, 18), seatM); top.position.set(sx, 0.68, sz); top.castShadow = true; scene.add(top);
      const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.66, 8), mat(0x777a84)); lg.position.set(sx, 0.33, sz); scene.add(lg);
      const ft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 16), mat(0x777a84)); ft.position.set(sx, 0.02, sz); scene.add(ft);
      seats.push({ x: sx, z: sz, face: Math.PI, h: 0.7, stx: sx, stz: sz + 0.85, name: '창가 바 자리', view: true });
    });
    labelSprite('창가 자리 · 앉아서 바깥 보기', { size: 0.3, y: 1.7, x: (bx0 + bx1) / 2, z: Z(86), bg: '#d5ecd6' });
  }
  // 창가 라운지 의자 2개 (북쪽 창 바라봄)
  [32, 54].forEach((px) => {
    const sx = X(px), sz = Z(98);
    wbox(sx, sz, 0.8, 0.8, 0.3, 0xf2c94c, { y0: 0.15 });                // 방석
    wbox(sx, sz + 0.36, 0.8, 0.12, 0.55, 0xe5b72f, { y0: 0.4 });        // 등받이 (실내 쪽, 앉으면 창을 봄)
    wbox(sx - 0.4, sz, 0.1, 0.8, 0.28, 0xe5b72f, { y0: 0.4 });
    wbox(sx + 0.4, sz, 0.1, 0.8, 0.28, 0xe5b72f, { y0: 0.4 });
    seats.push({ x: sx, z: sz - 0.02, face: Math.PI, h: 0.46, stx: sx, stz: sz + 0.9, name: '창가 라운지 의자', view: true });
  });

  // 테이블 위: bhc 뿌링클 치킨 한 판
  const food = new THREE.Group();
  food.position.set(X(65), 0.48, Z(112));
  const add = (geo, color, x, y, z, opts = {}) => {
    const m = new THREE.Mesh(geo, mat(color, opts.mat || {}));
    m.position.set(x, y, z); if (opts.scale) m.scale.set(...opts.scale); if (opts.rot) m.rotation.set(...opts.rot);
    m.castShadow = true; food.add(m); return m;
  };
  add(new THREE.BoxGeometry(0.46, 0.05, 0.34), 0xd7352b, 0, 0.025, 0);                 // 빨간 포장 트레이
  add(new THREE.BoxGeometry(0.42, 0.01, 0.30), 0xfff3d6, 0, 0.055, 0);                 // 흰 종이
  const golden = [0xd98a2b, 0xcf7a22, 0xe39a3a, 0xc96f1f];
  [[-0.12, 0.0, -0.05, 0.1], [0.0, 0.0, -0.07, 0.11], [0.12, 0.0, -0.04, 0.1], [-0.06, 0.0, 0.07, 0.1],
   [0.07, 0.0, 0.07, 0.105], [-0.15, 0.0, 0.06, 0.085], [0.0, 0.085, 0.0, 0.1], [-0.05, 0.075, -0.05, 0.085]]
    .forEach(([x, y, z, r], i) => add(new THREE.IcosahedronGeometry(r, 1), golden[i % 4], x, 0.12 + y, z,
      { scale: [1.15, 0.8, 1.3], rot: [0, i * 1.3, 0], mat: { flatShading: true, roughness: 0.75 } }));
  // 뼈 달린 닭다리
  [[0.17, 0.085, 0.0, 0.5], [-0.2, 0.085, -0.06, -0.4]].forEach(([x, y, z, rz]) => {
    add(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 8), 0xfff6e6, x + 0.08 * Math.sign(x), 0.1 + y * 0.2, z, { rot: [0, 0, Math.PI / 2 + rz * 0.3] });
  });
  // 뿌링클 시즈닝 (노란 치즈 가루)
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, rr = Math.random() * 0.17;
    add(new THREE.SphereGeometry(0.012 + Math.random() * 0.008, 6, 5), i % 3 ? 0xffd34d : 0xffe9a0,
      Math.cos(a) * rr * 1.2, 0.17 + Math.random() * 0.06 - rr * 0.1, Math.sin(a) * rr * 0.9);
  }
  // 소스 · 치킨무 · 콜라
  add(new THREE.CylinderGeometry(0.04, 0.032, 0.04, 14), 0xfff1c9, 0.32, 0.02, 0.14);          // 소스 컵
  add(new THREE.CylinderGeometry(0.05, 0.04, 0.05, 14), 0xffffff, -0.32, 0.025, 0.14);         // 치킨무 컵
  add(new THREE.CylinderGeometry(0.043, 0.043, 0.012, 14), 0xf3f0c8, -0.32, 0.051, 0.14);
  add(new THREE.CylinderGeometry(0.042, 0.034, 0.15, 14), 0xe03a3a, 0.28, 0.075, -0.2);        // 콜라 컵
  add(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 14), 0xffffff, 0.28, 0.156, -0.2);
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6), 0xffffff, 0.285, 0.21, -0.2);
  scene.add(food);
  labelSprite('bhc 뿌링클 치킨', { size: 0.34, y: 1.25, x: X(65), z: Z(112), bg: '#ffd23f' });
}

// ---------------- 탕비 구역 ----------------
{
  // 카운터 + 가전 (배치도 상 x 208~230, y 320~397)
  const ax = X(235) - 0.18 - 0.42;                                           // 벽에 붙임
  wbox(ax, Z(332.5), 0.8, 1.0, 0.9, 0xf0f0f3, { collide: true });            // 전자레인지 카운터
  wbox(ax, Z(332.5), 0.5, 0.6, 0.3, 0x1f2126, { y0: 0.9 });                  // 전자레인지
  wbox(ax, Z(358.5), 0.6, 0.6, 1.1, 0xe3f2fc, { collide: true });            // 얼음정수기
  wbox(ax + 0.31, Z(358.5), 0.02, 0.3, 0.2, 0x6cc0f5, { y0: 0.7, cast: false });
  wbox(ax, Z(384.5), 0.8, 0.8, 1.75, 0xdfe2e8, { collide: true });           // 냉장고
  labelSprite('전자레인지', { size: 0.3, y: 1.55, x: ax, z: Z(332.5), bg: '#ffffff' });
  labelSprite('얼음정수기', { size: 0.3, y: 1.7, x: ax, z: Z(358.5), bg: '#e3f2fc' });
  labelSprite('냉장고', { size: 0.3, y: 2.25, x: ax, z: Z(384.5), bg: '#ffffff' });
}

// ---------------- 화분 ----------------
function plant(px, py, s = 1) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.15 * s, 0.32 * s, 14), mat(0xd9b38c));
  pot.position.set(X(px), 0.16 * s, Z(py)); pot.castShadow = true; scene.add(pot);
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.2 * s, 12, 10), mat(i % 2 ? 0x5db37e : 0x72c48f));
    leaf.position.set(X(px) + (i - 1) * 0.12 * s, 0.5 * s + i * 0.08 * s, Z(py) + (i % 2 ? 0.05 : -0.05));
    leaf.castShadow = true; scene.add(leaf);
  }
  colliders.push({ x1: X(px) - 0.2 * s, x2: X(px) + 0.2 * s, z1: Z(py) - 0.2 * s, z2: Z(py) + 0.2 * s });
}
// (미니 화분은 사용자 요청으로 제거)

if (F3) stripSince(mark4a);                          // ← 4층 내부 끝

// ---------------- 바깥 풍경: 실제 주변 (네이버 로드뷰 참고) ----------------
// 4층 바닥(y=0) 아래로 1~3층이 있고 지면은 3개 층(약 10m) 아래. 1층에 앤드위치 매장.
// 3층 모드에서는 내가 서 있는 층이 y=0 이라 지면은 2개 층 아래.
// 방향은 임의 가정: 동쪽 = 큰길(1층 매장), 서쪽 = 좁은 골목(전봇대·전선).
const FLOOR_H = 3.4, NF = F3 ? 2 : 3, GY = -NF * FLOOR_H;
{
  const SKY = 0xcfe0ee;
  scene.background = new THREE.Color(SKY);
  scene.fog.color.set(SKY); scene.fog.near = 70; scene.fog.far = 240;

  // 지면: 아스팔트
  ground.position.y = GY - 0.02;
  ground.material = mat(0x575b62, { roughness: 1 });

  const BXw = X(F3 ? 348 : 338) + 0.23, BZw = Z(F3 ? 558 : 520) + 0.23;   // 건물 반폭 (벽 바깥면)

  // ── 외벽 한 칸(창 1개 × 1개 층) 무늬
  function cellTex(kind, len, floors) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    if (kind === 'glass') {
      const gr = g.createLinearGradient(0, 0, 128, 128); gr.addColorStop(0, '#80aad0'); gr.addColorStop(1, '#4b75a2');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(0, 128); g.lineTo(60, 0); g.lineTo(92, 0); g.lineTo(32, 128); g.fill();
      g.fillStyle = 'rgba(28,42,60,.88)'; g.fillRect(0, 98, 128, 30);                 // 층 사이 띠
      g.strokeStyle = '#26384c'; g.lineWidth = 5; g.strokeRect(2, 2, 124, 124);
      g.fillStyle = '#26384c'; g.fillRect(62, 0, 4, 98);
    } else if (kind === 'beige') {
      g.fillStyle = '#d9cfbb'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${120 + Math.random() * 60 | 0},${110 + Math.random() * 50 | 0},${90 + Math.random() * 40 | 0},.13)`; g.fillRect(Math.random() * 128, Math.random() * 128, 3, 3); }
      g.fillStyle = '#2f3a46'; g.fillRect(14, 28, 100, 56);
      g.fillStyle = '#8fb0c8'; g.fillRect(17, 31, 28, 50); g.fillRect(49, 31, 28, 50); g.fillRect(81, 31, 30, 50);
      g.strokeStyle = '#ece6d8'; g.lineWidth = 3; g.strokeRect(12, 26, 104, 60);
    } else if (kind === 'brick') {
      g.fillStyle = '#b98467'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(80,40,25,.25)'; g.lineWidth = 1;
      for (let y = 0; y < 128; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
      g.fillStyle = '#2b3642'; g.fillRect(26, 34, 76, 48); g.fillStyle = '#7ea3bd'; g.fillRect(29, 37, 34, 42); g.fillRect(66, 37, 33, 42);
    } else if (kind === 'ribbon') {                       // 흰 타일 + 가로 띠창 (길 건너 KB 건물)
      g.fillStyle = '#e6e7e4'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(120,120,115,.35)'; g.lineWidth = 1;
      for (let x = 0; x <= 128; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
      g.fillStyle = '#26303a'; g.fillRect(0, 34, 128, 52);
      g.fillStyle = '#4d6a82'; for (let x = 2; x < 128; x += 32) g.fillRect(x, 37, 28, 46);
      g.fillStyle = '#cfd1cd'; g.fillRect(0, 86, 128, 8);
    } else if (kind === 'sabin') {                        // 베이지 + 회색 세로 기둥 (SABIN KNIT 건물)
      g.fillStyle = '#ddd3bf'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(${130 + Math.random() * 50 | 0},${120 + Math.random() * 40 | 0},${100 + Math.random() * 30 | 0},.12)`; g.fillRect(Math.random() * 128, Math.random() * 128, 3, 3); }
      g.fillStyle = '#7b7d86'; g.fillRect(0, 0, 14, 128);
      g.fillStyle = '#2b333d'; g.fillRect(30, 26, 28, 70); g.fillRect(72, 26, 28, 70);
      g.fillStyle = '#7f9db4'; g.fillRect(33, 29, 22, 64); g.fillRect(75, 29, 22, 64);
      g.fillStyle = '#c9c0ac'; g.fillRect(0, 100, 128, 6);
    } else {                                              // gray
      g.fillStyle = '#cfd0d3'; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#3a4756'; g.fillRect(20, 36, 88, 44); g.fillStyle = '#8aa6bb'; g.fillRect(23, 39, 38, 38); g.fillRect(65, 39, 40, 38);
      g.fillStyle = '#b9bbbf'; g.fillRect(0, 100, 128, 10);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(len / 3.2, floors);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  // ── 이웃 건물 (카메라를 가리면 투명해진다)
  function tower(cx, cz, w, d, floors, kind) {
    const h = floors * FLOOR_H;
    const side = (len) => new THREE.MeshStandardMaterial({ map: cellTex(kind, len, floors), roughness: 0.9, transparent: true });
    const roof = new THREE.MeshStandardMaterial({ color: 0xb8bbbf, roughness: 1, transparent: true });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side(d), side(d), roof, roof, side(w), side(w)]);
    m.position.set(cx, GY + h / 2, cz);
    scene.add(m); fadeWalls.push(m);
    return m;
  }
  // 서쪽 골목(폭 6m) 건너 — 베이지 돌타일 중고층
  tower(-(BXw + 38 + 9), 0, 18, 34, 5, 'beige');
  tower(-(BXw + 38 + 7), -34, 14, 22, 3, 'gray');
  tower(-(BXw + 38 + 7), 34, 14, 22, 4, 'brick');
  // 북쪽 — 파란 유리 빌딩 + 벽돌 저층
  tower(-6, -(BZw + 38 + 8), 24, 16, 5, 'glass');
  tower(30, -(BZw + 38 + 7), 16, 14, 3, 'brick');
  // 남쪽 — 우리 건물에 바로 붙은 SABIN KNIT 베이지 건물 (로드뷰 확인)
  const SBZ = BZw + 0.3 + 7;
  tower(BXw - 7, SBZ, 14, 14, 10, 'sabin');
  tower(-6, BZw + 0.3 + 14 + 6, 22, 12, 6, 'gray');
  {
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(12, FLOOR_H), new THREE.MeshStandardMaterial({ map: canvasTexture(768, 218, (g, w, h) => {
      g.fillStyle = '#d9cfbb'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#23282f'; g.fillRect(30, 70, 330, 140); g.fillRect(400, 70, 340, 140);
      g.fillStyle = '#15181c'; g.fillRect(0, 0, w, 56);
      g.fillStyle = '#f2efe8'; g.font = `italic 700 34px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('SABIN KNIT', w / 2, 30);
    }), roughness: 0.8 }));
    sg.rotation.y = Math.PI / 2; sg.position.set(BXw + 0.05, GY + FLOOR_H / 2, SBZ); scene.add(sg);
  }
  // 동쪽 큰길(퇴계로 6차선, 중앙 노란 울타리) 건너편 — KB국민은행 흰 타일 8층 + 파란 유리 고층
  const ROAD_W = 22;
  const EX = BXw + 3 + ROAD_W + 3;
  tower(EX + 9, 0, 18, 38, 8, 'ribbon');
  {
    const base = new THREE.Mesh(new THREE.BoxGeometry(18.4, FLOOR_H, 38.4), mat(0xa3a098));
    base.position.set(EX + 9, GY + FLOOR_H / 2, 0); scene.add(base);
    const kb = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.2), new THREE.MeshBasicMaterial({ map: canvasTexture(512, 68, (g, w, h) => {
      g.fillStyle = '#ffbf1f'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#4a3b00'; g.font = `800 38px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('KB국민은행', w / 2, h / 2 + 2);
    }) }));
    kb.rotation.y = -Math.PI / 2; kb.position.set(EX - 0.25, GY + 2.9, 0); scene.add(kb);
  }
  tower(EX + 9, -34, 16, 22, 14, 'glass');
  tower(EX + 7, 34, 14, 26, 6, 'beige');
  // 멀리 스카이라인 (안개에 묻힘)
  for (let i = 0; i < 22; i++) {
    const a = i / 22 * Math.PI * 2, r = 140 + (i % 5) * 10;
    const h = 14 + ((i * 37) % 26);
    const b = new THREE.Mesh(new THREE.BoxGeometry(14 + (i % 3) * 5, h, 14 + (i % 4) * 4), new THREE.MeshStandardMaterial({ color: 0xaeb9c6, roughness: 1 }));
    b.position.set(Math.cos(a) * r, GY + h / 2, Math.sin(a) * r); scene.add(b);
  }

  // ── 우리 건물 1~3층: 파란 유리 커튼월
  {
    const fh = -GY;                                       // 지면~4층 바닥
    const side = (len) => new THREE.MeshStandardMaterial({ map: cellTex('glass', len, NF), roughness: 0.35, metalness: 0.15 });
    const roof = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 1 });
    if (!F3) roof.visible = false;                        // 4층: 바닥 구멍(계단)으로 아래를 볼 수 있게 몸체 윗면을 숨긴다(4층 바닥이 덮고 있어 다른 곳엔 영향 없음)
    const body = new THREE.Mesh(new THREE.BoxGeometry(BXw * 2, fh, BZw * 2), [side(BZw * 2), side(BZw * 2), roof, roof, side(BXw * 2), side(BXw * 2)]);
    body.position.set(0, GY + fh / 2 - 0.02, 0); body.receiveShadow = true; scene.add(body);
  }

  // ── 1층 앤드위치 매장 (동쪽 큰길 쪽, 사진 참고: 크림색 차양 + andwich 간판 + 큰 유리창)
  {
    const SZ = F3 ? 0 : 6, SW = 12;                       // 매장 중심 z, 폭 (3층은 건물이 작아 중앙으로)
    const tex = canvasTexture(960, 272, (g, w, h) => {
      g.fillStyle = '#e9d9b3'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f6efdc'; g.fillRect(0, 0, w, 78);                       // 간판 띠
      g.fillStyle = '#1b1b1f'; g.font = `800 52px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('andwich', w / 2, 42);
      [[40, 300], [350, 610], [660, 920]].forEach(([a, b]) => {
        const gr = g.createLinearGradient(0, 100, 0, 262); gr.addColorStop(0, '#5a7a78'); gr.addColorStop(1, '#2c4444');
        g.fillStyle = gr; g.fillRect(a, 100, b - a, 162);
        g.strokeStyle = '#1c1c1c'; g.lineWidth = 8; g.strokeRect(a, 100, b - a, 162);
        g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(a + 14, 112, (b - a) / 2 - 20, 40);
      });
    });
    // ── 가게 안쪽 벽(건물 벽면): 선반·메뉴판이 있는 따뜻한 실내
    const BAY = 1.4;                                      // 인도 쪽으로 튀어나온 가게 깊이
    const back = new THREE.Mesh(new THREE.PlaneGeometry(SW, FLOOR_H), new THREE.MeshStandardMaterial({ map: canvasTexture(960, 272, (g, w, h) => {
      g.fillStyle = '#f1e2c2'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#8a6a43'; g.fillRect(0, h - 40, w, 40);
      [70, 120].forEach((y) => { g.fillStyle = '#a07a4c'; g.fillRect(40, y, 400, 8); g.fillRect(520, y, 400, 8); });
      for (let i = 0; i < 10; i++) { g.fillStyle = ['#d9a441', '#c8553d', '#7aa05a', '#f4efe2'][i % 4]; g.fillRect(52 + i * 38, 40, 26, 30); g.fillRect(532 + i * 38, 40, 26, 30); }
      g.fillStyle = '#1f2a26'; g.fillRect(300, 128, 360, 100);
      g.fillStyle = '#f4efe2'; g.font = `800 26px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SANDWICH · COFFEE', 480, 160);
      g.font = `600 17px ${FONT}`; g.fillText('샌드위치 · 샐러드 · 음료', 480, 200);
    }), roughness: 0.9 }));
    back.rotation.y = Math.PI / 2; back.position.set(BXw + 0.03, GY + FLOOR_H / 2, SZ); scene.add(back);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(BAY, 0.1, SW), mat(0xe9e0cc)); floor.position.set(BXw + BAY / 2, GY + 0.1, SZ); floor.receiveShadow = true; scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(BAY, 0.1, SW), mat(0xf6f1e4)); ceil.position.set(BXw + BAY / 2, GY + 2.6, SZ); scene.add(ceil);
    [-1, 1].forEach((s) => { const w = new THREE.Mesh(new THREE.BoxGeometry(BAY, 2.6, 0.1), mat(0xe8dcc0)); w.position.set(BXw + BAY / 2, GY + 1.3, SZ + s * SW / 2); scene.add(w); });
    // 카운터 + 샌드위치 진열장
    const cnt = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 5), mat(0x9b7348)); cnt.position.set(BXw + 0.55, GY + 0.6, SZ - 2.6); cnt.castShadow = true; scene.add(cnt);
    const topc = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 5.1), mat(0xe9e5dc)); topc.position.set(BXw + 0.55, GY + 1.12, SZ - 2.6); scene.add(topc);
    const dcase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 2.2), mat(0xdff1ff, { transparent: true, opacity: 0.4, roughness: 0.1 })); dcase.position.set(BXw + 0.58, GY + 1.33, SZ - 3.6); scene.add(dcase);
    for (let i = 0; i < 5; i++) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.3), mat(0xd9b06a)); sw.position.set(BXw + 0.58, GY + 1.2, SZ - 4.5 + i * 0.45); scene.add(sw);
      const fill = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.035, 0.31), mat(i % 2 ? 0x7aa05a : 0xc8553d)); fill.position.set(BXw + 0.58, GY + 1.2, SZ - 4.5 + i * 0.45); scene.add(fill);
    }
    const mach = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.5), mat(0x2a2c31)); mach.position.set(BXw + 0.45, GY + 1.37, SZ - 1.2); scene.add(mach);   // 커피머신
    // 안쪽 작은 테이블 2개
    [1.5, 4].forEach((dz) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 16), mat(0xc9a574)); t.position.set(BXw + 0.8, GY + 0.85, SZ + dz); scene.add(t);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 8), mat(0x555555)); l.position.set(BXw + 0.8, GY + 0.48, SZ + dz); scene.add(l);
    });
    // 펜던트 조명 (따뜻한 빛)
    [-4, 0, 4].forEach((dz) => {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffe2a8 })); lamp.position.set(BXw + 0.8, GY + 2.2, SZ + dz); scene.add(lamp);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 4), mat(0x222222)); cord.position.set(BXw + 0.8, GY + 2.4, SZ + dz); scene.add(cord);
    });
    const warm = new THREE.PointLight(0xffd9a0, 1.2, 9); warm.position.set(BXw + 0.8, GY + 2.0, SZ); scene.add(warm);
    // 유리 전면 (투명) + 문틀
    const glassF = new THREE.Mesh(new THREE.PlaneGeometry(SW, 2.45), new THREE.MeshStandardMaterial({ color: 0xcfe8ee, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2 }));
    glassF.rotation.y = Math.PI / 2; glassF.position.set(BXw + BAY, GY + 1.32, SZ); scene.add(glassF);
    for (let i = 0; i <= 4; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.5, 0.07), mat(0x1c1c1c)); m.position.set(BXw + BAY, GY + 1.32, SZ - SW / 2 + i * SW / 4); scene.add(m); }
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, SW), mat(0x1c1c1c)); sill.position.set(BXw + BAY, GY + 2.58, SZ); scene.add(sill);
    // 간판 (유리 위)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(SW, 0.8), new THREE.MeshBasicMaterial({ map: canvasTexture(960, 64, (g, w, h) => {
      g.fillStyle = '#f6efdc'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1b1b1f'; g.font = `800 46px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('andwich', w / 2, h / 2 + 2);
    }) }));
    sign.rotation.y = Math.PI / 2; sign.position.set(BXw + BAY + 0.02, GY + 3.0, SZ); scene.add(sign);
    // 차양
    const awn = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, SW + 0.6), mat(0xf7f0de));
    awn.position.set(BXw + BAY + 0.7, GY + 2.72, SZ); awn.rotation.z = -0.18; awn.castShadow = true; scene.add(awn);
    // 테라스 테이블·의자 (인도 위)
    [-3.6, 0, 3.6].forEach((dz) => {
      const tx = BXw + BAY + 0.9;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 16), mat(0xc9a574)); t.position.set(tx, GY + 0.75, SZ + dz); scene.add(t);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8), mat(0x555555)); l.position.set(tx, GY + 0.38, SZ + dz); scene.add(l);
      [[0, -0.5], [0, 0.5]].forEach(([ox, oz]) => {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.38), mat(0x2d2f34)); c.position.set(tx + ox, GY + 0.45, SZ + dz + oz); scene.add(c);
      });
    });
  }

  // ── 큰길 · 인도 · 차선
  const slab = (cx, cz, w, d, color, y = 0.15) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, y, d), mat(color, { roughness: 1 }));
    m.position.set(cx, GY + y / 2, cz); m.receiveShadow = true; scene.add(m);
  };
  slab(BXw + 1.5, 0, 3, 100, 0xb9b7b2);                                  // 우리 쪽 인도
  slab(BXw + 3 + ROAD_W + 1.5, 0, 3, 100, 0xb9b7b2);                    // 건너편 인도
  slab(-(BXw + 19), 0, 38, BZw * 2 + 90, 0x6d7076, 0.05);                  // 골목 포장
  const MX = BXw + 3 + ROAD_W / 2;                                       // 중앙분리선 x
  for (let z = -48; z < 48; z += 4.4) {
    [-3.7, -7.4, 3.7, 7.4].forEach((ox) => {                             // 흰 점선 차선
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 2.2), mat(0xe9e9e6, { roughness: 1 }));
      d.position.set(MX + ox, GY + 0.02, z); scene.add(d);
    });
  }
  [-0.55, 0.55].forEach((ox) => {                                        // 노란 실선(중앙)
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 100), mat(0xe8c43a, { roughness: 1 }));
    l.position.set(MX + ox, GY + 0.02, 0); scene.add(l);
  });
  for (let z = -48; z <= 48; z += 2.2) {                                 // 노란·검정 방호 울타리 기둥
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.95, 8), mat(0x24262a)); post.position.set(MX, GY + 0.48, z); scene.add(post);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.18, 8), mat(0xf2c200)); band.position.set(MX, GY + 0.62, z); scene.add(band);
  }
  [0.55, 0.8].forEach((y) => {                                           // 울타리 줄
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 100), mat(0x8e8a2c)); rail.position.set(MX, GY + y, 0); scene.add(rail);
  });

  // ── 가로수: 소나무 (퇴계로 인도에 줄지어 서 있음)
  function streetTree(x, z) {
    const h = 4.8 + ((z * 7) % 5) * 0.12;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, h, 8), mat(0x6a4a34)); tr.position.set(x, GY + h / 2, z); tr.castShadow = true; scene.add(tr);
    [[0, 0.0, 1.5, 0.55], [0.45, 0.9, 1.15, 0.5], [-0.4, 1.7, 0.8, 0.42]].forEach(([ox, oy, r, sy]) => {
      const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(0x4f8f56, { flatShading: true }));
      cr.scale.y = sy; cr.position.set(x + ox, GY + h - 0.4 + oy * 0.7, z + ox * 0.5); cr.castShadow = true; scene.add(cr);
    });
  }
  [-15, -6, 17, 26, 35].forEach((z) => streetTree(BXw + 2.4, z));
  [-20, -4, 12, 28].forEach((z) => streetTree(BXw + 3 + ROAD_W + 0.6, z));

  // ── 트럭 (흰 탑차 / 파란 포터)
  function truck(x, z, boxColor, cabColor, flip = 1) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.1, 3.6), mat(boxColor, { roughness: 0.6 })); box.position.set(0, 1.55, -0.6 * flip); g.add(box);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.55, 1.5), mat(cabColor, { roughness: 0.5 })); cab.position.set(0, 1.1, 1.6 * flip); g.add(cab);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 0.05), mat(0x222a33, { roughness: 0.2 })); gl.position.set(0, 1.35, 2.36 * flip); g.add(gl);
    [[-0.95, -1.4], [0.95, -1.4], [-0.95, 1.5], [0.95, 1.5]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.25, 14), mat(0x15161a)); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.4, wz); g.add(w);
    });
    g.position.set(x, GY, z); g.traverse((o) => { o.castShadow = true; }); scene.add(g);
  }
  truck(MX - 5.4, -4, 0xf2f3f4, 0xf2f3f4);
  truck(MX - 1.9, 13, 0x3a3d45, 0x2f4f86);
  truck(MX + 5.4, -22, 0xf2f3f4, 0xe8eaec, -1);

  // ── 주차된 차
  function car(x, z, color) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.6), mat(color, { roughness: 0.4, metalness: 0.3 })); b.position.y = 0.62; g.add(b);
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.5), mat(color, { roughness: 0.4, metalness: 0.3 })); c.position.set(0, 1.18, -0.1); g.add(c);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.4, 2.2), mat(0x222a33, { roughness: 0.2 })); gl.position.set(0, 1.2, -0.1); g.add(gl);
    [[-0.9, -1.5], [0.9, -1.5], [-0.9, 1.5], [0.9, 1.5]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 14), mat(0x15161a)); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.34, wz); g.add(w);
    });
    g.position.set(x, GY + 0.0, z); g.traverse((o) => { o.castShadow = true; }); scene.add(g);
  }
  car(BXw + 3 + 1.3, -12, 0x15161a);
  car(BXw + 3 + 1.3, -30, 0xdadde2);
  car(BXw + 3 + 1.3, 22, 0x9aa1ab);
  car(MX + 1.9, 6, 0x203049);
  car(MX + 5.4, 30, 0x15161a);
  car(MX - 5.4, 34, 0xdadde2);
  car(-(BXw + 8), 14, 0x15161a);                                         // 골목 주차

  // ── 골목 전봇대 + 얽힌 전선
  {
    const tops = [];
    [-12, 5, 22, 38].forEach((z) => {
      const x = -(BXw + 2.2);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.19, 9.6, 8), mat(0x6c6b66)); p.position.set(x, GY + 4.8, z); p.castShadow = true; scene.add(p);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.1), mat(0x4a4a46)); arm.position.set(x, GY + 9.1, z); scene.add(arm);
      tops.push([x, z]);
    });
    const wireMat = new THREE.LineBasicMaterial({ color: 0x1e1f22 });
    for (let i = 0; i < tops.length - 1; i++) {
      [-0.8, -0.3, 0.3, 0.8].forEach((ox, k) => {
        const [x1, z1] = tops[i], [x2, z2] = tops[i + 1];
        const pts = [];
        for (let s = 0; s <= 14; s++) {
          const t = s / 14;
          pts.push(new THREE.Vector3(x1 + ox, GY + 9.1 - 4 * (0.6 + k * 0.15) * t * (1 - t), z1 + (z2 - z1) * t));
        }
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
      });
    }
  }
}

const mark4b = markScene();                          // ← 4층 라벨·로고·화살표 (3층 모드에서 제거)
// ---------------- 라벨 (공간 이름) ----------------
labelSprite('휴게공간', { y: 2.2, x: X(78), z: Z(118), bg: '#d5ecd6' });
labelSprite('A구역 · 6석', { y: 1.9, x: X(81), z: Z(200), bg: '#f6d3ca' });
labelSprite('B구역 · 4석', { y: 1.9, x: X(100), z: Z(278), bg: '#cdebdb' });
labelSprite('C구역 · 6석', { y: 1.9, x: X(81), z: Z(356), bg: '#dad3f2' });
labelSprite('D구역 · 6석', { y: 1.9, x: X(81), z: Z(434), bg: '#fae7b0' });
labelSprite('회의실', { y: 2.3, x: X(286), z: Z(125), bg: '#e3daf3' });
labelSprite('입구', { y: 1.5, x: X(258), z: Z(290), bg: '#ff6b5e', fg: '#ffffff', size: 0.45 });

// 메인 입구 위 로고 간판 — 문 윗벽(문 높이 2.3m 위)에 양쪽 면 모두 라운드비 로고
{
  const signX = X(235), signZ = Z(290);
  const LW = 2.5, LH = LW * 222 / 1311;
  wbox(signX, signZ, 0.5, 3.0, WALL_H - 2.3, 0xfbf9f4, { y0: 2.3, collide: false, material: wallMat() });   // 벽과 같은 색 (노란 판 없음)
  const logoMat = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.FrontSide });
  new THREE.TextureLoader().load('assets/logo.png', (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; logoMat.map = t; logoMat.needsUpdate = true;
  });
  const midY = 2.3 + (WALL_H - 2.3) / 2;
  [[1, Math.PI / 2], [-1, -Math.PI / 2]].forEach(([s, ry]) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(LW, LH), logoMat);
    p.position.set(signX + s * 0.255, midY, signZ); p.rotation.y = ry; scene.add(p);
  });
}
labelSprite('남자화장실', { size: 0.34, y: 2.0, x: X(226), z: Z(494), bg: '#cfe3f7' });
labelSprite('여자화장실', { size: 0.34, y: 2.0, x: X(307), z: Z(470), bg: '#f7d3de' });
labelSprite('실외기실', { size: 0.34, y: 2.0, x: X(31), z: Z(281), bg: '#d9dbe0' });

// 입구 바닥 화살표
{
  const tex = canvasTexture(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#ff6b5e';
    g.beginPath(); g.moveTo(20, h / 2); g.lineTo(100, 14); g.lineTo(100, 44); g.lineTo(236, 44); g.lineTo(236, 84); g.lineTo(100, 84); g.lineTo(100, h - 14); g.closePath(); g.fill();
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  m.rotation.x = -Math.PI / 2; m.position.set(X(262), 0.03, Z(290)); scene.add(m);
}

if (F3) stripSince(mark4b);                          // ← 4층 라벨 끝

// ============================================================
//  3층 라운지 — ?floor=3
//  사용자가 준 3층 배치도(assets/floorplan3.png, 381x584)의 픽셀 좌표를 그대로 쓴다.
//  K=0.05(1px≈0.05m)는 문 폭(≈35px=1.8m)·책상(≈51x13px)으로 역산한 값 — 실제 치수를 알면 맨 위 K 만 바꾼다.
//  배치도에 없는 것(창 위치, 천장, 스튜디오 문, 정수기 옆 분리수거통·소화전함 위치)은 영상(mpVn0p_Sf5I)을 보고 넣은 가정이다.
// ============================================================
const ZONES3 = [];
if (F3) {
  const T = 6;                                                   // 벽 두께(px)
  const lintel = (x1, y1, x2, y2, y0 = 2.3) => {                 // 문 위 가림벽(통과는 되고 위만 막힘)
    const m = pbox(x1, y1, x2, y2, WALL_H - y0, 0xf8f6f1, { y0, material: wallMat() }); fadeWalls.push(m); return m;
  };
  const plane = (w, h, map, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, transparent: true }));
    m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m;
  };
  const signTex = (lines, { bg = '#ffffff', fg = '#1b1b1f', w = 512, h = 256, size = 40 } = {}) => canvasTexture(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((t, i) => { g.font = `${i === 0 ? 900 : 700} ${i === 0 ? size : size * 0.62}px ${FONT}`; g.fillText(t, w / 2, h * (i + 1) / (lines.length + 1)); });
  });
  const wallCol = 0xf8f6f1;

  // ── 바닥 (배치도 색을 따른다)
  floorRect(20, 113, 348, 558, 0xe8e4db, 0.01);          // 라운지 기본
  floorRect(247, 265, 348, 420, 0xefe9de, 0.012);        // 입구 앞(층 공용부)
  floorRect(244, 114, 348, 265, 0xdbe8f5, 0.012);        // 호리존 스튜디오 (배치도 파랑)
  floorRect(273, 117, 344, 260, 0xffffff, 0.014);        // 호리존 흰 바닥
  floorRect(20, 113, 175, 189, 0xdcd5c8, 0.012);         // 창고
  floorRect(20, 269, 69, 319, 0xdfe3ea, 0.012);          // 실외기실
  floorRect(183, 507, 286, 558, 0xdde8f7, 0.012);        // 남자화장실
  floorRect(286, 447, 348, 558, 0xfde0e6, 0.012);        // 여자화장실

  // ── 외벽(창문). 실외기실 쪽·여자화장실·화장실 아래는 막힌 벽
  windowWall(20, 113, 348, 113);
  windowWall(20, 113, 20, 558, [[269, 319]]);
  windowWall(348, 113, 348, 447);
  wall(348, 447, 348, 558);
  windowWall(20, 558, 183, 558);
  wall(183, 558, 348, 558);

  // ── 입구 앞 공용부: 위(스튜디오 아래)·아래·왼쪽 벽. 입구 문은 왼쪽 벽 y 310~346 (폭 ≈1.8m)
  wall(247, 265, 348, 265);
  wall(247, 420, 348, 420);
  wall(247, 265, 247, 310);
  wall(247, 346, 247, 420);
  lintel(244, 310, 250, 346);
  {
    const LW = 2.2, LH = LW * 222 / 1311, sx = X(247), sz = Z(328);
    const lm = new THREE.MeshBasicMaterial({ transparent: true });
    new THREE.TextureLoader().load('assets/logo.png', (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; lm.map = t; lm.needsUpdate = true; });
    [[1, Math.PI / 2], [-1, -Math.PI / 2]].forEach(([s, ry]) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(LW, LH), lm); p.position.set(sx + s * (T * K / 2 + 0.005), 2.3 + (WALL_H - 2.3) / 2, sz); p.rotation.y = ry; scene.add(p);
    });
    const tex = canvasTexture(256, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.fillStyle = '#ff6b5e';
      g.beginPath(); g.moveTo(20, h / 2); g.lineTo(100, 14); g.lineTo(100, 44); g.lineTo(236, 44); g.lineTo(236, 84); g.lineTo(100, 84); g.lineTo(100, h - 14); g.closePath(); g.fill();
    });
    const a = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    a.rotation.x = -Math.PI / 2; a.position.set(X(268), 0.03, Z(328)); scene.add(a);
    labelSprite('입구', { y: 1.5, x: X(285), z: Z(328), bg: '#ff6b5e', fg: '#ffffff', size: 0.45 });
    ZONES3.push({ n: '입구', s: '라운드비 3층 라운지에 오신 걸 환영합니다 · 약 40명', r: [247, 265, 348, 420] });
  }

  // ── 창고 (x 20~175, y 113~189). 문은 동쪽 벽 y 133~168
  wall(20, 189, 175, 189);
  wall(175, 113, 175, 133);
  wall(175, 168, 175, 189);
  lintel(172, 133, 178, 168);
  [[28, 150, 1], [28, 172, 1], [40, 174, 2], [150, 178, 1]].forEach(([px, py, n]) => {      // 영상: "그냥 창고 공간"
    for (let i = 0; i < n; i++) wbox(X(px), Z(py), 0.55, 0.45, 0.4, 0xc9a574, { y0: i * 0.4, collide: i === 0 });
  });
  labelSprite('창고', { size: 0.34, y: 2.0, x: X(98), z: Z(150), bg: '#d9dbe0' });
  ZONES3.push({ n: '창고', s: '짐 보관 공간 (STORAGE)', r: [20, 113, 175, 189] });

  // ── 실외기실 (x 20~69, y 269~319). 문은 남쪽 벽 x 43~63 — 닫혀 있음
  wall(20, 269, 69, 269);
  wall(69, 269, 69, 319);
  wall(20, 319, 43, 319);
  wall(63, 319, 69, 319);
  wbox(X(53), Z(319), 20 * K, 0.1, 2.1, 0x9aa0a8, { collide: true });
  lintel(43, 316, 63, 322, 2.1);
  labelSprite('실외기실', { size: 0.34, y: 2.1, x: X(45), z: Z(294), bg: '#d9dbe0' });
  ZONES3.push({ n: '실외기실', s: '', r: [20, 269, 69, 319] });

  // ── 호리존 스튜디오 (개방형: 벽 없음). 흰 곡면 배경(cove) + 대형 조명 + 프롬프터
  {
    const r = 0.9, xw = X(341), zc = Z((117 + 260) / 2), len = (260 - 117) * K;
    const wm = new THREE.Mesh(new THREE.BoxGeometry(0.1, WALL_H, len), mat(0xffffff, { roughness: 1 }));
    wm.position.set(xw + 0.05, WALL_H / 2, zc); wm.receiveShadow = true; scene.add(wm);
    colliders.push({ x1: xw, x2: xw + 0.1, z1: zc - len / 2, z2: zc + len / 2 });
    const cove = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 28, 1, true, 0, Math.PI / 2), mat(0xffffff, { side: THREE.DoubleSide, roughness: 1 }));
    cove.rotation.x = Math.PI / 2; cove.position.set(xw - r, r, zc); cove.receiveShadow = true; scene.add(cove);
    const sx = X(261), sz = Z(228);
    const dark = mat(0x16171a);
    wbox(sx, sz, 0.6, 0.6, 0.03, 0x222222, { collide: true });
    wbox(sx, sz, 0.045, 0.045, 1.65, 0x2a2a2e);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.26, 0.42, 8), dark);
    head.rotation.z = -Math.PI / 2; head.position.set(sx, 1.75, sz); head.castShadow = true; scene.add(head);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.02, 8), new THREE.MeshBasicMaterial({ color: 0xfffbe8 }));
    face.rotation.z = -Math.PI / 2; face.position.set(sx + 0.215, 1.75, sz); scene.add(face);
    const px2 = X(262), pz2 = Z(200);                                  // 프롬프터(영상 장면)
    wbox(px2, pz2, 0.045, 0.045, 1.15, 0x2a2a2e);
    wbox(px2, pz2, 0.55, 0.55, 0.03, 0x222222);
    const pr = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.55), mat(0x101216, { roughness: 0.2, metalness: 0.3 }));
    pr.position.set(px2, 1.3, pz2); pr.rotation.z = 0.55; pr.castShadow = true; scene.add(pr);
    floorRect(244, 114, 249, 265, 0xb9bcc4, 0.016);                    // 신발 벗는 경계
    labelSprite('👟 신발 벗고 입장', { size: 0.3, y: 1.3, x: X(246), z: Z(150), bg: '#ffffff' });
    labelSprite('호리존 스튜디오', { y: 2.2, x: X(300), z: Z(190), bg: '#ffffff' });
    ZONES3.push({ n: '호리존 스튜디오', s: '개방형 · 사방이 흰색 · 대형 조명 · 제품·인물 촬영 · 신발은 벗고 입장', r: [244, 114, 348, 265] });
  }

  // ── 선반(스피커·앰프) + 전자칠판 (선반 x 26~175 y 204~214 / 칠판 y 219~231)
  {
    const wood = 0xd9b98a, sxR = X(175), sxL = sxR - 6.0, sl = sxR - sxL, scx = (sxL + sxR) / 2, scz = Z(209);   // 선반: 오른쪽 끝(배치도 x=175)에서 서쪽으로 6m
    wbox(scx, scz, sl, 10 * K, 1.1, wood, { collide: true });
    const nCub = Math.floor(sl / 1.3);
    for (let i = 0; i < nCub; i++) {                                    // 주황 조명 칸 (남쪽 면)
      wbox(sxL + (i + 0.5) * sl / nCub, scz + 5 * K + 0.005, sl / nCub - 0.14, 0.02, 0.6, 0xff9a4d, { y0: 0.25, cast: false, material: new THREE.MeshBasicMaterial({ color: 0xff9a4d }) });
    }
    wbox(X(150), scz, 0.26, 0.2, 0.34, 0x16171a, { y0: 1.1 });          // 스피커
    wbox(X(165), scz, 0.26, 0.2, 0.34, 0x16171a, { y0: 1.1 });
    wbox(X(122), scz, 0.5, 0.2, 0.1, 0x6b6f78, { y0: 1.1 });            // 앰프
    labelSprite('선반', { size: 0.3, y: 1.7, x: sxL + 0.8, z: scz, bg: '#ead9bd' });

    const bx = X(134.5), bz = Z(225), BW = 2.6, BH = 1.45, BY = 0.8;
    wbox(bx, bz, 1.9, 0.5, 0.08, 0x2b2d33, { collide: true });
    wbox(bx - 1.15, bz, 0.08, 0.08, 2.1, 0x2b2d33);
    wbox(bx + 1.15, bz, 0.08, 0.08, 2.1, 0x2b2d33);
    const dark = mat(0x14161b, { roughness: 0.3 });
    const screenTex = canvasTexture(512, 288, (g, w, h) => {
      g.fillStyle = '#15181f'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1f2937'; g.fillRect(10, 10, w - 20, h - 20);
      g.fillStyle = '#ffffff'; g.font = `900 40px ${FONT}`; g.textAlign = 'center'; g.fillText('전자칠판', w / 2, 80);
      g.font = `700 22px ${FONT}`; g.fillStyle = '#cfd8e6';
      g.fillText('판서 · 노트북 연결 · QR로 바로 공유', w / 2, 130);
      g.strokeStyle = '#ffd93d'; g.lineWidth = 5; g.beginPath(); g.moveTo(80, 200); g.bezierCurveTo(150, 150, 220, 250, 300, 190); g.stroke();
      g.strokeStyle = '#7fc4ff'; g.beginPath(); g.moveTo(300, 230); g.lineTo(430, 215); g.stroke();
    });
    const scr = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, 0.1), [dark, dark, dark, dark, new THREE.MeshBasicMaterial({ map: screenTex }), dark]);
    scr.position.set(bx, BY + BH / 2, bz + 0.18); scr.castShadow = true; scene.add(scr);
    wbox(bx, bz + 0.3, 0.9, 0.18, 0.04, 0xf2f2f5, { y0: BY - 0.04 });  // 펜 거치대
    const lx = bx - 2.6;                                                  // 노트북 놓는 자리: 칠판 왼쪽
    wbox(lx, bz, 0.9, 0.6, 0.04, 0xf4f1ea, { y0: 0.74, collide: true });
    wbox(lx, bz, 0.05, 0.05, 0.74, 0x777a84);
    addMacbook(lx, bz, 1);
    labelSprite('전자칠판 · 강의 공간', { y: 2.45, x: bx, z: Z(240), bg: '#ffffff' });
    ZONES3.push({ n: '전자칠판', s: '판서 · QR로 바로 공유 · 노트북 연결(HDMI·USB·C타입 선 구비) · 무선 연결도 가능', r: [20, 193, 205, 240] });
  }

  // ── 강의 좌석: 책상 15개(2석씩) 1~30번 + 스튜디오 앞 31·32번 = 총 32석 (배치도)
  {
    const TONE = '#e9e4d6';
    const rows = [
      { y1: 275, y2: 288, tables: [[89, 140], [140, 192]], id0: 1 },
      { y1: 315, y2: 329, tables: [[89, 140], [140, 192]], id0: 5 },
      { y1: 356, y2: 369, tables: [[38, 89], [89, 140], [140, 192]], id0: 9 },
      { y1: 396, y2: 409, tables: [[38, 89], [89, 140], [140, 192]], id0: 15 },
      { y1: 436, y2: 449, tables: [[38, 89], [89, 140], [140, 192]], id0: 21 },
      { y1: 476, y2: 489, tables: [[89, 140], [140, 192]], id0: 27 },
    ];
    rows.forEach((row) => {
      let id = row.id0;
      row.tables.forEach(([a, b]) => {
        const tx = X((a + b) / 2), w = 2.4, d = 0.65, tz = Z(row.y1) + d / 2;   // 책상은 실물 크기(2.4x0.65m) 고정 → 책상 사이·줄 사이가 넓다
        wbox(tx, tz, w, d, 0.04, 0xf1ece0, { y0: 0.72, collide: true });
        wbox(tx - w / 2 + 0.03, tz, 0.04, d - 0.1, 0.72, 0xcfcabd);
        wbox(tx + w / 2 - 0.03, tz, 0.04, d - 0.1, 0.72, 0xcfcabd);
        wbox(tx, tz - d / 2 + 0.03, w - 0.2, 0.02, 0.4, 0xe3dece, { y0: 0.3 });
        const chz = tz + d / 2 + 0.4;
        [-0.6, 0.6].forEach((dx) => {
          const cx = tx + dx;
          wbox(cx, chz, 0.46, 0.46, 0.07, 0x2a2c32, { y0: 0.42 });
          wbox(cx, chz + 0.2, 0.46, 0.06, 0.42, 0x2a2c32, { y0: 0.5 });
          wbox(cx, chz, 0.06, 0.06, 0.4, 0x777a84, { y0: 0.02 });
          const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshBasicMaterial({ map: seatTexture(String(id), TONE) }));
          tag.rotation.x = -Math.PI / 2; tag.position.set(cx, 0.768, tz + d / 2 - 0.16); scene.add(tag);
          seats.push({ x: cx, z: chz - 0.05, face: Math.PI, h: 0.46, stx: cx, stz: chz + 0.4, name: id + '번 자리' });
          id++;
        });
      });
      wbox(X(197), Z(row.y1) + 0.33, 0.5, 0.1, 0.03, 0xf5f5f5, { cast: false });                  // 멀티탭 (영상: 넉넉히 준비)
    });
    // 스튜디오 앞 31·32번 (세로 책상, 의자는 동쪽에서 서쪽을 향함)
    const dx0 = X(219.5), dz0 = Z(262.5);                               // 실물 크기 0.7x2.0m
    wbox(dx0, dz0, 0.7, 2.0, 0.04, 0xf1ece0, { y0: 0.72, collide: true });
    wbox(dx0, dz0 - 0.95, 0.6, 0.04, 0.72, 0xcfcabd); wbox(dx0, dz0 + 0.95, 0.6, 0.04, 0.72, 0xcfcabd);
    [[31, -0.55, -1], [32, 0.55, 1]].forEach(([id, oz, dz]) => {
      const cx = dx0 + 0.75, cz = dz0 + oz;
      wbox(cx, cz, 0.46, 0.46, 0.07, 0x2a2c32, { y0: 0.42 });
      wbox(cx + 0.2, cz, 0.06, 0.46, 0.42, 0x2a2c32, { y0: 0.5 });
      wbox(cx, cz, 0.06, 0.06, 0.4, 0x777a84, { y0: 0.02 });
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshBasicMaterial({ map: seatTexture(String(id), TONE) }));
      tag.rotation.x = -Math.PI / 2; tag.position.set(dx0, 0.768, cz); scene.add(tag);
      seats.push({ x: cx - 0.05, z: cz, face: -Math.PI / 2, h: 0.46, stx: cx, stz: cz + dz * 0.9, name: id + '번 자리' });
    });
    labelSprite('강의 좌석 · 총 32석', { y: 1.8, x: X(115), z: Z(345), bg: '#e9e4d6' });
    labelSprite('스튜디오 앞 · 31·32', { size: 0.3, y: 1.5, x: X(219), z: Z(300), bg: '#dbe8f5' });
    ZONES3.push({ n: '스튜디오 앞 좌석', s: '31·32번 · 호리존 스튜디오 바로 앞', r: [205, 240, 247, 290] });
    ZONES3.push({ n: '강의 좌석', s: '좌석 총 32석 (책상 30 + 스튜디오 앞 2) · 멀티탭 넉넉 · 이용 1시간 50,000원(부가세 별도)', r: [20, 189, 205, 505] });
  }

  // ── 얼음 정수기 카운터 (x 219~240, y 367~446) + 분리배출 + 소화전함
  {
    const ix0 = X(229.5), iz0 = Z(406.5);                                                         // 카운터는 실물 크기 0.7x2.6m
    wbox(ix0, iz0, 0.7, 2.6, 0.9, 0xd8b98a, { collide: true });
    wbox(ix0, iz0, 0.76, 2.66, 0.04, 0xf1e7d3, { y0: 0.9 });
    wbox(ix0, iz0 + 0.7, 0.4, 0.45, 0.55, 0xf3f5f8, { y0: 0.94 });                               // 얼음 정수기
    wbox(ix0 - 0.205, iz0 + 0.7, 0.02, 0.28, 0.07, 0x58a6ff, { y0: 1.3, material: new THREE.MeshBasicMaterial({ color: 0x58a6ff }) });
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.1, 12), mat(0xffffff)); c.position.set(ix0, 0.99, iz0 - 0.5 + i * 0.1); scene.add(c); }
    wbox(ix0 - 0.3, iz0 + 2.0, 0.5, 0.5, 0.7, 0x24262c, { collide: true });                       // 일반 쓰레기
    wbox(ix0 + 0.35, iz0 + 2.0, 0.5, 0.5, 0.7, 0x2f6fd3, { collide: true });                    // 재활용
    wbox(X(244.5), Z(400), 0.4, 0.9, 1.6, 0xbfc3c8, { y0: 0.2 });                                // 소화전함 (영상)
    wbox(X(244.5) - 0.21, Z(400), 0.02, 0.12, 0.12, 0xd8232a, { y0: 1.45, material: new THREE.MeshBasicMaterial({ color: 0xd8232a }) });
    plane(0.5, 0.7, signTex(['한 번 더', '체크하기!'], { bg: '#fffdf2', size: 46, w: 256, h: 360 }), X(244.5) - 0.215, 1.0, Z(400) + 0.2, -Math.PI / 2);
    labelSprite('얼음 정수기 · 분리배출', { size: 0.34, y: 1.9, x: X(229), z: Z(380), bg: '#cfe3f7' });
    ZONES3.push({ n: '얼음 정수기', s: '얼음 정수기(온수도 제공) · 일반 쓰레기/재활용 분리배출 · 안내문', r: [205, 360, 247, 475] });
  }

  // ── 4층으로 올라가는 계단 (입구 앞 공용부 동쪽, x 300~340 / y 322~408). 17단 × 0.2m = 3.4m.
  //    계단 덩어리가 시야를 가리면 벽처럼 투명해진다. 시작부(y 316~334)에 들어서면 걸어 올라가 4층으로 이동.
  {
    const sx = X(320), w = 2.2, z0 = Z(322), run = 0.254, N = 17;     // 폭 2.2m(고정), 길이 N*run=4.3m
    for (let i = 0; i < N; i++) {
      const top = 0.2 * (i + 1);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, top, run), new THREE.MeshStandardMaterial({ color: 0xe8e2d3, roughness: 0.9, transparent: true }));
      m.position.set(sx, top / 2, z0 + run * (i + 0.5)); m.castShadow = true; m.receiveShadow = true; scene.add(m); fadeWalls.push(m);
    }
    colliders.push({ x1: sx - w / 2 - 0.02, x2: sx + w / 2 + 0.02, z1: Z(338), z2: z0 + N * run + 0.2 });   // 옆으로 계단 덩어리에 파고들지 못하게
    labelSprite('↑ 4층 공유오피스', { size: 0.4, y: 2.0, x: sx, z: Z(310), bg: '#ffd93d' });
    const tex = canvasTexture(256, 128, (g, tw, th) => {
      g.clearRect(0, 0, tw, th); g.fillStyle = '#ff6b5e';
      g.beginPath(); g.moveTo(tw / 2, 8); g.lineTo(tw / 2 + 44, th / 2 + 2); g.lineTo(tw / 2 + 16, th / 2 + 2); g.lineTo(tw / 2 + 16, th - 6); g.lineTo(tw / 2 - 16, th - 6); g.lineTo(tw / 2 - 16, th / 2 + 2); g.lineTo(tw / 2 - 44, th / 2 + 2); g.closePath(); g.fill();
    });
    const ar = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    ar.rotation.x = -Math.PI / 2; ar.position.set(sx, 0.03, Z(305)); scene.add(ar);
    ZONES3.unshift({ n: '계단', s: '걸어 올라가면 4층 공유오피스로 이동합니다', r: [300, 298, 342, 412] });
  }

  // ── 화장실. 남자: x 183~286 y 507~558 (북쪽 문 x 191~214). 여자: x 286~348 y 447~558 (서쪽 문 y 455~478)
  wall(183, 507, 191, 507);
  wall(214, 507, 286, 507);
  wall(183, 507, 183, 558);
  lintel(191, 504, 214, 510);
  wall(286, 447, 348, 447);
  wall(286, 447, 286, 455);
  wall(286, 478, 286, 558);
  lintel(283, 455, 289, 478);
  labelSprite('남자화장실', { size: 0.34, y: 2.0, x: X(202), z: Z(497), bg: '#cfe3f7' });
  labelSprite('여자화장실', { size: 0.34, y: 2.0, x: X(300), z: Z(467), bg: '#f7d3de' });
  ZONES3.push({ n: '남자화장실', s: '', r: [183, 507, 286, 558] });
  ZONES3.push({ n: '여자화장실', s: '', r: [286, 447, 348, 558] });
}

// ============================================================
//  병아리 매니저 캐릭터
// ============================================================
function makeChick() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);

  const yellow = mat(0xffe06e, { roughness: 0.95 });
  const wingYellow = mat(0xf7c94f, { roughness: 0.95 });
  const orange = mat(0xff9150, { roughness: 0.8 });
  const dark = mat(0x1b1612, { roughness: 0.25 });
  const frame = mat(0x2a1e12, { roughness: 0.5 });
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x7b5326, side: THREE.BackSide });

  // 만화 같은 갈색 외곽선 (뒤집은 껍질)
  const outlined = (parent, mesh, k = 1.05) => {
    parent.add(mesh);
    const o = new THREE.Mesh(mesh.geometry, outlineMat);
    o.position.copy(mesh.position); o.rotation.copy(mesh.rotation); o.scale.copy(mesh.scale).multiplyScalar(k);
    parent.add(o);
    return mesh;
  };

  // 통통한 달걀형 몸 (머리+몸이 하나로)
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 36, 26), yellow);
  torso.scale.set(1.06, 0.98, 1.0); torso.position.y = 0.58; torso.castShadow = true;
  outlined(body, torso, 1.035);

  // 머리 위 짧은 깃털 두 가닥
  [[-0.06, 0.32, 0.12], [0.07, -0.3, 0.1]].forEach(([x, rz, h]) => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13 + h, 10), yellow);
    f.position.set(x, 1.1, 0.0); f.rotation.z = rz;
    outlined(body, f, 1.18);
  });

  // 큰 반짝 눈 + 얇은 둥근 안경
  [-1, 1].forEach((s) => {
    const x = s * 0.185;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 16), dark);
    eye.scale.set(1, 1.2, 0.6); eye.position.set(x, 0.62, 0.45); eye.rotation.y = s * 0.3; body.add(eye);
    const h1 = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mat(0xffffff, { roughness: 0.2 }));
    h1.position.set(x - 0.022, 0.655, 0.482); body.add(h1);
    const h2 = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), mat(0xffffff, { roughness: 0.2 }));
    h2.position.set(x + 0.025, 0.59, 0.482); body.add(h2);
    // 안경테: 얼굴 곡면을 따라 살짝 바깥으로 기울여 몸 안에 파묻히지 않게
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 8, 36), frame);
    ring.position.set(x * 1.12, 0.62, 0.478); ring.rotation.y = s * 0.42; body.add(ring);
    // 볼터치
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), mat(0xff9fa0, { roughness: 1 }));
    cheek.scale.set(1.15, 0.7, 0.3); cheek.position.set(s * 0.335, 0.49, 0.345); cheek.rotation.y = s * 0.75;
    body.add(cheek);
  });
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 6), frame);
  bridge.rotation.z = Math.PI / 2; bridge.position.set(0, 0.635, 0.44); body.add(bridge);

  // 작고 납작한 부리 (길게 튀어나오지 않게 — 피노키오 방지)
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.078, 0.055, 4), orange);
  beak.rotation.x = Math.PI / 2; beak.rotation.y = Math.PI / 4; beak.scale.set(1.25, 1, 0.6);
  beak.position.set(0, 0.535, 0.5); outlined(body, beak, 1.12);

  // 통통한 날개
  [-1, 1].forEach((s) => {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), wingYellow);
    w.scale.set(0.5, 0.95, 0.75); w.position.set(s * 0.52, 0.5, 0.02); w.rotation.z = s * -0.45; w.castShadow = true;
    w.name = s < 0 ? 'wingL' : 'wingR';
    outlined(body, w, 1.08);
  });

  // 뒤쪽 꼬리 깃
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 8), yellow);
  tail.position.set(0, 0.45, -0.5); tail.rotation.x = -Math.PI / 2 + 0.4;
  outlined(body, tail, 1.15);

  // 칼라 + 넥타이 + 사원증
  [-1, 1].forEach((s) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.025, 0.09), mat(0xffffff));
    c.position.set(s * 0.065, 0.345, 0.43); c.rotation.set(0.5, 0, s * 0.35); body.add(c);
  });
  const tie = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.17, 0.02), mat(0x2f52d9));
  tie.position.set(0, 0.255, 0.445); tie.rotation.x = -0.4; body.add(tie);
  const knot = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, 0.028), mat(0x2f52d9));
  knot.position.set(0, 0.33, 0.45); body.add(knot);
  const badgeTex = canvasTexture(128, 96, (gx, w, h) => {
    gx.fillStyle = '#1b1b1f'; gx.fillRect(0, 0, w, h);
    gx.fillStyle = '#ffffff'; gx.fillRect(6, 22, w - 12, h - 28);
    gx.fillStyle = '#111'; gx.font = '900 44px sans-serif'; gx.textAlign = 'center'; gx.textBaseline = 'middle';
    gx.fillText('MGR', w / 2, h / 2 + 8);
  });
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.12), new THREE.MeshBasicMaterial({ map: badgeTex }));
  badge.position.set(0.2, 0.22, 0.4); badge.rotation.y = 0.5; body.add(badge);

  // 오렌지 발
  [-0.15, 0.15].forEach((x, i) => {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), orange);
    foot.scale.set(1.05, 0.45, 1.45); foot.position.set(x, 0.05, 0.1); foot.castShadow = true;
    foot.name = i === 0 ? 'footL' : 'footR';
    outlined(g, foot, 1.1);
  });
  g.userData.body = body;
  g.scale.setScalar(1.3);
  scene.add(g);
  return g;
}

const chick = makeChick();

// ============================================================
//  입력
// ============================================================
const keys = {};
addEventListener('keydown', (e) => { keys[e.code] = true; });
addEventListener('keyup', (e) => { keys[e.code] = false; });
const joy = { x: 0, y: 0 };

let yaw = F3 ? Math.PI / 2 : 0; // (3층: 동쪽 입구에서 서쪽 강의실을 바라봄) 카메라가 로비 안쪽(남쪽)에서 북쪽을 바라봄 → 벽에 안 가리고 문·사무실이 한눈에
let pitch = THREE.MathUtils.degToRad(56);
let dist = 12.5;

let dragging = false, lastX = 0, lastY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && e.clientX < innerWidth * 0.45) return;   // 조이스틱 영역
  dragging = true; lastX = e.clientX; lastY = e.clientY;
});
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  yaw -= (e.clientX - lastX) * 0.006;
  pitch = THREE.MathUtils.clamp(pitch + (e.clientY - lastY) * 0.004, THREE.MathUtils.degToRad(25), THREE.MathUtils.degToRad(72));
  lastX = e.clientX; lastY = e.clientY;
});
addEventListener('wheel', (e) => { dist = THREE.MathUtils.clamp(dist + e.deltaY * 0.006, 5, 26); }, { passive: true });

// 가상 조이스틱
{
  const el = document.getElementById('joy'), knob = el.querySelector('i');
  let id = null;
  const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px,${dy}px)`; };
  el.addEventListener('pointerdown', (e) => { id = e.pointerId; el.setPointerCapture(id); });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const r = el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy), max = r.width / 2 - 10;
    if (m > max) { dx = dx / m * max; dy = dy / m * max; }
    joy.x = dx / max; joy.y = -dy / max; setKnob(dx, dy);
  });
  const end = (e) => { if (e.pointerId !== id) return; id = null; joy.x = joy.y = 0; setKnob(0, 0); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}

// ============================================================
//  플레이어 이동 / 충돌
// ============================================================
const player = F3 ? { x: X(272), z: Z(296), r: 0.4, face: -Math.PI / 2 } : { x: X(305), z: Z(290), r: 0.4, face: -Math.PI / 2 };
if (params.get('from') === 'stairs') {          // 계단으로 넘어온 경우: 건너편 계단 앞에서 시작
  if (F3) { player.x = X(320); player.z = Z(296); player.face = 0; }                 // 3층: 올라가는 계단 앞(북쪽 승강장)
  else { player.x = X(319); player.z = Z(340); player.face = Math.PI; }              // 4층: 계단 복도 입구
}
const SPEED = 5.6;
let started = params.get('skip') === '1' || params.get('from') === 'stairs';   // 계단으로 넘어온 경우 인트로 없이 바로 이어서

function hits(px, pz) {
  for (const c of colliders) {
    const nx = Math.max(c.x1, Math.min(px, c.x2));
    const nz = Math.max(c.z1, Math.min(pz, c.z2));
    const dx = px - nx, dz = pz - nz;
    if (dx * dx + dz * dz < player.r * player.r) return true;
  }
  return false;
}

function teleport(px, py, yawDeg) {
  player.x = X(px); player.z = Z(py);
  if (yawDeg !== undefined) yaw = THREE.MathUtils.degToRad(yawDeg);
}
window.__tp = teleport;
window.__player = player;
window.__hits = hits;
window.__keys = keys;
if (params.get('at')) {
  const [a, b] = params.get('at').split(',').map(Number);
  teleport(a, b, params.get('yaw') !== null ? Number(params.get('yaw')) : undefined);
}
if (params.get('atm')) {                       // 미터 좌표로 이동 (시험용): ?atm=x,z
  const [a, b] = params.get('atm').split(',').map(Number);
  player.x = a; player.z = b;
  if (params.get('yaw') !== null) yaw = THREE.MathUtils.degToRad(Number(params.get('yaw')));
}
if (params.get('pitch')) pitch = THREE.MathUtils.degToRad(Number(params.get('pitch')));
if (params.get('dist')) dist = Number(params.get('dist'));

// ============================================================
//  구역 안내
// ============================================================
const zones = F3 ? ZONES3 : [
  { n: '계단 복도', s: '안쪽 계단을 걸어 내려가면 3층 라운지로 이동합니다', r: [303, 330, 338, 410] },
  { n: '입구', s: '라운드비 4층 공유오피스에 오신 걸 환영합니다', r: [235, 225, 338, 410] },
  { n: '회의실', s: '의자 8개가 놓인 회의 공간', r: [235, 75, 338, 225] },
  { n: '휴게공간', s: '라운지 · ㄱ자 긴 의자 (8석 표기)', r: [10, 75, 147, 160] },
  { n: 'A구역', s: '6석 (A1~A6)', r: [14, 160, 150, 238] },
  { n: 'B구역', s: '4석 (B1~B4)', r: [52, 240, 150, 310] },
  { n: 'C구역', s: '6석 (C1~C6)', r: [14, 318, 150, 392] },
  { n: 'D구역', s: '6석 (D1~D6)', r: [14, 398, 150, 472] },
  { n: '탕비 구역', s: '전자레인지 · 얼음정수기 · 냉장고', r: [185, 312, 236, 402] },
  { n: '실외기실', s: '', r: [10, 250, 52, 312] },
  { n: '남자화장실', s: '', r: [175, 468, 277, 520] },
  { n: '여자화장실', s: '', r: [277, 410, 338, 520] },
];
const zoneEl = document.getElementById('zone'), ztEl = document.getElementById('zt'), zsEl = document.getElementById('zs');
let curZone = null;
function updateZone() {
  const px = PX(player.x), py = PY(player.z);
  const z = zones.find((q) => px >= q.r[0] && px <= q.r[2] && py >= q.r[1] && py <= q.r[3]) || null;
  if (z === curZone) return;
  curZone = z;
  if (z) { ztEl.textContent = z.n; zsEl.textContent = z.s; zsEl.style.display = z.s ? 'block' : 'none'; zoneEl.classList.add('on'); }
  else zoneEl.classList.remove('on');
}

const dot = document.getElementById('dot');
function updateMinimap() {
  dot.style.left = (PX(player.x) / (F3 ? 381 : 371) * 100) + '%';
  dot.style.top = (PY(player.z) / (F3 ? 584 : 549) * 100) + '%';
}

// ============================================================
//  벽 투명화 (카메라 → 캐릭터 사이를 가리는 벽)
// ============================================================
const tmpBox = new THREE.Box3(), ray = new THREE.Ray(), hitPt = new THREE.Vector3();
function updateWallFade(camPos, target) {
  const dir = target.clone().sub(camPos); const len = dir.length(); dir.normalize();
  ray.set(camPos, dir);
  for (const w of fadeWalls) {
    tmpBox.setFromObject(w);
    tmpBox.expandByScalar(0.1);
    const hit = ray.intersectBox(tmpBox, hitPt);
    const blocked = hit && hitPt.distanceTo(camPos) < len;
    const to = blocked ? 0.12 : 1;
    const ms = Array.isArray(w.material) ? w.material : [w.material];
    for (const m of ms) { m.opacity += (to - m.opacity) * 0.2; m.depthWrite = m.opacity > 0.9; }
  }
}

// ============================================================
//  메인 루프
// ============================================================
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3();
let walkT = 0;
const feetL = chick.getObjectByName('footL'), feetR = chick.getObjectByName('footR');
const wingL = chick.getObjectByName('wingL'), wingR = chick.getObjectByName('wingR');

// ---- 의자에 앉기: 가까이 가서 E 키(또는 화면 버튼) → 앉기 / 이동 키 → 일어나기
let seated = null, savedCam = null;
// 자동 앉기: 의자 쪽으로 걸어가 가까워지면(1.1m 이내, 진행 방향이 의자를 향할 때) E 키 없이 바로 앉는다.
// 옆을 스쳐 지나갈 땐 반응하지 않고, 방금 일어난 의자는 1.8m 이상 벗어나야 다시 자동으로 앉는다.
let lastSeat = null, mvx = 0, mvz = 0, sitHold = false;
const AUTO_SIT_R = 1.1;
function autoSit() {
  if (lastSeat && Math.hypot(lastSeat.x - player.x, lastSeat.z - player.z) > 1.8) lastSeat = null;
  if (seated || stairAnim || !started || (!mvx && !mvz)) return;
  const hl = Math.hypot(mvx, mvz), hx = mvx / hl, hz = mvz / hl;
  let best = null, bd = AUTO_SIT_R;
  for (const s of seats) {
    if (s === lastSeat) continue;
    const dx = s.x - player.x, dz = s.z - player.z, d = Math.hypot(dx, dz);
    if (d < bd && d > 0.01 && (hx * dx + hz * dz) / d > 0.8) { bd = d; best = s; }
  }
  if (best) { sit(best); sitHold = true; }
}
const sitBtn = document.createElement('button');
sitBtn.style.cssText = 'position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:20;padding:10px 20px;border:0;border-radius:999px;background:#ffd23f;color:#1b1b1f;font:800 15px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;display:none';
document.body.appendChild(sitBtn);
function nearestSeat() {
  let best = null, bd = 1.5;
  for (const s of seats) { const d = Math.hypot(s.x - player.x, s.z - player.z); if (d < bd) { bd = d; best = s; } }
  return best;
}
const setLabels = (v) => scene.traverse((o) => { if (o.isSprite) o.visible = v; });
function sit(s) {
  seated = s; savedCam = { yaw, pitch, dist }; setLabels(false);   // 앉으면 떠 있는 이름표는 숨김
  player.x = s.x; player.z = s.z; player.face = s.face;
  yaw = s.face + Math.PI;                         // 카메라가 등 뒤에서 같은 방향을 봄
  pitch = THREE.MathUtils.degToRad(s.view ? 24 : 30); dist = s.view ? 3.4 : 6;
}
function standUp() {
  if (!seated) return;
  lastSeat = seated;
  player.x = seated.stx; player.z = seated.stz;
  if (savedCam) { yaw = savedCam.yaw; pitch = savedCam.pitch; dist = savedCam.dist; }
  seated = null; setLabels(true);
}
function toggleSit() { if (seated) standUp(); else { const s = nearestSeat(); if (s) sit(s); } }
addEventListener('keydown', (e) => { if (e.code === 'KeyE' && started) toggleSit(); });
sitBtn.addEventListener('click', toggleSit);
window.__sit = (i) => sit(seats[i]); window.__stand = standUp; window.__seats = seats;

// ---- 층 이동 계단: 계단 시작 구역에 들어서면 입력이 잠기고, 캐릭터가 계단을 걸어 한 층(3.4m) 내려가/올라간 뒤 화면이 어두워지며 다른 층 페이지로 넘어간다.
//      4층: 로비 동쪽 복도 끝 계단(아래로) / 3층: 입구 앞 공용부 계단(위로).  좌표는 각 층 배치도 픽셀.
let lift = 0, stairAnim = null;
const STAIRS = F3
  ? { trig: [302, 316, 338, 334], zs: Z(322), ze: Z(322) + 17 * 0.254, x1: X(320), z1: Z(322) + 17 * 0.254 - 0.1, dLift: 3.4, dur: 4.6, to: 'index.html?from=stairs' }
  : { trig: [HOLE4[0], 354, HOLE4[2], 404], zs: Z(HOLE4[1]), ze: Z(HOLE4[3]), x1: X((HOLE4[0] + HOLE4[2]) / 2), z1: Z(HOLE4[3] - 1), dLift: -3.4, dur: 4.6, to: 'index.html?floor=3&from=stairs' };
const fadeEl = document.createElement('div');
fadeEl.style.cssText = 'position:fixed;inset:0;background:#111;opacity:0;pointer-events:none;z-index:30;transition:opacity .2s linear';
document.body.appendChild(fadeEl);
if (params.get('from') === 'stairs') {          // 도착: 검은 화면에서 서서히 밝아진다
  fadeEl.style.opacity = '1';
  requestAnimationFrame(() => requestAnimationFrame(() => { fadeEl.style.transition = 'opacity .8s ease-out'; fadeEl.style.opacity = '0'; }));
}
function stepStairs(dt) {                    // 한 프레임 진행. 이동 중이면 true
  if (!stairAnim && started && !seated) {
    const px = PX(player.x), py = PY(player.z), t = STAIRS.trig;
    if (px >= t[0] && px <= t[2] && py >= t[1] && py <= t[3]) stairAnim = { t: 0, sx: player.x, sz: player.z };
  }
  if (!stairAnim) return false;
  const a = stairAnim;
  a.t = Math.min(1, a.t + dt / STAIRS.dur);
  const e = a.t * a.t * (3 - 2 * a.t);
  player.x = a.sx + (STAIRS.x1 - a.sx) * Math.min(1, e * 3);      // 앞쪽 1/3 구간에서 계단 가운데로 모임
  player.z = a.sz + (STAIRS.z1 - a.sz) * e;
  player.face = 0;                                                  // 남쪽(+z)을 향해 걷는다
  lift = STAIRS.dLift * Math.max(0, Math.min(1, (player.z - STAIRS.zs) / (STAIRS.ze - STAIRS.zs)));
  if (a.t > 0.72) fadeEl.style.opacity = String(Math.min(1, (a.t - 0.72) / 0.26));
  if (a.t >= 1 && !a.done) { a.done = true; setTimeout(() => { location.href = STAIRS.to; }, 250); }
  return true;
}
window.__stairAnim = () => stairAnim; window.__lift = () => lift;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);

  let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
  let iy = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + joy.y;
  if (!started) { ix = 0; iy = 0; }
  if (seated) {
    const pressing = Math.hypot(ix, iy) > 0.4;
    if (!pressing) sitHold = false;                // 걸어오며 앉은 경우: 이동 키를 한 번 뗄 때까지는 일어나지 않는다
    if (pressing && !sitHold) standUp();           // 그다음 이동 키를 누르면 일어남
    ix = 0; iy = 0;
  }
  const cs = seated ? null : nearestSeat();
  if (started && (seated || cs)) { sitBtn.style.display = 'block'; sitBtn.textContent = seated ? 'E · 일어나기' : 'E · 앉기 (' + cs.name + ')'; }
  else sitBtn.style.display = 'none';
  const mag = Math.hypot(ix, iy);
  let moving = false;
  mvx = 0; mvz = 0;
  if (mag > 0.05 && !stairAnim) {
    ix /= Math.max(1, mag); iy /= Math.max(1, mag);
    // 카메라 기준 방향
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const vx = (fx * iy + rx * ix) * SPEED * dt;
    const vz = (fz * iy + rz * ix) * SPEED * dt;
    mvx = vx; mvz = vz;                          // 막혀도 가려던 방향은 기억 (벤치처럼 충돌 박스 앞에서 앉기 위해)
    if (!hits(player.x + vx, player.z)) player.x += vx;
    if (!hits(player.x, player.z + vz)) player.z += vz;
    const target = Math.atan2(vx, vz);
    let d = target - player.face; d = Math.atan2(Math.sin(d), Math.cos(d));
    player.face += d * Math.min(1, dt * 12);
    moving = true;
  }

  autoSit();
  if (stepStairs(dt)) moving = true;
  walkT += dt * (moving ? 11 : 2);
  chick.position.set(player.x, (seated ? seated.h - 0.3 : 0) + lift, player.z);
  chick.rotation.y = player.face;
  const b = chick.userData.body;
  b.position.y = moving ? Math.abs(Math.sin(walkT)) * 0.07 : Math.sin(walkT) * 0.01;
  b.rotation.z = moving ? Math.sin(walkT) * 0.07 : 0;
  b.rotation.x = moving ? 0.06 : 0;
  feetL.position.z = (seated ? 0.3 : 0.08) + (moving ? Math.sin(walkT) * 0.09 : 0);
  feetR.position.z = (seated ? 0.3 : 0.08) - (moving ? Math.sin(walkT) * 0.09 : 0);
  wingL.rotation.z = 0.25 + (moving ? Math.sin(walkT) * 0.3 : 0);
  wingR.rotation.z = -0.25 - (moving ? Math.sin(walkT) * 0.3 : 0);

  // 카메라
  const camY = (seated ? seated.h + 0.45 : 0.7) + lift;
  const ahead = seated && seated.view ? 2.2 : 0;           // 창가 자리: 시선을 바깥쪽 앞으로
  camTarget.set(player.x + Math.sin(player.face) * ahead, camY, player.z + Math.cos(player.face) * ahead);
  camPos.set(
    player.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    camY + Math.sin(pitch) * dist,
    player.z + Math.cos(yaw) * Math.cos(pitch) * dist
  );
  camera.position.lerp(camPos, params.get('skip') === '1' ? 1 : 0.2);
  camera.lookAt(camTarget);

  updateWallFade(camera.position, camTarget);
  updateZone();
  updateMinimap();
  renderer.render(scene, camera);
  window.__frames = (window.__frames || 0) + 1;
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

document.getElementById('start').addEventListener('click', () => {
  started = true;
  document.getElementById('intro').style.display = 'none';
});
if (started) document.getElementById('intro').style.display = 'none';

// ---- 층 전환 링크 + 3층 문구
document.getElementById('hint').textContent = '이동 WASD·방향키 · 시점 드래그 · 확대 휠 · 의자 쪽으로 걸어가면 자동으로 앉아요(E도 가능) · 이동 키로 일어나기';
{
  const a = document.createElement('a');
  a.href = F3 ? 'index.html' : 'index.html?floor=3';
  a.textContent = F3 ? '↔ 4층 공유오피스로' : '↔ 3층 라운지로';
  a.style.cssText = 'position:fixed;left:14px;top:66px;z-index:5;background:rgba(255,255,255,.94);color:#1b1b1f;font:800 12px system-ui,sans-serif;padding:7px 11px;border-radius:10px;text-decoration:none;box-shadow:0 2px 10px rgba(0,0,0,.12)';
  document.body.appendChild(a);
}
if (F3) {
  document.title = '라운드비 3층 라운지 · 메타버스 투어';
  const img = document.querySelector('#minimap img'); img.src = 'assets/floorplan3.png'; img.alt = '3층 라운지 배치도';
  document.querySelector('#hud-title small').textContent = '3F 라운지 · 걸어다니며 둘러보세요';
  document.querySelector('#intro h1').innerHTML = '라운드비 3층<br>라운지 투어';
  document.querySelectorAll('#intro p')[1].innerHTML = '삐약매니저와 함께 전자칠판 강의실,<br>호리존 스튜디오, 정수기 코너까지 직접 걸어서 둘러보세요.';
}

camera.position.set(player.x, 7, player.z + 6);
frame();
