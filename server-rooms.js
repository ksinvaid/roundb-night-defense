(() => {
  const names = {
    dungeon: "던전 인 라운드비", survivor: "서바이버", brawl: "대난투",
    blood: "진화 블러드", "night-beam": "암전 순찰", "office-strike": "라운드비 총격전"
  };
  const entries = new Map([
    ["dungeon", code => { dgn.open(); dgnNet.joinByCode(code); }],
    ["survivor", code => svNet.joinByCode(code)]
  ]);
  let ad = "", lastPresence, writePresence, tab = "match", timer, busy = false;
  let rooms = [], roomError = false, opener;

  function flush() {
    if (!lastPresence || !writePresence) return;
    const {path, value} = lastPresence;
    const body = {...value, t: knx.net.TS};
    if (ad) body.s = ad;
    Promise.resolve(writePresence(path, body)).catch(() => {});
  }
  function hookPresence() {
    if (writePresence || typeof knx.net?.put !== "function") return;
    const original = knx.net.put;
    writePresence = (path, value) => original.call(knx.net, path, value);
    knx.net.put = function (path, value) {
      if (typeof path === "string" && path.startsWith("presence/") && value && typeof value === "object") {
        lastPresence = {path, value: {...value}};
        if (ad) value = {...value, s: ad};
      }
      return original.call(this, path, value);
    };
  }
  window.roundbRooms = {
    register(mode, join) { entries.set(mode, join); },
    advertise(mode, code, n) {
      hookPresence();
      ad = `arp-${mode}-${code.toLowerCase()}-${n}`;
      flush();
    },
    unlist(mode, code) {
      if (!ad.startsWith(`arp-${mode}-${code.toLowerCase()}-`)) return;
      ad = "";
      flush();
    }
  };
  hookPresence();

  function parsePresence(raw, now) {
    const unique = new Map();
    for (const p of Object.values(raw || {})) {
      if (!p || typeof p.s !== "string" || !Number.isFinite(p.t) || p.t < now - 90000 || p.t > now + 15000) continue;
      let room;
      const dungeon = /^dgp-([a-z2-9]{4})-(\d{3})-(\d)(\d)$/.exec(p.s);
      const survivor = /^svp-([a-z2-9]{4})-(\d)(\d)$/.exec(p.s);
      const arena = /^arp-(brawl|blood|night-beam|office-strike)-([a-z2-9]{6})-(10|[1-9])$/.exec(p.s);
      if (dungeon) room = {mode:"dungeon", code:dungeon[1], floor:+dungeon[2], count:+dungeon[3], cap:+dungeon[4]};
      if (survivor) room = {mode:"survivor", code:survivor[1], count:+survivor[2], cap:+survivor[3]};
      if (arena) room = {mode:arena[1], code:arena[2], count:+arena[3], cap:10};
      if (!room || room.count < 1 || room.cap < 2 || room.count > room.cap || !entries.has(room.mode)) continue;
      room.code = room.code.toUpperCase();
      room.updated = p.t;
      const key = room.mode + ":" + room.code;
      if (!unique.has(key) || unique.get(key).updated < room.updated) unique.set(key, room);
    }
    return [...unique.values()].sort((a, b) => (a.count === a.cap) - (b.count === b.cap) || b.updated - a.updated);
  }

  const dialog = document.createElement("dialog");
  dialog.className = "lb-server-dialog";
  dialog.setAttribute("aria-labelledby", "lb-server-title");
  dialog.innerHTML = `<header><h2 id="lb-server-title">서버 매칭 현황</h2><button class="btn btn-sm" type="button" data-room-action="close">닫기</button></header>
    <nav aria-label="서버 정보"><button class="btn btn-sm" type="button" data-room-tab="match">매칭 현황</button><button class="btn btn-sm" type="button" data-room-tab="rooms">전체 공개방</button><button class="btn btn-sm" type="button" data-room-action="refresh">새로고침</button><button class="btn btn-sm" type="button" data-room-action="follow">친구 따라가기</button></nav>
    <p class="lb-server-status" role="status"></p><ul class="lb-server-list"></ul>`;
  document.body.append(dialog);
  const list = dialog.querySelector("ul"), status = dialog.querySelector("[role=status]");
  function row(title, detail, label, action) {
    const li = document.createElement("li"), copy = document.createElement("div"), name = document.createElement("strong"), desc = document.createElement("small");
    name.textContent = title; desc.textContent = detail; copy.append(name, desc); li.append(copy);
    if (label) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "btn btn-sm"; button.textContent = label; button.disabled = !action;
      if (action) button.addEventListener("click", () => { dialog.close(); action(); });
      li.append(button);
    }
    return li;
  }
  function render() {
    if (!dialog.open) return;
    dialog.querySelector("h2").textContent = tab === "rooms" ? "전체 공개방" : "서버 매칭 현황";
    dialog.querySelectorAll("[data-room-tab]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.roomTab === tab)));
    if (tab === "rooms") {
      list.replaceChildren(...rooms.map(room => row(names[room.mode], `${room.count}/${room.cap}명 · ${room.floor ? room.floor + "층 · " : ""}${room.code}`,
        room.count === room.cap ? "정원 마감" : "입장", room.count < room.cap ? () => entries.get(room.mode)(room.code) : null)));
      status.textContent = roomError ? "공개방 목록을 불러오지 못했어요." : busy && !rooms.length ? "공개방을 확인하고 있어요…" : rooms.length ? `공개방 ${rooms.length}개 · 초대 전용 방은 코드로 입장할 수 있어요.` : "지금 열린 공개방이 없어요.";
      return;
    }
    const mm = window.mmq, snap = mm?.snapshot(), modes = mm?.modes() || [];
    list.replaceChildren(...modes.map(mode => {
      const n = snap?.byMode?.[mode.id]?.n || 0;
      return row(mode.full, !snap || snap.denied ? "조회 대기" : n ? `${n}명 대기 중` : "대기 없음", "빠른 매칭", mode.ok ? () => mm.join(mode.id) : null);
    }));
    status.textContent = snap?.denied ? "매칭 대기 현황을 불러오지 못했어요." : !snap ? "매칭 대기 현황을 확인하고 있어요…" : `빠른 매칭 대기 ${modes.reduce((sum, mode) => sum + (snap.byMode?.[mode.id]?.n || 0), 0)}명`;
  }
  async function refresh() {
    if (busy) return;
    busy = true;
    render();
    try {
      if (tab === "match") await window.mmq?.refresh();
      else {
        await knx.net.ready;
        const now = knx.net.now();
        const raw = await knx.net.get("presence", {orderBy: '"t"', startAt: now - 90000, limitToLast: 100});
        rooms = parsePresence(raw, now);
        roomError = false;
      }
    } catch { if (tab === "rooms") roomError = true; }
    finally { busy = false; render(); }
  }
  function open(next, button) {
    tab = next; opener = button;
    dialog.showModal();
    refresh();
    timer = setInterval(refresh, 8000);
  }
  dialog.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.roomAction === "close") dialog.close();
    if (button.dataset.roomAction === "refresh") refresh();
    if (button.dataset.roomAction === "follow") followFriend({});
    if (button.dataset.roomTab) { tab = button.dataset.roomTab; render(); refresh(); }
  });
  dialog.addEventListener("close", () => { clearInterval(timer); opener?.focus(); });
  /* 2026-11-09 친구 따라가기: 접속 중인 친구(knx.fr.list 의 online)의 presence 에서 공개방 표식(dgp-/svp-/arp-)을 찾아 바로 입장한다. 못 찾으면 이유를 알려 준다.
     opt.join === false 면 입장은 부른 쪽이 한다(던전 [온라인 파티] 탭). 반환 {ok, room, friend, msg} */
  async function followFriend(opt) {
    opt = opt || {}; const say = msg => { if (dialog.open) status.textContent = msg; return msg; };
    const fail = msg => ({ok: false, msg: say(msg)});
    try {
      say("접속 중인 친구를 찾고 있어요…");
      const fr = (window.knx?.fr?.list?.() || []).filter(f => f.st === "ok");
      if (!fr.length) return fail("친구가 아직 없어요. 친구 목록에서 먼저 친구를 추가해 주세요.");
      const on = fr.filter(f => f.online);
      if (!on.length) return fail("지금 접속 중인 친구가 없어요.");
      await knx.net.ready; const now = knx.net.now();
      const raw = await knx.net.get("presence", {orderBy: '"t"', startAt: now - 90000, limitToLast: 100});
      const all = Object.values(raw || {}).filter(p => p && Number.isFinite(p.t) && p.t >= now - 90000);
      let full = null, noRoom = null, other = null;
      for (const f of on) {
        const mine = all.filter(p => p.no === f.uid);
        for (const p of mine) {
          const room = parsePresence({x: p}, now)[0];
          if (!room) continue;
          if (opt.only && room.mode !== opt.only) { other = other || {f, room}; continue; }
          if (room.count >= room.cap) { full = full || {f, room}; continue; }
          const msg = `${f.nick} 님이 있는 ${names[room.mode] || room.mode} 방${room.floor ? "(" + room.floor + "층)" : ""}에 들어가요.`;
          say(msg);
          if (opt.join !== false) { if (dialog.open) dialog.close(); entries.get(room.mode)(room.code); }
          return {ok: true, room, friend: f, msg};
        }
        if (mine.length) noRoom = noRoom || f;
      }
      if (full) return fail(`${full.f.nick} 님의 방이 가득 찼어요 (${full.room.count}/${full.room.cap}). 자리가 나면 다시 눌러 주세요.`);
      if (other) return fail(`${other.f.nick} 님은 지금 ${names[other.room.mode] || other.room.mode} 방에 있어요 (던전 파티가 아니에요). 서버 매칭 현황의 [친구 따라가기]를 눌러 보세요.`);
      if (noRoom) return fail(`${noRoom.nick} 님은 접속 중이지만 따라갈 수 있는 공개방에 있지 않아요 (혼자 하는 중이거나 초대 전용 방). 친구에게 초대를 부탁해 보세요.`);
      return fail("접속 중인 친구가 서버에 보이지 않아요. 잠시 뒤 다시 눌러 주세요.");
    } catch (e) { return fail("친구 위치를 확인하지 못했어요. 잠시 뒤 다시 눌러 주세요."); }
  }
  window.roundbRooms = window.roundbRooms || {}; window.roundbRooms.followFriend = followFriend;
  document.querySelector("#lb-match-status").addEventListener("click", event => open("match", event.currentTarget));
  document.querySelector("#lb-room-list").addEventListener("click", event => open("rooms", event.currentTarget));
})();
