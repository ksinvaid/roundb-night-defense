(() => {
  const games = window.knx?.games;
  if (!games) return;
  const guns = [
    ["파수 카빈",24,12,.26,8],["제비 기관단총",30,9,.15,6],["성광 산탄총",6,34,.65,4],
    ["별빛 저격총",5,47,.9,13],["전술 경기관총",46,8,.17,8],["초승달 소총",18,18,.34,9],
    ["돌격 자동소총",32,11,.20,7],["철벽 단축 산탄총",8,28,.52,4.6],
    ["정밀 지정사수총",12,22,.42,10],["방패 중기관총",55,7,.13,6.5]
  ];
  const shop = [
    {gun:1,role:"기관단총",cost:350},{gun:2,role:"산탄총",cost:400},
    {gun:0,role:"카빈",cost:450},{gun:4,role:"기관총",cost:550},{gun:3,role:"저격총",cost:650}
  ];
  const pistol = ["권총",12,13,.36,6];
  const knife = ["전술 단검",1,36,.5,1.2];
  const colors = ["#ffb66d","#75bdff","#9bea93","#f590c9","#d2b3ff"];
  const lootTypes = ["탄약","방탄조끼","탄강화","응급키트","확장 탄창"];
  const lootIcons = [
    '<path d="M9 19h6v-9l-3-5-3 5zM9 15h6"/>','<path d="M5 6l4-2 3 4 3-4 4 2v13H5z"/>',
    '<path d="M13 3L6 13h5l-1 8 8-11h-5z"/>','<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M12 8v8m-4-4h8"/>',
    '<path d="M7 4h10v11l-4 5H7zM9 8h6m-6 4h6"/>'
  ].map(shape=>{const img=new Image();img.src="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff5d2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+shape+'</svg>');return img;});
  const lootGrades = ["일반","희귀","특급"];
  const lootColors = ["#dbe6ee","#60afff","#efbcff"];
  const tau = 2*Math.PI;
  const distance = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const angle = (a,b)=>Math.atan2(b.y-a.y,b.x-a.x);
  const offset = (a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  const floorGrid = Array.from({length:27},(_,y)=>Array.from({length:21},(_,x)=>
    x===0||y===0||x===20||y===26 ? 1 : 0));
  // 4층 투어의 회의실, 로비, 계단 복도를 전투용 격자에 맞춘다.
  const wall = (x1,y1,x2,y2)=> {
    for(let y=y1;y<=y2;y++) for(let x=x1;x<=x2;x++) floorGrid[y][x]=1;
  };
  wall(14,1,14,8); wall(16,8,19,8); wall(14,9,14,10);
  wall(14,13,14,19); wall(14,19,16,19); wall(18,19,19,19); wall(18,16,18,18);
  for(const y of [10,15,20]) for(const x of [4,9]) wall(x,y,x+2,y);
  wall(5,4,9,4); wall(4,23,7,23);
  const spawns = [[2.5,2.5],[3.5,2.5],[17.5,2.5],[18.5,2.5],[2.5,13.5],[3.5,13.5],[17.5,13.5],[18.5,13.5],[10.5,24.5],[11.5,24.5]];
  const solid = (x,y)=>floorGrid[Math.floor(y)]?.[Math.floor(x)]!==0;
  const wallShades=[[169,159,143],[112,151,161]].map(palette=>
    Array.from({length:32},(_,level)=>`rgb(${palette.map(channel=>Math.round(channel*level/31)).join(",")})`));
  function castWall(x,y,dx,dy) {
    let col=Math.floor(x),row=Math.floor(y),depth=0,side=0;
    const stepX=Math.sign(dx),stepY=Math.sign(dy);
    const strideX=Math.abs(1/dx),strideY=Math.abs(1/dy);
    let nextX=dx===0?Infinity:(dx>0?col+1-x:x-col)*strideX;
    let nextY=dy===0?Infinity:(dy>0?row+1-y:y-row)*strideY;
    while(!solid(col,row)){
      if(nextX<nextY){depth=nextX;nextX+=strideX;col+=stepX;side=0;}
      else {depth=nextY;nextY+=strideY;row+=stepY;side=1;}
    }
    return {depth:Math.max(.035,depth),side,col,row};
  }
  function clear(a,b) {
    const steps = Math.ceil(distance(a,b)*8);
    for(let i=1;i<steps;i++) {
      const t=i/steps;
      if(solid(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t)) return false;
    }
    return true;
  }
  function move(actor,dx,dy,dt) {
    const speed=3.35*dt;
    const x=actor.x+dx*speed,y=actor.y+dy*speed;
    const fits=(x,y)=>[-.19,.19].every(a=>[-.19,.19].every(b=>!solid(x+a,y+b)));
    if(fits(x,actor.y))actor.x=x;
    if(fits(actor.x,y))actor.y=y;
  }
  function route(actor,target) {
    const width=21, start=Math.floor(actor.y)*width+Math.floor(actor.x);
    const finish=Math.floor(target.y)*width+Math.floor(target.x);
    if(start===finish)return target;
    const prev=new Int16Array(567).fill(-1), queue=[start];
    prev[start]=start;
    for(let i=0;i<queue.length&&prev[finish]<0;i++){
      const cell=queue[i],x=cell%width,y=Math.floor(cell/width);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        if(solid(x+dx,y+dy))continue;
        const n=cell+dx+dy*width;
        if(prev[n]!==-1)continue;
        prev[n]=cell;queue.push(n);
      }
    }
    if(prev[finish]===undefined||prev[finish]<0)return actor;
    let next=finish;
    while(prev[next]!==start)next=prev[next];
    return {x:next%width+.5,y:Math.floor(next/width)+.5};
  }
  const portraits=Array.from({length:10},(_,i)=>{const img=new Image();img.src=kSrc(i,false);return img;});
  function create(id,name,fps) {
    const dialog=document.createElement("section");
    dialog.className="brawl rb-shooter";
    window.roundbArenaScreen(dialog);
    dialog.innerHTML=`
      <header><strong>${name}</strong><span data-hud></span>${fps?'<label class="shooter-sensitivity">회전 감도 <input data-sensitivity type="range" min="15" max="150" value="45"><output data-sensitivity-value>45%</output></label>':""}<button type="button" data-action="exit">로비로</button></header>
      <div class="brawl-controls">
        ${fps?'<select data-match aria-label="총격전 방식"><option value="objective">설치·해체전 · 최대 7라운드</option><option value="deathmatch">팀 데스매치 · 20점</option></select>':""}
        <button type="button" data-action="solo">AI와 플레이</button><button type="button" data-action="host">온라인 방 만들기</button>
        <label class="arena-public"><input type="checkbox" data-public> 공개방</label>
      <input data-code maxlength="6" aria-label="초대 코드" placeholder="초대 코드"><button type="button" data-action="join">참가</button>
        <button type="button" data-action="start" hidden>온라인 시작</button>
      </div>
      <p data-message role="status">${fps?"5대5 · 20점 선승 · 3분":"2인 5팀 · 마지막까지 생존 · 2분"}</p>
      <details class="shooter-guide" ${fps?"":"open"}><summary>조작과 아이템 안내</summary>
        <p>${fps?"WASD 이동 · 마우스 드래그 조준 · 우클릭 조준 확대 · R 재장전":"빛이 비추는 곳에 적이 들어오면 자동 발사합니다. 아이템 가까이에서 멈추면 원형 게이지가 차고 획득합니다. 쓰러지면 팀원을 관전합니다."}</p>
        ${fps?"":`<div class="shooter-loot-key">${lootTypes.map((name,i)=>`<span><img alt="" src="${lootIcons[i].src}">${name}</span>`).join("")}</div>`}
      </details>
      ${fps?`<div class="shooter-tactical arena-combat" hidden>
        <span data-tactical role="status"></span>
        <div data-armory hidden>${shop.map(({gun,role,cost})=>`<button type="button" data-action="buy-gun-${gun}"><b>${guns[gun][0]}</b><small>${role} · ${cost} C</small></button>`).join("")}<button type="button" data-action="buy-armor">방탄 · 300</button><button type="button" data-action="buy-utility">전술 장비 · 200</button></div>
        <button type="button" data-action="objective">설치·해체 E</button><button type="button" data-action="signature">고유 능력 Q</button>
      </div>`:""}
      <aside data-scoreboard class="arena-combat shooter-scoreboard" hidden aria-label="전적판"></aside>
      <div class="arena-combat shooter-matchbar"><button type="button" data-action="score">전적 Tab</button>
        <button type="button" data-action="pickup">총기 줍기 ${fps?"G":"F"}</button><span data-kda></span><span data-pickup></span></div>
      <div class="arena-combat shooter-link-status" data-link-status hidden role="status">방장 화면과 동기화가 지연되고 있어요.</div>
      <ol class="arena-combat shooter-feed" data-feed></ol>
      <section data-result class="shooter-result arena-combat" hidden aria-labelledby="${id}-result">
        <div><small>경기 종료</small><h2 id="${id}-result" data-result-title></h2><p data-final-score></p>
        <p data-final-stats></p><button type="button" data-action="score">전체 전적</button>
        <button type="button" data-action="exit">로비로 돌아가기</button></div>
      </section>
      <canvas tabindex="0" aria-label="${name} 전장"></canvas>
      <div class="rb-shooter-buttons arena-combat">
        <button type="button" data-action="left">◀</button><button type="button" data-action="forward">▲</button>
        <button type="button" data-action="back">▼</button><button type="button" data-action="right">▶</button>
        <button type="button" data-action="reload">재장전 R</button>
        ${fps?`<button type="button" data-action="fire">발사</button><button type="button" data-action="zoom" aria-pressed="false">조준 확대</button><button type="button" data-action="weapon">무기 1–3</button>
          <button type="button" data-action="frag">수류탄 4</button><button type="button" data-action="smoke">연막탄 H</button><button type="button" data-action="flash">섬광탄 J</button>`:""}
      </div>
      <p>${fps?"WASD 이동 · 마우스 드래그 조준 · 클릭 또는 Space 발사 · 1 주총 / 2 권총 / 3 칼":"WASD 또는 이동 버튼 · 마우스·터치로 조준 · 시야에 들어오면 자동 발사 · 아이템 위에서 멈춰 획득"}</p>`;
    document.body.append(dialog);
    const $=selector=>dialog.querySelector(selector);
    const canvas=$("canvas"), ctx=canvas.getContext("2d");
    const keys=new Set(), controls=new Map(), humans=new Map();
    const timer=fps?180:120;
    let room, role="", slot=0, state, frame, prev, publishAt, heldAt=null, heading=0, fire=false, paid="", zoom=false, lastSnapshot=0, snapshotWatch;
    const preview="data:image/svg+xml,"+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 27"><rect width="21" height="27" fill="#4f5967"/>${floorGrid.map((row,y)=>row.map((wall,x)=>wall?`<rect x="${x}" y="${y}" width="1" height="1" fill="#1c283d"/>`:"").join("")).join("")}${spawns.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r=".36" fill="${colors[Math.floor(i/2)]}"/>`).join("")}</svg>`);
    const briefing=roundbArenaBriefing(dialog,{
      accent:fps?"#85c9ff":"#d6bbff",category:fps?"5대5 · 전술 FPS":"2인 5팀 · 마지막 팀 생존",
      title:name,summary:fps?"라운드비의 두 목표 지점을 공방합니다. 장비를 구매하고, 공격팀은 장치를 설치하며 수비팀은 해체합니다. 4라운드 선승, 최대 7라운드입니다.":"손전등으로 좁은 복도를 살피고, 팀원과 함께 탄약과 장비를 챙겨 살아남으세요.",
      map:"회의실과 복도 전술도",preview,
      rules:fps?[["목표","E 설치·해체 · 공격과 수비는 3라운드 뒤 교대"],["조준","우클릭 확대 · 1 주총 / 2 권총 / 3 단검"],["전술","Q 고유 능력 · 4 수류탄 · G 줍기 · H 연막 · J 섬광"]]:[["교전","손전등으로 비추면 자동 사격"],["획득","아이템 위에서 멈춰 게이지 채우기"],["관전","쓰러지면 생존 중인 팀원 화면으로 전환"]],
      start:()=>{disconnect();begin();}
    });
    const sites=[{label:"A",x:5.5,y:12.5},{label:"B",x:17.5,y:15.5}];
    const signatures=["연막 전개","적 탐지","전투 자극","응급 회복"];
    const team=i=>fps?i%2:Math.floor(i/2);
    const nearbyGun=p=>state.drops.find(item=>distance(p,item)<1.2&&clear(p,item));
    let sensitivity=.45, lastAimSend=0, aimPending=false;
    if(fps){
      const slider=$("[data-sensitivity]");
      try {slider.value=localStorage.getItem("roundb-shooter-sensitivity")||"45";} catch {}
      const syncSensitivity=()=>{
        sensitivity=Number(slider.value)/100;
        $("[data-sensitivity-value]").textContent=slider.value+"%";
      };
      syncSensitivity();
      slider.addEventListener("input",()=>{
        syncSensitivity();
        try {localStorage.setItem("roundb-shooter-sensitivity",slider.value);} catch {}
      });
    }
    function weapon(p) { return p.w===1?pistol:p.w===2?knife:guns[p.primary]; }
    function spawn(p) {
      const [x,y]=fps?[[2.5,4.5,10.5,12.5,18.5][Math.floor(p.i/2)],p.team===(state?.attack??0)?2.5:24.5]:spawns[p.i];
      Object.assign(p,{primary:p.k,recoil:0,moveError:0,damageBy:{},x,y,a:y<13?Math.PI/2:-Math.PI/2,hp:100,armor:0,clip:[guns[p.k][1],12,1],
        reserve:[fps?90:16,36,0],w:0,cd:0,load:0,down:0,blind:0,shot:0,loot:-1,progress:0,
        upgrade:0,mag:0,grenades:[1,1,1],think:0,objective:0,signature:1,stim:0,rifle:true,boughtUtility:false});
    }
    function begin() {
      briefing.play();
      $("[data-result]").hidden=true;
      cancelAnimationFrame(frame);
      const me=Number(window.lbDbg?.ME?.kn)||0;
      state={round:crypto.randomUUID(),t:0,done:false,score:Array(fps?2:5).fill(0),effects:[],loot:[],
        tactical:fps && $("[data-match]").value==="objective",feed:[],drops:[],combatVersion:4,
        players:Array.from({length:10},(_,i)=>({i,k:(i+me)%10,team:team(i),kills:0,deaths:0,assists:0,credits:650}))};
      if(state.tactical) nextRound();
      else state.players.forEach(spawn);
      if(!fps) {
        let n=0;
        for(let y=2;y<26;y+=3) for(let x=2;x<20;x+=3) {
          if(solid(x+.5,y+.5))continue;
          state.loot.push({id:n,x:x+.5,y:y+.5,type:n%5,grade:(x*y+n)%9===0?2:n%4===0?1:0});n++;
        }
      }
      $("[data-message]").textContent="교전 시작";
      dialog.querySelector("details").open=false;
      heading=state.players[slot].a; prev=performance.now();publishAt=0;paid="";
      for(const key of humans.keys())humans.set(key,{});
      frame=requestAnimationFrame(tick);
    }
    function nextRound() {
      state.roundNo=(state.roundNo||0)+1;
      state.attack=state.roundNo<=3?0:1;
      state.phase="buy";state.phaseEnd=state.t+10;
      state.device=null;state.drops=[];state.recon=[0,0];state.effects=[];
      for(const p of state.players) {
        spawn(p);
        p.rifle=false;p.w=1;p.grenades=[0,0,0];p.way=null;p.goal=null;
        if (state.roundNo===4) p.credits=650;
        if (p.i!==0 && !humans.has(p.i)) {
          action(p,p.credits>=750?"buy-gun-3":p.credits>=450?"buy-gun-0":"buy-gun-1");
          if(p.credits>=300)action(p,"buy-armor");
        }
      }
      for(const [i] of humans)humans.set(i,{a:state.players[i].a});
      heading=state.players[slot].a;
    }
    function roundWin(team, reason) {
      if(state.phase!=="live")return;
      state.score[team]++;
      state.notice=reason;
      for(const p of state.players)p.credits=Math.min(1600,p.credits+(p.team===team?550:400));
      if(state.score[team]>=4){state.done=true;state.winner=team;return;}
      state.phase="break";state.phaseEnd=state.t+3;
    }
    function objective(p,dt,input) {
      if(!state.tactical || state.phase!=="live")return;
      const moving=Math.hypot(input.dx||0,input.dy||0)>.1;
      const site=state.device || sites.find(point=>distance(p,point)<1.35);
      const can=site && (state.device ? p.team!==state.attack&&distance(p,site)<1.45 : p.team===state.attack);
      if(!input.use || moving || !can){p.objective=0;return;}
      p.objective+=dt;
      if(p.objective<(state.device?3.3:2.2))return;
      p.objective=0;
      if(state.device){roundWin(p.team,"장치 해체 완료");return;}
      state.device={x:site.x,y:site.y,label:site.label,end:state.t+30};
      state.notice=site.label+" 지점 · 장치 설치";
    }
    function reload(p) {
      if(p.w!==2 && p.reserve[p.w]>0 && p.clip[p.w]<weapon(p)[1]+(p.w===0?p.mag:0) && p.load<=0)p.load=1.05;
    }
    function receive(i,input) {
      if(!state || state.done || !input || !humans.has(i))return;
      humans.set(i,{dx:Math.sign(Number(input.dx)||0),dy:Math.sign(Number(input.dy)||0),
        a:Number.isFinite(input.a)?input.a:undefined,fire:input.fire===true,use:input.use===true,walk:input.walk===true});
      if(typeof input.action==="string") action(state.players[i],input.action);
    }
    function action(p,key) {
      if(!p?.hp)return;
      if(state.tactical && state.phase==="buy") {
        const offer=shop.find(item=>key==="buy-gun-"+item.gun);
        if(offer && !p.rifle && p.credits>=offer.cost){
          p.credits-=offer.cost;p.primary=offer.gun;p.rifle=true;p.w=0;
          p.clip[0]=guns[offer.gun][1];p.reserve[0]=90;p.load=0;
        }
        if(key==="buy-armor" && !p.armor && p.credits>=300){p.credits-=300;p.armor=55;}
        if(key==="buy-utility" && !p.boughtUtility && p.credits>=200){p.credits-=200;p.boughtUtility=true;p.grenades=[1,1,1];}
      }
      if(key==="reload"){reload(p);return;}
      if(state.tactical && state.phase!=="live" && !/^[012]$/.test(key))return;
      if(key==="signature" && state.tactical && p.signature>0){
        p.signature--;
        const kind=p.k%4;
        if(kind===0)state.effects.push({x:p.x+Math.cos(p.a)*1.5,y:p.y+Math.sin(p.a)*1.5,type:1,owner:p.i,at:state.t,end:state.t+6,armed:false});
        if(kind===1)state.recon[p.team]=state.t+5;
        if(kind===2)p.stim=6;
        if(kind===3)for(const ally of state.players)if(ally.hp&&ally.team===p.team&&distance(p,ally)<4)ally.hp=Math.min(100,ally.hp+35);
        return;
      }
      if(key==="pickup"){
        const item=nearbyGun(p);
        if(!item)return;
        state.drops.splice(state.drops.indexOf(item),1);
        if(p.rifle)dropGun(p);
        p.primary=item.gun;p.clip[0]=item.clip;p.reserve[0]=item.reserve;
        p.mag=item.mag;p.upgrade=item.upgrade;p.rifle=true;p.w=0;p.load=0;
        return;
      }
      if(!fps)return;
      if(/^[012]$/.test(key)){if(key==="0"&&!p.rifle)return;p.w=Number(key);p.load=0;return;}
      const type=["frag","smoke","flash"].indexOf(key);
      if(type<0 || !p.grenades[type])return;
      p.grenades[type]--;
      let x=p.x,y=p.y;
      for(let j=0;j<22;j++){
        const nx=x+Math.cos(p.a)*.23,ny=y+Math.sin(p.a)*.23;
        if(solid(nx,ny))break;
        x=nx;y=ny;
      }
      state.effects.push({x,y,type,owner:p.i,at:state.t+.55,end:state.t+(type===1?6.5:1.1),armed:true});
    }
    function dropGun(p) {
      if(state.drops.length>=36)state.drops.shift();
      state.drops.push({x:p.x,y:p.y,gun:p.primary,clip:p.clip[0],reserve:p.reserve[0],mag:p.mag,upgrade:p.upgrade});
    }
    function harm(source,target,amount) {
      if(!target.hp || source.team===target.team)return;
      const blocked=Math.min(target.armor,Math.round(amount*.65));
      target.armor-=blocked; target.hp=Math.max(0,target.hp-amount+blocked);
      target.hitAt=state.t;
      target.damageBy[source.i]=state.t;
      source.confirmedAt=state.t;
      if(!target.hp){
        source.kills++;target.deaths++;
        for(const [i,t] of Object.entries(target.damageBy)){
          if(Number(i)!==source.i && state.t-t<=8)state.players[i].assists++;
        }
        if(target.rifle)dropGun(target);
        if(!state.tactical)state.score[source.team]++;
        else source.credits=Math.min(1600,source.credits+120);
        target.down=state.t+3;
        state.feed.unshift([source.k,target.k,source.team,state.t,weapon(source)[0]]);state.feed.length=Math.min(4,state.feed.length);
      }
    }
    function visible(a,b) {
      if(!clear(a,b))return false;
      return !state.effects.some(e=>e.type===1 && !e.armed &&
        Array.from({length:10},(_,i)=>i/9).some(t=>Math.hypot(e.x-a.x-(b.x-a.x)*t,e.y-a.y-(b.y-a.y)*t)<1.35));
    }
    function target(p,max,cone,heading=p.a) {
      return state.players.filter(q=>q.hp && q.team!==p.team && distance(p,q)<=max &&
        Math.abs(offset(angle(p,q),heading))<=cone && visible(p,q)).sort((a,b)=>distance(p,a)-distance(p,b))[0];
    }
    function shotSpread(p) {
      const mobility=p.w===0&&[1,7].includes(p.primary)?.6:1;
      return .008+p.moveError*mobility+p.recoil*.012;
    }
    function shoot(p) {
      if(p.cd>0||p.load>0||p.blind>0)return;
      if(!p.clip[p.w]){reload(p);return;}
      const gun=weapon(p), firearm=fps&&p.w!==2;
      const heading=p.a+(firearm?(Math.random()*2-1)*shotSpread(p):0);
      const enemy=target(p,gun[4],fps?.06:.38,heading);
      if(firearm)p.recoil=Math.min(6,p.recoil+1.35);
      if(!fps && !enemy)return;
      p.cd=gun[3];p.shot=.16;
      if(p.w!==2)p.clip[p.w]--;
      if(enemy)harm(p,enemy,gun[2]+p.upgrade);
    }
    function pickup(p,dt,moving) {
      const item=state.loot.find(q=>distance(p,q)<.58);
      if(!item||moving){p.loot=-1;p.progress=0;return;}
      if(p.loot!==item.id){p.loot=item.id;p.progress=0;}
      p.progress+=dt/(.75+item.grade*.3);
      if(p.progress<1)return;
      const rank=item.grade+1;
      if(item.type===0)p.reserve[0]+=14+rank*8;
      if(item.type===1)p.armor=Math.max(p.armor,rank*24);
      if(item.type===2)p.upgrade=Math.max(p.upgrade,rank*3);
      if(item.type===3)p.hp=Math.min(100,p.hp+rank*24);
      if(item.type===4)p.mag=Math.max(p.mag,rank*4);
      state.loot=state.loot.filter(q=>q!==item);p.loot=-1;p.progress=0;
    }
    function local() {
      return {dx:Number(keys.has("d"))-Number(keys.has("a")),dy:Number(keys.has("w"))-Number(keys.has("s")),a:heading,fire,use:keys.has("e"),walk:keys.has("shift")};
    }
    function bot(p) {
      const site=state.tactical ? (state.device || sites[(state.roundNo-1)%sites.length]) : null;
      const wantsObjective=site && (state.device?p.team!==state.attack:p.team===state.attack);
      if(wantsObjective && distance(p,site)<1.1) {
        const enemy=state.players.find(q=>q.hp&&q.team!==p.team&&distance(p,q)<4&&visible(p,q));
        return {use:true,a:enemy?angle(p,enemy):p.a,fire:!!enemy};
      }
      if(state.t>=p.think) {
        const enemies=state.players.filter(q=>q.hp&&q.team!==p.team).sort((a,b)=>distance(p,a)-distance(p,b));
        p.goal=enemies[0]?.i;p.think=state.t+.35+p.i*.035;
        if(!fps && (p.reserve[0]+p.clip[0]<12 || p.armor===0)) {
          const loot=state.loot.filter(q=>q.type===0||q.type===1).sort((a,b)=>distance(p,a)-distance(p,b))[0];
          p.want=loot&&distance(p,loot)<7?loot.id:null;
        } else p.want=null;
        const objective=state.loot.find(q=>q.id===p.want)||(wantsObjective?site:state.players[p.goal]);
        p.way=objective&&(clear(p,objective)?{x:objective.x,y:objective.y}:route(p,objective));
      }
      const enemy=state.players[p.goal], item=state.loot.find(q=>q.id===p.want), gun=weapon(p);
      if(enemy?.hp&&distance(p,enemy)<gun[4]&&visible(p,enemy)&&!item)return {world:true,dx:0,dy:0,a:angle(p,enemy),fire:true};
      const next=p.way;
      if(!next||distance(p,next)<.28)return {};
      const a=angle(p,next);
      return {world:true,dx:Math.cos(a),dy:Math.sin(a),a,fire:false};
    }
    function update(dt) {
      state.t+=dt;
      if(state.tactical && state.phase!=="live") {
        if(state.t<state.phaseEnd)return;
        if(state.phase==="break"){nextRound();return;}
        state.phase="live";state.phaseEnd=state.t+65;state.notice="교전 시작";
      }
      for(const e of state.effects) {
        if(!e.armed||state.t<e.at)continue;
        e.armed=false;
        for(const p of state.players) {
          if(!p.hp||distance(p,e)>(e.type===2?3.8:2.4)||!clear(e,p))continue;
          if(e.type===0)harm(state.players[e.owner],p,60);
          if(e.type===2)p.blind=2.15;
        }
      }
      state.effects=state.effects.filter(e=>state.t<e.end);
      for(const p of state.players) {
        if(!p.hp){if(fps&&!state.tactical&&state.t>=p.down)spawn(p);else continue;}
        p.cd-=dt;p.blind-=dt;p.shot-=dt;p.stim-=dt;
        if(p.load>0&&(p.load-=dt)<=0) {
          const count=Math.min(p.reserve[p.w],weapon(p)[1]+(p.w===0?p.mag:0)-p.clip[p.w]);
          p.clip[p.w]+=count;p.reserve[p.w]-=count;
        }
        const input=p.i===0?local():humans.get(p.i)||bot(p);
        if(Number.isFinite(input.a))p.a=input.a;
        const movementDt=dt*(input.walk?.58:1)*(p.stim>0?1.32:1);
        const x=input.dx||0,y=input.dy||0,norm=Math.max(1,Math.hypot(x,y));
        p.moveError=x||y?(input.walk?.042:.105):Math.max(0,p.moveError-dt*.72);
        p.recoil=Math.max(0,p.recoil-dt*3.4);
        if(input.world)move(p,x/norm,y/norm,movementDt);
        else if(fps)move(p,(Math.cos(p.a)*y-Math.sin(p.a)*x)/norm,(Math.sin(p.a)*y+Math.cos(p.a)*x)/norm,movementDt);
        else move(p,x/norm,-y/norm,dt);
        if(!fps)pickup(p,dt,!!(x||y));
        if(!fps||input.fire)shoot(p);
        if(p.hp)objective(p,dt,input);
        if(state.done || state.tactical && state.phase!=="live")return;
      }
      const alive=new Set(state.players.filter(p=>p.hp).map(p=>p.team));
      if(state.tactical) {
        if(state.device && state.t>=state.device.end)roundWin(state.attack,"장치 폭발");
        else if(!alive.has(1-state.attack))roundWin(state.attack,"수비팀 전멸");
        else if(!state.device && (!alive.has(state.attack)||state.t>=state.phaseEnd))roundWin(1-state.attack,"설치 저지");
        return;
      }
      if(state.t>=timer || (fps?Math.max(...state.score)>=20:alive.size<=1)) {
        state.done=true;
        const scores=state.score.map((kills,i)=>({i,kills})).sort((a,b)=>b.kills-a.kills);
        state.winner=!fps&&alive.size===1?[...alive][0]:scores[0].kills===scores[1].kills?-1:scores[0].i;
      }
    }
    function tick(now) {
      try {
        update(Math.min(.05,Math.max(0,(now-prev)/1000)));prev=now;
        if(role==="host"&&(state.done||now-publishAt>85)){
          room.publish({...state,humans:humans.size+1,players:state.players.map(({way,goal,want,think,...player})=>player)});
          publishAt=now;
        }
        draw();
        if(!state.done)frame=requestAnimationFrame(tick);
      } catch(error) {
        console.error(name,error);
        $("[data-message]").textContent="경기 처리 오류 · 로비로 나가거나 AI와 다시 시작할 수 있어요.";
        if(role==="host")disconnectWithError();
      }
    }
    function matchHud(p) {
      const nameOf=q=>KNIGHTS[q.k].n;
      const kda=q=>`${q.kills} / ${q.deaths} / ${q.assists}`;
      const board=$("[data-scoreboard]");
      const item=p.hp&&nearbyGun(p);
      $("[data-kda]").textContent=`킬 / 데스 / 어시스트  ${kda(p)}`;
      $("[data-pickup]").textContent=item?`${fps?"G":"F"} · ${guns[item.gun][0]} 줍기`:"";
      $("[data-action=pickup]").disabled=!item;
      const feed=state.feed.filter(row=>state.t-row[3]<7).map(([from,to,, ,gun])=>`<li>${KNIGHTS[from].n} <b>${gun}</b> ${KNIGHTS[to].n}</li>`).join("");
      const list=$("[data-feed]");
      if(list.innerHTML!==feed)list.innerHTML=feed;
      if(!board.hidden){
        const rows=state.players.slice().sort((a,b)=>a.team-b.team||b.kills-a.kills).map(q=>`<tr class="${q===p?"mine":""}"><td>${q.team+1}</td><td>${nameOf(q)}</td><td>${q.kills}</td><td>${q.deaths}</td><td>${q.assists}</td><td>${q.hp?"생존":"다운"}</td></tr>`).join("");

        const table=`<table><thead><tr><th>팀</th><th>기사</th><th>킬</th><th>데스</th><th>어시</th><th>상태</th></tr></thead><tbody>${rows}</tbody></table>`;
        if(board.innerHTML!==table)board.innerHTML=table;
      }
    }
    function draw() {
      const w=canvas.clientWidth,h=canvas.clientHeight;
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      if(!w||!h)return;
      if(!state){
        ctx.fillStyle="#111c31";ctx.fillRect(0,0,w,h);
        ctx.textAlign="center";ctx.fillStyle="#ffdf94";ctx.font="800 28px system-ui";
        ctx.fillText(name,w/2,h*.43);
        ctx.fillStyle="#d7e7f7";ctx.font="600 14px system-ui";
        ctx.fillText("AI와 플레이하거나 온라인 방을 열어 시작하세요",w/2,h*.52);
        ctx.textAlign="start";
        return;
      }
      const p=state.players[slot];
      if(!p)return;
      matchHud(p);
      if(fps) {
        const watch=state.tactical&&!p.hp&&state.players.find(q=>q.hp&&q.team===p.team);
        firstPerson(watch||p,w,h,watch||role!=="guest"?undefined:heading);
        if(state.tactical)tacticalHud(p,watch,w,h);
        else dialog.querySelector(".shooter-tactical").hidden=true;
      }
      else {
        const watch=!p.hp && (state.players.find(q=>q.hp&&q.team===p.team)||state.players.find(q=>q.hp));
        topDown(watch||p,w,h);
        if (!p.hp && !state.done) $("[data-message]").textContent=watch?`쓰러졌어요 · ${KNIGHTS[watch.k].n} 관전 중`:"쓰러졌어요 · 결과 집계 중";
      }
      const remaining=Math.max(0,Math.ceil((state.tactical?(state.device?.end??state.phaseEnd):timer)-state.t));
      $("[data-hud]").textContent=`${remaining}초 · 체력 ${p.hp} · 방탄 ${p.armor} · ${weapon(p)[0]} ${p.clip[p.w]}/${p.reserve[p.w]}${p.load>0?" · 장전 중":""}${fps?" · "+state.score.join(" : "):""}`;
      if(state.done&&paid!==state.round) {
        paid=state.round;
        const win=state.winner===p.team;
        const reward=window.knx.reward?.grant(id,{win,secs:state.t,players:10,humans:state.humans||humans.size+1,score:p.kills*120,once:id+":"+state.round});
        const result=state.winner<0?"무승부":win?"승리":"패배";
        $("[data-result-title]").textContent=result;
        $("[data-result]").dataset.outcome=win?"win":state.winner<0?"draw":"loss";
        $("[data-final-score]").textContent=fps
          ? `우리 팀 ${state.score[p.team]}  :  ${state.score[1-p.team]} 상대 팀`
          : state.winner<0?"동점으로 경기 종료":`${state.winner+1}팀 승리`;
        $("[data-final-stats]").textContent=`${p.kills}킬 · ${p.deaths}데스 · ${p.assists}어시스트 · +${reward?.rp||0} RP`;
        $("[data-result]").hidden=false;
        $("[data-message]").textContent=(state.winner<0?"무승부":win?"우리 팀 승리":"상대 팀 승리")+` · ${p.kills}킬 · +${reward?.rp||0} RP`;
      }
    }
    function tacticalHud(p,watch,w,h) {
      const controls=dialog.querySelector(".shooter-tactical");
      controls.hidden=false;
      const buy=state.phase==="buy"&&!state.done, armory=$("[data-armory]");
      armory.hidden=!buy;
      for(const {gun,cost} of shop){
        $("[data-action=buy-gun-"+gun+"]").disabled=p.rifle||p.credits<cost;
      }
      for (const [key,cost,owned] of [["armor",300,p.armor],["utility",200,p.boughtUtility]])
        $("[data-action=buy-"+key+"]").disabled=!!owned||p.credits<cost;
      const side=p.team===state.attack?"공격":"수비", site=state.device||sites.find(q=>distance(q,p)<1.35);
      const task=state.device?"해체":"설치";
      const valid=p.hp && state.phase==="live" && site &&
        (state.device?p.team!==state.attack&&distance(p,site)<1.45:p.team===state.attack);
      const use=$('[data-action="objective"]');
      use.disabled=!valid;
      use.textContent=p.objective>0?task+" "+Math.round(p.objective/(state.device?3.3:2.2)*100)+"%":task+" · E 길게";
      const signature=$('[data-action="signature"]');
      signature.textContent=signatures[p.k%4]+" · Q";
      signature.disabled=!p.signature||!p.hp||state.phase!=="live";
      const phase=state.done?"경기 종료":buy?"구매 시간":state.phase==="break"?"라운드 종료":state.device?state.device.label+" 장치 작동 중":"교전 중";
      $("[data-tactical]").textContent=`R${state.roundNo}/7 · ${side} · ${phase} · ${p.credits} 크레딧`;
      if(!state.done)$("[data-message]").textContent=watch?KNIGHTS[watch.k].n+" 관전 중":!p.hp?"다음 라운드까지 대기":state.notice||phase;

      const unit=Math.min(5,w/95,h/70), x=12, y=12;
      ctx.save();ctx.fillStyle="#0b1424ee";ctx.fillRect(x-3,y-3,21*unit+6,27*unit+6);
      for(let row=0;row<27;row++)for(let col=0;col<21;col++)if(floorGrid[row][col]){ctx.fillStyle="#59647b";ctx.fillRect(x+col*unit,y+row*unit,unit,unit);}
      ctx.font="bold 11px system-ui";ctx.textAlign="center";
      for(const point of sites){ctx.fillStyle=state.device?.label===point.label?"#ff5e72":"#ffe3a0";ctx.fillText(point.label,x+point.x*unit,y+point.y*unit+3);}
      for(const q of state.players)if(q.hp&&(q.team===p.team||state.recon?.[p.team]>state.t)){
        ctx.fillStyle=q===p?"#fff":q.team===p.team?"#83dbff":"#ff6474";ctx.beginPath();ctx.arc(x+q.x*unit,y+q.y*unit,2.5,0,tau);ctx.fill();
      }
      ctx.restore();
    }
    function topDown(p,w,h) {
      const s=Math.min(w/21,h/27), left=(w-s*21)/2, top=(h-s*27)/2;
      const x=v=>left+v*s,y=v=>top+v*s;
      ctx.fillStyle="#080d16";ctx.fillRect(0,0,w,h);
      ctx.save();ctx.beginPath();ctx.moveTo(x(p.x),y(p.y));
      for(let ray=0;ray<=48;ray++){
        const a=p.a-.48+.96*ray/48,dx=Math.cos(a),dy=Math.sin(a);
        let d=.06;
        while(d<9&&!solid(p.x+dx*d,p.y+dy*d))d+=.05;
        ctx.lineTo(x(p.x+dx*d),y(p.y+dy*d));
      }
      ctx.closePath();ctx.clip();
      ctx.fillStyle="#c0b894";ctx.fillRect(left,top,s*21,s*27);
      for(let row=0;row<27;row++)for(let col=0;col<21;col++)if(floorGrid[row][col]) {
        ctx.fillStyle="#474456";ctx.fillRect(x(col),y(row),s,s);
      }
      for(const item of state.drops)if(visible(p,item))drawDroppedGun(x(item.x),y(item.y),Math.max(14,s*.7));
      for(const item of state.loot)if(visible(p,item)) {
        const px=x(item.x),py=y(item.y),r=Math.max(8,s*.29);
        ctx.fillStyle="#101929";ctx.strokeStyle=lootColors[item.grade];ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(px,py,r,0,tau);ctx.fill();ctx.stroke();
        const icon=lootIcons[item.type];
        if(icon.complete&&icon.naturalWidth)ctx.drawImage(icon,px-r*.72,py-r*.72,r*1.44,r*1.44);
        if(distance(p,item)<1.25){ctx.fillStyle=lootColors[item.grade];ctx.font="bold 11px sans-serif";ctx.textAlign="center";ctx.fillText(lootGrades[item.grade]+" "+lootTypes[item.type],px,py+r+12);ctx.textAlign="start";}
      }
      for(const q of state.players)if(q.hp&&visible(p,q)) actor(q,x(q.x),y(q.y),s);
      ctx.restore();
      for(const q of state.players)if(q.hp&&q.team===p.team)actor(q,x(q.x),y(q.y),s);
      if(p.progress>0){ctx.strokeStyle="#faf3a7";ctx.lineWidth=3;ctx.beginPath();ctx.arc(x(p.x),y(p.y),s*.64,-Math.PI/2,-Math.PI/2+tau*p.progress);ctx.stroke();}
    }
    function drawDroppedGun(x,y,size) {
      ctx.save();ctx.translate(x,y);ctx.scale(size/32,size/32);
      ctx.fillStyle="#101825";ctx.strokeStyle="#ffde91";ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(-15,-5);ctx.lineTo(15,-5);ctx.lineTo(15,-1);ctx.lineTo(3,-1);
      ctx.lineTo(1,7);ctx.lineTo(-5,7);ctx.lineTo(-3,0);ctx.lineTo(-15,0);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    }
    function actor(p,x,y,size) {
      const img=portraits[p.k];
      ctx.fillStyle=colors[p.team];ctx.beginPath();ctx.arc(x,y,size*.28,0,tau);ctx.fill();
      if(img.complete&&img.naturalWidth)ctx.drawImage(img,x-size*.37,y-size*.8,size*.74,size*.85);
      if(p.shot>0){ctx.strokeStyle="#fff3a2";ctx.lineWidth=2;ctx.beginPath();
        ctx.moveTo(x+Math.cos(p.a)*size*.2,y+Math.sin(p.a)*size*.2);
        ctx.lineTo(x+Math.cos(p.a)*size*2.1,y+Math.sin(p.a)*size*2.1);ctx.stroke();ctx.lineWidth=1;}
    }
    function firstPerson(p,w,h,viewHeading=p.a) {
      const backdrop=ctx.createLinearGradient(0,0,0,h);
      backdrop.addColorStop(0,"#263648");backdrop.addColorStop(.5,"#718493");
      backdrop.addColorStop(.501,"#35404a");backdrop.addColorStop(1,"#18232e");
      ctx.fillStyle=backdrop;ctx.fillRect(0,0,w,h);
      for(let row=1;row<=8;row++){
        const y=h*.5+h*.5/(row*.7+1);
        ctx.fillStyle="#b6d3de20";ctx.fillRect(0,y,w,1);
      }
      const fov=zoom?.56:1.12, columns=Math.min(320,w), width=w/columns, depths=[];
      for(let i=0;i<columns;i++){
        const a=viewHeading+fov*(i/columns-.5),dx=Math.cos(a),dy=Math.sin(a);
        const hit=castWall(p.x,p.y,dx,dy);
        const z=hit.depth*Math.cos(a-viewHeading);depths.push(z);
        const height=Math.min(h*2,h*1.1/z),shade=Math.max(.25,1-z/24)*(hit.side?.78:1);
        const seam=(hit.side?p.x+dx*hit.depth:p.y+dy*hit.depth)%1<.035;
        ctx.fillStyle=wallShades[Number(hit.col>=14)][Math.round(31*shade*(seam?.78:1))];
        const top=(h-height)/2;
        ctx.fillRect(i*width,top,width+1,height);
        ctx.fillStyle=hit.col>=14?"#55c9d364":"#e0a65f66";
        ctx.fillRect(i*width,top+height*.22,width+1,Math.max(1,height*.025));
        ctx.fillStyle="#15223468";ctx.fillRect(i*width,top+height*.82,width+1,height*.18);
      }
      const sprites=state.players.filter(q=>q.hp&&q!==p&&visible(p,q)).sort((a,b)=>distance(p,b)-distance(p,a));
      for(const q of sprites) {
        const a=offset(angle(p,q),viewHeading),d=distance(p,q)*Math.cos(a), x=w*(.5+a/fov),size=Math.min(h*1.1,h*.75/d);
        if(d<=0)continue;
        const col=Math.floor(x/width);
        if(col<0||col>=columns||depths[col]<d-.12)continue;
        const img=portraits[q.k];
        if(img.complete&&img.naturalWidth)ctx.drawImage(img,x-size*.31,h/2-size*.42,size*.62,size);
        ctx.fillStyle="#142032";ctx.fillRect(x-16,h/2-size*.46,32,4);
        ctx.fillStyle=colors[q.team];ctx.fillRect(x-16,h/2-size*.46,32*q.hp/100,4);
        if(q.shot>0&&q.w!==2){
          ctx.fillStyle="#ffd188";ctx.beginPath();
          ctx.arc(x+size*.19,h/2+size*.03,Math.min(11,2+size*.04),0,tau);ctx.fill();
        }
      }
      for(const item of state.drops){
        const a=offset(angle(p,item),viewHeading),d=distance(p,item)*Math.cos(a),x=w*(.5+a/fov);
        if(d<=.12||Math.abs(a)>=fov/2||depths[Math.floor(x/width)]<d-.12)continue;
        drawDroppedGun(x,h/2+Math.min(h*.44,h*.44/d),Math.min(76,h*.25/d));
      }
      for(const cloud of state.effects) {
        if(cloud.type!==1||cloud.armed||!clear(p,cloud))continue;
        const bearing=offset(angle(p,cloud),viewHeading), depth=distance(p,cloud)*Math.cos(bearing);
        if(depth<=.1||Math.abs(bearing)>fov*.75)continue;
        const x=w*(.5+bearing/fov), radius=Math.min(h,h*.7/depth);
        const gradient=ctx.createRadialGradient(x,h/2,0,x,h/2,radius);
        gradient.addColorStop(0,"#9297a5ee");
        gradient.addColorStop(.7,"#79808dbb");
        gradient.addColorStop(1,"#79808d00");
        ctx.fillStyle=gradient;
        ctx.fillRect(x-radius,h/2-radius,radius*2,radius*2);
      }
      if(state.effects.some(e=>e.type===1&&!e.armed&&distance(p,e)<1.45)){
        ctx.fillStyle="#7b7e8de8";ctx.fillRect(0,0,w,h);
      }
      const gap=Math.min(38,5+(p.w===2?0:shotSpread(p))*160);
      ctx.strokeStyle="#f8ead7";ctx.beginPath();
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        ctx.moveTo(w/2+dx*gap,h/2+dy*gap);ctx.lineTo(w/2+dx*(gap+5),h/2+dy*(gap+5));
      }
      ctx.stroke();
      drawViewWeapon(p,w,h);
      if(state.t-p.confirmedAt<.16){
        ctx.strokeStyle="#fff0a8";ctx.lineWidth=2;ctx.beginPath();
        for(const sx of [-1,1])for(const sy of [-1,1]){
          ctx.moveTo(w/2+sx*7,h/2+sy*7);ctx.lineTo(w/2+sx*13,h/2+sy*13);
        }
        ctx.stroke();ctx.lineWidth=1;
      }
      if(p.blind>0){ctx.fillStyle="#08090b";ctx.fillRect(0,0,w,h);}
      if(state.t-p.hitAt<.24){
        const vignette=ctx.createRadialGradient(w/2,h/2,h*.22,w/2,h/2,Math.hypot(w,h)*.5);
        vignette.addColorStop(0,"#ef304000");vignette.addColorStop(1,"#ef3040aa");ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
      }
      if(state.tactical && p.blind<=0)for(const point of sites){
        const bearing=offset(angle(p,point),viewHeading);
        if(Math.abs(bearing)>fov/2||!clear(p,point))continue;
        const x=w*(.5+bearing/fov),y=h*.63;
        ctx.save();ctx.textAlign="center";ctx.font="900 15px system-ui";
        ctx.fillStyle=state.device?.label===point.label?"#ff6e80":"#ffe3a0";ctx.fillText(point.label,x,y);ctx.restore();
      }
    }
    function drawViewWeapon(p,w,h) {
      const size=Math.min(w,h)*.36, shot=Math.max(0,p.shot)/.16;
      const load=p.load>0?Math.sin(Math.PI*p.load/1.05):0;
      const length=p.w===1?74:116+[0,-12,-8,29,16,3,5,-20,18,10][p.primary];
      ctx.save();
      ctx.translate(w*(zoom?.50:.66),h*(.90+.18*load)+size*.09*shot);
      ctx.scale(size/180,size/180);ctx.rotate(load*.55-shot*.08);
      ctx.fillStyle="#202837";ctx.fillRect(-26,-2,54,90);
      ctx.fillStyle="#697281";ctx.fillRect(-19,10,41,31);
      if(p.w===2){
        ctx.fillStyle="#dbe8f1";ctx.beginPath();ctx.moveTo(-9,6);ctx.lineTo(-15,-67);ctx.lineTo(3,-110);
        ctx.lineTo(12,-71);ctx.lineTo(9,6);ctx.fill();ctx.restore();return;
      }
      const metal=ctx.createLinearGradient(-27,0,27,0);
      metal.addColorStop(0,"#141925");metal.addColorStop(.48,"#697687");metal.addColorStop(.51,"#3b4758");metal.addColorStop(1,"#161d29");
      ctx.fillStyle=metal;ctx.fillRect(-26,-length*.64,52,length*.73);
      ctx.fillRect(-9,-length,18,length*.43);
      ctx.fillStyle="#090f19";ctx.fillRect(-17,-length*.65,34,7);
      for(let y=-length*.55;y<-10;y+=9)ctx.fillRect(-20,y,9,3);
      ctx.fillStyle="#dcb56d";ctx.fillRect(-2,-length*.66,4,4);
      if(load>.12){ctx.fillStyle="#131a25";ctx.fillRect(26+load*32,2+load*35,19,46);}
      if(shot>.52){
        ctx.fillStyle="#ffe1a2";ctx.beginPath();
        for(let i=0;i<12;i++){
          const a=i*tau/12,r=i%2?8:26*shot;
          ctx.lineTo(Math.cos(a)*r,-length+Math.sin(a)*r);
        }
        ctx.closePath();ctx.fill();
      }
      if(shot>0){
        ctx.save();ctx.translate(24+(1-shot)*75,-36-30*Math.sin(Math.PI*shot));ctx.rotate((1-shot)*4);
        ctx.fillStyle="#e4b25b";ctx.fillRect(-4,-2,10,4);ctx.restore();
      }
      ctx.restore();
    }
    function send(key) {
      const data={...local(),action:key};
      if(role==="guest")room?.input(data);
      else if(key)action(state?.players[slot],key);
    }
    function disconnectWithError() {
      disconnect();
      $("[data-message]").textContent="방장 화면에서 경기 처리 오류가 발생했어요. 방을 다시 열어 주세요.";
    }
    function disconnect() {
      $("[data-result]").hidden=true;
      clearInterval(snapshotWatch);aimPending=false;lastAimSend=0;heldAt=null;$("[data-link-status]").hidden=true;
      room?.close();room=null;role="";slot=0;state=null;humans.clear();keys.clear();controls.clear();fire=false;
      cancelAnimationFrame(frame);frame=0;$("[data-scoreboard]").hidden=true;briefing.show();zoom=false;$('[data-action="zoom"]')?.setAttribute("aria-pressed","false");$('[data-action="start"]').hidden=true;
    }
    function drawGuest(now) {
      if(role!=="guest"||!state){frame=0;return;}
      if(aimPending&&now-lastAimSend>=33){aimPending=false;lastAimSend=now;send();}
      draw();
      frame=state.done?0:requestAnimationFrame(drawGuest);
    }
    function connect(next) {
      disconnect();role=next;$("[data-message]").textContent="연결 중…";
      room=createArenaRoom(id,{
        error(message){disconnect();$("[data-message]").textContent=message;},
        ready(i,code){slot=i;$("[data-message]").textContent=i?"방장이 시작하기를 기다리는 중":"초대 코드 "+code;$('[data-action="start"]').hidden=!!i;},
        accept:()=>!state||state.done,join(i){humans.set(i,{});},leave(i){humans.delete(i);},input:receive,
        state(nextState) {
          if(nextState?.players?.length!==10)return;
          if(nextState.combatVersion!==4){
            disconnect();$("[data-message]").textContent="방장이 이전 버전이에요. 둘 다 새로고침하고 다시 입장해 주세요.";return;
          }
          if(state?.round!==nextState.round||state?.roundNo!==nextState.roundNo){$("[data-result]").hidden=true;heading=nextState.players[slot].a;dialog.querySelector("details").open=false;$("[data-message]").textContent="교전 시작";}
          briefing.play();state=nextState;lastSnapshot=performance.now();
          $("[data-link-status]").hidden=true;
          if(!frame)frame=requestAnimationFrame(drawGuest);
        }
      });
      if(role==="host")room.host({listed: $("[data-public]").checked});else {
        room.join($("[data-code]").value);
        snapshotWatch=setInterval(()=>{
          if(!state||state.done)return;
          const status=$("[data-link-status]");
          status.hidden=performance.now()-lastSnapshot<3500;
        },500);
      }
    }
    function toggleZoom() {
      if(!fps || !state)return;
      zoom=!zoom; $('[data-action="zoom"]').setAttribute("aria-pressed",String(zoom)); draw();
    }
    canvas.addEventListener("contextmenu",event=>event.preventDefault());
    canvas.addEventListener("pointerdown",event=>{
      if(event.button===2){if(fps)toggleZoom();else if(state)aim(event);return;}
      if(event.button!==0)return;
      if(!state||state.done)return;
      canvas.focus({preventScroll:true});
      heldAt={x:event.clientX,y:event.clientY};
      canvas.setPointerCapture(event.pointerId);
      if(!fps)aim(event);else {fire=true;send();}
    });
    function aim(event) {
      if(fps){
        const dx=heldAt?event.clientX-heldAt.x:event.movementX;
        if(Number.isFinite(dx))heading+=Math.max(-28,Math.min(28,dx))*.004*sensitivity;
        if(heldAt)heldAt.x=event.clientX;
      }
      if(!fps&&state){
        const p=state.players[slot],box=canvas.getBoundingClientRect(),s=Math.min(box.width/21,box.height/27);
        heading=Math.atan2(event.clientY-box.top-(box.height-s*27)/2-p.y*s,event.clientX-box.left-(box.width-s*21)/2-p.x*s);
      }
      if(role==="guest")aimPending=true;
    }
    canvas.addEventListener("pointermove",event=>{if(state&&!state.done&&(event.pointerType==="mouse"||heldAt))aim(event);});
    canvas.addEventListener("pointerup",()=>{
      if(fps&&heldAt){fire=false;send();}
      heldAt=null;
    });
    const releaseCanvas=()=>{heldAt=null;fire=false;send();};
    canvas.addEventListener("pointercancel",releaseCanvas);
    canvas.addEventListener("lostpointercapture",releaseCanvas);
    const movement={left:"a",right:"d",forward:"w",back:"s"};
    for(const button of dialog.querySelectorAll(".rb-shooter-buttons button")){
      const key=movement[button.dataset.action];
      if(!key&&button.dataset.action!=="fire")continue;
      button.addEventListener("pointerdown",event=>{
        button.setPointerCapture(event.pointerId);
        controls.set(event.pointerId,key||"fire");
        if(key)keys.add(key);else fire=true;
        send();
      });
      const release=event=>{
        const held=controls.get(event.pointerId);controls.delete(event.pointerId);
        if(held==="fire")fire=false;else keys.delete(held);
        send();
      };
      button.addEventListener("pointerup",release);button.addEventListener("pointercancel",release);
    }
    const objectiveButton=$('[data-action="objective"]');
    if(objectiveButton){
      objectiveButton.addEventListener("pointerdown",event=>{
        objectiveButton.setPointerCapture(event.pointerId);keys.add("e");send();
      });
      const release=()=>{keys.delete("e");send();};
      objectiveButton.addEventListener("pointerup",release);
      objectiveButton.addEventListener("pointercancel",release);
      objectiveButton.addEventListener("lostpointercapture",release);
    }
    function inputKey(event) {
      const physical=/^(?:Key|Digit)([A-Z0-9])$/.exec(event.code);
      const aliases={ArrowUp:"w",ArrowDown:"s",ArrowLeft:"a",ArrowRight:"d",Space:" ",Tab:"tab",ShiftLeft:"shift",ShiftRight:"shift"};
      return physical?.[1].toLowerCase()||aliases[event.code]||aliases[event.key]||event.key.toLowerCase();
    }
    window.addEventListener("keydown",event=>{
      if(!dialog.open||!state||event.target.matches?.("input,select"))return;
      const key=inputKey(event);
      if(key==="tab"){
        event.preventDefault();event.stopImmediatePropagation();$("[data-scoreboard]").hidden=false;draw();return;
      }
      if(key!=="shift"&&(!"wasd r1234ghjeqf".includes(key)||key.length!==1))return;
      event.preventDefault();event.stopImmediatePropagation();
      if(["w","a","s","d","e","shift"].includes(key))keys.add(key);
      if(key===" ")fire=true;
      const command={r:"reload",1:"0",2:"1",3:"2",4:"frag",g:fps?"pickup":"frag",h:"smoke",j:"flash",q:"signature",f:fps?undefined:"pickup"}[key];
      send(event.repeat?undefined:command);
    },true);
    window.addEventListener("keyup",event=>{
      if(!dialog.open)return;
      const key=inputKey(event);
      if(key==="tab")$("[data-scoreboard]").hidden=true;
      keys.delete(key);
      if(key===" ")fire=false;
      send();
    },true);
    window.addEventListener("blur",()=>{keys.clear();fire=false;$("[data-scoreboard]").hidden=true;if(dialog.open)send();});
    window.roundbRooms?.register(id, code => { dialog.showScreen(); $("[data-code]").value = code; connect("guest"); });
  dialog.addEventListener("click",event=>{
      const key=event.target.closest("button")?.dataset.action;
      if(key==="exit")dialog.close();
      else if(key==="score"){$("[data-scoreboard]").hidden=!$("[data-scoreboard]").hidden;draw();}
      else if(key==="pickup")send("pickup");
      else if(key==="zoom")toggleZoom();
      else if(key==="solo"){disconnect();begin();}
      else if(key==="host")connect("host");
      else if(key==="join")connect("guest");
      else if(key==="start"&&role==="host")begin();
      else if(key==="weapon"&&state)send(String((state.players[slot].w+1)%3));
      else if(key?.startsWith("buy-")||["reload","frag","smoke","flash","signature"].includes(key))send(key);
    });
    dialog.addEventListener("close",disconnect);
    games.register({id,name,tag:fps?"5대5 설치·해체전 · 최대 7라운드":"손전등과 전리품 · 2인 5팀",kind:"main",open:()=>{dialog.showScreen();draw();}});
  }
  // 암전 순찰(night-beam)은 nightpatrol.js 로 분리됨
  /* office-strike 는 officestrike.js 로 분리됐다(이 파일의 fps 분기는 night-beam 분리 뒤 shooters.js 를 지울 때 함께 사라진다) */
  for(const button of document.querySelectorAll("[data-shooter]:not([data-shooter=\"office-strike\"])"))button.addEventListener("click",()=>games.open(button.dataset.shooter));
})();
