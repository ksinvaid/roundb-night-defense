(() => {
  const games = window.knx?.games;
  if (!games) return;
  const guns = [
    ["파수 카빈",24,12,.26,8],["제비 기관단총",30,9,.15,6],["성광 산탄총",6,34,.65,4],
    ["별빛 저격총",5,47,.9,13],["전술 경기관총",46,8,.17,8],["초승달 소총",18,18,.34,9],
    ["돌격 자동소총",32,11,.20,7],["철벽 단축 산탄총",8,28,.52,4.6],
    ["정밀 지정사수총",12,22,.42,10],["방패 중기관총",55,7,.13,6.5]
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
    if(prev[finish]<0)return actor;
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
      <header><strong>${name}</strong><span data-hud></span><button type="button" data-action="exit">로비로</button></header>
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
        <div data-armory hidden><button type="button" data-action="buy-rifle">주총 · 450</button><button type="button" data-action="buy-armor">방탄 · 300</button><button type="button" data-action="buy-utility">전술 장비 · 200</button></div>
        <button type="button" data-action="objective">설치·해체 E</button><button type="button" data-action="signature">고유 능력 Q</button>
      </div>`:""}
      <canvas tabindex="0" aria-label="${name} 전장"></canvas>
      <div class="rb-shooter-buttons arena-combat">
        <button type="button" data-action="left">◀</button><button type="button" data-action="forward">▲</button>
        <button type="button" data-action="back">▼</button><button type="button" data-action="right">▶</button>
        <button type="button" data-action="reload">재장전 R</button>
        ${fps?`<button type="button" data-action="fire">발사</button><button type="button" data-action="zoom" aria-pressed="false">조준 확대</button><button type="button" data-action="weapon">무기 1–3</button>
          <button type="button" data-action="frag">수류탄 G</button><button type="button" data-action="smoke">연막탄 H</button><button type="button" data-action="flash">섬광탄 J</button>`:""}
      </div>
      <p>${fps?"WASD 이동 · 마우스 드래그 조준 · 클릭 또는 Space 발사 · 1 주총 / 2 권총 / 3 칼":"WASD 또는 이동 버튼 · 마우스·터치로 조준 · 시야에 들어오면 자동 발사 · 아이템 위에서 멈춰 획득"}</p>`;
    document.body.append(dialog);
    const $=selector=>dialog.querySelector(selector);
    const canvas=$("canvas"), ctx=canvas.getContext("2d");
    const keys=new Set(), controls=new Map(), humans=new Map();
    const timer=fps?180:120;
    let room, role="", slot=0, state, frame, prev, publishAt, heldAt=null, heading=0, fire=false, paid="", zoom=false;
    const preview="data:image/svg+xml,"+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 27"><rect width="21" height="27" fill="#4f5967"/>${floorGrid.map((row,y)=>row.map((wall,x)=>wall?`<rect x="${x}" y="${y}" width="1" height="1" fill="#1c283d"/>`:"").join("")).join("")}${spawns.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r=".36" fill="${colors[Math.floor(i/2)]}"/>`).join("")}</svg>`);
    const briefing=roundbArenaBriefing(dialog,{
      accent:fps?"#85c9ff":"#d6bbff",category:fps?"5대5 · 전술 FPS":"2인 5팀 · 마지막 팀 생존",
      title:name,summary:fps?"라운드비의 두 목표 지점을 공방합니다. 장비를 구매하고, 공격팀은 장치를 설치하며 수비팀은 해체합니다. 4라운드 선승, 최대 7라운드입니다.":"손전등으로 좁은 복도를 살피고, 팀원과 함께 탄약과 장비를 챙겨 살아남으세요.",
      map:"회의실과 복도 전술도",preview,
      rules:fps?[["목표","E 설치·해체 · 공격과 수비는 3라운드 뒤 교대"],["조준","우클릭 확대 · 1 주총 / 2 권총 / 3 단검"],["전술","Q 고유 능력 · G 수류탄 · H 연막 · J 섬광"]]:[["교전","손전등으로 비추면 자동 사격"],["획득","아이템 위에서 멈춰 게이지 채우기"],["관전","쓰러지면 생존 중인 팀원 화면으로 전환"]],
      start:()=>{disconnect();begin();}
    });
    const sites=[{label:"A",x:5.5,y:12.5},{label:"B",x:17.5,y:15.5}];
    const signatures=["연막 전개","적 탐지","전투 자극","응급 회복"];
    const team=i=>fps?i%2:Math.floor(i/2);
    function weapon(p) { return p.w===1?pistol:p.w===2?knife:guns[p.k]; }
    function spawn(p) {
      const [x,y]=fps?[[2.5,4.5,10.5,12.5,18.5][Math.floor(p.i/2)],p.team===(state?.attack??0)?2.5:24.5]:spawns[p.i];
      Object.assign(p,{x,y,a:y<13?Math.PI/2:-Math.PI/2,hp:100,armor:0,clip:[guns[p.k][1],12,1],
        reserve:[fps?90:16,36,0],w:0,cd:0,load:0,down:0,blind:0,shot:0,loot:-1,progress:0,
        upgrade:0,mag:0,grenades:[1,1,1],think:0,objective:0,signature:1,stim:0,rifle:true,boughtUtility:false});
    }
    function begin() {
      briefing.play();
      cancelAnimationFrame(frame);
      const me=Number(window.lbDbg?.ME?.kn)||0;
      state={round:crypto.randomUUID(),t:0,done:false,score:Array(fps?2:5).fill(0),effects:[],loot:[],
        tactical:fps && $("[data-match]").value==="objective",feed:[],
        players:Array.from({length:10},(_,i)=>({i,k:(i+me)%10,team:team(i),kills:0,credits:650}))};
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
      state.device=null;state.recon=[0,0];state.effects=[];
      for(const p of state.players) {
        spawn(p);
        p.rifle=false;p.w=1;p.grenades=[0,0,0];p.way=null;p.goal=null;
        if (state.roundNo===4) p.credits=650;
        if (p.i!==0 && !humans.has(p.i)) {
          action(p,"buy-rifle");
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
        if(key==="buy-rifle" && !p.rifle && p.credits>=450){p.credits-=450;p.rifle=true;p.w=0;}
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
    function harm(source,target,amount) {
      if(!target.hp || source.team===target.team)return;
      const blocked=Math.min(target.armor,Math.round(amount*.65));
      target.armor-=blocked; target.hp=Math.max(0,target.hp-amount+blocked);
      target.hitAt=state.t;
      if(!target.hp){
        source.kills++;
        if(!state.tactical)state.score[source.team]++;
        else source.credits=Math.min(1600,source.credits+120);
        target.down=state.t+3;
        state.feed.unshift([source.k,target.k,source.team]);state.feed.length=Math.min(4,state.feed.length);
      }
    }
    function visible(a,b) {
      if(!clear(a,b))return false;
      return !state.effects.some(e=>e.type===1 && !e.armed &&
        Array.from({length:10},(_,i)=>i/9).some(t=>Math.hypot(e.x-a.x-(b.x-a.x)*t,e.y-a.y-(b.y-a.y)*t)<1.35));
    }
    function target(p,max,cone) {
      return state.players.filter(q=>q.hp && q.team!==p.team && distance(p,q)<=max &&
        Math.abs(offset(angle(p,q),p.a))<=cone && visible(p,q)).sort((a,b)=>distance(p,a)-distance(p,b))[0];
    }
    function shoot(p) {
      if(p.cd>0||p.load>0||p.blind>0)return;
      if(!p.clip[p.w]){reload(p);return;}
      const gun=weapon(p), enemy=target(p,gun[4],fps?.10:.38);
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
      update(Math.min(.05,Math.max(0,(now-prev)/1000)));prev=now;
      if(role==="host"&&(state.done||now-publishAt>85)){
        room.publish({...state,humans:humans.size+1,players:state.players.map(({way,goal,want,think,...player})=>player)});
        publishAt=now;
      }
      draw();
      if(!state.done)frame=requestAnimationFrame(tick);
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
      if(!w || !h || !p) return;
      if(fps) {
        const watch=state.tactical&&!p.hp&&state.players.find(q=>q.hp&&q.team===p.team);
        firstPerson(watch||p,w,h);
        if(state.tactical)tacticalHud(p,watch,w,h);
        else dialog.querySelector(".shooter-tactical").hidden=true;
      }
      else {
        const watch=!p.hp && (state.players.find(q=>q.hp&&q.team===p.team)||state.players.find(q=>q.hp));
        topDown(watch||p,w,h);
        if (!p.hp && !state.done) $("[data-message]").textContent=watch?"쓰러졌어요 · 관전 중":"쓰러졌어요 · 결과 집계 중";
      }
      const remaining=Math.max(0,Math.ceil((state.tactical?(state.device?.end??state.phaseEnd):timer)-state.t));
      $("[data-hud]").textContent=`${remaining}초 · 체력 ${p.hp} · 방탄 ${p.armor} · ${weapon(p)[0]} ${p.clip[p.w]}/${p.reserve[p.w]}${fps?" · "+state.score.join(" : "):""}`;
      if(state.done&&paid!==state.round) {
        paid=state.round;
        const win=state.winner===p.team;
        const reward=window.knx.reward?.grant(id,{win,secs:state.t,players:10,humans:state.humans||humans.size+1,score:p.kills*120,once:id+":"+state.round});
        $("[data-message]").textContent=(state.winner<0?"무승부":win?"우리 팀 승리":"상대 팀 승리")+` · ${p.kills}킬 · +${reward?.rp||0} RP`;
      }
    }
    function tacticalHud(p,watch,w,h) {
      const controls=dialog.querySelector(".shooter-tactical");
      controls.hidden=false;
      const buy=state.phase==="buy"&&!state.done, armory=$("[data-armory]");
      armory.hidden=!buy;
      for (const [key,cost,owned] of [["rifle",450,p.rifle],["armor",300,p.armor],["utility",200,p.boughtUtility]])
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
      ctx.textAlign="right";ctx.fillStyle="#ffe5a9";
      state.feed.slice(0,3).forEach(([from,to],i)=>ctx.fillText(KNIGHTS[from].n+"  ›  "+KNIGHTS[to].n,w-14,22+i*16));
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
    function actor(p,x,y,size) {
      const img=portraits[p.k];
      ctx.fillStyle=colors[p.team];ctx.beginPath();ctx.arc(x,y,size*.28,0,tau);ctx.fill();
      if(img.complete&&img.naturalWidth)ctx.drawImage(img,x-size*.37,y-size*.8,size*.74,size*.85);
      if(p.shot>0){ctx.strokeStyle="#fff3a2";ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(p.a)*size*.78,y+Math.sin(p.a)*size*.78);ctx.stroke();}
    }
    function firstPerson(p,w,h) {
      ctx.fillStyle="#303344";ctx.fillRect(0,0,w,h/2);ctx.fillStyle="#635746";ctx.fillRect(0,h/2,w,h/2);
      const fov=zoom?.56:1.12, columns=Math.min(280,w), width=w/columns, depths=[];
      for(let i=0;i<columns;i++){
        const a=p.a+fov*(i/columns-.5),dx=Math.cos(a),dy=Math.sin(a);
        let d=.035;
        while(d<30&&!solid(p.x+dx*d,p.y+dy*d))d+=.065;
        const z=d*Math.cos(a-p.a);depths.push(z);
        const height=Math.min(h*2,h*1.1/z),shade=Math.max(.18,1-z/21);
        ctx.fillStyle=`rgb(${Math.round(199*shade)},${Math.round(176*shade)},${Math.round(170*shade)})`;
        ctx.fillRect(i*width,(h-height)/2,width+1,height);
      }
      const sprites=state.players.filter(q=>q.hp&&q!==p&&visible(p,q)).sort((a,b)=>distance(p,b)-distance(p,a));
      for(const q of sprites) {
        const a=offset(angle(p,q),p.a),d=distance(p,q)*Math.cos(a), x=w*(.5+a/fov),size=Math.min(h*1.1,h*.75/d);
        if(d<=0)continue;
        const col=Math.floor(x/width);
        if(col<0||col>=columns||depths[col]<d-.12)continue;
        const img=portraits[q.k];
        if(img.complete&&img.naturalWidth)ctx.drawImage(img,x-size*.31,h/2-size*.42,size*.62,size);
        ctx.fillStyle=colors[q.team];ctx.fillRect(x-16,h/2-size*.46,32,4);
      }
      for(const cloud of state.effects) {
        if(cloud.type!==1||cloud.armed||!clear(p,cloud))continue;
        const bearing=offset(angle(p,cloud),p.a), depth=distance(p,cloud)*Math.cos(bearing);
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
      ctx.strokeStyle="#f8ead7";ctx.beginPath();ctx.moveTo(w/2-7,h/2);ctx.lineTo(w/2+7,h/2);ctx.moveTo(w/2,h/2-7);ctx.lineTo(w/2,h/2+7);ctx.stroke();
      const gunLength=p.w===2?.12:p.w===1?.16:.23, kick=p.shot>0?h*.027:0;
      ctx.fillStyle="#202332";ctx.fillRect(w*.53,h*.79+kick,w*.14,h*.24);
      ctx.fillStyle=p.w===2?"#b8c2cf":p.shot>0?"#e5b754":"#4e566b";
      ctx.fillRect(w*.58,h*(.87-gunLength)+kick,w*(p.w===2?.032:.065),h*gunLength);
      if(p.blind>0){ctx.fillStyle="#08090b";ctx.fillRect(0,0,w,h);}
      if(state.t-p.hitAt<.24){
        const vignette=ctx.createRadialGradient(w/2,h/2,h*.22,w/2,h/2,Math.hypot(w,h)*.5);
        vignette.addColorStop(0,"#ef304000");vignette.addColorStop(1,"#ef3040aa");ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
      }
      if(state.tactical && p.blind<=0)for(const point of sites){
        const bearing=offset(angle(p,point),p.a);
        if(Math.abs(bearing)>fov/2||!clear(p,point))continue;
        const x=w*(.5+bearing/fov),y=h*.63;
        ctx.save();ctx.textAlign="center";ctx.font="900 15px system-ui";
        ctx.fillStyle=state.device?.label===point.label?"#ff6e80":"#ffe3a0";ctx.fillText(point.label,x,y);ctx.restore();
      }
    }
    function send(key) {
      const data={...local(),action:key};
      if(role==="guest")room?.input(data);
      else if(key)action(state?.players[slot],key);
    }
    function disconnect() {
      room?.close();room=null;role="";slot=0;state=null;humans.clear();keys.clear();controls.clear();fire=false;
      cancelAnimationFrame(frame);briefing.show();zoom=false;$('[data-action="zoom"]')?.setAttribute("aria-pressed","false");$('[data-action="start"]').hidden=true;
    }
    function connect(next) {
      disconnect();role=next;$("[data-message]").textContent="연결 중…";
      room=createArenaRoom(id,{
        error(message){disconnect();$("[data-message]").textContent=message;},
        ready(i,code){slot=i;$("[data-message]").textContent=i?"방장이 시작하기를 기다리는 중":"초대 코드 "+code;$('[data-action="start"]').hidden=!!i;},
        accept:()=>!state||state.done,join(i){humans.set(i,{});},leave(i){humans.delete(i);},input:receive,
        state(nextState) {
          if(nextState?.players?.length!==10)return;
          if(state?.round!==nextState.round||state?.roundNo!==nextState.roundNo){heading=nextState.players[slot].a;dialog.querySelector("details").open=false;$("[data-message]").textContent="교전 시작";}
          briefing.play();state=nextState;draw();
        }
      });
      if(role==="host")room.host({listed: $("[data-public]").checked});else room.join($("[data-code]").value);
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
      heldAt={x:event.clientX,y:event.clientY};
      canvas.setPointerCapture(event.pointerId);
      if(!fps)aim(event);else {fire=true;send();}
    });
    function aim(event) {
      if(fps&&heldAt){heading+=(event.clientX-heldAt.x)*.008;heldAt.x=event.clientX;}
      if(!fps&&state){
        const p=state.players[slot],box=canvas.getBoundingClientRect(),s=Math.min(box.width/21,box.height/27);
        heading=Math.atan2(event.clientY-box.top-(box.height-s*27)/2-p.y*s,event.clientX-box.left-(box.width-s*21)/2-p.x*s);
      }
      send();
    }
    canvas.addEventListener("pointermove",event=>{if(state&&(!fps||heldAt))aim(event);});
    canvas.addEventListener("pointerup",()=>{
      if(fps&&heldAt){fire=false;send();}
      heldAt=null;
    });
    canvas.addEventListener("pointercancel",()=>{heldAt=null;fire=false;send();});
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
    window.addEventListener("keydown",event=>{
      if(!dialog.open||!state||event.target.matches?.("input,select"))return;
      const key=event.key.toLowerCase();
      if(key!=="shift"&&(!"wasd r123ghjeq".includes(key)||key.length!==1))return;
      event.preventDefault();event.stopImmediatePropagation();
      if(["w","a","s","d","e","shift"].includes(key))keys.add(key);
      if(key===" ")fire=true;
      const command={r:"reload",1:"0",2:"1",3:"2",g:"frag",h:"smoke",j:"flash",q:"signature"}[key];
      send(event.repeat?undefined:command);
    },true);
    window.addEventListener("keyup",event=>{
      if(!dialog.open)return;
      keys.delete(event.key.toLowerCase());
      if(event.key===" ")fire=false;
      send();
    },true);
    window.addEventListener("blur",()=>{keys.clear();fire=false;if(dialog.open)send();});
    window.roundbRooms?.register(id, code => { dialog.showScreen(); $("[data-code]").value = code; connect("guest"); });
  dialog.addEventListener("click",event=>{
      const key=event.target.closest("button")?.dataset.action;
      if(key==="exit")dialog.close();
      else if(key==="zoom")toggleZoom();
      else if(key==="solo"){disconnect();begin();}
      else if(key==="host")connect("host");
      else if(key==="join")connect("guest");
      else if(key==="start"&&role==="host")begin();
      else if(key==="weapon"&&state)send(String((state.players[slot].w+1)%3));
      else if(["reload","frag","smoke","flash","signature","buy-rifle","buy-armor","buy-utility"].includes(key))send(key);
    });
    dialog.addEventListener("close",disconnect);
    games.register({id,name,tag:fps?"5대5 설치·해체전 · 최대 7라운드":"손전등과 전리품 · 2인 5팀",kind:"main",open:()=>{dialog.showScreen();draw();}});
  }
  create("night-beam","암전 순찰",false);
  create("office-strike","라운드비 총격전",true);
  for(const button of document.querySelectorAll("[data-shooter]"))button.addEventListener("click",()=>games.open(button.dataset.shooter));
})();
