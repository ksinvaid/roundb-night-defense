#!/usr/bin/env node
/* 기사단 포즈 시트 만들기 — 게임의 knightrig.js(원본 기사 그림을 잘라 관절을 돌리는 퍼핏 리그)를 헤드리스 크롬에서 돌려
   기사마다 포즈 6~8개를 한 장(JPG, 가로 1200px)에 늘어놓는다. 새 그림을 그리거나 합성하지 않고, 기존 그림(img/knights_fixed/*.webp)을 리그로 움직인 것만 쓴다.

   사용법 (저장소 루트에서, Node 20 이상 + 크롬/엣지가 깔린 PC. 설치할 패키지 없음):
     node tools/build_knight_poses.mjs                      # 10명 전부 → knights/img/pose_<id>.jpg
     node tools/build_knight_poses.mjs --only jiyu,seoa     # 일부만
     node tools/build_knight_poses.mjs --copy "D:/…/06_기사단소개"   # 같은 파일을 포즈시트_<이름>.jpg 로 한 벌 더 복사(운영자용)
     node tools/build_knight_poses.mjs --contact out.jpg    # 점검용: 한 명(--only)의 모든 포즈를 한 장에
     환경변수 CHROME_PATH 로 크롬 위치를 직접 지정할 수 있다.

   어떤 포즈를 넣을지는 knights/data.json 의 기사별 "sheet" 배열이 정한다(한글 이름표 label, pose, t=시간(초), 선택: facing·dx·dy·scale·h(키 px)·ghost:false).
   포즈가 어색하면 data.json 에서 그 항목만 빼고 다시 돌리면 된다.

   [왜 knightrig.js 를 그대로 쓰지 않고 한 겹을 얹나] 리그는 몸통 그림에서 팔 자리를 비워 두고 팔 조각만 돌려서, 게임 안 작은 크기에서는 티가 안 나지만 이 시트 크기(키 212px)에서는 팔이 돌아갈 때
   그 자리가 네모난 구멍으로 보인다. 그래서 몸통 변환이 적용된 상태에서 다리 조각을 그리기 직전에 '원본 그림의 팔 자리'를 한 겹 깔아 구멍을 가린다(ghostProxy). 새로 그린 픽셀은 없고 원본 그림의 같은 부분이다.
   팔을 크게 돌리는 포즈(공격·주문)는 팔이 머리카락·몸통 뒤로 숨어 서 있는 모습과 구별이 안 돼서 시트에 넣지 않았다. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = k => { const i = argv.indexOf("--" + k); return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true); };
const ONLY = arg("only") && arg("only") !== true ? String(arg("only")).split(",").map(s => s.trim()).filter(Boolean) : null;
const OUT = path.resolve(ROOT, typeof arg("out") === "string" ? arg("out") : "knights/img");
const COPY = typeof arg("copy") === "string" ? arg("copy") : null;
const CONTACT = typeof arg("contact") === "string" ? arg("contact") : null;
const MAX_BYTES = 390 * 1024;   // 한 장 400KB 이하

/* ───────── 브라우저 안에서 도는 코드(문자열로 페이지에 들어간다) ───────── */
function pageMain() {
  const FONT = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans CJK KR","Noto Sans KR",sans-serif';
  const KEYS = KnightRig.KEYS;
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("그림 못 읽음 " + src)); i.src = src; });
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function fit(ctx, text, font, maxW, size) { let s = size; do { ctx.font = font(s); if (ctx.measureText(text).width <= maxW) break; s -= 1; } while (s > 11); return s; }

  function centerOf(im) {
    const W = im.naturalWidth, H = im.naturalHeight, c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
    const y = Math.floor(H * .94), d = g.getImageData(0, y, W, 1).data, runs = []; let s0 = -1;
    for (let x = 0; x <= W; x++) { const on = x < W && d[x * 4 + 3] > 40; if (on && s0 < 0) s0 = x; else if (!on && s0 >= 0) { if (x - s0 > 3) runs.push((s0 + x) / 2); s0 = -1; } }
    if (runs.length >= 2) { runs.sort((a, b) => Math.abs(a - W / 2) - Math.abs(b - W / 2)); const a = runs[0], b = runs[1]; if (Math.abs(a - b) < H * .3) return (a + b) / 2; }
    return W / 2;
  }
  /* 팔 자리 구멍 메우기: 리그는 몸통 그림에서 팔 자리를 비워 두고 팔 조각만 돌린다 → 팔이 돌아가면 그 자리가 네모로 비어 보인다.
     그림 위에 '원본 팔 자리'를 한 겹 깔아(같은 몸통 변환으로, 다리 조각을 그리기 직전에) 구멍을 가린다. 새로 그린 픽셀은 없고 원본 그림의 같은 부분이다. */
  function ghostProxy(real, im) {
    const H0 = im.naturalHeight, cx = centerOf(im), ai = .085 * H0, ao = .195 * H0, y0 = .45 * H0, y1 = .70 * H0;
    let armed = false, done = false;
    return new Proxy(real, {
      get(t, k) {
        const v = t[k];
        if (typeof v !== "function") return v;
        if (k === "scale") return (...a) => { v.apply(t, a); armed = true; };
        if (k === "save") return () => {
          if (armed && !done) { done = true; t.save(); for (const [a, b] of [[cx - ao, cx - ai], [cx + ai, cx + ao]]) t.drawImage(im, a, y0, b - a, y1 - y0, a, y0, b - a, y1 - y0); t.restore(); }
          v.call(t);
        };
        return v.bind(t);
      },
      set(t, k, val) { t[k] = val; return true; }
    });
  }
  window.buildSheet = async function (spec) {
    const id = KEYS.indexOf(spec.id); if (id < 0) throw new Error("모르는 기사 " + spec.id);
    await load("img/knights_fixed/" + spec.id + ".webp");
    for (let i = 0; i < 200 && !KnightRig.ready(id); i++) { KnightRig.preload([id]); await new Promise(r => setTimeout(r, 25)); }
    if (!KnightRig.ready(id)) throw new Error("리그를 못 만들었어요: " + spec.id);
    const P = spec.poses, n = P.length, cols = spec.cols || (n <= 6 ? 3 : 4), rows = Math.ceil(n / cols);
    const W = 1200, cw = Math.floor((W - 48) / cols), padX = 24, headH = 104, ch = spec.cellH || 330, footH = 40, gap = 0;
    const H = headH + rows * ch + footH + 12;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const ctx = cv.getContext("2d");
    document.body.append(cv);
    // 바탕
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#0b0e1d"); bg.addColorStop(1, "#171d3d"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // 머리글
    ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#faf6ee";
    ctx.font = "900 54px " + FONT; ctx.fillText(spec.name, padX, 66);
    const nw = ctx.measureText(spec.name).width;
    ctx.font = "700 22px " + FONT; ctx.fillStyle = "#f6c453"; ctx.fillText(spec.role + " · " + spec.en.toUpperCase(), padX + nw + 18, 66);
    ctx.fillStyle = "#b4bbdc"; const qs = fit(ctx, "“" + spec.line + "”", s => "700 " + s + "px " + FONT, W - padX * 2, 22); ctx.fillText("“" + spec.line + "”", padX, 96);
    ctx.fillStyle = "#3b4685"; ctx.fillRect(padX, headH - 4, W - padX * 2, 2);
    // 칸
    for (let k = 0; k < P.length; k++) { const p = P[k];
      const c = k % cols, r = Math.floor(k / cols), x0 = padX + c * cw, y0 = headH + r * ch;
      const cx0 = x0 + 5, cy0 = y0 + 6, cw0 = cw - 10, ch0 = ch - 12;
      rr(ctx, cx0, cy0, cw0, ch0, 16); ctx.fillStyle = "#1a2147"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#3b4685"; ctx.stroke();
      // 바닥선
      const base = cy0 + ch0 - 70, figH = p.h || spec.figH || 212;
      ctx.save(); rr(ctx, cx0, cy0, cw0, ch0, 16); ctx.clip();
      const fl = ctx.createLinearGradient(0, base - 6, 0, cy0 + ch0); fl.addColorStop(0, "#232c5a"); fl.addColorStop(1, "#1a2147"); ctx.fillStyle = fl; ctx.fillRect(cx0, base - 6, cw0, ch0);
      ctx.restore();
      ctx.save(); rr(ctx, cx0, cy0, cw0, ch0, 16); ctx.clip();
      const o = {x: x0 + cw / 2 + (p.dx || 0), y: base + (p.dy || 0), height: figH * (p.scale || 1), facing: p.facing === -1 ? -1 : 1, pose: p.pose, t: p.t || 0, loop: false, shadow: p.pose !== "prone"};
      if (p.style) o.style = p.style; if (p.arm) o.arm = p.arm; if (p.flash) o.flash = p.flash; if (p.arc === false) o.arc = false; if (p.arcColor) o.arcColor = p.arcColor; if (p.speed) o.speed = p.speed;
      let cc = ctx;
      if (p.ghost !== false && p.pose !== "idle" && p.pose !== "prone") cc = ghostProxy(ctx, await load("img/knights_fixed/" + spec.id + ".webp"));   // 서 있기·쓰러짐은 팔이 안 돌아서 필요 없음
      KnightRig.draw(cc, id, o);
      ctx.restore();
      // 번호 + 이름표
      const lx = cx0 + 12, ly = cy0 + 12;
      ctx.beginPath(); ctx.arc(lx + 16, ly + 16, 16, 0, 6.2832); ctx.fillStyle = "#f6c453"; ctx.fill();
      ctx.fillStyle = "#2a1a00"; ctx.font = "900 20px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(k + 1), lx + 16, ly + 17.5);
      const bw = cw0 - 24, bh = 40, bx = cx0 + 12, by = cy0 + ch0 - 12 - bh;
      rr(ctx, bx, by, bw, bh, 12); ctx.fillStyle = "#0b0e1d"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#8ab9ff"; ctx.stroke();
      ctx.fillStyle = "#faf6ee"; fit(ctx, p.label, s => "800 " + s + "px " + FONT, bw - 16, 20); ctx.textAlign = "center"; ctx.fillText(p.label, bx + bw / 2, by + bh / 2 + 1);
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    }
    // 바닥글
    ctx.fillStyle = "#8d95c2"; ctx.font = "600 15px " + FONT; ctx.textAlign = "left";
    ctx.fillText("라운드비 나이츠 · 기사단 소개 — 원작 그림은 AI로 만든 캐릭터입니다.", padX, H - 18);
    ctx.textAlign = "right"; ctx.fillText("ksinvaid.github.io/roundb-night-defense", W - padX, H - 18); ctx.textAlign = "left";
    // JPG (한 장 400KB 이하가 되도록 품질을 낮춰 가며)
    let url = "", bytes = 0;
    for (const q of [0.92, 0.88, 0.84, 0.8, 0.76, 0.72, 0.68, 0.64, 0.6]) {
      url = cv.toDataURL("image/jpeg", q); bytes = Math.floor((url.length - 23) * 3 / 4);
      if (bytes <= spec.maxBytes) { spec.q = q; break; }
    }
    cv.remove();
    return {url, bytes, w: W, h: H};
  };
  window.__ready = true;
}

