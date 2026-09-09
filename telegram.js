const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const fs = require("fs");

const pairingSessions = new Map();
const pairCooldown = new Map();
const pairingFinalized = new Set();
const PAIR_COOLDOWN_MS = 30_000;
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

const CALLING_CODE_MAP = {
    1: { iso: "US", name: "United States/Canada" },
    7: { iso: "RU", name: "Russia/Kazakhstan" },
    20: { iso: "EG", name: "Egypt" },
    27: { iso: "ZA", name: "South Africa" },
    30: { iso: "GR", name: "Greece" },
    31: { iso: "NL", name: "Netherlands" },
    32: { iso: "BE", name: "Belgium" },
    33: { iso: "FR", name: "France" },
    34: { iso: "ES", name: "Spain" },
    36: { iso: "HU", name: "Hungary" },
    39: { iso: "IT", name: "Italy" },
    40: { iso: "RO", name: "Romania" },
    41: { iso: "CH", name: "Switzerland" },
    43: { iso: "AT", name: "Austria" },
    44: { iso: "GB", name: "United Kingdom" },
    45: { iso: "DK", name: "Denmark" },
    46: { iso: "SE", name: "Sweden" },
    47: { iso: "NO", name: "Norway" },
    48: { iso: "PL", name: "Poland" },
    49: { iso: "DE", name: "Germany" },
    51: { iso: "PE", name: "Peru" },
    52: { iso: "MX", name: "Mexico" },
    53: { iso: "CU", name: "Cuba" },
    54: { iso: "AR", name: "Argentina" },
    55: { iso: "BR", name: "Brazil" },
    56: { iso: "CL", name: "Chile" },
    57: { iso: "CO", name: "Colombia" },
    58: { iso: "VE", name: "Venezuela" },
    60: { iso: "MY", name: "Malaysia" },
    61: { iso: "AU", name: "Australia" },
    62: { iso: "ID", name: "Indonesia" },
    63: { iso: "PH", name: "Philippines" },
    64: { iso: "NZ", name: "New Zealand" },
    65: { iso: "SG", name: "Singapore" },
    66: { iso: "TH", name: "Thailand" },
    81: { iso: "JP", name: "Japan" },
    82: { iso: "KR", name: "South Korea" },
    84: { iso: "VN", name: "Vietnam" },
    86: { iso: "CN", name: "China" },
    90: { iso: "TR", name: "Turkey" },
    91: { iso: "IN", name: "India" },
    92: { iso: "PK", name: "Pakistan" },
    93: { iso: "AF", name: "Afghanistan" },
    94: { iso: "LK", name: "Sri Lanka" },
    95: { iso: "MM", name: "Myanmar" },
    98: { iso: "IR", name: "Iran" },
    211: { iso: "SS", name: "South Sudan" },
    212: { iso: "MA", name: "Morocco" },
    213: { iso: "DZ", name: "Algeria" },
    216: { iso: "TN", name: "Tunisia" },
    218: { iso: "LY", name: "Libya" },
    220: { iso: "GM", name: "Gambia" },
    221: { iso: "SN", name: "Senegal" },
    233: { iso: "GH", name: "Ghana" },
    234: { iso: "NG", name: "Nigeria" },
    254: { iso: "KE", name: "Kenya" },
    255: { iso: "TZ", name: "Tanzania" },
    256: { iso: "UG", name: "Uganda" },
    260: { iso: "ZM", name: "Zambia" },
    263: { iso: "ZW", name: "Zimbabwe" },
    351: { iso: "PT", name: "Portugal" },
    353: { iso: "IE", name: "Ireland" },
    358: { iso: "FI", name: "Finland" },
    380: { iso: "UA", name: "Ukraine" },
    420: { iso: "CZ", name: "Czech Republic" },
    421: { iso: "SK", name: "Slovakia" },
    500: { iso: "FK", name: "Falkland Islands" },
    501: { iso: "BZ", name: "Belize" },
    502: { iso: "GT", name: "Guatemala" },
    505: { iso: "NI", name: "Nicaragua" },
    506: { iso: "CR", name: "Costa Rica" },
    507: { iso: "PA", name: "Panama" },
    591: { iso: "BO", name: "Bolivia" },
    593: { iso: "EC", name: "Ecuador" },
    595: { iso: "PY", name: "Paraguay" },
    598: { iso: "UY", name: "Uruguay" },
    670: { iso: "TL", name: "East Timor" },
    673: { iso: "BN", name: "Brunei" },
    675: { iso: "PG", name: "Papua New Guinea" },
    679: { iso: "FJ", name: "Fiji" },
    850: { iso: "KP", name: "North Korea" },
    852: { iso: "HK", name: "Hong Kong" },
    853: { iso: "MO", name: "Macau" },
    855: { iso: "KH", name: "Cambodia" },
    856: { iso: "LA", name: "Laos" },
    880: { iso: "BD", name: "Bangladesh" },
    886: { iso: "TW", name: "Taiwan" },
    960: { iso: "MV", name: "Maldives" },
    961: { iso: "LB", name: "Lebanon" },
    962: { iso: "JO", name: "Jordan" },
    963: { iso: "SY", name: "Syria" },
    964: { iso: "IQ", name: "Iraq" },
    965: { iso: "KW", name: "Kuwait" },
    966: { iso: "SA", name: "Saudi Arabia" },
    967: { iso: "YE", name: "Yemen" },
    968: { iso: "OM", name: "Oman" },
    971: { iso: "AE", name: "UAE" },
    972: { iso: "IL", name: "Israel" },
    973: { iso: "BH", name: "Bahrain" },
    974: { iso: "QA", name: "Qatar" },
    975: { iso: "BT", name: "Bhutan" },
    977: { iso: "NP", name: "Nepal" },
    992: { iso: "TJ", name: "Tajikistan" },
    993: { iso: "TM", name: "Turkmenistan" },
    994: { iso: "AZ", name: "Azerbaijan" },
    995: { iso: "GE", name: "Georgia" },
    996: { iso: "KG", name: "Kyrgyzstan" },
    998: { iso: "UZ", name: "Uzbekistan" },
    1242: { iso: "BS", name: "Bahamas" },
    1246: { iso: "BB", name: "Barbados" },
    1345: { iso: "KY", name: "Cayman Islands" },
    1868: { iso: "TT", name: "Trinidad and Tobago" },
    1876: { iso: "JM", name: "Jamaica" },
};

