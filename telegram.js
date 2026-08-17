const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const fs = require("fs");

const pairingSessions = new Map();
const pairCooldown = new Map();
const PAIR_COOLDOWN_MS = 60_000;
const BRAND = "𝑿 𝑵𝑶𝑩𝑰𝑻𝑨 𝑴𝑶𝑫𝒁";
const START_PHOTO = path.join(process.cwd(), "telegram_start.jpg");

function normalizePhone(value) { return String(value || "").replace(/\D/g, ""); }
function safeSessionId(phone) { return normalizePhone(phone); }
function maskPhone(phone) { const value = String(phone || ""); return value.length > 2 ? `${value.slice(0, 2)}*********` : value; }
function formatPairingCode(value) { const raw = String(value || "").replace(/\s+/g, ""); return raw.match(/.{1,4}/g)?.join("-") || raw; }

const startText = `╭━━━〔 💕 ${BRAND} 💕 〕━━━╮
┃
┃ 🌹 𝑯𝒆𝒚 𝑳𝒐𝒗𝒆𝒍𝒚, 𝒍𝒆𝒕'𝒔 𝒄𝒐𝒏𝒏𝒆𝒄𝒕
┃    𝒚𝒐𝒖𝒓 𝑾𝒉𝒂𝒕𝒔𝑨𝒑𝒑 💗
┃
┃ 💌 𝑬𝒏𝒕𝒆𝒓 𝒚𝒐𝒖𝒓 𝑾𝒉𝒂𝒕𝒔𝑨𝒑𝒑 𝒏𝒖𝒎𝒃𝒆𝒓
┃    𝒘𝒊𝒕𝒉 𝒄𝒐𝒖𝒏𝒕𝒓𝒚 𝒄𝒐𝒅𝒆 💕
┃
┃ 🌸 𝑬𝒙𝒂𝒎𝒑𝒍𝒆:
┃ ➜ /pair 91*********
┃
┃ 💞 𝑫𝒐𝒏'𝒕 𝒖𝒔𝒆 𝒕𝒉𝒆 + 𝒔𝒊𝒈𝒏, 𝒎𝒚 𝒍𝒐𝒗𝒆.
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;
function startingText(phone) { return `╭━━━〔 💗 𝑺𝑻𝑨𝑹𝑻𝑰𝑵𝑮 💗 〕━━━╮\n┃\n┃ 🌹 𝑰𝒏𝒊𝒕𝒊𝒂𝒍𝒊𝒛𝒊𝒏𝒈 𝒚𝒐𝒖𝒓\n┃    𝑾𝒉𝒂𝒕𝒔𝑨𝒑𝒑 𝒔𝒆𝒔𝒔𝒊𝒐𝒏... 💕\n┃\n┃ 📱 𝑵𝒖𝒎𝒃𝒆𝒓: ${maskPhone(phone)}\n┃\n┃ 💞 𝑷𝒍𝒆𝒂𝒔𝒆 𝒘𝒂𝒊𝒕, 𝒎𝒚 𝒍𝒐𝒗𝒆... ✨\n┃\n╰━━━━━━━━━━━━━━━━━━━━━━╯`; }
function codeText(code) { return `╭━━━〔 💖 𝑷𝑨𝑰𝑹𝑰𝑵𝑮 𝑪𝑶𝑫𝑬 💖 〕━━━╮\n┃\n┃ 🔐 𝑪𝒐𝒅𝒆:\n┃    『 ${formatPairingCode(code)} 』\n┃\n┃ 📱 𝑾𝒉𝒂𝒕𝒔𝑨𝒑𝒑 → 𝑺𝒆𝒕𝒕𝒊𝒏𝒈𝒔\n┃ ➜ 𝑳𝒊𝒏𝒌𝒆𝒅 𝑫𝒆𝒗𝒊𝒄𝒆𝒔\n┃ ➜ 𝑳𝒊𝒏𝒌 𝒂 𝑫𝒆𝒗𝒊𝒄𝒆\n┃ ➜ 𝑳𝒊𝒏𝒌 𝒘𝒊𝒕𝒉 𝒑𝒉𝒐𝒏𝒆 𝒏𝒖𝒎𝒃𝒆𝒓\n┃\n┃ ⏳ 𝑬𝒙𝒑𝒊𝒓𝒆𝒔 𝒊𝒏 𝟗𝟎 𝒔𝒆𝒄𝒐𝒏𝒅𝒔 💕\n┃\n┃ ⚠️ 𝑫𝒐𝒏'𝒕 𝒔𝒉𝒂𝒓𝒆 𝒕𝒉𝒊𝒔 𝒄𝒐𝒅𝒆.\n┃\n╰━━━━━━━━━━━━━━━━━━━━━━╯`; }
const successText = `╭━━━〔 💚 𝑺𝑼𝑪𝑪𝑬𝑺𝑺 💚 〕━━━╮\n┃\n┃ 💚 𝑾𝒉𝒂𝒕𝒔𝑨𝒑𝒑 𝑪𝒐𝒏𝒏𝒆𝒄𝒕𝒆𝒅! 💕\n┃\n┃ 🎀 𝑷𝒂𝒊𝒓𝒊𝒏𝒈 𝒄𝒐𝒎𝒑𝒍𝒆𝒕𝒆𝒅\n┃    𝒔𝒖𝒄𝒄𝒆𝒔𝒔𝒇𝒖𝒍𝒍𝒚! 🌹\n┃\n┃ 🚀 ${BRAND}\n┃    𝒊𝒔 𝒏𝒐𝒘 𝒓𝒆𝒂𝒅𝒚 💖\n┃\n╰━━━━━━━━━━━━━━━━━━━━━━╯`;
function failedText(phone) { return `╭━━━〔 💔 𝑭𝑨𝑰𝑳𝑬𝑫 💔 〕━━━╮\n┃\n┃ 🥀 𝑶𝒉 𝒏𝒐... 𝑷𝒂𝒊𝒓𝒊𝒏𝒈 𝒇𝒂𝒊𝒍𝒆𝒅.\n┃\n┃ 🌹 𝑷𝒍𝒆𝒂𝒔𝒆 𝒕𝒓𝒚 𝒂𝒈𝒂𝒊𝒏:\n┃ ➜ /pair ${maskPhone(phone)}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━━╯`; }
function expiredText(phone) { return `╭━━━〔 🥀 𝑬𝑿𝑷𝑰𝑹𝑬𝑫 🥀 〕━━━╮\n┃\n┃ ⏰ 𝑷𝒂𝒊𝒓𝒊𝒏𝒈 𝒄𝒐𝒅𝒆 𝒆𝒙𝒑𝒊𝒓𝒆𝒅.\n┃\n┃ 💌 ➜ /pair ${maskPhone(phone)}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━━╯`; }

