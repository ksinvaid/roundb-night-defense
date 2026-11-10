#!/usr/bin/env node
/* 기사단 캐릭터 시트 만들기 — 공식 그림(3면도·표정 시트·치비)만 한 장(JPG, 가로 1600px 안팎, 장당 400KB 이하)에 얹는다.
   새로 그리거나 움직이거나 합성하는 것은 없다. 원본 그림은 자르고 크기를 줄여 카드에 놓을 뿐이다.

   구성: 머리글(이름·직업·말버릇) · 3면도(앞·옆·뒤) 큰 카드 · 표정 6칸 + 치비 + 프로필 칸.

   사용법 (저장소 루트에서, Node 20 이상 + 크롬/엣지가 깔린 PC. 설치할 패키지 없음):
     node tools/build_knight_sheets.mjs                       # 10명 전부 → knights/img/sheet_<id>.jpg
     node tools/build_knight_sheets.mjs --only jiyu,seoa      # 일부만
     node tools/build_knight_sheets.mjs --copy "D:/…/06_기사단소개"   # 같은 파일을 캐릭터시트_<이름>.jpg 로 한 벌 더 복사(운영자용)
     node tools/build_knight_sheets.mjs --art "D:/…/라운드기사단"     # 원본 그림 폴더(기본: 아래 ART_DEFAULT 또는 환경변수 KNIGHT_ART_DIR)
     환경변수 CHROME_PATH 로 크롬 위치를 직접 지정할 수 있다.

   원본 그림 폴더에서 읽는 것(이름은 data.json 의 한글 이름):
     원본/03_3면도/<이름>.png      앞·옆·뒤 전신 (2752×1536)
     원본/04_표정시트/<이름>.png   표정 6종, 3×2 격자 (2528×1696) — 순서: 1 기본 · 2 웃음 · 3 진지 · 4 놀람 · 5 수줍음 · 6 기사마다 다름
     게임용/투명_치비/<이름>.png   치비(투명)

   글자(이름표)는 knights/data.json 기사별 "sheet" 에서 읽는다:
     "sheet": {"faces": ["기본","웃음","진지","놀람","수줍음","분노"],     ← 표정 6칸 이름. 그림에 실제로 보이는 표정만 적는다(그림에 없는 소품·동작 금지)
               "crop": {"3": {"x": 0, "y": .04, "w": 1, "h": .92}}}       ← (선택) n번째 표정 칸만 자르는 위치를 칸 크기의 비율로 조정 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ART_DEFAULT = "D:/Program Files/자비스/11_송현우/라운드기사단";
const argv = process.argv.slice(2);
const arg = k => { const i = argv.indexOf("--" + k); return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true); };
const ONLY = typeof arg("only") === "string" ? String(arg("only")).split(",").map(s => s.trim()).filter(Boolean) : null;
const OUT = path.resolve(ROOT, typeof arg("out") === "string" ? arg("out") : "knights/img");
const COPY = typeof arg("copy") === "string" ? arg("copy") : null;
const ART = path.resolve(typeof arg("art") === "string" ? arg("art") : (process.env.KNIGHT_ART_DIR || ART_DEFAULT));
const MAX_BYTES = 390 * 1024;   // 한 장 400KB 이하

/* ───────── 브라우저 안에서 도는 코드(문자열로 페이지에 들어간다) ───────── */
function pageMain() {
  const FONT = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans CJK KR","Noto Sans KR",sans-serif';
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("그림을 못 읽었어요: " + decodeURIComponent(src))); i.src = src; });
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function fit(ctx, text, font, maxW, size, min) { let s = size; do { ctx.font = font(s); if (ctx.measureText(text).width <= maxW) break; s -= 1; } while (s > (min || 11)); return s; }
  function wrap(ctx, text, maxW) {   // 공백 단위(단어)로 줄바꿈, 한 단어가 칸보다 길 때만 글자 단위로 자른다
    const out = []; let line = "";
    for (const word of text.split(" ")) {
      const t = line ? line + " " + word : word;
      if (ctx.measureText(t).width <= maxW) { line = t; continue; }
      if (line) { out.push(line); line = ""; }
      if (ctx.measureText(word).width <= maxW) { line = word; continue; }
      for (const ch of Array.from(word)) { const t2 = line + ch; if (line && ctx.measureText(t2).width > maxW) { out.push(line); line = ch; } else line = t2; }
    }
    if (line) out.push(line); return out;
  }
  function bbox(im) {   // 치비의 투명한 여백을 잘라내기 위한 알파 경계
    const c = document.createElement("canvas"), W = Math.min(im.naturalWidth, 800), s = W / im.naturalWidth, H = Math.round(im.naturalHeight * s); c.width = W; c.height = H;
    const g = c.getContext("2d"); g.drawImage(im, 0, 0, W, H); const d = g.getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return {x: x0 / s, y: y0 / s, w: (x1 - x0 + 1) / s, h: (y1 - y0 + 1) / s};
  }

  window.buildSheet = async function (spec) {
    const [tv, ex, cb] = await Promise.all([load(spec.urls.view), load(spec.urls.faces), load(spec.urls.chibi)]);
    const W = 1600, pad = 24, gap = 12, inW = W - pad * 2;
    const headH = 126, secH = 38, tvH = Math.round(inW * tv.naturalHeight / tv.naturalWidth), capH = 46, tile = Math.floor((inW - gap * 3) / 4), footH = 64;
    const H = pad + headH + secH + tvH + capH + 10 + secH + tile * 2 + gap + footH + 6;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H; document.body.append(cv);
    const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    // 바탕
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#0b0e1d"); bg.addColorStop(1, "#171d3d"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    let y = pad;
    // 머리글
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"; ctx.fillStyle = "#faf6ee"; ctx.font = "900 64px " + FONT; ctx.fillText(spec.name, pad, y + 62);
    const nw = ctx.measureText(spec.name).width;
    ctx.font = "700 26px " + FONT; ctx.fillStyle = "#f6c453"; ctx.fillText(spec.role + " · " + spec.en.toUpperCase() + " · " + spec.age + "세", pad + nw + 20, y + 60);
    ctx.fillStyle = "#b4bbdc"; fit(ctx, "“" + spec.line + "”", s => "700 " + s + "px " + FONT, inW - 260, 28); ctx.fillText("“" + spec.line + "”", pad, y + 100);
    ctx.textAlign = "right"; ctx.fillStyle = "#8d95c2"; ctx.font = "800 22px " + FONT; ctx.fillText("KNIGHT " + String(spec.no).padStart(2, "0") + " / 10", W - pad, y + 60); ctx.textAlign = "left";
    y += headH; ctx.fillStyle = "#3b4685"; ctx.fillRect(pad, y - 10, inW, 2);
    // 3면도
    ctx.fillStyle = "#f6c453"; ctx.font = "800 24px " + FONT; ctx.fillText("3면도", pad, y + 26); y += secH;
    ctx.save(); rr(ctx, pad, y, inW, tvH, 16); ctx.clip(); ctx.drawImage(tv, pad, y, inW, tvH); ctx.restore();
    rr(ctx, pad, y, inW, tvH, 16); ctx.lineWidth = 3; ctx.strokeStyle = "#3b4685"; ctx.stroke();
    y += tvH + 8;
    ["앞모습", "옆모습", "뒷모습"].forEach((t, k) => {
      const cx = pad + inW * (k * 2 + 1) / 6, bw = 150, bh = 34;
      rr(ctx, cx - bw / 2, y, bw, bh, 11); ctx.fillStyle = "#0b0e1d"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#8ab9ff"; ctx.stroke();
      ctx.fillStyle = "#faf6ee"; ctx.font = "800 20px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(t, cx, y + bh / 2 + 1); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    });
    y += capH + 10;
    // 표정 + 치비 + 프로필
    ctx.fillStyle = "#f6c453"; ctx.font = "800 24px " + FONT; ctx.fillText("표정 · 치비 · 프로필", pad, y + 26); y += secH;
    const cells = [];   // 8칸: 표정 6 + 치비 + 프로필
    for (let k = 0; k < 8; k++) cells.push({x: pad + (k % 4) * (tile + gap), y: y + Math.floor(k / 4) * (tile + gap)});
    const cw = ex.naturalWidth / 3, ch = ex.naturalHeight / 2, ins = cw * .012;
    for (let k = 0; k < 6; k++) {
      const c = cells[k], col = k % 3, row = Math.floor(k / 3), o = (spec.crop && spec.crop[String(k + 1)]) || {};
      const fx = o.x != null ? o.x : 0, fy = o.y != null ? o.y : 0, fw = o.w != null ? o.w : 1, fh = o.h != null ? o.h : 1;
      let sx = col * cw + ins + fx * (cw - 2 * ins), sy = row * ch + ins + fy * (ch - 2 * ins), sw = fw * (cw - 2 * ins), sh = fh * (ch - 2 * ins);
      // 칸이 정사각이 되도록 가운데 기준으로 맞춤
      if (sw > sh) { sx += (sw - sh) / 2; sw = sh; } else if (sh > sw) { sy += (sh - sw) / 2; sh = sw; }
      ctx.save(); rr(ctx, c.x, c.y, tile, tile, 14); ctx.clip(); ctx.drawImage(ex, sx, sy, sw, sh, c.x, c.y, tile, tile); ctx.restore();
      rr(ctx, c.x, c.y, tile, tile, 14); ctx.lineWidth = 3; ctx.strokeStyle = "#3b4685"; ctx.stroke();
      const lab = spec.faces[k] || "";
      ctx.font = "800 20px " + FONT; const tw = Math.min(tile - 28, ctx.measureText(lab).width + 30), bh = 34, bx = c.x + 10, by = c.y + tile - bh - 10;
      rr(ctx, bx, by, tw, bh, 11); ctx.fillStyle = "rgba(11,14,29,.92)"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#8ab9ff"; ctx.stroke();
      ctx.fillStyle = "#faf6ee"; ctx.textBaseline = "middle"; ctx.fillText(lab, bx + 15, by + bh / 2 + 1); ctx.textBaseline = "alphabetic";
      // 번호
      ctx.beginPath(); ctx.arc(c.x + 28, c.y + 28, 16, 0, 6.2832); ctx.fillStyle = "#f6c453"; ctx.fill(); ctx.fillStyle = "#2a1a00"; ctx.font = "900 19px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(k + 1), c.x + 28, c.y + 29.5); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    }
    // 치비
    { const c = cells[6]; rr(ctx, c.x, c.y, tile, tile, 14); const g = ctx.createLinearGradient(0, c.y, 0, c.y + tile); g.addColorStop(0, "#232c5a"); g.addColorStop(1, "#1a2147"); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#3b4685"; ctx.stroke();
      const b = bbox(cb), maxW = tile - 40, maxH = tile - 100, s = Math.min(maxW / b.w, maxH / b.h), dw = b.w * s, dh = b.h * s, dx = c.x + (tile - dw) / 2, dy = c.y + 22 + (maxH - dh);
      ctx.fillStyle = "rgba(16,21,28,.35)"; ctx.beginPath(); ctx.ellipse(c.x + tile / 2, dy + dh + 3, dw * .36, 9, 0, 0, 6.2832); ctx.fill();
      ctx.drawImage(cb, b.x, b.y, b.w, b.h, dx, dy, dw, dh);
      const lab = "치비 (게임 속 모습)"; ctx.font = "800 20px " + FONT; const tw = Math.min(tile - 28, ctx.measureText(lab).width + 30), bh = 34, bx = c.x + 10, by = c.y + tile - bh - 10;
      rr(ctx, bx, by, tw, bh, 11); ctx.fillStyle = "rgba(11,14,29,.92)"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#8ab9ff"; ctx.stroke(); ctx.fillStyle = "#faf6ee"; ctx.textBaseline = "middle"; ctx.fillText(lab, bx + 15, by + bh / 2 + 1); ctx.textBaseline = "alphabetic"; }
    // 프로필
    { const c = cells[7]; rr(ctx, c.x, c.y, tile, tile, 14); ctx.fillStyle = "#12162b"; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#3b4685"; ctx.stroke();
      const rows = [["직업", spec.role], ["나이", spec.age + "세"], ["무기", spec.weapon], ["머리", spec.hair], ["눈", spec.eye], ["성격", (spec.keywords || []).join(" · ")]];
      let size = 21, lines;
      for (; size >= 15; size--) {   // 칸 안에 다 들어갈 때까지 글자를 줄임
        ctx.font = "700 " + size + "px " + FONT; lines = []; let h = 0;
        for (const [k2, v] of rows) { const w = wrap(ctx, v, tile - 36 - 62); lines.push([k2, w]); h += w.length * (size + 7) + 8; }
        if (h + 64 < tile) break;
      }
      ctx.fillStyle = "#f6c453"; ctx.font = "800 24px " + FONT; ctx.fillText("프로필", c.x + 18, c.y + 40);
      let yy = c.y + 76; ctx.font = "700 " + size + "px " + FONT;
      for (const [k2, w] of lines) { ctx.fillStyle = "#8d95c2"; ctx.fillText(k2, c.x + 18, yy); ctx.fillStyle = "#faf6ee"; for (const t of w) { ctx.fillText(t, c.x + 18 + 62, yy); yy += size + 7; } yy += 8; } }
    y += tile * 2 + gap + 18;
    // 바닥글
    ctx.fillStyle = "#8d95c2"; ctx.font = "600 17px " + FONT; ctx.fillText("라운드비 나이츠 · 기사단 캐릭터 시트 — 원작 그림은 AI로 만든 캐릭터입니다.", pad, H - 24);
    ctx.textAlign = "right"; ctx.fillText("ksinvaid.github.io/roundb-night-defense", W - pad, H - 24); ctx.textAlign = "left";
    // JPG: 한 장 400KB 이하가 되도록 품질을 낮춰 보고, 그래도 크면 크기를 줄인다
    let best = null;
    for (const sc of [1, .95, .9, .85, .8, .75]) {
      let src = cv;
      if (sc !== 1) { src = document.createElement("canvas"); src.width = Math.round(W * sc); src.height = Math.round(H * sc); const g = src.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(cv, 0, 0, src.width, src.height); }
      for (const q of [0.9, 0.86, 0.82, 0.78]) {
        const url = src.toDataURL("image/jpeg", q), bytes = Math.floor((url.length - 23) * 3 / 4);
        if (!best || bytes <= spec.maxBytes) best = {url, bytes, w: src.width, h: src.height, q, sc};
        if (bytes <= spec.maxBytes) break;
      }
      if (best.bytes <= spec.maxBytes) break;
    }
    cv.remove();
    return best;
  };
  window.__ready = true;
}

const PAGE = '<!doctype html><meta charset="utf-8"><title>sheets</title><body style="margin:0;background:#000"><script>(' + pageMain.toString() + ')()</script></body>';

/* ───────── 작은 정적 서버(읽기 전용: 원본 그림 폴더의 필요한 부분만) ───────── */
const ART_OK = /^\/art\/(원본\/03_3면도|원본\/04_표정시트|게임용\/투명_치비)\/[^/\\]+\.png$/;
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (u === "/__sheets.html") { rsp.writeHead(200, {"Content-Type": "text/html; charset=utf-8"}); rsp.end(PAGE); return; }
      const f = path.join(ART, u.replace(/^\/art\//, ""));
      if (!ART_OK.test(u) || !f.startsWith(ART) || !fs.existsSync(f)) { rsp.writeHead(404); rsp.end("no"); return; }
      rsp.writeHead(200, {"Content-Type": "image/png", "Cache-Control": "no-store"}); fs.createReadStream(f).pipe(rsp);
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
if (!fs.existsSync(path.join(ART, "원본", "03_3면도"))) { console.error("원본 그림 폴더를 찾지 못했어요: " + ART + "\n--art 로 라운드기사단 폴더를 알려 주세요."); process.exit(1); }
const chrome = findChrome();
if (!chrome) { console.error("크롬/엣지를 찾지 못했어요. CHROME_PATH 환경변수에 chrome.exe 위치를 적어 주세요."); process.exit(1); }

const {srv, port} = await serve();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "knsheet-"));
const dbg = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1700,1000",
  "--remote-debugging-port=" + dbg, "--user-data-dir=" + tmp, "http://127.0.0.1:" + port + "/__sheets.html"], {stdio: "ignore"});
let code = 0;
try {
  await waitJson("http://127.0.0.1:" + dbg + "/json/version");
  let tabs = []; for (let i = 0; i < 60 && !tabs.length; i++) { tabs = (await waitJson("http://127.0.0.1:" + dbg + "/json/list")).filter(t => t.type === "page" && /__sheets/.test(t.url)); if (!tabs.length) await sleep(150); }
  if (!tabs.length) throw new Error("페이지 탭을 못 찾았어요");
  const c = await cdp(tabs[0].webSocketDebuggerUrl);
  await c.send("Runtime.enable");
  for (let i = 0; i < 100; i++) { if (await evaluate(c, "window.__ready === true")) break; await sleep(100); if (i === 99) throw new Error("페이지가 준비되지 않았어요"); }
  fs.mkdirSync(OUT, {recursive: true});
  const enc = p => "/art/" + p.split("/").map(encodeURIComponent).join("/");
  const report = [];
  for (const k of list) {
    if (!k.sheet || !Array.isArray(k.sheet.faces) || k.sheet.faces.length !== 6) throw new Error(k.id + ": data.json 의 sheet.faces 가 6개가 아니에요");
    const spec = {id: k.id, no: k.no, name: k.name, en: k.en, role: k.role, age: k.age, weapon: k.weapon, hair: k.hair, eye: k.eye, keywords: k.keywords, line: k.line, faces: k.sheet.faces, crop: k.sheet.crop || {}, maxBytes: MAX_BYTES,
      urls: {view: enc("원본/03_3면도/" + k.name + ".png"), faces: enc("원본/04_표정시트/" + k.name + ".png"), chibi: enc("게임용/투명_치비/" + k.name + ".png")}};
    const r = await evaluate(c, "buildSheet(" + JSON.stringify(spec) + ")");
    const buf = Buffer.from(r.url.slice(r.url.indexOf(",") + 1), "base64");
    const file = path.join(OUT, "sheet_" + k.id + ".jpg");
    fs.writeFileSync(file, buf);
    if (COPY) { fs.mkdirSync(COPY, {recursive: true}); fs.writeFileSync(path.join(COPY, "캐릭터시트_" + k.name + ".jpg"), buf); }
    report.push(k.id + " " + k.name + " → " + path.relative(ROOT, file) + "  " + r.w + "x" + r.h + "  " + Math.round(buf.length / 1024) + "KB  (품질 " + r.q + ", 배율 " + r.sc + ")");
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
