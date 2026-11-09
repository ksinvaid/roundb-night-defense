/* KnightRig — 기사 한 장 그림(img/knights_fixed/*.webp 또는 내 스킨)을 부위별로 잘라 관절을 돌리는 컷아웃(퍼핏) 리그. 공용 모듈(window.KnightRig).
   원본 그림은 건드리지 않는다: 읽기만 해서 오프스크린 캔버스에 조각(머리·몸통·팔 둘·다리 둘)을 한 번 만들어 두고, 프레임마다 회전 변환만 한다.

   ── API ─────────────────────────────────────────────────────────────────────────────────────────
   KnightRig.draw(ctx, knightId, o)  →  {handX, handY, ready}
     ctx        캔버스 2D 컨텍스트(호출자가 정한 좌표계 그대로 그린다)
     knightId   0~9 (KNIGHTS 인덱스). 그림 주소는 전역 kSrc(id,false)(내 스킨 포함)를 쓰고, 없으면 img/knights_fixed/<키>.webp
     o.x, o.y   발 밑 가운데(바닥에 닿는 점)의 좌표
     o.height   그려질 전체 키(px). 또는 o.scale(원본 픽셀 → 좌표 배율). 둘 다 없으면 scale 1
     o.facing   1(기본) 또는 -1(좌우 반전)
     o.pose     "idle"|"walk"|"run"|"attack"|"hurt"|"cast"|"crouch"|"roll"|"prone"  (기본 idle)
     o.t        시간(초). idle/walk/run/cast/crouch 는 계속 흐르는 시간, attack/hurt/roll 은 '시작한 뒤 흐른 시간'(끝나면 서 있는 자세)
     o.loop     true 면 attack/hurt/roll 을 반복(t 를 지속시간으로 나눈 나머지 사용)
     o.style    attack 의 종류: "slash"(내려치기, 기본)|"thrust"(찌르기)|"throw"(던지기)
     o.arm      공격하는 팔: "R"(화면 오른쪽, 기본) 또는 "L"
     o.arc      attack 때 휘두른 궤적 호를 그릴지(기본 true), o.arcColor(기본 "#fff3b0")
     o.flash    0~1, 흰색 번쩍(피격). o.alpha 투명도. o.shadow 바닥 그림자(기본 true, 발 착지 때 눌림)
     o.speed    walk/run 걸음 빠르기 배율(기본 1)
   반환 handX/handY 는 공격하는 손의 좌표(호출자 좌표계) — 총·이펙트를 붙일 때 쓴다.
   KnightRig.duration(pose)   one-shot 자세의 길이(초): attack .55 · hurt .35 · roll .6
   KnightRig.preload(ids)     조각을 미리 만들어 둔다(그림이 아직 안 불러와졌으면 불러온 뒤 만든다)
   KnightRig.ready(id)        조각이 준비됐는지
   KnightRig.sheet(ctx, t, w, pose)   10기사를 한 줄로 늘어놓고 그리는 점검용 함수
   ※ 조각이 아직 없으면(그림 로딩 중) 원본 한 장을 통째로 그린다(깨지지 않음).
   ─────────────────────────────────────────────────────────────────────────────────────────────── */
