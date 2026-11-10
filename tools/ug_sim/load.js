// index.html 에서 던전 엔진 부분(dgr + dgnMap + dgnCore + dgnBoss)만 뽑아 노드에서 실행하는 시험 틀
const vm = require("vm"), fs = require("fs"), path = require("path");
function mkRng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function boot(html, seed) {
  const L = fs.readFileSync(html, "utf8").split("\n");
  const a = L.findIndex(l => l.includes("===DGR_START==="));
  const b = L.findIndex(l => l.startsWith("const dgnR = (() => {"));
  const src = L.slice(a, b).join("\n");
  const M2 = Object.create(Math); M2.random = mkRng(seed || 1);
  const ctx = vm.createContext({console, Math: M2, Date, JSON, setTimeout, clearTimeout, structuredClone, performance: {now: () => Date.now()}}); ctx.window = ctx; ctx.globalThis = ctx; ctx.G = ctx;
  vm.runInContext(src + "\n;globalThis.__x = {dgnMap, dgnCore, dgnBoss, dgr: window.dgr};", ctx, {filename: "index.html:" + (a + 1)});
  return ctx.__x;
}
module.exports = {boot, mkRng};
