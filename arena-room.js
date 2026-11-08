(() => {
  window.createArenaRoom = function createArenaRoom(mode, callbacks) {
    const peers = new Map();
    let peer, guest, timeout, code, role = "", ended = false, listed = false;
    const advertise = () => {
      if (listed && code) window.roundbRooms?.advertise(mode, code, peers.size + 1);
    };
    const unlist = () => {
      if (listed && code) window.roundbRooms?.unlist(mode, code);
      listed = false;
    };
    const roomId = value => "roundb-arena-v1-" + mode + "-" + value;
    const send = (connection, message) => {
      if (connection?.open) connection.send(message);
    };
    function close() {
      if (ended) return;
      ended = true;
      unlist();
      clearTimeout(timeout);
      peer?.destroy();
      peers.clear();
    }
    function fail(message) {
      if (ended) return;
      close();
      callbacks.error(message);
    }
    function startPeer(id) {
      if (typeof Peer !== "function") { fail("온라인 연결을 불러오지 못했어요."); return null; }
      try { peer = id ? new Peer(id, {debug:0}) : new Peer({debug:0}); }
      catch { fail("온라인 연결을 시작하지 못했어요."); return null; }
      timeout = setTimeout(() => fail("연결 시간이 초과됐어요."), 12000);
      peer.on("error", () => fail("방에 연결할 수 없어요. 초대 코드와 네트워크를 확인해 주세요."));
      return peer;
    }
    return {
      async host(options = {}) {
        listed = options.listed === true;
        role = "host";
        try { await loadPeerJS(); } catch { return fail("온라인 연결을 불러오지 못했어요."); }
        if (ended) return;
        code = Array.from(crypto.getRandomValues(new Uint8Array(6)), value => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[value % 32]).join("");
        const host = startPeer(roomId(code));
        if (!host) return;
        host.on("open", () => { clearTimeout(timeout); callbacks.ready(0, code); advertise(); });
        host.on("connection", connection => {
          let slot = -1;
          connection.on("open", () => {
            slot = Array.from({length:9}, (_, i) => i+1).find(i => !peers.has(i) && callbacks.accept(i)) ?? -1;
            if (slot < 0) { send(connection,{type:"full"}); setTimeout(() => connection.close(),500); return; }
            peers.set(slot,connection);
            send(connection,{type:"welcome",slot});
            callbacks.join(slot); advertise();
          });
          connection.on("data", message => {
            if (slot >= 1 && message?.type === "input") callbacks.input(slot,message.value);
          });
          connection.on("close", () => {
            if (slot >= 1 && peers.get(slot) === connection) { peers.delete(slot); callbacks.leave(slot); advertise(); }
          });
        });
      },
      async join(value) {
        role = "guest";
        code = value.trim().toUpperCase();
        if (!/^[A-Z2-9]{6}$/.test(code)) return fail("초대 코드 6자리를 입력해 주세요.");
        try { await loadPeerJS(); } catch { return fail("온라인 연결을 불러오지 못했어요."); }
        if (ended) return;
        const client = startPeer();
        if (!client) return;
        client.on("open", () => {
          guest = client.connect(roomId(code),{reliable:true});
          guest.on("data", message => {
            if (message?.type === "welcome" && Number.isInteger(message.slot) && message.slot > 0 && message.slot < 10) {
              clearTimeout(timeout); callbacks.ready(message.slot,code);
            } else if (message?.type === "state") callbacks.state(message.value);
            else if (message?.type === "full") fail("이미 시작했거나 빈 자리가 없는 방이에요.");
          });
          guest.on("close", () => fail("방장과 연결이 끊겼어요."));
          guest.on("error", () => fail("방장과 연결할 수 없어요."));
        });
      },
      input(value) { if (role === "guest") send(guest,{type:"input",value}); },
      publish(value) { if (role === "host") { unlist(); for (const connection of peers.values()) send(connection,{type:"state",value}); } },
      close
    };
  };
})();

// A game owns the viewport while its screen is active.
window.roundbArenaScreen = function (screen) {
  screen.hidden = true;
  screen.setAttribute("aria-label", "게임 화면");
  screen.tabIndex = -1;
  let previousFocus;
  Object.defineProperty(screen, "open", {get: () => !screen.hidden});
  screen.showScreen = () => {
    if (screen.open) return;
    previousFocus = document.activeElement;
    screen.hidden = false;
    document.body.classList.add("rb-arena-active");
    screen.focus();
  };
  screen.close = () => {
    if (!screen.open) return;
    screen.hidden = true;
    document.body.classList.remove("rb-arena-active");
    screen.dispatchEvent(new Event("close"));
    previousFocus?.focus();
  };
};


// Preserve native editing shortcuts, while game surfaces own their right-click menu.
document.addEventListener("contextmenu", event => {
  if (!event.target.closest?.("#app, section.brawl") ||
      event.target.closest("input, textarea, [contenteditable=true]")) return;
  event.preventDefault();
  if (!event.target.closest("canvas") || event.target.closest("section.brawl, #scr-dungeon")) return;
  const marker = document.createElement("span");
  marker.className = "rb-context-ping";
  marker.setAttribute("aria-hidden", "true");
  marker.style.left = event.clientX + "px";
  marker.style.top = event.clientY + "px";
  document.body.append(marker);
  setTimeout(() => marker.remove(), 420);
}, true);

window.roundbArenaBriefing = function (screen, config) {
  const canvas = screen.querySelector("canvas");
  const briefing = document.createElement("section");
  briefing.className = "arena-briefing";
  briefing.style.setProperty("--arena-accent", config.accent);
  briefing.innerHTML = `
    <div class="arena-intro">
      <span class="arena-eyebrow">${config.category}</span>
      <h2>${config.title}</h2>
      <p>${config.summary}</p>
      <div class="arena-rules">${config.rules.map(([label, detail])=>`<div><strong>${label}</strong><span>${detail}</span></div>`).join("")}</div>
      <button type="button" class="arena-launch">AI와 바로 시작</button>
    </div>
    <div class="arena-map-preview">
      <img src="${config.preview || "img/td/floorplan_path.webp"}" alt="${config.map} 전장 미리보기">
      <span>${config.map}</span>
    </div>`;
  briefing.querySelector(".arena-launch").addEventListener("click", config.start);
  canvas.before(briefing);
  screen.classList.add("arena-has-briefing");
  return {
    briefing,
    show() { screen.classList.remove("arena-playing"); },
    play() { screen.classList.add("arena-playing"); }
  };
};