(function (root) {
  "use strict";
  const KEYS = ["seoa", "hayun", "jiyu", "arin", "chaewon", "isol", "daon", "soyul", "ian", "teo"];
  const DUR = {attack: .55, hurt: .35, roll: .6};
  const rigs = new Map(), imgs = new Map();
  /* 기사별 분할선 보정(원본 높이를 1로 본 비율). 없으면 기본값. */
  const TUNE = {};
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const ease = v => v * v * (3 - 2 * v);

  function srcOf(id) {
    try { if (typeof root.kSrc === "function") { const s = root.kSrc(id, false); if (s) return s; } } catch (e) {}
    return "img/knights_fixed/" + (KEYS[id] || "seoa") + ".webp";
  }
  function image(src) {
    let im = imgs.get(src);
    if (!im) { im = new Image(); im.src = src; imgs.set(src, im); }
    return im;
  }
  function cvs(w, h) { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

  /* 발 두 개의 가운데(몸 중심)를 알파로 찾는다: 아래쪽 줄에서 불투명한 덩어리들 중 중앙에 가장 가까운 둘 */
  function centerX(full, W, H) {
    try {
      const y = Math.floor(H * .94), d = full.getContext("2d").getImageData(0, y, W, 1).data, runs = [];
      let s = -1;
      for (let x = 0; x <= W; x++) {
        const on = x < W && d[x * 4 + 3] > 40;
        if (on && s < 0) s = x; else if (!on && s >= 0) { if (x - s > 3) runs.push((s + x) / 2); s = -1; }
      }
      if (runs.length >= 2) { runs.sort((a, b) => Math.abs(a - W / 2) - Math.abs(b - W / 2)); const a = runs[0], b = runs[1]; if (Math.abs(a - b) < H * .3) return {cx: (a + b) / 2, gap: Math.abs(a - b)}; }
    } catch (e) {}
    return {cx: W / 2, gap: H * .16};
  }
  function piece(full, x0, y0, x1, y1, px, py) {
    x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0)); x1 = Math.round(x1); y1 = Math.round(y1);
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0), c = cvs(w, h);
    c.getContext("2d").drawImage(full, x0, y0, w, h, 0, 0, w, h);
    return {c, x0, y0, w, h, px, py, white: null};
  }
  function whiteOf(p) {
    if (!p.white) { const c = cvs(p.w, p.h), g = c.getContext("2d"); g.drawImage(p.c, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = "#fff"; g.fillRect(0, 0, p.w, p.h); p.white = c; }
    return p.white;
  }
  function build(src, im, id) {
    const W = im.naturalWidth, H = im.naturalHeight;
    const full = cvs(W, H); full.getContext("2d").drawImage(im, 0, 0);
    const k = KEYS[id] || "", cg = centerX(full, W, H), cx = cg.cx;
    const T = Object.assign({hip: .73, head: .46, shoulder: .45, hand: .70, legHalf: clamp(cg.gap / 2 / H + .065, .11, .17), armIn: .085, armOut: .195, ov: .04}, TUNE[k] || {});
    const hipY = T.hip * H, headY = T.head * H, ay0 = T.shoulder * H, ay1 = T.hand * H, lh = T.legHalf * H, ai = T.armIn * H, ao = T.armOut * H, ov = T.ov * H;
    const rig = {src, W, H, cx, full, T};
    rig.legL = piece(full, cx - lh, hipY - ov, cx, H, cx - .06 * H, hipY);
    rig.legR = piece(full, cx, hipY - ov, cx + lh, H, cx + .06 * H, hipY);
    rig.armL = piece(full, cx - ao, ay0, cx - ai, ay1, cx - ai - .02 * H, ay0 + .03 * H);
    rig.armR = piece(full, cx + ai, ay0, cx + ao, ay1, cx + ai + .02 * H, ay0 + .03 * H);
    rig.head = piece(full, 0, 0, W, headY + ov, cx, headY);
    // 몸통 층: 원본에서 팔·다리·머리 자리를 비운다(조각이 그 자리를 채운다)
    const body = cvs(W, H), g = body.getContext("2d");
    g.drawImage(full, 0, 0);
    g.clearRect(cx - lh, hipY, lh * 2, H - hipY);
    g.clearRect(cx - ao, ay0, ao - ai, ay1 - ay0); g.clearRect(cx + ai, ay0, ao - ai, ay1 - ay0);
    g.clearRect(0, 0, W, headY);
    rig.body = body;
    return rig;
  }
  function rigFor(id) {
    const src = srcOf(id), key = src;
    let r = rigs.get(key);
    if (r) return r;
    const im = image(src);
    if (!(im.complete && im.naturalWidth)) return null;
    try { r = build(src, im, id); } catch (e) { r = {bad: true, src, im}; }
    rigs.set(key, r);
    return r;
  }

  /* 관절 각도(라디안). 양수 = 시계 방향. 길이는 키(H)에 대한 비율 */
  function joints(pose, t, o) {
    const J = {legL: 0, legR: 0, armL: 0, armR: 0, rot: 0, bx: 0, by: 0, sy: 1, head: 0, liftL: 0, liftR: 0, plant: 0, strike: -1, atkAng: 0};
    const side = o.arm === "L" ? -1 : 1;
    const dur = DUR[pose];
    if (dur) { if (o.loop) t = ((t % dur) + dur) % dur; else if (t < 0 || t >= dur) { pose = "idle"; t = o.t || 0; } }
    if (pose === "walk" || pose === "run") {
      const run = pose === "run", w = (run ? 2 * Math.PI / .46 : 2 * Math.PI / .72) * (o.speed || 1), ph = t * w, s = Math.sin(ph), c = Math.cos(ph);
      const la = run ? .72 : .58, aa = run ? .95 : .7;
      const sl = Math.max(0, s), sr = Math.max(0, -s);   // 한 발씩 번갈아 옆으로 내딛고 들었다 놓는다
      J.legL = sl * la; J.legR = -sr * la; J.armL = .08 + sr * aa; J.armR = -(.08 + sl * aa);
      J.liftL = sl; J.liftR = sr;
      J.by = -Math.abs(s) * (run ? .04 : .028); J.rot = s * (run ? .05 : .028) + (run ? .06 : 0);
      J.head = -J.rot * .6 + Math.sin(ph * 2) * .01; J.sy = 1 + (Math.abs(c) - .5) * .012;
      J.plant = Math.max(0, 1 - Math.abs(s) * 3);   // 발이 바닥에 닿는 순간(다리가 가운데일 때) 그림자 눌림
    } else if (pose === "attack") {
      const u = t / DUR.attack, style = o.style || "slash";
      let a, rot, lunge;
      if (style === "thrust") {
        a = u < .3 ? -.9 * ease(u / .3) : u < .5 ? -.9 + 1.25 * ease((u - .3) / .2) : .35 * (1 - ease((u - .5) / .5));
        rot = u < .3 ? -.08 * ease(u / .3) : u < .5 ? -.08 + .22 * ease((u - .3) / .2) : .14 * (1 - ease((u - .5) / .5));
        lunge = u < .3 ? 0 : u < .5 ? .09 * ease((u - .3) / .2) : .09 * (1 - ease((u - .5) / .5));
      } else if (style === "throw") {
        a = u < .35 ? -2.5 * ease(u / .35) : u < .5 ? -2.5 + 3.4 * ease((u - .35) / .15) : .9 * (1 - ease((u - .5) / .5));
        rot = u < .35 ? -.1 * ease(u / .35) : u < .5 ? -.1 + .26 * ease((u - .35) / .15) : .16 * (1 - ease((u - .5) / .5));
        lunge = .03 * Math.sin(u * Math.PI);
      } else {   // slash: 팔을 뒤로 높이 감았다가 앞으로 내려친다
        a = u < .3 ? -2.1 * ease(u / .3) : u < .5 ? -2.1 + 3.3 * ease((u - .3) / .2) : 1.2 * (1 - ease((u - .5) / .5));
        rot = u < .3 ? -.12 * ease(u / .3) : u < .5 ? -.12 + .3 * ease((u - .3) / .2) : .18 * (1 - ease((u - .5) / .5));
        lunge = u < .3 ? 0 : u < .5 ? .06 * ease((u - .3) / .2) : .06 * (1 - ease((u - .5) / .5));
      }
      J.atkAng = a; J.strike = u;
      if (side > 0) { J.armR = a; J.armL = -.35 + .35 * Math.sin(u * Math.PI); } else { J.armL = -a; J.armR = .35 - .35 * Math.sin(u * Math.PI); }
      J.rot = rot * side; J.bx = lunge * side * 0 + lunge; J.head = -J.rot * .5;
      const step = u < .5 ? ease(u / .5) : 1 - ease((u - .5) / .5);
      J.legL = -.18 * step; J.legR = .3 * step; J.by = -.02 * Math.sin(u * Math.PI); J.plant = step > .8 ? 1 : 0;
    } else if (pose === "hurt") {
      const u = t / DUR.hurt, k = Math.sin(Math.min(1, u) * Math.PI);
      J.rot = -.3 * k; J.bx = -.07 * k; J.armL = -.9 * k; J.armR = .9 * k; J.head = .25 * k; J.legL = .2 * k; J.legR = -.2 * k; J.sy = 1 - .05 * k;
    } else if (pose === "cast") {
      const s = Math.sin(t * 5);
      J.armL = 2.3 + s * .12; J.armR = -2.3 - s * .12; J.by = -.02 + s * .006; J.head = -.06; J.sy = 1 + Math.sin(t * 3) * .01;
    } else if (pose === "crouch") {
      J.by = .09; J.sy = .86; J.legL = .35; J.legR = -.35; J.armL = -.25; J.armR = .25; J.rot = .04;
    } else if (pose === "roll") {
      const u = clamp(t / DUR.roll, 0, 1);
      J.spin = u * Math.PI * 2; J.by = -.18 * Math.sin(u * Math.PI); J.sy = .8; J.legL = .5; J.legR = -.5; J.armL = -.6; J.armR = .6;
    } else if (pose === "prone") {
      J.lie = true; J.by = 0; J.armL = -.3; J.armR = .3;
    } else {   // idle: 숨쉬기 + 팔 살랑
      const s = Math.sin(t * 2.2);
      J.sy = 1 + s * .008; J.armL = -.05 + s * .03; J.armR = .05 - s * .03; J.head = Math.sin(t * 1.4) * .015; J.by = s * .004;
    }
    return J;
  }

  function drawPiece(ctx, p, ang, dx, dy, flash) {
    ctx.save();
    ctx.translate(p.px + dx, p.py + dy); ctx.rotate(ang);
    ctx.drawImage(p.c, p.x0 - p.px, p.y0 - p.py);
    if (flash > 0) { ctx.globalAlpha *= flash; ctx.drawImage(whiteOf(p), p.x0 - p.px, p.y0 - p.py); }
    ctx.restore();
  }

  function draw(ctx, id, o) {
    o = o || {};
    const rig = rigFor(id), facing = o.facing === -1 ? -1 : 1, pose = o.pose || "idle", t = o.t || 0;
    const H0 = rig && !rig.bad ? rig.H : 300;
    const sc = o.height ? o.height / H0 : (o.scale || 1), out = {handX: o.x || 0, handY: o.y || 0, ready: !!(rig && !rig.bad)};
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.translate(o.x || 0, o.y || 0);
    if (!rig || rig.bad) {   // 로딩 중: 통째로 한 장
      const im = rig && rig.im || image(srcOf(id));
      if (im.complete && im.naturalWidth) { const w = im.naturalWidth * sc, h = im.naturalHeight * sc; ctx.scale(facing, 1); ctx.drawImage(im, -w / 2, -h, w, h); }
      ctx.restore(); return out;
    }
    const J = joints(pose, t, o), H = rig.H, cx = rig.cx, flash = clamp(o.flash || 0, 0, 1);
    // 그림자(발 밑, 착지 때 눌림)
    if (o.shadow !== false && !J.lie) {
      ctx.save(); ctx.fillStyle = "rgba(16,21,28,.32)"; ctx.beginPath();
      ctx.ellipse(J.bx * H * sc * facing, 0, .19 * H * sc * (1 + J.plant * .12), .055 * H * sc * (1 - J.plant * .25), 0, 0, 6.2832); ctx.fill(); ctx.restore();
    }
    ctx.scale(facing * sc, sc);
    ctx.translate(-cx + J.bx * H, -H);   // 이후 좌표: 원본 픽셀 (발 가운데가 원점으로 오도록)
    if (J.spin != null) { ctx.translate(cx, H * .55); ctx.rotate(J.spin); ctx.translate(-cx, -H * .55); }
    if (J.lie) { ctx.translate(cx, H); ctx.rotate(-1.45); ctx.translate(-cx, -H); }
    ctx.translate(0, J.by * H);
    if (J.sy !== 1) { ctx.translate(cx, H); ctx.scale(1, J.sy); ctx.translate(-cx, -H); }
    if (J.rot) { ctx.translate(cx, H * .72); ctx.rotate(J.rot); ctx.translate(-cx, -H * .72); }
    const lift = .07 * H;
    // 층 순서: 다리 → 팔 → 몸통 → 머리 (몸통 층이 다리·팔 윗부분 이음새를 덮는다)
    drawPiece(ctx, rig.legL, J.legL, 0, -J.liftL * lift, flash);
    drawPiece(ctx, rig.legR, J.legR, 0, -J.liftR * lift, flash);
    drawPiece(ctx, rig.armL, J.armL, 0, 0, flash);
    drawPiece(ctx, rig.armR, J.armR, 0, 0, flash);
    ctx.drawImage(rig.body, 0, 0);
    drawPiece(ctx, rig.head, J.head, 0, 0, flash);
    // 공격 호와 손 위치
    const side = o.arm === "L" ? -1 : 1, sp = side > 0 ? rig.armR : rig.armL, ang = side > 0 ? J.armR : J.armL;
    const hx = sp.px + Math.sin(-ang) * 0 + (-Math.sin(ang)) * (.3 * H), hy = sp.py + Math.cos(ang) * (.3 * H);
    if (pose === "attack" && o.arc !== false && (o.style || "slash") === "slash" && J.strike > .3 && J.strike < .85) {
      const th = v => Math.PI / 2 + (side > 0 ? v : -v), fade = 1 - (J.strike - .3) / .55;
      ctx.save(); ctx.globalAlpha *= clamp(fade, 0, 1) * .9; ctx.lineCap = "round";
      ctx.strokeStyle = o.arcColor || "#fff3b0"; ctx.lineWidth = .05 * H;
      ctx.beginPath(); ctx.arc(sp.px, sp.py, .42 * H, th(-2.1), th(J.atkAng), side < 0); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
    // 손 좌표를 호출자 좌표계로 (회전·반전을 단순 근사)
    out.handX = (o.x || 0) + (hx - cx) * sc * facing + J.bx * H * sc * facing; out.handY = (o.y || 0) + (hy - H) * sc + J.by * H * sc;
    return out;
  }

  function preload(ids) { (ids || [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).forEach(id => { const im = image(srcOf(id)); if (im.complete && im.naturalWidth) rigFor(id); else im.addEventListener("load", () => rigFor(id), {once: true}); }); }
  function sheet(ctx, t, w, pose) {
    const n = 10, cell = (w || 1000) / n, h = cell * 1.55;
    for (let i = 0; i < n; i++) draw(ctx, i, {x: cell * (i + .5), y: h, height: h * .92, pose: pose || "walk", t: t + i * .13, loop: true, facing: 1});
  }
  root.KnightRig = {draw, duration: p => DUR[p] || 0, preload, ready: id => { const r = rigs.get(srcOf(id)); return !!(r && !r.bad); }, sheet, TUNE, KEYS};
})(typeof window !== "undefined" ? window : globalThis);