const PAGE = '<!doctype html><meta charset="utf-8"><title>poses</title><body style="margin:0;background:#000">' +
  '<script src="/knightrig.js"></script><script>(' + pageMain.toString() + ')()</script></body>';

/* ───────── 작은 정적 서버(저장소 루트, 읽기 전용) ───────── */
const MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg"};
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (u === "/__poses.html") { rsp.writeHead(200, {"Content-Type": MIME[".html"]}); rsp.end(PAGE); return; }
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT) || !/^\/(knightrig\.js|img\/knights_fixed\/[a-z]+\.webp)$/.test(u) || !fs.existsSync(f)) { rsp.writeHead(404); rsp.end("no"); return; }
      rsp.writeHead(200, {"Content-Type": MIME[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store"}); fs.createReadStream(f).pipe(rsp);
    }).listen(0, "127.0.0.1", () => res({srv, port: srv.address().port}));
  });
}

/* ───────── 크롬 띄우기 + 최소 CDP 클라이언트(WebSocket 은 Node 기본 제공) ───────── */
function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const pf = process.env["ProgramFiles"] || "C:/Program Files", pf86 = process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", la = process.env.LOCALAPPDATA || "";
  const list = [pf + "/Google/Chrome/Application/chrome.exe", pf86 + "/Google/Chrome/Application/chrome.exe", la + "/Google/Chrome/Application/chrome.exe",
    pf86 + "/Microsoft/Edge/Application/msedge.exe", pf + "/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return list.find(p => p && fs.existsSync(p)) || null;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitJson(url, tries = 100) { for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return await r.json(); } catch (e) {} await sleep(150); } throw new Error("크롬이 열리지 않았어요: " + url); }
function cdp(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url); let id = 0; const pend = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.no(new Error(m.error.message)) : p.ok(m.result); } };
    ws.onerror = () => rej(new Error("CDP 연결 실패"));
    ws.onopen = () => res({send: (method, params = {}) => new Promise((ok, no) => { const i = ++id; pend.set(i, {ok, no}); ws.send(JSON.stringify({id: i, method, params})); }), close: () => { try { ws.close(); } catch (e) {} }});
  });
}
async function evaluate(c, expression) {
  const r = await c.send("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true});
  if (r.exceptionDetails) throw new Error("페이지 오류: " + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
  return r.result.value;
}

/* ───────── 메인 ───────── */
const data = JSON.parse(fs.readFileSync(path.join(ROOT, "knights", "data.json"), "utf8"));
let list = data.knights;
if (ONLY) list = list.filter(k => ONLY.includes(k.id));
if (!list.length) { console.error("만들 기사가 없어요(--only 이름 확인)"); process.exit(1); }

const chrome = findChrome();
if (!chrome) { console.error("크롬/엣지를 찾지 못했어요. CHROME_PATH 환경변수에 chrome.exe 위치를 적어 주세요."); process.exit(1); }
const {srv, port} = await serve();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "knpose-"));
const dbg = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1300,1000",
  "--remote-debugging-port=" + dbg, "--user-data-dir=" + tmp, "http://127.0.0.1:" + port + "/__poses.html"], {stdio: "ignore"});
