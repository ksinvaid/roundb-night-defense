(() => {
  const lobby = window.lbDbg;
  const games = window.knx?.games;
  if (!lobby || !games) return;
  const floors = ["3f", "4f"];
  const duration = 90;
  const strikeRange = 115;
  const dialog = document.createElement("dialog");
  dialog.className = "brawl";
  dialog.innerHTML = `
    <header><strong>라운드비 대난투</strong><span data-status></span>
      <button type="button" data-close>로비로</button></header>
    <canvas aria-label="라운드비 3층·4층 대난투 경기장"></canvas>
    <div class="brawl-controls">
      <button type="button" data-act="attack">공격 · Space</button>
      <button type="button" data-act="dash">돌진 · Shift</button>
      <button type="button" data-act="floor">층 이동 · E</button>
    </div>
    <p>WASD·방향키 또는 바닥 터치로 이동. 마지막까지 살아남으세요.</p>
    <div class="brawl-result" hidden><strong data-result></strong><button type="button" data-restart>다시 하기</button></div>`;
  document.body.append(dialog);
  const canvas = dialog.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const status = dialog.querySelector("[data-status]");
  const result = dialog.querySelector(".brawl-result");
  const pressed = new Set();
  let fighters, player, destination, elapsed, frame, previous, lastStatus;
  const pictures = Array.from({length:10}, (_, id) => {
    const image = new Image();
    image.src = kSrc(id, false);
    return image;
  });
  const floorOf = actor => lobby.FL[actor.floor];
  function spawn(floor, index) {
    const map = lobby.FL[floor];
    const x = map.view[0] + map.vw * (.29 + (index % 2) * .38);
    const y = map.view[1] + map.vh * (.22 + Math.floor(index / 2) * .27);
    const cell = lobby.nearestFree(map, x, y, Math.max(map.cols,map.rows));
    return lobby.cellXY(map,cell);
  }
  function start() {
    lobby.init();
    if (!lobby.FL["3f"] || !lobby.FL["4f"]) return;
    cancelAnimationFrame(frame);
    pressed.clear();
    destination = null;
    elapsed = 0;
    previous = performance.now();
    lastStatus = "";
    const selected = Math.max(0, Math.min(9, Number(lobby.ME?.kn) || 0));
    fighters = pictures.map((image, id) => {
      const floor = floors[Math.floor(id / 5)];
      const point = spawn(floor, id % 5);
      return {id, image, name:KNIGHTS[id].n, floor, x:point.x, y:point.y,
        hp:100, cooldown:0, travel:0, flash:0, dash:0, route:[], repath:0};
    });
    player = fighters[selected];
    result.hidden = true;
    if (!dialog.open) dialog.showModal();
    frame = requestAnimationFrame(tick);
  }
  function move(actor, x, y, speed, dt) {
    const dx = x - actor.x, dy = y - actor.y, distance = Math.hypot(dx, dy);
    if (distance < 2) return;
    const step = Math.min(distance, speed * dt);
    const map = floorOf(actor);
    const nextX = actor.x + dx / distance * step;
    const nextY = actor.y + dy / distance * step;
    if (lobby.isFree(map, nextX, actor.y)) actor.x = nextX;
    if (lobby.isFree(map, actor.x, nextY)) actor.y = nextY;
  }
  function attack(actor) {
    if (!actor.hp || actor.cooldown > 0) return;
    actor.cooldown = actor === player ? .42 : .68;
    actor.flash = .18;
    for (const other of fighters) {
      if (other === actor || !other.hp || actor.floor !== other.floor) continue;
      if (Math.hypot(actor.x - other.x, actor.y - other.y) <= strikeRange &&
          hasClearStrike(actor,other)) {
        other.hp = Math.max(0, other.hp - (actor === player ? 22 : 12));
      }
    }
  }
  function hasClearStrike(actor,other) {
    const map = floorOf(actor);
    const steps = Math.ceil(Math.hypot(actor.x-other.x,actor.y-other.y)/4);
    for (let step=1; step<steps; step++) {
      const t = step/steps;
      if (!lobby.isFree(map,actor.x+(other.x-actor.x)*t,actor.y+(other.y-actor.y)*t)) return false;
    }
    return true;
  }
  function switchFloor(actor) {
    if (!actor.hp || actor.travel > 0) return;
    actor.floor = actor.floor === "3f" ? "4f" : "3f";
    Object.assign(actor, spawn(actor.floor, 2));
    actor.travel = 2;
    actor.route = [];
    if (actor === player) destination = null;
  }
  function control(action) {
    if (result.hidden && player?.hp) {
      if (action === "attack") attack(player);
      if (action === "floor") switchFloor(player);
      if (action === "dash" && player.dash <= 0) player.dash = 1.5;
    }
  }
  function update(dt) {
    for (const actor of fighters) {
      if (!actor.hp) continue;
      actor.cooldown -= dt;
      actor.travel -= dt;
      actor.flash -= dt;
      actor.dash -= dt;
      if (actor === player) {
        const dx = Number(pressed.has("d") || pressed.has("arrowright")) - Number(pressed.has("a") || pressed.has("arrowleft"));
        const dy = Number(pressed.has("s") || pressed.has("arrowdown")) - Number(pressed.has("w") || pressed.has("arrowup"));
        const speed = actor.dash > 1.25 ? 750 : 330;
        if (dx || dy) {
          destination = null;
          move(actor, actor.x + dx * 100, actor.y + dy * 100, speed, dt);
        } else if (destination) {
          follow(actor, destination, speed, dt);
        }
        if (pressed.has(" ")) attack(actor);
        continue;
      }
      const targets = fighters.filter(other => other !== actor && other.hp && other.floor === actor.floor);
      const distance = other => Math.hypot(actor.x - other.x, actor.y - other.y);
      const target = targets.reduce((best, other) => !best || distance(other) < distance(best) ? other : best, null);
      if (!target) { switchFloor(actor); continue; }
      actor.repath -= dt;
      if (actor.repath <= 0) {
        actor.route = lobby.findPath(floorOf(actor), actor.x, actor.y, target.x, target.y) || [];
        actor.repath = .38 + actor.id * .025;
      }
      if (distance(target) < strikeRange * .85) attack(actor);
      follow(actor, actor.route, 210 + actor.id * 5, dt);
    }
  }
  function follow(actor, route, speed, dt) {
    const point = route[0];
    if (!point) return;
    if (Math.hypot(actor.x - point.x, actor.y - point.y) < 12) route.shift();
    else move(actor, point.x, point.y, speed, dt);
  }
  function draw() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const map = floorOf(player);
    const scale = Math.min(width / map.vw, height / map.vh);
    const left = (width - map.vw * scale) / 2, top = (height - map.vh * scale) / 2;
    canvas.brawlView = {scale, left, top};
    const background = lobby.BG[player.floor];
    if (background) ctx.drawImage(background, left, top, map.vw * scale, map.vh * scale);
    for (const actor of fighters.filter(a => a.hp && a.floor === player.floor).sort((a,b) => a.y-b.y)) {
      const x = left + (actor.x - map.view[0]) * scale, y = top + (actor.y - map.view[1]) * scale;
      const size = Math.max(28, 100 * scale);
      if (actor.flash > 0) {
        ctx.strokeStyle = actor === player ? "#fff087" : "#e55766";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, strikeRange * scale, 0, Math.PI * 2); ctx.stroke();
      }
      if (actor.image.complete && actor.image.naturalWidth) {
        const w = size * actor.image.naturalWidth / actor.image.naturalHeight;
        ctx.drawImage(actor.image, x-w/2, y-size, w, size);
      }
      ctx.fillStyle = "#20213a";
      ctx.fillRect(x-18, y+2, 36, 5);
      ctx.fillStyle = actor === player ? "#ffe06b" : "#e85c76";
      ctx.fillRect(x-18, y+2, 36 * actor.hp / 100, 5);
      ctx.font = "bold 11px system-ui";
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#191a2b";
      ctx.strokeText(actor === player ? "나 · "+actor.name : actor.name, x, y+19);
      ctx.fillStyle = "#fff";
      ctx.fillText(actor === player ? "나 · "+actor.name : actor.name, x, y+19);
    }
  }
  function tick(now) {
    const dt = Math.min(.05, (now-previous)/1000);
    previous = now;
    elapsed += dt;
    update(dt);
    draw();
    const alive = fighters.filter(actor => actor.hp);
    const text = `${player.floor.toUpperCase()} · 체력 ${player.hp} · 생존 ${alive.length}/10 · ${Math.max(0,Math.ceil(duration-elapsed))}초`;
    if (text !== lastStatus) { status.textContent = text; lastStatus = text; }
    if (!player.hp || alive.length === 1 || elapsed >= duration) {
      const best = Math.max(...alive.map(actor => actor.hp));
      const winners = alive.filter(actor => actor.hp === best);
      result.querySelector("[data-result]").textContent = !player.hp ? "탈락! 다시 도전해 보세요." :
        winners.length > 1 ? "시간 종료 · 공동 1위" :
        winners[0] === player ? "승리! 대난투의 최강 기사" : `시간 종료 · ${winners[0].name} 승리`;
      result.hidden = false;
      return;
    }
    frame = requestAnimationFrame(tick);
  }
  canvas.addEventListener("pointerdown", event => {
    if (!result.hidden || !canvas.brawlView) return;
    const box = canvas.getBoundingClientRect(), map = floorOf(player);
    const {scale,left,top} = canvas.brawlView;
    const x = (event.clientX-box.left-left)/scale + map.view[0];
    const y = (event.clientY-box.top-top)/scale + map.view[1];
    destination = lobby.findPath(map, player.x, player.y, x, y) || [];
  });
  const keys = new Set(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"," ","shift","e"]);
  window.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();
    if (!dialog.open || !keys.has(key) || (key === " " && event.target.matches?.("button") && !event.target.hasAttribute("data-close"))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    pressed.add(key);
    if (!event.repeat && key === "shift") control("dash");
    if (!event.repeat && key === "e") control("floor");
  }, true);
  window.addEventListener("keyup", event => pressed.delete(event.key.toLowerCase()), true);
  window.addEventListener("blur", () => pressed.clear());
  dialog.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-close")) dialog.close();
    if (button.hasAttribute("data-restart")) start();
    if (button.dataset.act) control(button.dataset.act);
  });
  dialog.addEventListener("close", () => { cancelAnimationFrame(frame); pressed.clear(); });
  games.register({id:"brawl", name:"대난투", tag:"라운드비 3·4층에서 기사 10명 배틀", kind:"main", open:start});
  document.querySelector("[data-open-brawl]").addEventListener("click", () => games.open("brawl"));
})();
