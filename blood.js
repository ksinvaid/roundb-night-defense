(() => {
  const games = window.knx?.games;
  if (!games) return;
  const W = 3500, H = 2400, hourLimit = 600, eliminationLimit = 3600, baseHP = 1400, cap = 32;
  const species = [
    ["보병",0,42,7,90,115,"◆"], ["크롤러",8,50,8,75,135,"✦"],
    ["저격수",20,55,12,165,120,"▲"], ["블롭",38,78,13,100,112,"●"],
    ["중장갑병",65,108,16,130,104,"■"], ["브루트",100,145,20,95,111,"⬟"],
    ["공성 전차",150,165,25,175,94,"▣"], ["돌연변이",220,205,30,125,116,"✷"]
  ];
  const colors = ["#fbc95b","#84c8ff","#ff8293","#a4e585","#c6a5ff","#ffb58c","#8ef1df","#ffc3ef","#d1e079","#bccaff"];
  const bases = Array.from({length:10}, (_,i) => ({
    x:320+(i%5)*715, y:i<5?210:H-210
  }));
  const dialog = document.createElement("section");
  dialog.className = "brawl blood";
  window.roundbArenaScreen(dialog);
  dialog.innerHTML = `
    <header><strong>진화 블러드</strong><span data-hud></span><button type="button" data-exit>로비로</button></header>
    <div class="brawl-controls">
      <select data-rule aria-label="경기 방식"><option value="elim">본진 섬멸전</option><option value="hour">무한 생산 · 10분</option></select>
      <button type="button" data-play>경기 시작 · AI전</button><button type="button" data-host>방 만들기</button>
      <label class="arena-public"><input type="checkbox" data-public> 공개방</label>
      <input data-code maxlength="6" placeholder="초대 코드" aria-label="초대 코드">
      <button type="button" data-join>참가</button><button type="button" data-start hidden>온라인 경기 시작</button>
    </div>
    <p data-message role="status">처치 수가 오르면 다음 유닛이 생산됩니다.</p>
    <p class="arena-combat blood-live" data-live role="status" hidden></p>
    <canvas aria-label="진화 블러드 전장"></canvas>
    <div class="brawl-controls arena-combat"><button type="button" data-command="drone">드론 이동</button>
      <button type="button" data-command="attack">공격 이동</button><button type="button" data-command="move">이동</button></div>
    <section class="blood-command arena-combat" aria-label="병력 지휘소"><strong>병력 지휘소</strong><button type="button" data-home>본진 복귀 · B</button>
      <div class="blood-targets">${bases.map((_,i)=>`<button type="button" data-target="${i}">${i+1}번</button>`).join("")}</div>
      <div class="blood-officer"><img alt="" src="${kSrc(4,false)}"><span>지휘관 대기 중</span></div>
    </section>
    <p>WASD 드론 이동 · 화면 가장자리 / 방향키로 시점 이동 · 유닛 드래그 선택 · 우클릭 이동 / 공격 이동 · 지휘소에서 본진을 고르면 지휘관이 일반 병력을 보냅니다.</p>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const canvas = $("canvas"), ctx = canvas.getContext("2d");
  const images = Array.from({length:10},(_,i)=>{const img=new Image();img.src=kSrc(i,false);return img;});
  const art = ["humanoid","bug","drone","blob","golem","jaws","crane","bird","skull"].map((shape,i)=>{
    const image=new Image();
    if(window.dgr?.mobDataURL)image.src=window.dgr.mobDataURL({shape,c:colors[i],c2:"#3a263f",elite:i===8},80);
    return image;
  });
  const camera={x:0,y:0}, cameraKeys=new Set(), droneKeys=new Set();
  const movementKeys={KeyW:"w",KeyA:"a",KeyS:"s",KeyD:"d"};
  let edge, cameraTime=0;
  const range = (n,min,max) => Math.min(max,Math.max(min,n));
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const heroEvery = 30;
  const names = new Map();
  function myName() {
    let nick;
    try { nick=typeof window.knx.me==="function"?window.knx.me()?.nick:window.knx.me?.nick; } catch {}
    return String(nick||(typeof SAVE!=="undefined"&&SAVE.nick)||"기사").slice(0,18);
  }
  const playerName = id => names.get(id) || (id === slot ? myName() : "AI " + (id+1));
  const selected = new Set();
  let state, room, role="", slot=0, frame, previous, lastPublish, command="drone", drag, view;
  const humans = new Set();
  const preview = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#22384c"/><path d="M0 ${H/2}H${W}" stroke="#87a6be" stroke-width="12" stroke-dasharray="45 40"/>${bases.map((base,id)=>`<circle cx="${base.x}" cy="${base.y}" r="88" fill="${colors[id]}"/><text x="${base.x}" y="${base.y+25}" text-anchor="middle" fill="#17223a" font-size="70" font-family="sans-serif">${id+1}</text>`).join("")}</svg>`);
  const briefing=roundbArenaBriefing(dialog,{
    accent:"#9edfd3",category:"전략전 · 10개 본진",title:"진화 블러드",
    summary:"드론이 병력을 생산하고 처치 수에 따라 새 병종을 해금합니다. 지휘관은 전장 밖에서 일반 병력에 진격 명령을 내립니다.",
    map:"10개 본진 배치",preview,
    rules:[["지휘","지휘소에서 적 본진을 선택해 일반 병력을 보냅니다"],["정밀 조작","드래그로 유닛을 선택하고 우클릭으로 공격 이동"],["승리","본진 섬멸전 또는 10분 무한 생산"]],
    start:()=>{disconnect();begin();}
  });
  briefing.briefing.querySelector(".arena-launch").textContent="경기 시작 · AI전";
  function level(kills) {
    let rank=0;
    while(rank+1<species.length&&kills>=species[rank+1][1])rank++;
    return rank;
  }
  function showStarted() {
    const live=$("[data-live]");
    live.textContent="경기 시작! · WASD 드론 이동 · 방향키 시점 이동";
    live.hidden=false;
    $("[data-message]").textContent="교전 중 · 병력이 자동으로 생산됩니다.";
    $("[data-play]").hidden=true;
    $("[data-start]").hidden=true;
  }
  function stopWithError(error) {
    console.error("Blood match",error);
    disconnect();
    $("[data-message]").textContent="경기를 진행할 수 없어요. 경기 시작 버튼으로 다시 시도해 주세요.";
  }
  function unitFor(owner,id,hero=false) {
    const stats=hero?["영웅",0,310,36,155,145,"★"]:species[level(owner.kills)];
    const origin=hero?bases[owner.id]:owner;
    return {id,owner:owner.id,x:origin.x+(id%5-2)*11,y:origin.y+24,
      hp:stats[2],max:stats[2],damage:stats[3],reach:stats[4],speed:stats[5],shape:stats[6],hero,cd:0,order:null};
  }
  function begin() {
    if (role==="guest") return;
    briefing.play();
    showStarted();
    cancelAnimationFrame(frame);
    state={time:0,rule:$("[data-rule]").value,online:role==="host",done:false,nextId:0,units:[],
      players:bases.map((base,id)=>({id,...base,kills:0,hp:baseHP,respawn:0,spawn:0,nextHero:heroEvery,order:null,pad:-1}))};
    Object.assign(camera,bases[slot]); cameraTime=0;
    selected.clear(); command="drone"; drag=null;
    previous=performance.now(); lastPublish=0;
    runFrame(()=>tick(previous));
  }
  function alive(p) { return state.rule==="hour" || p.hp>0; }
  function walk(object,to,speed,dt) {
    const d=distance(object,to);
    if (d<1) return true;
    const step=Math.min(d,speed*dt);
    object.x+=(to.x-object.x)*step/d; object.y+=(to.y-object.y)*step/d;
    return step===d;
  }
  function formation(point,id,kind) {
    return {x:point.x+(id%7-3)*19,y:point.y+(Math.floor(id/7)%5-2)*18,kind};
  }
  function orderArmy(owner,target,kind="attack") {
    for (const unit of state.units) {
      if (unit.owner===owner.id && !unit.hero) unit.order=formation(target,unit.id,kind);
    }
    owner.rally={...target,kind};
  }
  function issue(id,message) {
    if (!message) return;
    if (message.kind === "identity") {
      if (typeof message.name === "string") names.set(id,message.name.trim().slice(0,18)||"기사");
      return;
    }
    if (!state || state.done) return;
    const owner=state.players[id];
    if (!alive(owner)) return;
    if(message.kind==="steer"){
      owner.steer={x:Math.sign(Number(message.x)||0),y:Math.sign(Number(message.y)||0)};
      if(owner.steer.x||owner.steer.y)owner.order=null;
      return;
    }
    if (message.kind === "home") {
      orderArmy(owner,bases[id],"move");
      return;
    }
    if (message.kind === "army") {
      if (Number.isInteger(message.target) && bases[message.target] && message.target !== id) orderArmy(owner,bases[message.target]);
      return;
    }
    if (!Number.isFinite(message.x) || !Number.isFinite(message.y)) return;
    const point={x:range(message.x,20,W-20),y:range(message.y,20,H-20)};
    if (message.kind==="drone") { owner.steer=null; owner.order=point; return; }
    if (!["attack","move"].includes(message.kind) || !Array.isArray(message.ids)) return;
    const ids=new Set(message.ids.slice(0,45));
    for (const unit of state.units) {
      if (unit.owner===id && ids.has(unit.id)) unit.order={...point,kind:message.kind};
    }
  }
  function send(point, kind=command) {
    const input={...point,kind,ids:[...selected]};
    if (role==="guest") room.input(input);
    else issue(slot,input);
  }
  function updatePlayers(dt) {
    for (const p of state.players) {
      if (!alive(p)) {
        if (state.online && p.respawn && state.time>=p.respawn) {
          Object.assign(p,bases[p.id],{hp:baseHP,respawn:0,order:null,pad:-1,spawn:0,rally:null});
        } else continue;
      }
      const ai=p.id!==0 && !humans.has(p.id);
      if (ai && (!p.rally || state.time>=p.nextOrder)) {
        const options=state.players.filter(q=>q!==p && alive(q));
        const target=options.sort((a,b)=>distance(p,a)-distance(p,b))[0];
        if (target) {
          orderArmy(p,bases[target.id]);
          p.order={x:(bases[p.id].x+bases[target.id].x)/2,y:p.id<5?H*.32:H*.68};
          p.nextOrder=state.time+8+p.id%3;
        }
      }
      if(p.steer?.x||p.steer?.y){
        const scale=240*dt/Math.hypot(p.steer.x,p.steer.y);
        p.x=range(p.x+p.steer.x*scale,20,W-20);
        p.y=range(p.y+p.steer.y*scale,20,H-20);
      } else if (p.order && walk(p,p.order,240,dt)) p.order=null;
      p.spawn-=dt;
      if (p.spawn<=0 && state.units.filter(u=>u.owner===p.id && !u.hero).length<cap) {
        const unit=unitFor(p,++state.nextId);
        unit.order=p.rally&&formation(p.rally,unit.id,p.rally.kind);
        state.units.push(unit);
        p.spawn=1.4;
      }
      if (p.kills>=p.nextHero && state.units.filter(u=>u.owner===p.id && u.hero).length<6) {
        state.units.push(unitFor(p,++state.nextId,true));
        p.nextHero+=heroEvery;
      }
    }
  }
  function updateUnits(dt) {
    for (const unit of state.units) {
      if (unit.hp<=0) continue;
      unit.cd-=dt;
      const owner=state.players[unit.owner];
      let target=null, best=unit.reach*unit.reach;
      if (unit.order?.kind!=="move") {
        for (const foe of state.units) {
          if (foe.owner===unit.owner || foe.hp<=0) continue;
          const d=(unit.x-foe.x)**2+(unit.y-foe.y)**2;
          if (d<=best) { best=d; target=foe; }
        }
        if (!target && state.rule==="elim") {
          for (const opponent of state.players) {
            if (opponent===owner || !alive(opponent)) continue;
            const d=distance(unit,bases[opponent.id])-28;
            if (d*d<=best) { best=d*d; target=opponent; }
          }
        }
      }
      if (target) {
        if (unit.cd>0) continue;
        unit.cd=.75;
        target.hp=Math.max(0,target.hp-unit.damage);
        if (target.hp===0 && target.owner!=null) owner.kills++;
        if (target.hp===0 && target.owner==null) target.respawn=state.online?state.time+60:0;
      } else if (unit.order && walk(unit,unit.order,unit.speed,dt)) unit.order=null;
    }
    state.units=state.units.filter(unit=>unit.hp>0);
  }
  const timeLimit = () => state.rule==="elim"?eliminationLimit:hourLimit;
  function result() {
    const standing=state.players.filter(alive);
    if (state.time<timeLimit() && (state.rule!=="elim" || standing.length>1)) return;
    const standings=(state.rule==="elim" && standing.length===1 ? standing : state.players.slice()).sort((a,b)=>b.kills-a.kills);
    state.done=true; state.winner=standings[0].id;
  }
  function runFrame(callback) {
    try {callback();} catch(error){stopWithError(error);}
  }
  function tick(now) {
    const dt=Math.min(.05,(now-previous)/1000);
    previous=now;
    if (!state.done) {
      state.time+=dt; updatePlayers(dt); updateUnits(dt); result();
      if (state.done || now-lastPublish>100) {
        if (role==="host") room?.publish({
          version:3,time:Math.round(state.time*10)/10,rule:state.rule,done:state.done,winner:state.winner,
          players:state.players.map(p=>[Math.round(p.x),Math.round(p.y),p.kills,p.hp,p.respawn,playerName(p.id)]),
          units:state.units.map(u=>[u.id,u.owner,Math.round(u.x),Math.round(u.y),u.hp,u.max,u.hero?8:species.findIndex(type=>type[6]===u.shape)])
        });
        lastPublish=now;
      }
    }
    pan(now);draw();
    if(state.time>=4||state.done)$("[data-live]").hidden=true;
    if (!state.done) frame=requestAnimationFrame(next=>runFrame(()=>tick(next)));
    else {
      $("[data-message]").textContent=`경기 종료 · ${state.winner+1}번 본진 승리`;
      $("[data-play]").hidden=false;
    }
  }
  function pan(now) {
    const dt=cameraTime?Math.min(.05,(now-cameraTime)/1000):0;
    cameraTime=now;
    const x=Number(cameraKeys.has("ArrowRight"))-Number(cameraKeys.has("ArrowLeft"))+(edge?.x||0);
    const y=Number(cameraKeys.has("ArrowDown"))-Number(cameraKeys.has("ArrowUp"))+(edge?.y||0);
    const step=760*dt/Math.max(1,Math.hypot(x,y));
    camera.x+=x*step;camera.y+=y*step;
    if(droneKeys.size&&!x&&!y){
      const player=state.players[slot];
      if(player){camera.x=player.x;camera.y=player.y;}
    }
  }
  function guestFrame(now) {
    if(!state||role!=="guest"){frame=0;return;}
    pan(now);draw();
    if(state.time>=4||state.done)$("[data-live]").hidden=true;
    frame=state.done?0:requestAnimationFrame(next=>runFrame(()=>guestFrame(next)));
  }
  function draw() {
    if (!state) return;
    const width=canvas.clientWidth, height=canvas.clientHeight;
    const dpr=Math.min(2,window.devicePixelRatio || 1);
    if (canvas.width!==Math.round(width*dpr) || canvas.height!==Math.round(height*dpr)) {
      canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
    }
    if(!width||!height)return;
    const scale=Math.max(width/W,height/H,.52);
    const halfW=width/(2*scale),halfH=height/(2*scale);
    camera.x=range(camera.x,halfW,W-halfW);camera.y=range(camera.y,halfH,H-halfH);
    const left=width/2-camera.x*scale,top=height/2-camera.y*scale;
    const visible=(x,y)=>x>=camera.x-halfW-100&&x<=camera.x+halfW+100&&y>=camera.y-halfH-100&&y<=camera.y+halfH+100;
    view={scale,left,top};
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);
    ctx.translate(left,top); ctx.scale(scale,scale);
    ctx.fillStyle="#253631";ctx.fillRect(0,0,W,H);
    for(let lane=0;lane<5;lane++){
      ctx.fillStyle=lane%2?"#35474a":"#394c48";
      ctx.fillRect(bases[lane].x-115,0,230,H);
    }
    ctx.strokeStyle="#33435a";ctx.lineWidth=2;
    for (let x=0;x<W;x+=100) {ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for (let y=0;y<H;y+=100) {ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    ctx.fillStyle="#243e50";ctx.fillRect(0,H*.46,W,H*.08);
    ctx.strokeStyle="#526c7d";ctx.setLineDash([22,18]);ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();ctx.setLineDash([]);
    state.players.forEach(p=>{
      const base=bases[p.id], color=colors[p.id];
      ctx.fillStyle="#18282c";ctx.fillRect(base.x-86,base.y-66,172,132);
      ctx.strokeStyle=alive(p)?color:"#53535d";ctx.lineWidth=5;ctx.strokeRect(base.x-86,base.y-66,172,132);
      ctx.fillStyle="#354953";ctx.fillRect(base.x-52,base.y-37,104,68);
      label("본진 "+(p.id+1),base.x,base.y+9,"#171926",25);
      if (state.rule==="elim") bar(base.x,base.y+46,p.hp/baseHP,color,108);
      if (!alive(p)) return;
      ctx.fillStyle="#111627";ctx.beginPath();ctx.ellipse(p.x,p.y+12,35,12,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=color;ctx.fillRect(p.x-39,p.y-10,78,9);
      const image=images[p.id];
      if (image.complete && image.naturalWidth) ctx.drawImage(image,p.x-24,p.y-79,48,72);
      label((p.id===slot?"나 · ":"")+playerName(p.id),p.x,p.y+39,color,24);
    });
    for (const unit of state.units) {
      if(!visible(unit.x,unit.y))continue;
      const type=unit.hero?8:species.findIndex(entry=>entry[6]===unit.shape);
      const sprite=art[type],size=unit.hero?73:44+Math.max(0,type)*2;
      ctx.fillStyle="#102025aa";ctx.beginPath();ctx.ellipse(unit.x,unit.y+5,size*.43,9,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=selected.has(unit.id)?"#fff":colors[unit.owner];ctx.lineWidth=3;ctx.stroke();
      const bob=Math.sin(state.time*12+unit.id)*2;
      if(sprite?.complete&&sprite.naturalWidth)ctx.drawImage(sprite,unit.x-size/2,unit.y-size+8+bob,size,size);
      else if(images[unit.owner].naturalWidth)ctx.drawImage(images[unit.owner],unit.x-size/2,unit.y-size+8,size,size);
      if (unit.hero || selected.has(unit.id)) bar(unit.x,unit.y+7,unit.hp/unit.max,"#f7fbff",27);
    }
    if (drag) {
      ctx.strokeStyle="#fff";ctx.lineWidth=3;
      ctx.strokeRect(drag.start.x,drag.start.y,drag.end.x-drag.start.x,drag.end.y-drag.start.y);
    }
    const me=state.players[slot], time=Math.max(0,Math.ceil(timeLimit()-state.time));
    const text=state.done ? `${state.winner+1}번 본진 승리` :
      `${Math.floor(time/60)}:${String(time%60).padStart(2,"0")} · ${me.kills}킬 · ${species[level(me.kills)][0]}${!alive(me)&&me.respawn?" · 부활 "+Math.max(0,Math.ceil(me.respawn-state.time))+"초":""}`;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const mw=Math.min(145,width*.25),mh=mw*H/W,mx=width-mw-12,my=12;
    ctx.fillStyle="#101c27e8";ctx.fillRect(mx,my,mw,mh);
    for(const base of bases){ctx.fillStyle=colors[bases.indexOf(base)];ctx.fillRect(mx+base.x/W*mw-2,my+base.y/H*mh-2,4,4);}
    ctx.strokeStyle="#fff";ctx.lineWidth=1;ctx.strokeRect(mx-left/scale/W*mw,my-top/scale/H*mh,width/scale/W*mw,height/scale/H*mh);
    if ($("[data-hud]").textContent!==text) $("[data-hud]").textContent=text;
  }
  function label(text,x,y,color,size,align="center") {
    ctx.font=`bold ${size}px system-ui`;ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(text,x,y);
  }
  function bar(x,y,ratio,color,width) {
    ctx.fillStyle="#111626";ctx.fillRect(x-width/2,y,width,7);
    ctx.fillStyle=color;ctx.fillRect(x-width/2,y,width*ratio,7);
  }
  function point(event) {
    const box=canvas.getBoundingClientRect();
    return {x:(event.clientX-box.left-view.left)/view.scale,y:(event.clientY-box.top-view.top)/view.scale};
  }
  canvas.addEventListener("pointerdown",event=>{
    if (!view || !state || state.done) return;
    if (event.button===2) { send(point(event),selected.size ? "attack" : "drone"); return; }
    if (event.button!==0) return;
    const p=point(event);
    drag={start:p,end:p};canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("contextmenu",event=>event.preventDefault());
  canvas.addEventListener("pointermove",event=>{
    if(drag)drag.end=point(event);
    const box=canvas.getBoundingClientRect(), margin=30;
    edge=event.pointerType==="mouse"&&!drag?{
      x:Number(event.clientX>box.right-margin)-Number(event.clientX<box.left+margin),
      y:Number(event.clientY>box.bottom-margin)-Number(event.clientY<box.top+margin)
    }:null;
  });
  canvas.addEventListener("pointerleave",()=>{edge=null;});
  function sendSteering(){
    send({x:Number(droneKeys.has("d"))-Number(droneKeys.has("a")),
      y:Number(droneKeys.has("s"))-Number(droneKeys.has("w"))},"steer");
  }
  function droneKey(event){
    return movementKeys[event.code]||(/^[wasd]$/i.test(event.key)?event.key.toLowerCase():null);
  }
  window.addEventListener("keydown",event=>{
    if(!dialog.open||!state||event.target.matches?.("input,select"))return;
    const key=droneKey(event);
    if(key){
      event.preventDefault();event.stopImmediatePropagation();
      if(!droneKeys.has(key)){droneKeys.add(key);sendSteering();}
    } else if(event.key.startsWith("Arrow")){
      event.preventDefault();event.stopImmediatePropagation();cameraKeys.add(event.key);
    } else if(event.code==="KeyB"&&!event.repeat){
      event.preventDefault();event.stopImmediatePropagation();recall();
    }
  },true);
  window.addEventListener("keyup",event=>{
    cameraKeys.delete(event.key);
    if(droneKeys.delete(droneKey(event))&&state)sendSteering();
  },true);
  window.addEventListener("blur",()=>{
    cameraKeys.clear();edge=null;
    if(droneKeys.size){droneKeys.clear();if(state)sendSteering();}
  });
  function recall(){
    if(!state||state.done)return;
    Object.assign(camera,bases[slot]);
    send({},"home");
    $(".blood-officer span").textContent="일반 병력 본진 복귀 · 신규 병력도 집결";
    dialog.querySelectorAll("[data-target]").forEach(button=>button.setAttribute("aria-pressed","false"));
  }
  canvas.addEventListener("pointercancel",()=>{drag=null;});
  canvas.addEventListener("pointerup",event=>{
    if (!drag) return;
    const {start}=drag, end=point(event); drag=null;
    const units=state.units.filter(u=>u.owner===slot);
    if (distance(start,end)>20) {
      selected.clear();
      for (const unit of units) if (unit.x>=Math.min(start.x,end.x) && unit.x<=Math.max(start.x,end.x) &&
        unit.y>=Math.min(start.y,end.y) && unit.y<=Math.max(start.y,end.y)) selected.add(unit.id);
      command="attack";
    } else if (distance(end,state.players[slot])<36) {
      Object.assign(camera,bases[slot]); cameraTime=0;
    selected.clear(); command="drone";
    } else {
      const unit=units.find(u=>distance(u,end)<19);
      if (unit) {selected.clear();selected.add(unit.id);command="attack";}
      else send(end);
    }
    draw();
  });
  function disconnect() {
    room?.close();room=null;role="";slot=0;state=null;selected.clear();humans.clear();
    cancelAnimationFrame(frame);frame=0;cameraKeys.clear();droneKeys.clear();edge=null;cameraTime=0;$("[data-start]").hidden=true;$("[data-live]").hidden=true;$("[data-play]").hidden=false;briefing.show();
  }
  function connect(nextRole) {
    disconnect();names.clear();role=nextRole;$("[data-message]").textContent="연결 중…";
    room=createArenaRoom("blood",{
      error(message){disconnect();$("[data-message]").textContent=message;},
      ready(id,code){slot=id;if(id)room.input({kind:"identity",name:myName()});$("[data-message]").textContent=id?"방장이 시작하기를 기다리는 중":"초대 코드 "+code;$("[data-start]").hidden=!!id;},
      accept:()=>!state || state.done,
      join(id){humans.add(id);},leave(id){humans.delete(id);},
      input:issue,
      state(snapshot) {
        if (snapshot?.players?.length!==10 || !Array.isArray(snapshot.units)) return;
        if(snapshot.version!==3){
          disconnect();$("[data-message]").textContent="방장도 새로고침한 뒤 다시 입장해 주세요.";return;
        }
        briefing.play();
        if(!state||(state.done&&!snapshot.done)){Object.assign(camera,bases[slot]);showStarted();}
        state={...snapshot,
          players:snapshot.players.map(([x,y,kills,hp,respawn,name],id)=>{if(name)names.set(id,name);return {id,x,y,kills,hp,respawn};}),
          units:snapshot.units.map(([id,owner,x,y,hp,max,type])=>({id,owner,x,y,hp,max,hero:type===8,shape:type===8?"★":species[type]?.[6]||"◆"}))
        };
        if(!frame)frame=requestAnimationFrame(now=>runFrame(()=>guestFrame(now)));
      }
    });
    if(role==="host")room.host({listed: $("[data-public]").checked});
    else room.join($("[data-code]").value);
  }
  window.roundbRooms?.register("blood", code => { dialog.showScreen(); $("[data-code]").value = code; connect("guest"); });
  dialog.addEventListener("click",event=>{
    const button=event.target.closest("button");
    if(!button)return;
    if (button.hasAttribute("data-target") && state && !state.done) {
      const target=Number(button.dataset.target);
      if (target===slot) {recall();return;}
      const message={kind:"army",target};
      if(role==="guest")room.input(message);else issue(slot,message);
      const officer=$(".blood-officer");
      officer.querySelector("span").textContent=`${playerName(target)} 본진으로 진격`;
      officer.animate([{transform:"translateX(0)"},{transform:"translateX(26px)"},{transform:"translateX(0)"}],{duration:460});
      dialog.querySelectorAll("[data-target]").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));
    }
    if(button.hasAttribute("data-home"))recall();
    if(button.hasAttribute("data-exit"))dialog.close();
    if(button.hasAttribute("data-play")){disconnect();begin();}
    if(button.hasAttribute("data-host"))connect("host");
    if(button.hasAttribute("data-join"))connect("guest");
    if(button.hasAttribute("data-start") && role==="host")begin();
    if(button.dataset.command)command=button.dataset.command;
  });
  dialog.addEventListener("close",disconnect);
  games.register({id:"blood",name:"진화 블러드",tag:"드론 지휘 · 처치로 진화하는 자동 생산 전투",kind:"main",open:()=>dialog.showScreen()});
  document.querySelector("[data-open-blood]")?.addEventListener("click",()=>games.open("blood"));
})();
