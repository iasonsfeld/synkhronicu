// relais für sv: die galerie hört zu, nur der admin mit passwort darf senden.
// ein durable object hält den letzten zustand und alle verbindungen.

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== '/ws') return new Response('sv relais', { status: 200 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket erwartet', { status: 426 });
    const id = env.RAUM.idFromName('galerie');
    return env.RAUM.get(id).fetch(req);
  }
};

const enc = new TextEncoder();
function gleich(a, b) {                       // vergleich ohne früh abzubrechen
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] | 0) ^ (y[i] | 0);
  return d === 0;
}

export class Raum {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(req) {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ admin: false });
    const z = await this.ctx.storage.get('zustand');
    pair[1].send(JSON.stringify({ t: 'admin', da: this.admins() > 0 }));
    if (z) pair[1].send(z);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  admins(ohne) { return this.ctx.getWebSockets().filter(w => w !== ohne && (w.deserializeAttachment() || {}).admin).length; }
  galerien(ohne) { return this.ctx.getWebSockets().filter(w => w !== ohne && !(w.deserializeAttachment() || {}).admin).length; }
  an(text, nurGalerie = true) {
    for (const w of this.ctx.getWebSockets()) {
      if (nurGalerie && (w.deserializeAttachment() || {}).admin) continue;
      try { w.send(text); } catch (e) {}
    }
  }
  info(ohne) { const t = JSON.stringify({ t: 'info', galerien: this.galerien(ohne) });
    for (const w of this.ctx.getWebSockets()) if ((w.deserializeAttachment() || {}).admin) try { w.send(t); } catch (e) {} }

  async webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > 512 * 1024) return;
    let m; try { m = JSON.parse(msg); } catch (e) { return; }
    const att = ws.deserializeAttachment() || {};

    if (m.t === 'auth') {
      const sperre = (await this.ctx.storage.get('sperre')) || { n: 0, bis: 0 };
      if (Date.now() < sperre.bis) { ws.send(JSON.stringify({ t: 'auth', ok: false, warte: Math.ceil((sperre.bis - Date.now()) / 1000) })); return; }
      if (!(this.env.PASSWORT || this.env.PASSWORD)) { ws.send(JSON.stringify({ t: 'auth', ok: false, fehlt: true })); return; }   // kein secret am relais
      if (gleich(String(m.pw || '').trim(), String((this.env.PASSWORT || this.env.PASSWORD)).trim())) {
        await this.ctx.storage.put('sperre', { n: 0, bis: 0 });
        ws.serializeAttachment({ admin: true });
        ws.send(JSON.stringify({ t: 'auth', ok: true }));
        const z = await this.ctx.storage.get('zustand');
        ws.send(z ? JSON.stringify({ t: 'stand', z: JSON.parse(z) }) : JSON.stringify({ t: 'stand', z: null }));   // der admin übernimmt erst, was die galerie gerade zeigt
        this.an(JSON.stringify({ t: 'admin', da: true }));
        this.info();
      } else {
        sperre.n++; if (sperre.n >= 5) { sperre.bis = Date.now() + 60000; sperre.n = 0; }   // fünf fehler: eine minute pause
        await this.ctx.storage.put('sperre', sperre);
        ws.send(JSON.stringify({ t: 'auth', ok: false }));
      }
      return;
    }
    if (!att.admin) return;                    // alles andere nur vom admin
    if (m.t === 'zustand') { await this.ctx.storage.put('zustand', msg); this.an(msg); }
    else if (m.t === 'szene') this.an(msg);
  }

  async webSocketClose(ws) { this.weg(ws); }
  async webSocketError(ws) { this.weg(ws); }
  weg(ws) {
    const war = (ws.deserializeAttachment() || {}).admin;
    try { ws.close(); } catch (e) {}
    if (war && this.admins(ws) === 0) this.an(JSON.stringify({ t: 'admin', da: false }));
    this.info(ws);
  }
}
