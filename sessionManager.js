const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const EventEmitter = require("events");

class SessionManager extends EventEmitter {
  constructor({ startSession, sessionsDir = path.join(process.cwd(), "sessions") } = {}) {
    super();
    if (typeof startSession !== "function") throw new Error("startSession is required");
    this.startSession = startSession;
    this.sessionsDir = path.resolve(sessionsDir);
    this.sessions = new Map();
    this.setMaxListeners(0);
  }

  async init() {
    await fsp.mkdir(this.sessionsDir, { recursive: true });
    const entries = await fsp.readdir(this.sessionsDir, { withFileTypes: true }).catch(() => []);
    const ids = entries.filter(e => e.isDirectory() && /^\d{8,15}$/.test(e.name)).map(e => e.name);

    for (const id of ids) {
      const credsPath = path.join(this.sessionsDir, id, "creds.json");
      try {
        const creds = JSON.parse(await fsp.readFile(credsPath, "utf8"));
        if (creds?.registered) this.register(id);
        else await this.remove(id); // stale/incomplete pairing session
      } catch {
        await this.remove(id);
      }
    }

    return ids.filter(id => this.sessions.has(id));
  }

  register(id) {
    id = String(id);
    if (!/^\d{8,15}$/.test(id)) throw new Error("Invalid session id");
    if (!this.sessions.has(id)) this.sessions.set(id, { sock: null, status: "registered", starting: false, reconnecting: false });
    return this.sessions.get(id);
  }

  isRunning(id) {
    const s = this.sessions.get(String(id));
    return !!s?.sock && s.status === "connected";
  }

  status(id) {
    return this.sessions.get(String(id))?.status || "not-found";
  }

  async start(id, options = {}) {
    id = String(id);
    const entry = this.register(id);
    if (entry.starting) return entry.sock;
    if (entry.sock && entry.status === "connected") return entry.sock;

    entry.starting = true;
    entry.status = "starting";

    const userOnOpen = options.onOpen;
    const userOnClose = options.onClose;
    const userOnPairingCode = options.onPairingCode;
    const userOnPairingError = options.onPairingError;

    try {
      const sock = await this.startSession(path.join(this.sessionsDir, id), {
        ...options,
        pairedPhone: id,
        skipPairing: options.skipPairing !== false,
        onPairingCode: userOnPairingCode,
        onPairingError: userOnPairingError,
        onOpen: async (...args) => {
          entry.sock = args[0] || entry.sock;
          entry.status = "connected";
          entry.starting = false;
          entry.reconnecting = false;
          this.emit("connected", id, entry.sock);
          try { await userOnOpen?.(...args); } catch {}
        },
        onClose: async (...args) => {
          entry.sock = null;
          entry.status = "disconnected";
          entry.starting = false;
          this.emit("disconnected", id, ...args);
          try { await userOnClose?.(...args); } catch {}
        }
      });
      entry.sock = sock;
      entry.starting = false;
      return sock;
    } catch (e) {
      entry.starting = false;
      entry.status = "error";
      throw e;
    }
  }

  async startAll() {
    await this.init();
    const ids = [...this.sessions.keys()];
    for (const id of ids) {
      // Small stagger prevents every WhatsApp account from connecting at once.
      await new Promise(r => setTimeout(r, 500));
      this.start(id, { skipPairing: true }).catch(err => {
        console.error(`[SessionManager] ${id} startup failed:`, err?.message || err);
      });
    }
    return ids;
  }

  async stop(id) {
    id = String(id);
    const entry = this.sessions.get(id);
    if (!entry) return false;
    try { entry.sock?.ws?.terminate?.(); } catch {}
    try { entry.sock?.end?.(); } catch {}
    entry.sock = null;
    entry.status = "stopped";
    return true;
  }

  async remove(id) {
    id = String(id);
    await this.stop(id).catch(() => {});
    this.sessions.delete(id);
    await fsp.rm(path.join(this.sessionsDir, id), { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { SessionManager };