function startTelegramPairing() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || /^YOUR_|^$/.test(token)) { console.log("ℹ️ Telegram pairing disabled: TELEGRAM_BOT_TOKEN is not set."); return null; }
  const bot = new TelegramBot(token, { polling: true });

  async function cleanupPairingSession(sessionId, authDir, removeAuth = true) {
    const oldSock = pairingSessions.get(sessionId);
    try { oldSock?.ws?.terminate?.(); } catch {}
    try { oldSock?.end?.(); } catch {}
    pairingSessions.delete(sessionId);
    if (removeAuth) await fs.promises.rm(authDir, { recursive: true, force: true }).catch(() => {});
  }

  async function sendStart(msg) {
    if (fs.existsSync(START_PHOTO)) { try { await bot.sendPhoto(msg.chat.id, START_PHOTO, { caption: startText }); return; } catch {} }
    await bot.sendMessage(msg.chat.id, startText);
  }

  bot.onText(/^\/(start|help)$/i, sendStart);
  bot.onText(/^\/status$/i, async (msg) => {
    const manager = global.__nobitaSessionManager;
    const active = manager ? [...manager.sessions.entries()].filter(([, s]) => s.status === "connected").map(([id]) => id) : [...pairingSessions.keys()];
    await bot.sendMessage(msg.chat.id, active.length ? `🟢 Active paired sessions: ${active.join(", ")}` : "⚪ No active paired session.");
  });

  bot.onText(/^\/pair(?:\s+(.+))?$/i, async (msg, match) => {
    const userId = String(msg.from?.id || msg.chat.id);
    const remaining = PAIR_COOLDOWN_MS - (Date.now() - (pairCooldown.get(userId) || 0));
    if (remaining > 0) { await bot.sendMessage(msg.chat.id, `⏳ Please wait ${Math.ceil(remaining / 1000)}s before requesting another pair code.`); return; }

    const phone = normalizePhone(match?.[1]);
    if (!/^\d{8,15}$/.test(phone)) { await bot.sendMessage(msg.chat.id, failedText(phone || "91")); return; }
    pairCooldown.set(userId, Date.now());

    const sessionId = safeSessionId(phone);
    const authDir = path.join(process.cwd(), "sessions", sessionId);
    const manager = global.__nobitaSessionManager;

    if (manager?.isRunning(sessionId)) {
      await bot.sendMessage(msg.chat.id, `💚 ${phone} is already connected and running.\n\nUse /status to check active sessions.`);
      return;
    }
    if (pairingSessions.has(sessionId)) {
      await bot.sendMessage(msg.chat.id, "⏳ A pairing request for this number is already running. Please wait.");
      return;
    }

    // If an old auth exists but is not connected, remove it so the user can pair again cleanly.
    await cleanupPairingSession(sessionId, authDir, true);
    if (!manager || typeof manager.start !== "function") { await bot.sendMessage(msg.chat.id, failedText(phone)); return; }

    try {
      await bot.sendMessage(msg.chat.id, startingText(phone));
      let resolveCode, rejectCode;
      const codePromise = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
      let opened = false;
      const sock = await manager.start(sessionId, {
        skipPairing: false,
        pairedPhone: phone,
        onPairingCode: resolveCode,
        onPairingError: rejectCode,
        onOpen: async () => { opened = true; pairingSessions.delete(sessionId); try { manager?.register(sessionId); } catch {} try { await bot.sendMessage(msg.chat.id, successText); } catch {} },
        onClose: async (code, detail) => {
          if (!opened && code !== 515) { pairingSessions.delete(sessionId); await cleanupPairingSession(sessionId, authDir, true); const reason = detail?.error?.message || detail?.message || `status ${code || "unknown"}`; try { await bot.sendMessage(msg.chat.id, `${failedText(phone)}\n\n🔎 Reason: ${reason}`); } catch {} }
        }
      });
      if (!sock || typeof sock.requestPairingCode !== "function") throw new Error("WhatsApp socket was not created");
      pairingSessions.set(sessionId, sock);
      if (sock.user?.id) { await bot.sendMessage(msg.chat.id, successText); return; }

      const code = await Promise.race([codePromise, new Promise((_, reject) => setTimeout(() => reject(new Error("Pairing code generation timed out")), 30_000))]);
      await bot.sendMessage(msg.chat.id, codeText(code));

      setTimeout(async () => {
        if (!opened && pairingSessions.has(sessionId)) {
          await cleanupPairingSession(sessionId, authDir, true);
          try { await bot.sendMessage(msg.chat.id, expiredText(phone)); } catch {}
        }
      }, 90_000);
    } catch (error) {
      await cleanupPairingSession(sessionId, authDir, true);
      console.error("Telegram pairing error:", error?.message || error);
      await bot.sendMessage(msg.chat.id, failedText(phone));
    }
  });

  bot.on("polling_error", (error) => console.error("Telegram polling error:", error?.message || error));
  bot.on("error", (error) => console.error("Telegram bot error:", error?.message || error));
  console.log("✅ Telegram multi-user pairing control is running.");
  return bot;
}

module.exports = { startTelegramPairing };