let code = 0;
try {
  await waitJson("http://127.0.0.1:" + dbg + "/json/version");
  let tabs = []; for (let i = 0; i < 60 && !tabs.length; i++) { tabs = (await waitJson("http://127.0.0.1:" + dbg + "/json/list")).filter(t => t.type === "page" && /__poses/.test(t.url)); if (!tabs.length) await sleep(150); }
  if (!tabs.length) throw new Error("페이지 탭을 못 찾았어요");
  const c = await cdp(tabs[0].webSocketDebuggerUrl);
  await c.send("Runtime.enable");
  for (let i = 0; i < 100; i++) { if (await evaluate(c, "window.__ready === true")) break; await sleep(100); if (i === 99) throw new Error("페이지가 준비되지 않았어요"); }
  fs.mkdirSync(OUT, {recursive: true});
  const report = [];
  for (const k of list) {
    let poses = k.sheet;
    if (CONTACT) {   // 점검용: 가능한 포즈를 전부
      const one = (label, pose, t, x) => Object.assign({label, pose, t}, x || {});
      poses = [one("서기", "idle", .7), one("걷기", "walk", .18), one("달리기", "run", .115), one("내려치기R", "attack", .27, {arm: "R"}), one("내려치기L", "attack", .27, {arm: "L"}),
        one("찌르기R", "attack", .27, {style: "thrust", arm: "R"}), one("찌르기L", "attack", .27, {style: "thrust", arm: "L"}), one("던지기R", "attack", .26, {style: "throw", arm: "R"}),
        one("던지기L", "attack", .26, {style: "throw", arm: "L"}), one("주문", "cast", .3), one("맞음", "hurt", .17, {flash: .5}), one("웅크림", "crouch", .3), one("구르기", "roll", .15, {scale: .8}), one("쓰러짐", "prone", 0, {dx: 100})];
    }
    const spec = {id: k.id, name: k.name, en: k.en, role: k.role, line: k.line, poses, maxBytes: MAX_BYTES, cols: CONTACT ? 5 : undefined, cellH: CONTACT ? 300 : undefined, figH: CONTACT ? 190 : undefined};
    const r = await evaluate(c, "buildSheet(" + JSON.stringify(spec) + ")");
    const buf = Buffer.from(r.url.slice(r.url.indexOf(",") + 1), "base64");
    const file = CONTACT ? path.resolve(CONTACT) : path.join(OUT, "pose_" + k.id + ".jpg");
    fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, buf);
    if (COPY && !CONTACT) { fs.mkdirSync(COPY, {recursive: true}); fs.writeFileSync(path.join(COPY, "포즈시트_" + k.name + ".jpg"), buf); }
    report.push(k.id + " " + k.name + " → " + path.relative(ROOT, file) + "  " + r.w + "x" + r.h + "  " + Math.round(buf.length / 1024) + "KB  포즈 " + poses.length + "개");
  }
  console.log(report.join("\n"));
  try { await c.send("Browser.close"); } catch (e) {}
  c.close();
} catch (e) { console.error("실패:", e.message); code = 1; }
finally {
  try { proc.kill(); } catch (e) {}
  srv.close();
  await sleep(600);
  try { fs.rmSync(tmp, {recursive: true, force: true, maxRetries: 5, retryDelay: 300}); } catch (e) {}
  process.exit(code);
}
