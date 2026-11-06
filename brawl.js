(() => {
  const lobby = window.lbDbg;
  const games = window.knx?.games;
  if (!lobby || !games) return;
  const floors = ["3f", "4f"];
  const duration = 180;
  const worldScale = 1.8;
  const strikeRange = 115;
  const dialog = document.createElement("section");
  dialog.className = "brawl";
  window.roundbArenaScreen(dialog);
  dialog.innerHTML = `
    <header><strong>라운드비 대난투</strong><span data-status></span>
      <button type="button" data-close>로비로</button></header>
    <div class="brawl-controls"><button type="button" data-room="solo">혼자 하기</button>
      <button type="button" data-room="host">방 만들기</button>
      <label class="arena-public"><input type="checkbox" data-public> 공개방</label>
      <input data-code maxlength="6" placeholder="초대 코드" aria-label="초대 코드">
      <button type="button" data-room="join">참가</button>
      <button type="button" data-room="start" hidden>온라인 시작</button></div>
    <p data-room-status role="status"></p>
    <canvas aria-label="라운드비 3층·4층 대난투 경기장"></canvas>
    <div class="brawl-skills" aria-label="기사 스킬">
      <button type="button" data-skill="0">1</button><button type="button" data-skill="1">2</button>
      <button type="button" data-skill="2">3</button><button type="button" data-skill="3">4</button>
    </div>
    <div class="brawl-controls">
      <button type="button" data-act="dash">돌진 · Shift</button>
      <button type="button" data-act="floor">층 이동 · E</button>
    </div>
    <p>WASD·방향키 또는 바닥 터치로 이동 · 기본공격 자동 · 스킬 1–4</p>
    <div class="brawl-result" hidden><strong data-result></strong><button type="button" data-restart>다시 하기</button></div>`;
  document.body.append(dialog);
  const canvas = dialog.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const status = dialog.querySelector("[data-status]");
  const result = dialog.querySelector(".brawl-result");
  const skillButtons = Array.from(dialog.querySelectorAll("[data-skill]"));
  const kits = Array.from({length:10}, (_, id) => ({
    basic:window.dgr.knight(id).basic,
    active:window.dgr.skillList(id).filter(skill => skill.type === "active").slice(0,4)
  }));
  const pressed = new Set();
  let fighters, player, destination, elapsed, frame, previous, lastStatus;
  let room, role = "", localSlot = 0, running = false, lastSend = 0, roundId, reward = "";
  const remote = new Map();
  const roomStatus = dialog.querySelector("[data-room-status]");
  const startButton = dialog.querySelector('[data-room="start"]');
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
    const point=lobby.cellXY(map,cell);
    return {x:point.x*worldScale,y:point.y*worldScale};
  }
  function passable(map,x,y) {
    return lobby.isFree(map,x/worldScale,y/worldScale);
  }
  function path(actor,x,y) {
    const route=lobby.findPath(floorOf(actor),actor.x/worldScale,actor.y/worldScale,x/worldScale,y/worldScale);
    return (route||[]).map(point=>({x:point.x*worldScale,y:point.y*worldScale}));
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
    roundId = crypto.randomUUID();
    reward = "";
    running = true;
    const selected = role ? 0 : Math.max(0, Math.min(9, Number(lobby.ME?.kn) || 0));
    fighters = pictures.map((image, id) => {
      const floor = floors[Math.floor(id / 5)];
      const point = spawn(floor, id % 5);
      return {id, image, name:KNIGHTS[id].n, floor, x:point.x, y:point.y,
        hp:260, cooldown:0, travel:0, flash:0, dash:0, route:[], repath:0,
        skills:[0,0,0,0], boost:0, shield:0, stun:0, kills:0, summon:null, orbit:null};
    });
    player = fighters[selected];
    for (const input of remote.values()) Object.assign(input,{x:0,y:0,attack:false,route:null});
    result.hidden = true;
    dialog.querySelector("[data-restart]").hidden = false;
    if (!dialog.open) dialog.showScreen();
    frame = requestAnimationFrame(tick);
  }
  function move(actor, x, y, speed, dt) {
    const dx = x - actor.x, dy = y - actor.y, distance = Math.hypot(dx, dy);
    if (distance < 2) return;
    const step = Math.min(distance, speed * dt);
    const map = floorOf(actor);
    const nextX = actor.x + dx / distance * step;
    const nextY = actor.y + dy / distance * step;
    if (passable(map,nextX,actor.y)) actor.x = nextX;
    if (passable(map,actor.x,nextY)) actor.y = nextY;
  }
  function attack(actor) {
    if (!actor.hp || actor.cooldown > 0) return;
    const basic = kits[actor.id].basic;
    const target = enemies(actor,basic.range || strikeRange)[0];
    if (!target) return;
    actor.cooldown = 1 / (basic.rate || 1.5);
    flash(actor,basic.range || strikeRange,"#ffd26c",target,basic.kind);
    damage(actor,target,Math.round(10*(basic.mul || 1)));
  }
  function enemies(actor,range) {
    const distance = other => Math.hypot(actor.x-other.x,actor.y-other.y);
    return fighters.filter(other => other !== actor && other.hp && other.floor === actor.floor &&
      distance(other)<=range && hasClearStrike(actor,other)).sort((a,b)=>distance(a)-distance(b));
  }
  function flash(actor,range,color,target,kind) {
    actor.flash = .3;
    actor.effect = {range,color,kind,x:target?.x,y:target?.y};
  }
  function damage(actor,target,amount) {
    const protection = target.shield > 0 ? .65 : 1;
    target.hp = Math.max(0,target.hp-Math.max(1,Math.round(amount*protection*(actor.boost>0?1.3:1))));
    if (!target.hp) {
      actor.kills++;
      target.place = fighters.filter(fighter=>fighter.hp>0).length+1;
    }
  }
  function cast(actor,slot) {
    const skill = kits[actor.id].active[slot];
    if (!skill || !actor.hp || actor.stun>0 || actor.skills[slot]>0) return;
    const effect = skill.effect;
    const range = effect.radius || effect.range || effect.dist || 145;
    const targets = enemies(actor,range);
    const support = ["buff","heal","summon","shield"].includes(effect.kind);
    if (!targets.length && !support && effect.kind!=="dash") return;
    actor.skills[slot] = Math.max(2,skill.cd*.58);
    if (effect.kind==="summon") {
      actor.summon={x:actor.x,y:actor.y,floor:actor.floor,life:Math.min(12,effect.dur||8),cooldown:0};
      flash(actor,range,effect.col || "#c8a4ff");
      return;
    }
    if (effect.kind==="orbit") {
      actor.orbit={life:Math.min(8,effect.dur||5),cooldown:0,range};
      flash(actor,range,effect.col || "#c8a4ff");
      return;
    }
    if (support) {
      if (effect.heal || effect.kind==="heal") actor.hp=Math.min(260,actor.hp+24);
      actor.shield = effect.shield || effect.kind==="shield" ? 4 : actor.shield;
      actor.boost = 5;
    }
    if (effect.kind==="dash") actor.dash=1.5;
    const area = ["aoe","zone","cone","beam"].includes(effect.kind);
    const aim = targets[0] && Math.atan2(targets[0].y-actor.y,targets[0].x-actor.x);
    const directional = effect.kind==="cone" || effect.kind==="beam";
    flash(actor,range,effect.col || "#c8a4ff",area ? null : targets[0]);
    for (const target of area?targets:targets.slice(0,1)) {
      const angle = Math.atan2(target.y-actor.y,target.x-actor.x)-aim;
      if (directional && Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))>(effect.kind==="beam"?.19:(effect.angle||100)*Math.PI/360)) continue;
      if (!support || effect.kind==="summon") damage(actor,target,Math.min(45,Math.round(9*(effect.mul || effect.atkMul || 1.4))));
      if (effect.stun) target.stun=Math.min(1.2,effect.stun);
    }
  }
  function updateEffects(actor,dt) {
    const summon=actor.summon;
    if (summon) {
      summon.life-=dt;
      summon.cooldown-=dt;
      if (summon.life<=0) actor.summon=null;
      else if (summon.cooldown<=0) {
        const source={...summon,id:actor.id};
        const target=enemies(source,195)[0];
        if (target) { damage(actor,target,10); summon.cooldown=.65; }
      }
    }
    const orbit=actor.orbit;
    if (orbit) {
      orbit.life-=dt;
      orbit.cooldown-=dt;
      if (orbit.life<=0) actor.orbit=null;
      else if (orbit.cooldown<=0) {
        for (const target of enemies(actor,orbit.range)) damage(actor,target,7);
        orbit.cooldown=.65;
      }
    }
  }
  function hasClearStrike(actor,other) {
    const map = floorOf(actor);
    const steps = Math.ceil(Math.hypot(actor.x-other.x,actor.y-other.y)/4);
    for (let step=1; step<steps; step++) {
      const t = step/steps;
      if (!passable(map,actor.x+(other.x-actor.x)*t,actor.y+(other.y-actor.y)*t)) return false;
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
    if (role === "guest") { room?.input({action}); return; }
    if (result.hidden && player?.hp) {
      if (action === "attack") attack(player);
      if (action === "floor") switchFloor(player);
      if (action === "dash" && player.dash <= 0) player.dash = 1.5;
      if (action.startsWith("skill")) cast(player,Number(action.slice(5)));
    }
  }
  function direction() {
    return {
      x:Number(pressed.has("d") || pressed.has("arrowright"))-Number(pressed.has("a") || pressed.has("arrowleft")),
      y:Number(pressed.has("s") || pressed.has("arrowdown"))-Number(pressed.has("w") || pressed.has("arrowup")),
      attack:pressed.has(" ")
    };
  }
  function update(dt) {
    for (const actor of fighters) {
      if (!actor.hp) continue;
      actor.cooldown -= dt;
      actor.travel -= dt;
      actor.flash -= dt;
      actor.dash -= dt;
      actor.boost -= dt;
      actor.shield -= dt;
      actor.stun -= dt;
      actor.skills = actor.skills.map(cd=>Math.max(0,cd-dt));
      updateEffects(actor,dt);
      if (actor.stun>0) continue;
      attack(actor);
      if (actor === player || remote.has(actor.id)) {
        const input = actor === player ? direction() : remote.get(actor.id);
        const {x:dx,y:dy} = input;
        const speed = actor.dash > 1.25 ? 750 : 330;
        if (dx || dy) {
          if (actor === player) destination = null;
          else input.route = null;
          move(actor, actor.x + dx * 100, actor.y + dy * 100, speed, dt);
        } else {
          const route = actor === player ? destination : input.route;
          if (route) follow(actor,route,speed,dt);
        }
        if (input.attack) attack(actor);
        continue;
      }
      const targets = fighters.filter(other => other !== actor && other.hp && other.floor === actor.floor);
      const distance = other => Math.hypot(actor.x - other.x, actor.y - other.y);
      const target = targets.reduce((best, other) => !best || distance(other) < distance(best) ? other : best, null);
      if (!target) { switchFloor(actor); continue; }
      actor.repath -= dt;
      if (actor.repath <= 0) {
        actor.route = path(actor,target.x,target.y);
        actor.repath = .38 + actor.id * .025;
      }
      if (elapsed > 1.2 && distance(target) < 215) {
        const slot = actor.skills.findIndex(cd=>cd<=0);
        if (slot>=0) cast(actor,slot);
      }
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
    const wide = width>=700;
    const visibleFloors = wide ? floors : [player.floor];
    const paneWidth = width/visibleFloors.length;
    canvas.brawlViews = visibleFloors.map((floor,i)=>drawFloor(floor,paneWidth,height,i*paneWidth));
  }
  function drawFloor(floor,width,height,offset) {
    const map = lobby.FL[floor];
    const scale = Math.min((width-8) / map.vw, (height-22) / map.vh);
    const left = offset+(width-map.vw*scale)/2, top = (height-map.vh*scale)/2;
    const background = lobby.BG[floor];
    if (background) ctx.drawImage(background, left, top, map.vw * scale, map.vh * scale);
    ctx.fillStyle="#fff";
    ctx.font="bold 13px system-ui";
    ctx.textAlign="left";
    ctx.fillText(floor.toUpperCase(),left+8,top+16);
    for (const {summon} of fighters) {
      if (!summon || summon.floor!==floor) continue;
      ctx.fillStyle="#aabaff";
      ctx.fillRect(left+(summon.x/worldScale-map.view[0])*scale-7,top+(summon.y/worldScale-map.view[1])*scale-7,14,14);
    }
    for (const actor of fighters.filter(a => a.hp && a.floor === floor).sort((a,b) => a.y-b.y)) {
      const x = left + (actor.x/worldScale-map.view[0])*scale, y = top + (actor.y/worldScale-map.view[1])*scale;
      const size = Math.max(28, 100 * scale);
      if (actor.orbit) {
        ctx.strokeStyle="#c7a6ff"; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(x,y,actor.orbit.range*scale/worldScale,0,Math.PI*2); ctx.stroke();
      }
      const effect = actor.effect;
      const dx = effect?.x == null ? 1 : effect.x - actor.x;
      const dy = effect?.y == null ? 0 : effect.y - actor.y;
      const facing = Math.atan2(dy, dx);
      const attack = Math.min(1, actor.flash * 5);
      if (actor.image.complete && actor.image.naturalWidth) {
        const w = size * actor.image.naturalWidth / actor.image.naturalHeight;
        ctx.save();
        ctx.translate(x + Math.cos(facing) * attack * 9, y + Math.sin(facing) * attack * 9);
        ctx.rotate(Math.cos(facing) * attack * .22);
        ctx.drawImage(actor.image, -w/2, -size, w, size);
        ctx.restore();
      }
      if (attack > 0) {
        const reach = effect?.x == null ? size : Math.max(size * .7, Math.hypot(dx, dy) * scale / worldScale);
        ctx.save();
        ctx.translate(x, y - size * .42);
        ctx.rotate(facing);
        ctx.globalAlpha = attack;
        ctx.strokeStyle = effect?.color || "#fff087";
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 14;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(reach * .25, -size * .35);
        if (effect?.kind === "proj") {
          ctx.moveTo(reach * (1 - attack), 0);
          ctx.lineTo(reach, 0);
        } else {
          ctx.quadraticCurveTo(reach * .82, -size * .48, reach, size * .15);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = ctx.strokeStyle;
        for (let i = 0; i < 5; i++) {
          ctx.fillRect(reach * (.7 + i * .09) + (1 - attack) * 18, (i - 2) * 6, 3, 2);
        }
        ctx.restore();
      }
      ctx.fillStyle = "#20213a";
      ctx.fillRect(x-18, y+2, 36, 5);
      ctx.fillStyle = actor === player ? "#ffe06b" : "#e85c76";
      ctx.fillRect(x-18, y+2, 36 * actor.hp / 260, 5);
      ctx.font = "bold 11px system-ui";
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#191a2b";
      ctx.strokeText(actor === player ? "나 · "+actor.name : actor.name, x, y+19);
      ctx.fillStyle = "#fff";
      ctx.fillText(actor === player ? "나 · "+actor.name : actor.name, x, y+19);
    }
    return {floor,scale,left,top,width:map.vw*scale,height:map.vh*scale};
  }
  function tick(now) {
    const dt = Math.min(.05, (now-previous)/1000);
    previous = now;
    elapsed += dt;
    update(dt);
    draw();
    const alive = fighters.filter(actor => actor.hp);
    const text = hud(player,alive.length);
    if (text !== lastStatus) { status.textContent = text; lastStatus = text; }
    const done = alive.length <= 1 || elapsed >= duration;
    if (role === "host" && (done || now-lastSend >= 70)) {
      lastSend = now;
      room.publish({roundId,elapsed,done,humans:remote.size+1,fighters:fighters.map(({x,y,hp,floor,flash,effect,skills,kills,summon,orbit,place})=>({x,y,hp,floor,flash,effect,skills,kills,summon,orbit,place}))});
    }
    if (done) {
      running = false;
      showResult(alive,remote.size+1);
      return;
    }
    frame = requestAnimationFrame(tick);
  }
  function hud(actor, alive) {
    skillButtons.forEach((button,i) => {
      const skill = kits[actor.id].active[i];
      const cooldown = Math.ceil(actor.skills[i]);
      const label = `${i+1} · ${skill.n}${cooldown ? " ("+cooldown+"초)" : ""}`;
      if (button.textContent !== label) button.textContent=label;
      button.disabled=!actor.hp || cooldown>0;
    });
    return `${actor.floor.toUpperCase()} · 체력 ${actor.hp} · 생존 ${alive}/10 · ${Math.max(0,Math.ceil(duration-elapsed))}초`;
  }
  function showResult(alive,humans) {
      const best = Math.max(...alive.map(actor => actor.hp));
      const winners = alive.filter(actor => actor.hp === best);
      const win = winners.length===1 && winners[0]===player;
      if (!reward) {
        const place = player.hp ? 1+alive.filter(actor=>actor.hp>player.hp).length : player.place;
        const info={mode:role?"multi":"solo",win,place,players:10,humans,online:humans>1,score:player.kills*120,secs:elapsed};
        const rp = window.knx.reward.grant("brawl",{...info,once:"brawl:"+roundId}).rp;
        window.knx.bus.emit("game:end",{id:"brawl",result:{...info,rp}});
        reward = " · +" + rp + " RP";
      }
      result.querySelector("[data-result]").textContent = (!player.hp ? "탈락! 다시 도전해 보세요." :
        winners.length > 1 ? "시간 종료 · 공동 1위" :
        win ? "승리! 대난투의 최강 기사" : `시간 종료 · ${winners[0]?.name || "생존자 없음"}`) + reward;
      result.hidden = false;
  }
  function lobbyMenu() {
    if (!dialog.open) dialog.showScreen();
    roomStatus.textContent = "혼자 시작하거나 초대 코드로 함께 플레이하세요.";
  }
  function disconnect() {
    room?.close(); room = null; role = ""; running = false;
    remote.clear(); cancelAnimationFrame(frame); pressed.clear(); player = null;
    result.hidden = true;
    startButton.hidden = true;
  }
  function connect(nextRole) {
    disconnect();
    role = nextRole;
    roomStatus.textContent = "연결 중…";
    room = createArenaRoom("brawl",{
      error(message) { disconnect(); roomStatus.textContent = message; },
      ready(slot,code) {
        localSlot = slot;
        roomStatus.textContent = slot ? "방장이 시작하기를 기다리는 중" : "초대 코드 " + code;
        startButton.hidden = slot !== 0;
      },
      accept: () => !running,
      join(slot) { remote.set(slot,{x:0,y:0,attack:false,route:null}); },
      leave(slot) { remote.delete(slot); },
      input(slot,message) {
        const input = remote.get(slot), actor = fighters?.[slot];
        if (!input || !message || !running || !actor?.hp) return;
        if (message.action === "attack") attack(actor);
        if (message.action === "floor") { switchFloor(actor); input.route = null; }
        if (message.action === "dash" && actor.dash <= 0) actor.dash = 1.5;
        if (typeof message.action==="string" && /^skill[0-3]$/.test(message.action)) cast(actor,Number(message.action.slice(5)));
        if (Number.isFinite(message.tx) && Number.isFinite(message.ty)) input.route = path(actor,message.tx,message.ty);
        if ([-1,0,1].includes(message.x) && [-1,0,1].includes(message.y)) Object.assign(input,{x:message.x,y:message.y,attack:message.attack === true});
      },
      state(snapshot) {
        if (!Array.isArray(snapshot?.fighters) || snapshot.fighters.length !== 10) return;
        fighters = snapshot.fighters.map((actor,id)=>({...actor,id,image:pictures[id],name:KNIGHTS[id].n}));
        player = fighters[localSlot];
        elapsed = snapshot.elapsed;
        if (roundId!==snapshot.roundId) { roundId=snapshot.roundId; reward=""; }
        running = !snapshot.done;
        const alive = fighters.filter(actor=>actor.hp);
        status.textContent = hud(player,alive.length);
        draw();
        result.hidden = !snapshot.done;
        if (snapshot.done) showResult(alive,snapshot.humans);
        dialog.querySelector("[data-restart]").hidden = true;
      }
    });
    if (role === "host") room.host({listed: dialog.querySelector("[data-public]").checked});
    else room.join(dialog.querySelector("[data-code]").value);
  }
  canvas.addEventListener("pointerdown", event => {
    if (!running || !result.hidden || !canvas.brawlViews) return;
    const box = canvas.getBoundingClientRect(), map = floorOf(player);
    const view=canvas.brawlViews.find(v=>v.floor===player.floor);
    if (!view || event.clientX-box.left<view.left || event.clientX-box.left>view.left+view.width) return;
    const {scale,left,top} = view;
    const x = ((event.clientX-box.left-left)/scale + map.view[0])*worldScale;
    const y = ((event.clientY-box.top-top)/scale + map.view[1])*worldScale;
    if (role === "guest") room?.input({tx:x,ty:y});
    else destination = path(player,x,y);
  });
  const keys = new Set(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright","shift","e","1","2","3","4"]);
  window.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();
    if (!dialog.open || !running || !keys.has(key) || event.target.matches?.("input")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    pressed.add(key);
    if (role === "guest") room?.input(direction());
    if (!event.repeat && key === "shift") control("dash");
    if (!event.repeat && key === "e") control("floor");
    if (!event.repeat && /^[1-4]$/.test(key)) control("skill"+(Number(key)-1));
  }, true);
  window.addEventListener("keyup", event => {
    if (pressed.delete(event.key.toLowerCase()) && role === "guest") room?.input(direction());
  }, true);
  window.addEventListener("blur", () => { pressed.clear(); if (role === "guest") room?.input(direction()); });
  window.roundbRooms?.register("brawl", code => { dialog.showScreen(); dialog.querySelector("[data-code]").value = code; connect("guest"); });
  dialog.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-close")) dialog.close();
    if (button.hasAttribute("data-restart")) start();
    if (button.dataset.act) control(button.dataset.act);
    if (button.dataset.skill!=null) control("skill"+button.dataset.skill);
    if (button.dataset.room === "solo") { disconnect(); roomStatus.textContent = "혼자 하기 · AI 기사 9명"; start(); }
    if (button.dataset.room === "host") connect("host");
    if (button.dataset.room === "join") connect("guest");
    if (button.dataset.room === "start" && role === "host") start();
  });
  dialog.addEventListener("close", disconnect);
  games.register({id:"brawl", name:"대난투", tag:"라운드비 3·4층에서 기사 10명 배틀", kind:"main", open:lobbyMenu});
  document.querySelector("[data-open-brawl]").addEventListener("click", () => games.open("brawl"));
})();
