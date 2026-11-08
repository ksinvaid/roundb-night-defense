(() => {
  const games = window.knx?.games;
  if (!games) return;
  const W = 2300, H = 1500, limit = 3600, baseHP = 1400, cap = 32;
  const species = [
    ["보병",0,42,7,90,115,"◆"], ["크롤러",8,50,8,75,135,"✦"],
    ["저격수",20,55,12,165,120,"▲"], ["블롭",38,78,13,100,112,"●"],
    ["중장갑병",65,108,16,130,104,"■"], ["브루트",100,145,20,95,111,"⬟"],
    ["공성 전차",150,165,25,175,94,"▣"], ["돌연변이",220,205,30,125,116,"✷"]
  ];
  const colors = ["#fbc95b","#84c8ff","#ff8293","#a4e585","#c6a5ff","#ffb58c","#8ef1df","#ffc3ef","#d1e079","#bccaff"];
  const bases = Array.from({length:10}, (_,i) => ({
    x:190+(i%5)*480, y:i<5?145:1355
  }));
  const dialog = document.createElement("section");
  dialog.className = "brawl blood";
  window.roundbArenaScreen(dialog);
  dialog.innerHTML = `
    <header><strong>진화 블러드</strong><span data-hud></span><button type="button" data-exit>로비로</button></header>
    <div class="brawl-controls">
      <select data-rule aria-label="경기 방식"><option value="hour">무한 생산 · 1시간</option><option value="elim">본진 섬멸전</option></select>
      <button type="button" data-play>혼자 하기</button><button type="button" data-host>방 만들기</button>
      <label class="arena-public"><input type="checkbox" data-public> 공개방</label>
      <input data-code maxlength="6" placeholder="초대 코드" aria-label="초대 코드">
      <button type="button" data-join>참가</button><button type="button" data-start hidden>온라인 시작</button>
    </div>
    <p data-message role="status">처치 수가 오르면 다음 유닛이 생산됩니다.</p>
    <canvas aria-label="진화 블러드 전장"></canvas>
    <div class="brawl-controls"><button type="button" data-command="drone">드론 이동</button>
      <button type="button" data-command="attack">공격 이동</button><button type="button" data-command="move">이동</button></div>
    <section class="blood-command" aria-label="전장 밖 지휘소"><strong>지휘소 · 전체 병력 명령</strong>
      <div class="blood-targets">${bases.map((_,i)=>`<button type="button" data-target="${i}">${i+1}번</button>`).join("")}</div>
      <div class="blood-officer"><img alt="" src="${kSrc(4,false)}"><span>지휘관 대기 중</span></div>
    </section>
    <p>유닛 드래그 선택 · 우클릭 이동 / 공격 이동 · 지휘소에서 본진을 고르면 지휘관이 일반 병력을 보냅니다.</p>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const canvas = $("canvas"), ctx = canvas.getContext("2d");
  const images = Array.from({length:10},(_,i)=>{const img=new Image();img.src=kSrc(i,false);return img;});
  const range = (n,min,max) => Math.min(max,Math.max(min,n));
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const heroEvery = 30;
  const names = new Map();
  const myName = () => String(window.knx?.me?.()?.nick || SAVE.nick || "기사").slice(0,18);
  const playerName = id => names.get(id) || (id === slot ? myName() : "AI " + (id+1));
  const selected = new Set();
  let state, room, role="", slot=0, frame, previous, lastPublish, command="drone", drag, view;
  const humans = new Set();
  function level(kills) {
    return species.findLastIndex(type=>kills>=type[1]);
  }
  function unitFor(owner,id,hero=false) {
    const stats=hero?["영웅",0,310,36,155,145,"★"]:species[level(owner.kills)];
    const origin=hero?bases[owner.id]:owner;
    return {id,owner:owner.id,x:origin.x+(id%5-2)*11,y:origin.y+24,
      hp:stats[2],max:stats[2],damage:stats[3],reach:stats[4],speed:stats[5],shape:stats[6],hero,cd:0,order:null};
  }
  function begin() {
    if (role==="guest") return;
    cancelAnimationFrame(frame);
    state={time:0,rule:$("[data-rule]").value,online:role==="host",done:false,nextId:0,units:[],
      players:bases.map((base,id)=>({id,...base,kills:0,hp:baseHP,respawn:0,spawn:0,nextHero:heroEvery,order:null,pad:-1}))};
    selected.clear(); command="drone"; drag=null;
    previous=performance.now(); lastPublish=0;
    frame=requestAnimationFrame(tick);
  }
  function alive(p) { return state.rule==="hour" || p.hp>0; }
  function walk(object,to,speed,dt) {
    const d=distance(object,to);
    if (d<1) return true;
    const step=Math.min(d,speed*dt);
    object.x+=(to.x-object.x)*step/d; object.y+=(to.y-object.y)*step/d;
    return step===d;
  }
  function orderArmy(owner,target) {
    for (const unit of state.units) {
      if (unit.owner===owner.id && !unit.hero) unit.order={...target,kind:"attack"};
    }
    owner.rally={...target,kind:"attack"};
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
    if (message.kind === "army") {
      if (Number.isInteger(message.target) && bases[message.target] && message.target !== id) orderArmy(owner,bases[message.target]);
      return;
    }
    if (!Number.isFinite(message.x) || !Number.isFinite(message.y)) return;
    const point={x:range(message.x,20,W-20),y:range(message.y,20,H-20)};
    if (message.kind==="drone") { owner.order=point; return; }
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
          p.order={x:(bases[p.id].x+bases[target.id].x)/2,y:p.id<5?430:1070};
          p.nextOrder=state.time+8+p.id%3;
        }
      }
      if (p.order && walk(p,p.order,240,dt)) p.order=null;
      p.spawn-=dt;
      if (p.spawn<=0 && state.units.filter(u=>u.owner===p.id && !u.hero).length<cap) {
        const unit=unitFor(p,++state.nextId);
        unit.order=p.rally;
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
      let target=null, best=unit.reach;
      if (unit.order?.kind!=="move") {
        for (const foe of state.units) {
          if (foe.owner===unit.owner || foe.hp<=0) continue;
          const d=distance(unit,foe);
          if (d<=best) { best=d; target=foe; }
        }
        if (!target && state.rule==="elim") {
          for (const opponent of state.players) {
            if (opponent===owner || !alive(opponent)) continue;
            const d=distance(unit,bases[opponent.id])-28;
            if (d<=best) { best=d; target=opponent; }
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
  function result() {
    const standing=state.players.filter(alive);
    if (state.time<limit && (state.rule!=="elim" || standing.length>1)) return;
    const standings=(state.rule==="elim" && standing.length===1 ? standing : state.players.slice()).sort((a,b)=>b.kills-a.kills);
    state.done=true; state.winner=standings[0].id;
  }
  function tick(now) {
    const dt=Math.min(.05,(now-previous)/1000);
    previous=now;
    if (!state.done) {
      state.time+=dt; updatePlayers(dt); updateUnits(dt); result();
      if (state.done || now-lastPublish>100) {
        if (role==="host") room?.publish({
          time:Math.round(state.time*10)/10,rule:state.rule,done:state.done,winner:state.winner,
          players:state.players.map(p=>[Math.round(p.x),Math.round(p.y),p.kills,p.hp,p.respawn,playerName(p.id)]),
          units:state.units.map(u=>[u.id,u.owner,Math.round(u.x),Math.round(u.y),u.hp,u.max,u.hero?8:species.findIndex(type=>type[6]===u.shape)])
        });
        lastPublish=now;
      }
    }
    draw();
    if (!state.done) frame=requestAnimationFrame(tick);
  }
  function draw() {
    if (!state) return;
    const width=canvas.clientWidth, height=canvas.clientHeight;
    const dpr=Math.min(2,window.devicePixelRatio || 1);
    if (canvas.width!==Math.round(width*dpr) || canvas.height!==Math.round(height*dpr)) {
      canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
    }
    const scale=Math.min(width/W,height/H), left=(width-W*scale)/2, top=(height-H*scale)/2;
    view={scale,left,top};
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);
    ctx.translate(left,top); ctx.scale(scale,scale);
    ctx.fillStyle="#242e42";ctx.fillRect(0,0,W,H);
    ctx.strokeStyle="#33435a";ctx.lineWidth=2;
    for (let x=0;x<W;x+=100) {ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for (let y=0;y<H;y+=100) {ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    ctx.fillStyle="#243e50";ctx.fillRect(0,H*.46,W,H*.08);
    ctx.strokeStyle="#526c7d";ctx.setLineDash([22,18]);ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();ctx.setLineDash([]);
    state.players.forEach(p=>{
      const base=bases[p.id], color=colors[p.id];
      ctx.fillStyle=alive(p)?color:"#53535d";ctx.fillRect(base.x-54,base.y-36,108,72);
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
      label(unit.shape,unit.x,unit.y,colors[unit.owner],unit.hero?35:24);
      if (unit.hero || selected.has(unit.id)) bar(unit.x,unit.y+7,unit.hp/unit.max,"#f7fbff",27);
    }
    if (drag) {
      ctx.strokeStyle="#fff";ctx.lineWidth=3;
      ctx.strokeRect(drag.start.x,drag.start.y,drag.end.x-drag.start.x,drag.end.y-drag.start.y);
    }
    const me=state.players[slot], time=Math.max(0,Math.ceil(limit-state.time));
    const text=state.done ? `${state.winner+1}번 본진 승리` :
      `${Math.floor(time/60)}:${String(time%60).padStart(2,"0")} · ${me.kills}킬 · ${species[level(me.kills)][0]}${!alive(me)&&me.respawn?" · 부활 "+Math.max(0,Math.ceil(me.respawn-state.time))+"초":""}`;
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
  canvas.addEventListener("pointermove",event=>{if(drag)drag.end=point(event);});
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
    cancelAnimationFrame(frame);$("[data-start]").hidden=true;
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
        state={...snapshot,
          players:snapshot.players.map(([x,y,kills,hp,respawn,name],id)=>{if(name)names.set(id,name);return {id,x,y,kills,hp,respawn};}),
          units:snapshot.units.map(([id,owner,x,y,hp,max,type])=>({id,owner,x,y,hp,max,hero:type===8,shape:type===8?"★":species[type]?.[6]||"◆"}))
        };
        draw();
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
      if (target===slot) return;
      const message={kind:"army",target};
      if(role==="guest")room.input(message);else issue(slot,message);
      const officer=$(".blood-officer");
      officer.querySelector("span").textContent=`${playerName(target)} 본진으로 진격`;
      officer.animate([{transform:"translateX(0)"},{transform:"translateX(26px)"},{transform:"translateX(0)"}],{duration:460});
      dialog.querySelectorAll("[data-target]").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));
    }
    if(button.hasAttribute("data-exit"))dialog.close();
    if(button.hasAttribute("data-play")){disconnect();begin();}
    if(button.hasAttribute("data-host"))connect("host");
    if(button.hasAttribute("data-join"))connect("guest");
    if(button.hasAttribute("data-start") && role==="host")begin();
    if(button.dataset.command)command=button.dataset.command;
  });
  dialog.addEventListener("close",disconnect);
  games.register({id:"blood",name:"진화 블러드",tag:"드론 지휘 · 처치로 진화하는 자동 생산 전투",kind:"main",open:()=>dialog.showScreen()});
  document.querySelector("[data-open-blood]").addEventListener("click",()=>games.open("blood"));
})();
