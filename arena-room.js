(() => {
  window.createArenaRoom = function createArenaRoom(mode, callbacks) {
    const peers = new Map();
    let peer, guest, timeout, code, role = "", ended = false;
    const roomId = value => "roundb-arena-v1-" + mode + "-" + value;
    const send = (connection, message) => {
      if (connection?.open) connection.send(message);
    };
    function close() {
      if (ended) return;
      ended = true;
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
      async host() {
        role = "host";
        try { await loadPeerJS(); } catch { return fail("온라인 연결을 불러오지 못했어요."); }
        if (ended) return;
        code = Array.from(crypto.getRandomValues(new Uint8Array(6)), value => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[value % 32]).join("");
        const host = startPeer(roomId(code));
        if (!host) return;
        host.on("open", () => { clearTimeout(timeout); callbacks.ready(0, code); });
        host.on("connection", connection => {
          let slot = -1;
          connection.on("open", () => {
            slot = Array.from({length:9}, (_, i) => i+1).find(i => !peers.has(i) && callbacks.accept(i)) ?? -1;
            if (slot < 0) { send(connection,{type:"full"}); setTimeout(() => connection.close(),500); return; }
            peers.set(slot,connection);
            send(connection,{type:"welcome",slot});
            callbacks.join(slot);
          });
          connection.on("data", message => {
            if (slot >= 1 && message?.type === "input") callbacks.input(slot,message.value);
          });
          connection.on("close", () => {
            if (slot >= 1 && peers.get(slot) === connection) { peers.delete(slot); callbacks.leave(slot); }
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
      publish(value) { if (role === "host") for (const connection of peers.values()) send(connection,{type:"state",value}); },
      close
    };
  };
})();