const SORTED_CODES = Object.keys(CALLING_CODE_MAP)
    .map(Number)
    .sort((a, b) => String(b).length - String(a).length || b - a);

function detectCountry(digits) {
    if (!digits) return null;
    if (digits.startsWith("00")) digits = digits.slice(2);
    for (const code of SORTED_CODES) {
      if (digits.startsWith(String(code))) {
        const info = CALLING_CODE_MAP[code];
        return { callingCode: code, iso: info.iso, name: info.name };
      }
    }
    return null;
}

function startTelegramPairing() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || /^YOUR_|^$/.test(token)) {
    console.log("ℹ️ Telegram pairing disabled: TELEGRAM_BOT_TOKEN is not set.");
    return null;
  }

  const bot = new TelegramBot(token, { polling: true });

  // Clean up a previous/incomplete pairing socket and stale auth data.
  // This must be defined before /pair uses it.
  async function cleanupPairingSession(sessionId, authDir, removeAuth = true) {
    const oldSock = pairingSessions.get(sessionId);
    try { oldSock?.ws?.terminate?.(); } catch {}
    try { oldSock?.end?.(); } catch {}
    pairingSessions.delete(sessionId);
    if (removeAuth) {
      await fs.promises.rm(authDir, { recursive: true, force: true }).catch(() => {});
    }
  }
  const WA_CHANNEL_LINK =
    process.env.WA_CHANNEL_LINK ||
    "https://whatsapp.com/channel/0029Vb6gE1WHrDZX1MbuPi3G";
  const GROUP_INVITE_LINK =
    process.env.TG_GROUP_LINK || "";

  function esc(s = "") {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function safeReply(chatId, text, opts = {}) {
    return bot.sendMessage(chatId, text, {
      parse_mode: "HTML",
      ...opts
    }).catch((e) => {
      console.error("Telegram sendMessage failed:", e?.message || e);
      return null;
    });
  }

  function safeEdit(chatId, messageId, text, opts = {}) {
    return bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "HTML",
      ...opts
    }).catch(() => null);
  }

  function isGroup(msg) {
    return msg?.chat?.type === "group" || msg?.chat?.type === "supergroup";
  }

  function redirectToGroup(chatId, replyToId) {
    const buttons = GROUP_INVITE_LINK
      ? { inline_keyboard: [[{ text: "🌷 Join Telegram Group", url: GROUP_INVITE_LINK }]] }
      : undefined;

    return safeReply(
      chatId,
      `🌸 <b>Group Only Feature</b>\n\n` +
      `➜ ${BRAND} pairing works inside a Telegram group.\n` +
      `➜ Add the bot to your group and use:\n` +
      `<code>/pair +917074420859</code>`,
      {
        reply_to_message_id: replyToId,
        reply_markup: buttons
      }
    );
  }

  async function sendStart(msg) {
    if (!isGroup(msg)) return redirectToGroup(msg.chat.id, msg.message_id);
    if (fs.existsSync(START_PHOTO)) {
      try {
        return await bot.sendPhoto(msg.chat.id, START_PHOTO, {
          caption: startText,
          reply_to_message_id: msg.message_id
        });
      } catch {}
    }
    return safeReply(msg.chat.id, startText, { reply_to_message_id: msg.message_id });
  }

  bot.onText(/^\/(start|help)$/i, sendStart);

  bot.onText(/^\/status$/i, async (msg) => {
    if (!isGroup(msg)) return redirectToGroup(msg.chat.id, msg.message_id);

    const manager = global.__nobitaSessionManager;
    const active = manager
      ? [...manager.sessions.entries()]
          .filter(([, s]) => s.status === "connected")
          .map(([id]) => id)
      : [];

    return safeReply(
      msg.chat.id,
      active.length
        ? `🟢 <b>Active Sessions</b>\n\n${active.map(x => `• <code>${x}</code>`).join("\n")}`
        : `⚪ <b>No Active Session</b>\n\nNo WhatsApp session is currently connected.`,
      { reply_to_message_id: msg.message_id }
    );
  });

  bot.onText(/^\/pair(?:\s+(.+))?$/i, async (msg, match) => {
    if (!isGroup(msg)) return redirectToGroup(msg.chat.id, msg.message_id);

    const userId = String(msg.from?.id || msg.chat.id);
    const remaining = PAIR_COOLDOWN_MS - (Date.now() - (pairCooldown.get(userId) || 0));
    if (remaining > 0) {
      return safeReply(
        msg.chat.id,
        `⏳ <b>Please wait ${Math.ceil(remaining / 1000)}s</b> before requesting another pair code.`,
        { reply_to_message_id: msg.message_id }
      );
    }

    const rawArg = String(match?.[1] || "").trim();
    const phone = normalizePhone(rawArg);

    if (!phone || !/^\d{8,15}$/.test(phone)) {
      return safeReply(
        msg.chat.id,
        `╭━━━〔 ⚠️ 𝑰𝑵𝑽𝑨𝑳𝑰𝑫 𝑵𝑼𝑴𝑩𝑬𝑹 〕━━━╮\n\n` +
        `📌 𝑼𝒔𝒆 𝒕𝒉𝒊𝒔 𝒇𝒐𝒓𝒎𝒂𝒕:\n` +
        `➜ <code>/pair 919876543210</code>\n\n` +
        `🌍 𝑪𝒐𝒖𝒏𝒕𝒓𝒚 𝒄𝒐𝒅𝒆 𝒊𝒔 𝒓𝒆𝒒𝒖𝒊𝒓𝒆𝒅.\n` +
        `╰━━━━━━━━━━━━━━━━━━╯`,
        { reply_to_message_id: msg.message_id }
      );
    }

    const countryInfo = detectCountry(phone);
    if (!countryInfo) {
      return safeReply(
        msg.chat.id,
        `╭━━━〔 ⚠️ 𝑪𝑶𝑼𝑵𝑻𝑹𝒀 𝑪𝑶𝑫𝑬 〕━━━╮\n\n` +
        `🌍 <b>Country code not detected.</b>\n\n` +
        `📌 Example:\n➜ <code>/pair 919876543210</code>\n\n` +
        `Please include a valid international country code.\n` +
        `╰━━━━━━━━━━━━━━━━━━╯`,
        { reply_to_message_id: msg.message_id }
      );
    }

    pairCooldown.set(userId, Date.now());

    const sessionId = safeSessionId(phone);
    const authDir = path.join(process.cwd(), "sessions", sessionId);
    const manager = global.__nobitaSessionManager;

    if (manager?.isRunning(sessionId)) {
      return safeReply(
        msg.chat.id,
        `💚 <b>${esc(phone)}</b> is already connected and running.\n\nUse /status to check active sessions.`,
        { reply_to_message_id: msg.message_id }
      );
    }

    if (pairingSessions.has(sessionId)) {
      return safeReply(
        msg.chat.id,
        `⏳ A pairing request for <code>${esc(phone)}</code> is already running. Please wait.`,
        { reply_to_message_id: msg.message_id }
      );
    }

    await cleanupPairingSession(sessionId, authDir, true);

    if (!manager || typeof manager.start !== "function") {
      return safeReply(
        msg.chat.id,
        failedText(phone),
        { reply_to_message_id: msg.message_id }
      );
    }

    let loadingMsg = null;

    try {
      loadingMsg = await safeReply(
        msg.chat.id,
        `⏳ <b>Generating Pair Code...</b>\n\n` +
        `📱 <b>Number:</b> <code>+${esc(phone)}</code>\n` +
        `${isoToFlag(countryInfo.iso)} <b>${esc(countryInfo.name)}</b> (+${countryInfo.callingCode})\n\n` +
        `🔄 <i>Please wait a moment...</i>`,
        { reply_to_message_id: msg.message_id }
      );

      let resolveCode, rejectCode;
      const codePromise = new Promise((resolve, reject) => {
        resolveCode = resolve;
        rejectCode = reject;
      });

      let opened = false;

      const sock = await manager.start(sessionId, {
        skipPairing: false,
        pairedPhone: phone,
        isPairingFlow: true,
        onPairingCode: resolveCode,
        onPairingError: rejectCode,
        onOpen: async () => {
          opened = true;
          pairingFinalized.add(sessionId);
          pairingSessions.delete(sessionId);
          try { manager.register(sessionId); } catch {}

          // If the code message is already present, the watcher below will edit it.
          // Otherwise send a connected confirmation.
        },
        onClose: async (code, detail) => {
          if (!opened && code !== 515 && !pairingFinalized.has(sessionId)) {
            pairingFinalized.add(sessionId);
            pairingSessions.delete(sessionId);
            await cleanupPairingSession(sessionId, authDir, true);
            const reason = detail?.error?.message || detail?.message || `status ${code || "unknown"}`;
            rejectCode(new Error(reason));
          }
        }
      });

      if (!sock || typeof sock.requestPairingCode !== "function") {
        throw new Error("WhatsApp socket was not created");
      }

      pairingSessions.set(sessionId, sock);

      if (loadingMsg?.message_id) {
        try { await bot.deleteMessage(msg.chat.id, loadingMsg.message_id); } catch {}
      }

      const code = await Promise.race([
        codePromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Pairing code generation timed out")), 30_000)
        )
      ]);

      const formatted = formatPairingCode(code);
      const flag = isoToFlag(countryInfo.iso);

      const pairText =
        `╭━━━〔 🔐 𝑷𝑨𝑰𝑹 𝑪𝑶𝑫𝑬 𝑹𝑬𝑨𝑫𝒀 〕━━━╮\n\n` +
        `📱 𝑵𝒖𝒎𝒃𝒆𝒓\n` +
        `➜ <code>+${esc(phone)}</code>\n\n` +
        `🌍 𝑪𝒐𝒖𝒏𝒕𝒓𝒚\n` +
        `➜ ${flag} <b>${esc(countryInfo.name)}</b> (+${countryInfo.callingCode})\n\n` +
        `🔑 𝑷𝒂𝒊𝒓𝒊𝒏𝒈 𝑪𝒐𝒅𝒆\n` +
        `➜ <code>${esc(formatted)}</code>\n\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `📲 𝑯𝒐𝒘 𝑻𝒐 𝑪𝒐𝒏𝒏𝒆𝒄𝒕\n` +
        `① 𝑶𝒑𝒆𝒏 𝑾𝒉𝒂𝒕𝒔𝑨𝒑𝒑\n` +
        `② 𝑺𝒆𝒕𝒕𝒊𝒏𝒈𝒔 → 𝑳𝒊𝒏𝒌𝒆𝒅 𝑫𝒆𝒗𝒊𝒄𝒆𝒔\n` +
        `③ 𝑳𝒊𝒏𝒌 𝑨 𝑫𝒆𝒗𝒊𝒄𝒆\n` +
        `④ 𝑬𝒏𝒕𝒆𝒓 𝑻𝒉𝒆 𝑪𝒐𝒅𝒆\n\n` +
        `⏳ 𝑬𝒙𝒑𝒊𝒓𝒆𝒔 ➜ ~90 𝑺𝒆𝒄𝒐𝒏𝒅𝒔\n\n` +
        `⚠️ 𝑫𝒐 𝑵𝒐𝒕 𝑺𝒉𝒂𝒓𝒆 𝒀𝒐𝒖𝒓 𝑪𝒐𝒅𝒆!\n\n` +
        `╰━━━━〔 💗 ${BRAND} 〕━━━━╯`;

      const pairMsg = await safeReply(
        msg.chat.id,
        pairText,
        {
          reply_to_message_id: msg.message_id,
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: "📋 𝑪𝒐𝒑𝒚 𝑪𝒐𝒅𝒆", copy_text: { text: formatted } }],
              []
            ]
          }
        }
      );

      // Miku-style background watcher: edit the same pair message after connection.
      if (pairMsg?.message_id) {
        const msgId = pairMsg.message_id;
        const WATCH_TIMEOUT_MS = 5 * 60 * 1000;

        (async () => {
          try {
            await new Promise((resolve, reject) => {
              const timer = setTimeout(() => {
                manager.removeListener("connected", onConn);
                manager.removeListener("session.deleted", onDel);
                reject(new Error("timeout"));
              }, WATCH_TIMEOUT_MS);

              function onConn(sid) {
                if (sid !== sessionId) return;
                clearTimeout(timer);
                manager.removeListener("connected", onConn);
                manager.removeListener("session.deleted", onDel);
                resolve();
              }

              function onDel(sid) {
                if (sid !== sessionId) return;
                clearTimeout(timer);
                manager.removeListener("connected", onConn);
                manager.removeListener("session.deleted", onDel);
                reject(new Error("deleted"));
              }

              manager.on("connected", onConn);
              manager.on("session.deleted", onDel);

              if (manager.isRunning(sessionId)) {
                onConn(sessionId);
              }
            });

            await safeEdit(
              msg.chat.id,
              msgId,
              `╭━━━〔 ❤️‍🩹 𝑩𝑶𝑻 𝑪𝑶𝑵𝑵𝑬𝑪𝑻𝑬𝑫 〕━━━╮\n\n` +
              `✅ 𝑺𝒖𝒄𝒄𝒆𝒔𝒔𝒇𝒖𝒍𝒍𝒚 𝑳𝒊𝒏𝒌𝒆𝒅!\n\n` +
              `📱 𝑵𝒖𝒎𝒃𝒆𝒓 ➜ <code>+${esc(phone)}</code>\n` +
              `${flag} 𝑪𝒐𝒖𝒏𝒕𝒓𝒚 ➜ <b>${esc(countryInfo.name)}</b> (+${countryInfo.callingCode})\n\n` +
              `💚 𝑩𝒐𝒕 𝒊𝒔 𝒏𝒐𝒘 𝑪𝒐𝒏𝒏𝒆𝒄𝒕𝒆𝒅!\n\n` +
              `╰━━━━〔 💗 ${BRAND} 〕━━━━╯`,
              { reply_markup: { inline_keyboard: [[]] } }
            );
          } catch {
            await safeEdit(
              msg.chat.id,
              msgId,
              `╭━━━〔 😴 𝑷𝑨𝑰𝑹 𝑼𝑵𝑺𝑼𝑪𝑪𝑬𝑺𝑺𝑭𝑼𝑳 〕━━━╮\n\n` +
              `⏰ 𝑻𝒊𝒎𝒆𝒅 𝒐𝒖𝒕 — 𝒄𝒐𝒅𝒆 𝒘𝒂𝒔 𝒏𝒐𝒕 𝒖𝒔𝒆𝒅.\n\n` +
              `📱 𝑵𝒖𝒎𝒃𝒆𝒓 ➜ <code>+${esc(phone)}</code>\n\n` +
              `🔁 𝑷𝒍𝒆𝒂𝒔𝒆 𝒕𝒓𝒚 𝒂𝒈𝒂𝒊𝒏:\n` +
              `<code>/pair ${esc(phone)}</code>\n\n` +
              `╰━━━━〔 💗 ${BRAND} 〕━━━━╯`,
              { reply_markup: { inline_keyboard: [[]] } }
            );
          }
        })();
      }

      // Give the session manager time to emit connection events.
      return pairMsg;
    } catch (error) {
      if (loadingMsg?.message_id) {
        try { await bot.deleteMessage(msg.chat.id, loadingMsg.message_id); } catch {}
      }
      await cleanupPairingSession(sessionId, authDir, true);
      console.error("Telegram pairing error:", error?.message || error);

      if (!pairingFinalized.has(sessionId)) {
        pairingFinalized.add(sessionId);
        return safeReply(
          msg.chat.id,
          `╭━━━〔 ❌ 𝑷𝑨𝑰𝑹 𝑭𝑨𝑰𝑳𝑬𝑫 〕━━━╮\n\n` +
          `📱 𝑵𝒖𝒎𝒃𝒆𝒓 ➜ <code>+${esc(phone)}</code>\n` +
          `💬 𝑹𝒆𝒂𝒔𝒐𝒏 ➜ <i>${esc(error?.message || String(error))}</i>\n\n` +
          `🔁 𝑻𝒓𝒚 𝒂𝒈𝒂𝒊𝒏:\n` +
          `<code>/pair ${esc(phone)}</code>\n\n` +
          `╰━━━━〔 💗 ${BRAND} 〕━━━━╯`,
          { reply_to_message_id: msg.message_id }
        );
      }
    }
  });

  bot.on("polling_error", (error) =>
    console.error("Telegram polling error:", error?.message || error)
  );
  bot.on("error", (error) =>
    console.error("Telegram bot error:", error?.message || error)
  );

  console.log("✅ Telegram Miku-style pairing control for X NOBITA MODZ is running.");
  return bot;
}

module.exports = { startTelegramPairing };
