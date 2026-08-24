require("dotenv").config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestWaWebVersion,
  downloadContentFromMessage,
  generateWAMessageContent,
  generateMessageID
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const axios = require("axios");
const yts = require("yt-search");
const config = require("./config");
const fs = require("fs");
const path = require("path");
const { antiLinkHandler } = require("./plugins/antilink");
const { handleAutoReact, autoreactCommand } = require("./plugins/fun");
const { sendAnime, animeSearch, manga, character, sendRandomImage, animeFact } = require("./plugins/anime");
const { startTelegramPairing } = require("./telegram");
const { SessionManager } = require("./sessionManager");
const FormData = require("form-data");
const { execSync, exec } = require("child_process");

// ───────────── FUN COMMANDS DATA ─────────────

const jokes = [
  "Why did the computer go to the doctor? Because it had a virus! 😂",
  "What do you call a sleeping bull? A bulldozer! 🤣",
  "Why was the math book sad? Because it had too many problems! 😆",
  "Why did the phone wear glasses? It lost its contacts! 😂"
];

const truths = [
  "What's your biggest dream? 💭",
  "Who was your first crush? ❤️",
  "What's one secret talent you have? 😏",
  "What's your most embarrassing moment? 😂"
];

const dares = [
  "Send your funniest selfie! 😂",
  "Change your profile picture for 5 minutes! 😜",
  "Send 3 funny emojis! 🤣",
  "Say 'I am awesome' 5 times! 🔥"
];

const riddles = [
  "What has hands but cannot clap? 🤔",
  "What has keys but cannot open locks? 🧩",
  "What gets wetter the more it dries? 🤔",
  "What has a face and two hands but no arms? 🕐"
];

const facts = [
  "Honey never spoils. 🍯",
  "Octopuses have three hearts. 🐙",
  "Bananas are berries botanically. 🍌",
  "A day on Venus is longer than its year. 🌍"
];

const ballAnswers = [
  "𝒀𝒆𝒔, 𝒅𝒆𝒇𝒊𝒏𝒊𝒕𝒆𝒍𝒚! ✨",
  "𝑴𝒂𝒚𝒃𝒆... 🤔",
  "𝑵𝒐𝒕 𝒍𝒊𝒌𝒆𝒍𝒚! 😅",
  "𝑨𝒔𝒌 𝒂𝒈𝒂𝒊𝒏 𝒍𝒂𝒕𝒆𝒓! 🔮",
  "𝑨𝒃𝒔𝒐𝒍𝒖𝒕𝒆𝒍𝒚! 💫"
];

const randomPick = arr => arr[Math.floor(Math.random() * arr.length)];

// --- yt-dlp বাইনারি (play command এর জনে) — অটো ডাউনলোড ---
const YTDLP_BIN = path.join(__dirname, "yt-dlp");

async function ensureYtDlp() {
  // যদি আগে থাকে, আছে কি না চেক
  if (fs.existsSync(YTDLP_BIN)) return YTDLP_BIN;

  const plat = process.platform;
  const arch = process.arch;
  let url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
  if (plat === "win32") url += ".exe";
  else if (plat === "darwin") url = arch === "arm64"
    ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos_arm64"
    : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos";
  else if (plat === "linux") url += arch === "arm64" ? "_aarch64" : "";

  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 60000 });
  fs.writeFileSync(YTDLP_BIN, Buffer.from(res.data));
  fs.chmodSync(YTDLP_BIN, 0o755);
  return YTDLP_BIN;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- URL CONVERSION HELPERS (for .url command) ---

async function downloadMedia(message) {
  const msg = message?.message || {};

  let mediaType = null;
  let mediaMsg = null;
  let ext = ".bin";

  if (msg.imageMessage) {
    mediaType = "image";
    mediaMsg = msg.imageMessage;
    ext = ".jpg";
  } else if (msg.videoMessage) {
    mediaType = "video";
    mediaMsg = msg.videoMessage;
    ext = ".mp4";
  } else if (msg.audioMessage) {
    mediaType = "audio";
    mediaMsg = msg.audioMessage;
    ext = ".ogg";
  } else if (msg.documentMessage) {
    mediaType = "document";
    mediaMsg = msg.documentMessage;
    ext = path.extname(mediaMsg.fileName || "") || ".bin";
  } else if (msg.stickerMessage) {
    mediaType = "sticker";
    mediaMsg = msg.stickerMessage;
    ext = ".webp";
  }

  if (!mediaMsg) return null;

  const stream = await downloadContentFromMessage(mediaMsg, mediaType);
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return {
    buffer: Buffer.concat(chunks),
    ext,
    type: mediaType
  };
}

async function uploadToTelegraph(filePath) {
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));
  const res = await axios.post("https://telegra.ph/upload", form, {
    headers: form.getHeaders()
  });
  return "https://telegra.ph" + res.data[0].src;
}

async function uploadToUgu(filePath) {
  const form = new FormData();
  form.append("files[]", fs.createReadStream(filePath));
  const res = await axios.post("https://uguu.se/upload.php", form, {
    headers: form.getHeaders()
  });
  return res.data?.files?.[0]?.url || res.data?.url || "";
}

async function uploadMedia(filePath, type) {
  if (type === "image" || type === "sticker") {
    try {
      return await uploadToTelegraph(filePath);
    } catch (e) {
      // TelegraPh failed → fallback to Uguu
      return await uploadToUgu(filePath);
    }
  }
  return await uploadToUgu(filePath);
}

// --- End URL Conversion Helpers ---

let connectAttempts = 0;
const MAX_RETRY_WAIT = 60000;

// Global state
global.antilinkMode = global.antilinkMode || {};
global.antigmMode = global.antigmMode || {};
global.botMode = global.botMode || "public";
global.prefix = global.prefix || config.prefix;

// Data Directory
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Welcome Settings
const WELCOME_FILE = path.join(DATA_DIR, "welcome.json");
if (!fs.existsSync(WELCOME_FILE)) fs.writeFileSync(WELCOME_FILE, "{}");

function loadWelcome() {
  try {
    return JSON.parse(fs.readFileSync(WELCOME_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveWelcome(data) {
  fs.writeFileSync(WELCOME_FILE, JSON.stringify(data, null, 2), "utf8");
  try { fs.fsyncSync(fs.openSync(WELCOME_FILE, "r+")); } catch (e) {}
}

// Goodbye Settings
const GOODBYE_FILE = path.join(DATA_DIR, "goodbye.json");
if (!fs.existsSync(GOODBYE_FILE)) fs.writeFileSync(GOODBYE_FILE, "{}");

function loadGoodbye() {
  try {
    return JSON.parse(fs.readFileSync(GOODBYE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveGoodbye(data) {
  fs.writeFileSync(GOODBYE_FILE, JSON.stringify(data, null, 2), "utf8");
}

// Normalize a participant from Baileys (supports string/object/LID forms).
function getParticipantJid(participant, metadata) {
  if (!participant) return "";
  if (typeof participant === "string") {
    const rec = (metadata?.participants || []).find(p => getParticipantJid(p) === participant || p?.id === participant);
    return rec?.phoneNumber || participant;
  }
  // Newer WhatsApp/Baileys participant updates may expose a LID in `id`
  // while `phoneNumber` contains the real @s.whatsapp.net JID. Prefer the
  // phone JID so mentions and profile-picture lookups work reliably.
  if (participant.phoneNumber && String(participant.phoneNumber).includes("@")) return participant.phoneNumber;
  const id = participant.id || participant.jid || participant.participant || "";
  const rec = (metadata?.participants || []).find(p => p?.id === id || p?.jid === id);
  return rec?.phoneNumber || participant.phoneNumber || id;
}

function getParticipantDisplayNumber(participant, metadata) {
  const jid = getParticipantJid(participant);
  const record = (metadata?.participants || []).find(p =>
    getParticipantJid(p) === jid ||
    p?.id === jid ||
    p?.jid === jid
  );
  const candidate = participant?.phoneNumber || participant?.number ||
    record?.phoneNumber || record?.number ||
    jid;
  return String(candidate).split("@")[0].split(":")[0].replace(/\\D/g, "") || "member";
}

async function getProfilePictureBuffer(sock, jid) {
  try {
    const url = await sock.profilePictureUrl(jid, "image");
    if (!url) return null;
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

// Warning Settings
const WARN_FILE = path.join(DATA_DIR, "warnings.json");
if (!fs.existsSync(WARN_FILE)) fs.writeFileSync(WARN_FILE, "{}");

function loadWarnings() {
  try {
    return JSON.parse(fs.readFileSync(WARN_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveWarnings(data) {
  fs.writeFileSync(WARN_FILE, JSON.stringify(data, null, 2));
}

// Utility Helpers
const formatTime = (seconds) => {
  seconds = Math.floor(seconds);
  const d = Math.floor(seconds / 86400);
  seconds %= 86400;
  const h = Math.floor(seconds / 3600);
  seconds %= 3600;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${d ? d + "d " : ""}${h ? h + "h " : ""}${m ? m + "m " : ""}${s}s`;
};


// ── Group Status helper ──────────────────────────────────────────────────────
async function sendGroupStatus(sock, groupJid, storyData) {
  const waMsgContent = await generateWAMessageContent(storyData, {
    upload: sock.waUploadToServer
  });

  const wrappedMessage = {
    groupStatusMessageV2: {
      message: waMsgContent.message || waMsgContent
    }
  };

  await sock.relayMessage(groupJid, wrappedMessage, {
    messageId: generateMessageID()
  });
}

// ── Download quoted media for .gstatus ────────────────────────────────────────
async function downloadQuotedMedia(quotedMessage) {
  if (!quotedMessage) return null;

  const mediaMap = [
    ["imageMessage", "image", ".jpg"],
    ["videoMessage", "video", ".mp4"],
    ["audioMessage", "audio", ".ogg"],
    ["documentMessage", "document", ".bin"]
  ];

  for (const [key, type, ext] of mediaMap) {
    if (quotedMessage[key]) {
      const stream = await downloadContentFromMessage(quotedMessage[key], type);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      return {
        buffer: Buffer.concat(chunks),
        type,
        ext,
        data: quotedMessage[key]
      };
    }
  }

  return null;
}

let activeSock = null;

// Multi-user session manager: every paired WhatsApp number gets its own persistent session.
let sessionManager;
const pairedReconnectAttempts = new Map();

async function startBot(authDir = "./session", options = {}) {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const { version } = await fetchLatestWaWebVersion();
  console.log(`🚀 Starting ${config.botName}...`);
  console.log(`📦 WhatsApp version: ${version.join(".")}`);

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    generateHighQualityLinkPreview: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    keepAliveIntervalMs: 30000,
    defaultQueryTimeoutMs: 60000
  });

  activeSock = sock;
  global.__nobitaWhatsAppSocket = sock;
  sock.ev.on("creds.update", saveCreds);

  let pairingRequested = false;

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

        const requestedNumber = options.pairedPhone || (process.env.AUTO_PAIRING === "true" ? String(config.ownerNumber).replace(/\D/g, "") : "");
    if (!options.skipPairing && requestedNumber && (connection === "connecting" || qr) && !pairingRequested) {
      if (!state.creds.registered) {
        pairingRequested = true;
        try {
          let number = String(requestedNumber).replace(/\D/g, "");
          if (number.startsWith("0")) number = number.slice(1);
          console.log(`\n📲 Generating pairing code for ${number}...`);
          await delay(3000);
          const code = await sock.requestPairingCode(number);
          if (typeof options.onPairingCode === "function") options.onPairingCode(code);
          console.log("\n╭━━〔 X NOBITA MODZ 〕━━╮");
          console.log(`┃ 🔐 Pairing Code: ${code}`);
          console.log("╰━━━━━━━━━━━━━━━━━━━━━━╯");
        } catch (err) {
          pairingRequested = false;
          if (typeof options.onPairingError === "function") options.onPairingError(err);
          console.error("❌ Pairing code error:", err?.message || err);
        }
      }
    }

    if (connection === "open") {
      if (typeof options.onOpen === "function") options.onOpen(sock);
      console.log(`✅ ${config.botName} is online!`);
      connectAttempts = 0;
      if (options.pairedPhone) pairedReconnectAttempts.set(String(options.pairedPhone).replace(/\D/g, ""), 0);

      try {
        const ownerJid = `${(sock.user?.id || "").split(":")[0].split("@")[0]}@s.whatsapp.net`;
        const successMsg = `╭━━━〔 ✦ 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙯 ✦ 〕━━━╮
┃
┃ 🟢 𝐖𝐇𝐀𝐓𝐒𝐀𝐏𝐏 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃
┃
┃ 🤖 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙯
┃ 💚 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃 𝐒𝐔𝐂𝐂𝐄𝐒𝐒𝐅𝐔𝐋𝐋𝐘
┃ ⚡ Your WhatsApp session is now
┃    𝐀𝐂𝐓𝐈𝐕𝐄 & 𝐑𝐄𝐀𝐃𝐘 𝐓𝐎 𝐔𝐒𝐄
┃
┃ 🌹 𝐁𝐎𝐓 𝐒𝐓𝐀𝐓𝐔𝐒
┃ ➜ 🟢 𝐎𝐍𝐋𝐈𝐍𝐄
┃ ➜ 🔐 𝐒𝐄𝐒𝐒𝐈𝐎𝐍 𝐒𝐄𝐂𝐔𝐑𝐄
┃ ➜ ⚙️ 𝐒𝐘𝐒𝐓𝐄𝐌 𝐑𝐄𝐀𝐃𝐘
┃
┃ 💫 𝐏𝐀𝐈𝐑𝐈𝐍𝐆 𝐒𝐔𝐂𝐂𝐄𝐒𝐒
┃ 💕 Welcome to 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙯
┃
┃ 🌹 𝐓𝐞𝐥𝐞𝐠𝐫𝐚𝐦 𝐏𝐚𝐢𝐫𝐢𝐧𝐠 𝐁𝐨𝐭
┃ ➜ https://t.me/x_nobita_modz_2_3_1_bot
┃
┃ 💚 𝐖𝐡𝐚𝐭𝐬𝐀𝐩𝐩 𝐂𝐡𝐚𝐧𝐧𝐞𝐥
┃ ➜ https://whatsapp.com/channel/0029VbDKAblJJhzecdIDXC1d
┃
╰━━━〔 ✦ 𝙭 𝙣σвιтα ✦ 〕━━━╯`;
        
        await sock.sendMessage(ownerJid, { text: successMsg });
        console.log(`📩 Success message sent to owner: ${ownerJid}`);
      } catch (e) {
        console.error("Failed to send success message to owner:", e.message);
      }
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (typeof options.onClose === "function") options.onClose(code, lastDisconnect);
      if (options.pairedPhone) {
        const phone = String(options.pairedPhone).replace(/\D/g, "");
        // Keep successful multi-user sessions alive. Only a real logout is permanent.
        if (code === DisconnectReason.loggedOut) {
          console.error(`⚠️ Paired session ${phone} logged out; removing its session.`);
          try { await fs.promises.rm(authDir, { recursive: true, force: true }); } catch {}
          sessionManager?.sessions.delete(phone);
          return;
        }
        if (code === DisconnectReason.badSession) {
          console.error(`⚠️ Paired session ${phone} has a bad session; removing it.`);
          try { await fs.promises.rm(authDir, { recursive: true, force: true }); } catch {}
          sessionManager?.sessions.delete(phone);
          return;
        }
        const attempts = (pairedReconnectAttempts.get(phone) || 0) + 1;
        pairedReconnectAttempts.set(phone, attempts);
        const retry = Math.min(60000, Math.max(3000, 1000 * Math.pow(2, Math.min(attempts - 1, 6))) + Math.floor(Math.random() * 2000));
        console.warn(`⚠️ Paired session ${phone} closed (status=${code || "unknown"}); reconnect attempt ${attempts} in ${retry}ms.`);
        setTimeout(() => startBot(authDir, { ...options, skipPairing: true }), retry);
        return;
      }
      if (code === DisconnectReason.loggedOut) {
        console.error("⚠️ Main WhatsApp session logged out. Telegram pairing remains available.");
        activeSock = null;
        return;
      }
      connectAttempts++;
      const wait = Math.min(MAX_RETRY_WAIT, 10000 * connectAttempts);
      setTimeout(() => startBot(authDir, options), wait);
    }
  });

  // --- WELCOME / GOODBYE HANDLER ---
  sock.ev.on("group-participants.update", async (update) => {
    try {
      const { id, participants = [], action } = update || {};
      if (!id || !Array.isArray(participants)) return;

      const metadata = await sock.groupMetadata(id);
      const groupName = metadata.subject || "Our Group";

      const botJid = (sock.user?.id || "").split(":")[0] + "@s.whatsapp.net";
      const botBase = botJid.split("@")[0];

      const settingsWelcome = loadWelcome();
      const settingsGoodbye = loadGoodbye();

      if (action !== "add" && action !== "remove" && action !== "leave") return;

      const enabled = action === "add" ? settingsWelcome[id] === true : settingsGoodbye[id] === true;
      if (!enabled) return;

      for (const participant of participants) {
        try {
          const userJid = getParticipantJid(participant, metadata);
          if (!userJid) continue;

          const userBase = userJid.split("@")[0].split(":")[0];
          if (userJid === botJid || userBase === botBase) continue;

          const displayNumber = getParticipantDisplayNumber(participant, metadata);
          const mentionJid = userJid;
          const mentionText = `@${displayNumber}`;

          if (action === "add") {
            const welcomeText = `${mentionText}\n\n` +
              `🌸 𝑾𝒆𝒍𝒄𝒐𝒎𝒆 𝒕𝒐 ${groupName}! 🌸\n\n` +
              `*🌹✨ আগে যদি জানতাম তুমি আসবে,*\n` +
              `*তাহলে সঙ্গে করে গোলাপ নিয়ে আসতাম…* 🌹🥰💐✨\n\n` +
              `*নাজানিয়ে যখন এসে গেছো,*\n` +
              `*গোলাপ তো আর নেই! 🥺🌸💗🫶*\n\n` +
              `*তাই গোলাপের মতো সুন্দর মন থেকে বলছি—*\n` +
              `*💖🌷 প্রিয়, তোমাকে জানাই একরাশ মিষ্টি Welcome! 🥰🎀✨*\n\n` +
              `*তোমার আসায় আমাদের আড্ডাটাও আজ*\n` +
              `*আরও সুন্দর, মিষ্টি আর আনন্দময় হয়ে গেল!* 🥳🌸💞🦋✨\n\n` +
              `⎯꯭𓆩𐏓꯭🇽 𝑵𝑶𝑩𝑰𝑻𝑨 ⎯͢♡`;

            const dp = await getProfilePictureBuffer(sock, userJid);
            if (dp) {
              await sock.sendMessage(id, {
                image: dp,
                caption: welcomeText,
                mentions: [mentionJid]
              });
            } else {
              await sock.sendMessage(id, {
                text: welcomeText,
                mentions: [mentionJid]
              });
            }
            console.log(`[WELCOME] Sent to ${mentionJid} in ${groupName}`);
          } else {
            const goodbyeText =
              `👋 𝑮𝒐𝒐𝒅𝒃𝒚𝒆, ${mentionText}! 🥀\n` +
              `💔 𝑾𝒆 𝒘𝒊𝒍𝒍 𝒎𝒊𝒔𝒔 𝒚𝒐𝒖. ❤️`;
            await sock.sendMessage(id, {
              text: goodbyeText,
              mentions: [mentionJid]
            });
            console.log(`[GOODBYE] Sent to ${mentionJid} in ${groupName}`);
          }
        } catch (e) {
          console.error(`[${action.toUpperCase()}] Per-user error:`, e?.message || e);
        }
      }
    } catch (error) {
      console.error("WELCOME/GOODBYE ERROR:", error);
    }
  });

  const processCommandMessage = async (msg) => {
    try {
      if (!msg || !msg.key) return;
      const jid = msg.key.remoteJid;
      const isGroup = jid.endsWith("@g.us");
      const sender = msg.key.participant || msg.key.remoteJid;

      // --- ANTI GROUP-MENTION STORY ---
      // Group status/story messages are represented by groupStatusMessageV2
      // (older/newer Baileys variants may expose groupStatusMessage).
      if (isGroup && global.antigmMode[jid]) {
        const hasGroupStatus =
          !!msg.message?.groupStatusMessageV2 ||
          !!msg.message?.groupStatusMessage ||
          !!msg.message?.messageContextInfo?.groupStatusMessageV2 ||
          !!msg.message?.messageContextInfo?.groupStatusMessage;

        if (hasGroupStatus) {
          try {
            await sock.sendMessage(jid, {
              delete: {
                remoteJid: jid,
                fromMe: !!msg.key.fromMe,
                id: msg.key.id,
                participant: msg.key.participant
              }
            });
          } catch (e) {
            console.error("Anti-GM Delete Error:", e?.message || e);
          }
          return;
        }
      }

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        "";

      // --- ANTILINK HANDLER (via Plugin) ---
      await antiLinkHandler(sock, msg, msg);

      if (!text.startsWith(global.prefix)) return;

      const args = text.slice(global.prefix.length).trim().split(/\s+/);
      const command = args.shift().toLowerCase();
      const q = args.join(" ");

      // --- LOADING EMOJI REACTION ---
      try {
        await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } });
      } catch (e) {
        console.error("Reaction Error:", e);
      }

      const reply = async (txt, options = {}) => {
        await sock.sendMessage(jid, { text: txt, ...options }, { quoted: msg });
      };

      // Owner is always the WhatsApp number currently paired/logged in as the bot.
      // This removes the need to hard-code an owner number for command permissions.
      // The WhatsApp account used to pair this bot is always the Owner.
      // `fromMe` is the most reliable owner signal for the paired account.
      const botJid = (sock.user?.id || "").split(":")[0];
      const senderJid = (sender || "").split(":")[0];
      const normalizeJid = (jid) => (jid || "").replace(/:[0-9]+(?=@)/, "");
      const isOwner =
        !!msg.key?.fromMe ||
        (!!botJid && normalizeJid(senderJid) === normalizeJid(botJid));
      const isBotNumber = isOwner;

      // If Private Mode, only owner can use
      if (global.botMode === "private" && !isOwner) return;

      let isAdmin = false;
      let groupMeta = null;
      if (isGroup) {
        groupMeta = await sock.groupMetadata(jid);
        const senderNorm = normalizeJid(sender);
        const senderParticipant = groupMeta.participants.find(
          p => normalizeJid(p.id) === senderNorm
        );
        isAdmin = !!senderParticipant?.admin;
      }

      const header = `╭━━━〔 ✦ ${config.botName} ✦ 〕━━━╮`;
      const footer = `╰━━━━━━━━━━━━━━━━━━━━╯`;

      // --- COMMANDS ---
      switch (command) {
        case "pair": {
          const rawNumber = args[0];

          if (!rawNumber) {
            await reply(`╭━━━〔 🔐 𝙇𝙄𝙉𝙆 𝘿𝙀𝙑𝙄𝘾𝙀 〕━━━╮
┃
┃ 📱 𝙐𝙨𝙖𝙜𝙚:
┃   .pair 91XXXXXXXXXX
┃
┃ 💡 Example:
┃   .pair 919876543210
┃
╰━━━━━━━━━━━━━━━━━━━━╯`);
            break;
          }

          let phone = String(rawNumber).replace(/\D/g, "");
          if (phone.startsWith("00")) phone = phone.slice(2);
          if (phone.startsWith("0")) phone = phone.slice(1);

          if (!/^\d{8,15}$/.test(phone)) {
            await reply(`❌ 𝙄𝙣𝙫𝙖𝙡𝙞𝙙 𝙥𝙝𝙤𝙣𝙚 𝙣𝙪𝙢𝙗𝙚𝙧!\n\n📱 Example: .pair 919876543210`);
            break;
          }

          // Prevent a second pairing request while the same session is starting.
          const pairStatus = sessionManager.status(phone);
          if (pairStatus === "starting") {
            await reply(`⏳ 𝙋𝙖𝙞𝙧𝙞𝙣𝙜 𝙞𝙨 𝙖𝙡𝙧𝙚𝙖𝙙𝙮 𝙞𝙣 𝙥𝙧𝙤𝙜𝙧𝙚𝙨𝙨 𝙛𝙤𝙧 +${phone}.`);
            break;
          }

          if (sessionManager.isRunning(phone)) {
            await reply(`🟢 +${phone} 𝙞𝙨 𝙖𝙡𝙧𝙚𝙖𝙙𝙮 𝙘𝙤𝙣𝙣𝙚𝙘𝙩𝙚𝙙 𝙩𝙤 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙕.`);
            break;
          }

          await reply(`╭━━━〔 💞 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙕 💞 〕━━━╮
┃
┃ 📱 𝙉𝙪𝙢𝙗𝙚𝙧: +${phone}
┃
┃ ⏳ 𝙂𝙚𝙣𝙚𝙧𝙖𝙩𝙞𝙣𝙜 𝙥𝙖𝙞𝙧𝙞𝙣𝙜 𝙘𝙤𝙙𝙚...
┃
┃ ⚠️ 𝘿𝙤 𝙣𝙤𝙩 𝙨𝙝𝙖𝙧𝙚 𝙩𝙝𝙚 𝙘𝙤𝙙𝙚.
╰━━━━━━━━━━━━━━━━━━━━╯`);

          try {
            await sessionManager.start(phone, {
              skipPairing: false,

              onPairingCode: async (code) => {
                try {
                  await reply(`╭━━━〔 🔐 𝙇𝙄𝙉𝙆 𝘿𝙀𝙑𝙄𝘾𝙀 〕━━━╮
┃
┃ 📱 𝙉𝙪𝙢𝙗𝙚𝙧: +${phone}
┃
┃ 🔑 𝙋𝘼𝙄𝙍𝙄𝙉𝙂 𝘾𝙊𝘿𝙀:
┃
┃    ${code}
┃
┃ 📲 𝙃𝙊𝙒 𝙏𝙊 𝙇𝙄𝙉𝙆:
┃
┃ 1️⃣ WhatsApp খুলুন
┃ 2️⃣ Settings → Linked Devices
┃ 3️⃣ Link a Device
┃ 4️⃣ Link with phone number
┃ 5️⃣ উপরের code দিন
┃
┃ ❤️ Code দেওয়ার পর bot connect হবে।
┃ ⚠️ Code কাউকে share করবেন না।
╰━━━━━━━━━━━━━━━━━━━━╯`);
                } catch (e) {
                  console.error("[PAIR] Could not send pairing code:", e?.message || e);
                }
              },

              onPairingError: async (err) => {
                try {
                  await reply(`❌ 𝙋𝘼𝙄𝙍𝙄𝙉𝙂 𝙁𝘼𝙄𝙇𝙀𝘿!\n\n${err?.message || "Unable to generate pairing code."}`);
                } catch (e) {
                  console.error("[PAIR] Could not send pairing error:", e?.message || e);
                }
              }
            });
          } catch (err) {
            console.error("[PAIR COMMAND ERROR]", err);
            await reply(`❌ 𝙋𝘼𝙄𝙍𝙄𝙉𝙂 𝙀𝙍𝙍𝙊𝙍!\n\n${err?.message || "Unable to start WhatsApp pairing."}`);
          }

          break;
        }
        case "ping":
          const start = Date.now();
          await reply("Testing Ping...");
          const end = Date.now();
          await reply(`🏓 Pong! Speed: ${end - start}ms`);
          break;

        case "alive":
          await reply(`🤖 Bot : ${config.botName}\n⚡ Status : Online\n🔖 Prefix : ${global.prefix}\n🕐 Time : ${new Date().toLocaleString()}`);
          break;

        case "owner":
          const ownerMsg = `╭━━━〔 ✦ 𝐎𝐖𝐍𝐄𝐑 ✦ 〕━━━╮\n┃\n┃ 👑 𝙭 𝙣σвιтα\n┃\n┃ 📱 𝐓𝐄𝐋𝐄𝐆𝐑𝐀𝐌\n┃ 🔗 t.me/Nobitaxudi\n┃\n╰━━━━━━━━━━━━━━━━━━━━╯`;
          await reply(ownerMsg);
          break;

        case "menu":
          const menuText = `╭══ ╳-♡ 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙕 ♡🫶🏻❤️‍🩹
┃ ʀᴜɴ     : 01h 59m 26s
┃🫀 ᴍᴏᴅᴇ    : PUBLIC ❤️‍🩹
┃ ᴘʀᴇғɪx  : .
┃ ᴠᴇʀsɪᴏɴ : 2.0.0
┃ᴛɪᴍᴇ    : 08:51:59
┃🫂 ᴜsᴇʀ    : 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼
┃ ᴏᴡɴᴇʀ   : 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼
┃ ᴅᴇᴠᴇʟᴏᴘᴇʀ : 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼
╰═════════════════⊷

♡︎•━━━━━ 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙕 🤌🏻━━━━━━•♡︎

╭────❒ 𝑴𝑨𝑰𝑵 ❒
├◈ ping
├◈ pair
├◈ alive
├◈ menu
├◈ owner
┕──────────────────❒

╭────❒ 𝑩𝑶𝑻 𝑪𝑶𝑵𝑻𝑹𝑶𝑳 ❒
├◈ public
├◈ private
├◈ setprefix
├◈ restart
├◈ update
┕──────────────────❒

╭────❒ 𝑮𝑹𝑶𝑼𝑷 ❒
├◈ tagall
├◈ hidetag
├◈ kick
├◈ promote
├◈ demote
├◈ linkgc
├◈ antilink
├◈ antigm
├◈ welcome
├◈ wstatus
├◈ gstatus
├◈ goodbye on
├◈ goodbye off
├◈ add
├◈ admins
├◈ tagadmins
├◈ approve
├◈ reject
├◈ requests
├◈ lock
├◈ unlock
├◈ disappear
├◈ poll
├◈ warn
├◈ warnlist
├◈ resetwarn
├◈ setname
├◈ setdesc
├◈ grouplink
├◈ revoke
├◈ mute
├◈ unmute
├◈ delete
┕──────────────────❒

╭────❒ 𝑼𝑻𝑰𝑳𝑰𝑻𝒀 ❒
├◈ uptime
├◈ runtime
├◈ info
├◈ profile
├◈ groupinfo
├◈ id
├◈ jid
├◈ quote
├◈ cstatus
┕──────────────────❒

╭────❒ 𝑫𝑶𝑾𝑵𝑳𝑶𝑨𝑫 ❒
├◈ play
┕──────────────────❒

╭────❒ 𝑻𝑶𝑶𝑳𝑺 ❒
├◈ sticker
├◈ vv
├◈ url
┕──────────────────❒

╭────❒ 𝑨𝑰 ❒
├◈ ai
┕──────────────────❒

╭────❒ 𝑭𝑼𝑵 ❒
├◈ joke
├◈ truth
├◈ dare
├◈ riddle
├◈ fact
├◈ 8ball
├◈ dice
├◈ coin
├◈ rate
├◈ howlucky
├◈ howcute
├◈ autoreact
┕──────────────────❒

╭────❒ 𝑨𝑵𝑰𝑴𝑬 ❒
├◈ anime
├◈ animesearch
├◈ animeinfo
├◈ manga
├◈ character
├◈ waifu
├◈ waifuimage
├◈ husband
├◈ neko
├◈ animefact
┕──────────────────❒

╭────❒ 𝑿 𝑵𝑶𝑩𝑰𝑻𝑨 𝑴𝑶𝑫𝒁 ❒
├◈ .public
├◈ .private
├◈ .setprefix
├◈ .restart
├◈ .update
┕──────────────────❒

~Made with love by 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙕 😩🫶🏻~`;
          
          if (config.menuImage) {
            await sock.sendMessage(jid, { image: { url: config.menuImage }, caption: menuText }, { quoted: msg });
          } else {
            await reply(menuText);
          }
          break;

// --- BOT CONTROL ---
case "public":
  if (!isBotNumber) return reply("❌ 𝐎𝐧𝐥𝐲 𝐛𝐨𝐭 𝐥𝐨𝐠𝐢𝐧 𝐧𝐮𝐦𝐛𝐞𝐫 𝐜𝐚𝐧 𝐮𝐬𝐞 𝐭𝐡𝐢𝐬 𝐜𝐨𝐦𝐦𝐚𝐧𝐝.");
  global.botMode = "public";
  await reply(`🌐 𝐏𝐔𝐁𝐋𝐈𝐂 𝐌𝐎𝐃𝐄

✅ 𝐁𝐨𝐭 𝐢𝐬 𝐧𝐨𝐰 𝐚𝐯𝐚𝐢𝐥𝐚𝐛𝐥𝐞 𝐟𝐨𝐫 𝐞𝐯𝐞𝐫𝐲𝐨𝐧𝐞.`);
  break;

case "private":
  if (!isBotNumber) return reply("❌ 𝐎𝐧𝐥𝐲 𝐛𝐨𝐭 𝐥𝐨𝐠𝐢𝐧 𝐧𝐮𝐦𝐛𝐞𝐫 𝐜𝐚𝐧 𝐮𝐬𝐞 𝐭𝐡𝐢𝐬 𝐜𝐨𝐦𝐦𝐚𝐧𝐝.");
  global.botMode = "private";
  await reply(`🔒 𝐏𝐑𝐈𝐕𝐀𝐓𝐄 𝐌𝐎𝐃𝐄

✅ 𝐁𝐨𝐭 𝐢𝐬 𝐧𝐨𝐰 𝐢𝐧 𝐩𝐫𝐢𝐯𝐚𝐭𝐞 𝐦𝐨𝐝𝐞.`);
  break;

case "setprefix":
  if (!isBotNumber) return reply("❌ 𝐎𝐧𝐥𝐲 𝐛𝐨𝐭 𝐥𝐨𝐠𝐢𝐧 𝐧𝐮𝐦𝐛𝐞𝐫 𝐜𝐚𝐧 𝐮𝐬𝐞 𝐭𝐡𝐢𝐬 𝐜𝐨𝐦𝐦𝐚𝐧𝐝.");
  if (!args[0]) return reply(`⚙️ 𝐏𝐑𝐄𝐅𝐈𝐗 𝐒𝐄𝐓𝐓𝐈𝐍𝐆

🔹 𝐂𝐮𝐫𝐫𝐞𝐧𝐭 𝐏𝐫𝐞𝐟𝐢𝐱: ${global.prefix}

💡 𝐔𝐬𝐚𝐠𝐞: .setprefix !`);
  if (args[0].length > 3) return reply("❌ 𝐏𝐫𝐞𝐟𝐢𝐱 𝐦𝐮𝐬𝐭 𝐛𝐞 𝟏–𝟑 𝐜𝐡𝐚𝐫𝐚𝐜𝐭𝐞𝐫𝐬.");
  global.prefix = args[0];
  await reply(`⚙️ 𝐏𝐑𝐄𝐅𝐈𝐗 𝐔𝐏𝐃𝐀𝐓𝐄𝐃

🔹 𝐍𝐞𝐰 𝐏𝐫𝐞𝐟𝐢𝐱: ${global.prefix}`);
  break;

case "restart":
  if (!isOwner) return reply("❌ 𝐎𝐰𝐧𝐞𝐫 𝐨𝐧𝐥𝐲 𝐜𝐨𝐦𝐦𝐚𝐧𝐝.");
  await reply(`🔄 𝐑𝐄𝐒𝐓𝐀𝐑𝐓𝐈𝐍𝐆...

🤖 𝐁𝐨𝐭: ${config.botName}
📡 𝐒𝐭𝐚𝐭𝐮𝐬: 𝐑𝐞𝐬𝐭𝐚𝐫𝐭𝐢𝐧𝐠`);
  setTimeout(() => process.exit(0), 1500);
  break;

case "update":
  if (!isOwner) return reply("❌ 𝐎𝐰𝐧𝐞𝐫 𝐨𝐧𝐥𝐲 𝐜𝐨𝐦𝐦𝐚𝐧𝐝.");
  await reply(`📦 𝐔𝐏𝐃𝐀𝐓𝐄

⚠️ 𝐀𝐮𝐭𝐨𝐦𝐚𝐭𝐢𝐜 𝐮𝐩𝐝𝐚𝐭𝐞 𝐢𝐬 𝐧𝐨𝐭 𝐜𝐨𝐧𝐟𝐢𝐠𝐮𝐫𝐞𝐝 𝐲𝐞𝐭.

💡 𝐔𝐩𝐝𝐚𝐭𝐞 𝐭𝐡𝐞 𝐛𝐨𝐭 𝐟𝐫𝐨𝐦 𝐲𝐨𝐮𝐫 𝐡𝐨𝐬𝐭𝐢𝐧𝐠 𝐨𝐫 𝐆𝐢𝐭 𝐫𝐞𝐩𝐨𝐬𝐢𝐭𝐨𝐫𝐲.`);
  break;

// --- UTILITY COMMANDS ---
case "uptime":
  await reply(`⏱️ 𝐔𝐏𝐓𝐈𝐌𝐄: ${formatTime(process.uptime())}
📡 𝐒𝐭𝐚𝐭𝐮𝐬: 𝐎𝐧𝐥𝐢𝐧𝐞`);
  break;

case "runtime":
  await reply(`⚡ 𝐑𝐔𝐍𝐓𝐈𝐌𝐄: ${formatTime(process.uptime())}
🤖 𝐁𝐨𝐭: ${config.botName}`);
  break;

case "info":
  await reply(`👑 𝐎𝐰𝐧𝐞𝐫: ${config.ownerName}
🤖 𝐁𝐨𝐭: ${config.botName}
⚡ 𝐏𝐫𝐞𝐟𝐢𝐱: ${global.prefix}
💚 𝐌𝐨𝐝𝐞: ${global.botMode.toUpperCase()}
📡 𝐒𝐭𝐚𝐭𝐮𝐬: 𝐎𝐧𝐥𝐢𝐧𝐞`);
  break;

case "profile":
  await reply(`👤 𝐍𝐚𝐦𝐞: ${msg.pushName || "User"}
🆔 𝐈𝐃: 𝐇𝐢𝐝𝐝𝐞𝐧`);
  break;

case "groupinfo":
  if (!isGroup) return reply("❌ 𝐆𝐫𝐨𝐮𝐩 𝐨𝐧𝐥𝐲!");
  try {
    const metadataGI = await sock.groupMetadata(jid);
    await reply(`👥 𝐆𝐫𝐨𝐮𝐩: ${metadataGI.subject}
👤 𝐌𝐞𝐦𝐛𝐞𝐫𝐬: ${metadataGI.participants.length}
👑 𝐀𝐝𝐦𝐢𝐧𝐬: ${metadataGI.participants.filter(p => p.admin).length}
🆔 𝐆𝐫𝐨𝐮𝐩 𝐈𝐃: 𝐇𝐢𝐝𝐝𝐞𝐧`);
  } catch (e) {
    await reply("❌ 𝐄𝐫𝐫𝐨𝐫 𝐟𝐞𝐭𝐜𝐡𝐢𝐧𝐠 𝐠𝐫𝐨𝐮𝐩 𝐢𝐧𝐟𝐨.");
  }
  break;

case "id":
  await reply(`🆔 𝐔𝐬𝐞𝐫 𝐈𝐃: ${sender}
🔐 𝐏𝐫𝐢𝐯𝐚𝐜𝐲: 𝐏𝐫𝐨𝐭𝐞𝐜𝐭𝐞𝐝`);
  break;

case "jid":
  if (!q) {
    return reply(`🆔 𝐂𝐮𝐫𝐫𝐞𝐧𝐭 𝐉𝐈𝐃: ${jid}

💡 𝐔𝐬𝐞 .𝐣𝐢𝐝 <𝐥𝐢𝐧𝐤> 𝐭𝐨 𝐠𝐞𝐭 𝐆𝐫𝐨𝐮𝐩/𝐂𝐡𝐚𝐧𝐧𝐞𝐥 𝐉𝐈𝐃.`);
  }

  try {
    const link = q.trim();

    if (link.includes("chat.whatsapp.com/")) {
      const inviteCode = link.split("chat.whatsapp.com/")[1].split(/[?#\s]/)[0];
      const metadata = await sock.groupGetInviteInfo(inviteCode);

      await reply(`👥 𝐆𝐑𝐎𝐔𝐏 𝐉𝐈𝐃

📝 𝐍𝐚𝐦𝐞: ${metadata.subject || "Unknown"}
🆔 𝐉𝐈𝐃: ${metadata.id}`);
    }

    else if (link.includes("whatsapp.com/channel/")) {
      const inviteCode = link.split("whatsapp.com/channel/")[1]?.split(/[?#\s]/)[0];

      if (typeof sock.newsletterMetadata !== "function") {
        return reply("❌ 𝐂𝐡𝐚𝐧𝐧𝐞𝐥 𝐥𝐨𝐨𝐤𝐮𝐩 𝐧𝐨𝐭 𝐬𝐮𝐩𝐩𝐨𝐫𝐭𝐞𝐝.");
      }

      const result = await sock.newsletterMetadata("invite", inviteCode);
      const cJid = result?.id || result?.jid || result?.newsletterJid;

      await reply(`📢 𝐂𝐇𝐀𝐍𝐍𝐄𝐋 𝐉𝐈𝐃

📝 𝐍𝐚𝐦𝐞: ${result?.name || "Unknown"}
🆔 𝐉𝐈𝐃: ${cJid}`);
    }

    else {
      await reply("❌ 𝐔𝐧𝐬𝐮𝐩𝐩𝐨𝐫𝐭𝐞𝐝 𝐥𝐢𝐧𝐤. 𝐔𝐬𝐞 𝐆𝐫𝐨𝐮𝐩 𝐨𝐫 𝐂𝐡𝐚𝐧𝐧𝐞𝐥 𝐥𝐢𝐧𝐤.");
    }
  } catch (e) {
    await reply("❌ 𝐄𝐫𝐫𝐨𝐫 𝐟𝐞𝐭𝐜𝐡𝐢𝐧𝐠 𝐉𝐈𝐃. 𝐂𝐡𝐞𝐜𝐤 𝐥𝐢𝐧𝐤.");
  }
  break;

case "cstatus":
  if (!isOwner) return reply("❌ 𝐎𝐰𝐧𝐞𝐫 𝐨𝐧𝐥𝐲 𝐜𝐨𝐦𝐦𝐚𝐧𝐝.");
  if (!q) return reply("❌ 𝐔𝐬𝐚𝐠𝐞: .cstatus <channel_jid> <text>");

  try {
    const [targetJid, ...statusTextArr] = q.split(" ");
    const statusText = statusTextArr.join(" ");
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (quotedMsg?.imageMessage || quotedMsg?.videoMessage) {
      const stream = await downloadContentFromMessage(
        quotedMsg.imageMessage || quotedMsg.videoMessage,
        quotedMsg.imageMessage ? "image" : "video"
      );

      let buffer = Buffer.from([]);

      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      await sock.sendMessage(
        targetJid,
        {
          [quotedMsg.imageMessage ? "image" : "video"]: buffer,
          caption: statusText || ""
        },
        { newsletter: true }
      );
    } else {
      await sock.sendMessage(
        targetJid,
        { text: statusText },
        { newsletter: true }
      );
    }

    await reply("✅ 𝐂𝐡𝐚𝐧𝐧𝐞𝐥 𝐒𝐭𝐚𝐭𝐮𝐬 𝐏𝐨𝐬𝐭𝐞𝐝 𝐒𝐮𝐜𝐜𝐞𝐬𝐬𝐟𝐮𝐥𝐥𝐲!");
  } catch (e) {
    await reply("❌ 𝐅𝐚𝐢𝐥𝐞𝐝 𝐭𝐨 𝐩𝐨𝐬𝐭 𝐜𝐡𝐚𝐧𝐧𝐞𝐥 𝐬𝐭𝐚𝐭𝐮𝐬.");
  }
  break;

case "quote":
  const quotedQ = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

  if (!quotedQ) return reply("❌ 𝐏𝐥𝐞𝐚𝐬𝐞 𝐫𝐞𝐩𝐥𝐲 𝐭𝐨 𝐚 𝐦𝐞𝐬𝐬𝐚𝐠𝐞.");

  let qText =
    quotedQ.conversation ||
    quotedQ.extendedTextMessage?.text ||
    quotedQ.imageMessage?.caption ||
    quotedQ.videoMessage?.caption ||
    "Media message";

  await reply(`💬 𝐐𝐔𝐎𝐓𝐄

❝ ${qText} ❞

👑 𝐁𝐲: ${config.ownerName}`);
  break;

// --- GROUP COMMANDS ---

case "add": {
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner) return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙧 𝙊𝙬𝙣𝙚𝙧 𝙤𝙣𝙡𝙮!");

  const mentionedAdd =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  const nums = args
    .filter(x => /^[0-9]{6,20}$/.test(x))
    .map(x => x + "@s.whatsapp.net");

  const targets = [...new Set([...mentionedAdd, ...nums])];

  if (!targets.length)
    return reply(
      "👤 𝘼𝙙𝙙 𝙐𝙨𝙚𝙧\n" +
      "💡 𝙐𝙨𝙚: .add <number/@user>\n" +
      "✨ 𝙀𝙭𝙖𝙢𝙥𝙡𝙚: .add 919876543210"
    );

  try {
    const result = await sock.groupParticipantsUpdate(jid, targets, "add");
    const ok = result.filter(r => [200, 201].includes(r.status)).length;

    return reply(
      `💗 𝘼𝘿𝘿 𝙈𝙀𝙈𝘽𝙀𝙍\n` +
      `👤 𝙍𝙚𝙦𝙪𝙚𝙨𝙩𝙚𝙙: ${targets.length}\n` +
      `✅ 𝙎𝙪𝙘𝙘𝙚𝙨𝙨: ${ok}\n` +
      `🌸 𝙎𝙩𝙖𝙩𝙪𝙨: 𝘾𝙤𝙢𝙥𝙡𝙚𝙩𝙚`
    );
  } catch (e) {
    return reply(
      `❌ 𝘼𝙙𝙙 𝙁𝙖𝙞𝙡𝙚𝙙\n` +
      `📝 ${e?.message || "Check bot admin permission."}`
    );
  }
}

case "admins": {
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");

  const metaAdmins = await sock.groupMetadata(jid);
  const admins = metaAdmins.participants.filter(p => p.admin);
  const mentions = admins.map(p => p.id);

  let out = "👑 𝙂𝙍𝙊𝙐𝙋 𝘼𝘿𝙈𝙄𝙉𝙎\n\n";

  admins.forEach((p, i) => {
    out += `🌷 ${i + 1}. @${p.id.split("@")[0]}\n`;
  });

  return reply(out, { mentions });
}

case "tagadmins": {
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");

  const metaTag = await sock.groupMetadata(jid);
  const adminsTag = metaTag.participants.filter(p => p.admin);
  const tagMentions = adminsTag.map(p => p.id);
  const tagLine = adminsTag
    .map(p => `@${p.id.split("@")[0]}`)
    .join(" ");

  return reply(
    `👑 𝘼𝘿𝙈𝙄𝙉 𝙈𝙀𝙉𝙏𝙄𝙊𝙉\n\n` +
    `💗 ${tagLine || "𝙉𝙤 𝙖𝙙𝙢𝙞𝙣𝙨 𝙛𝙤𝙪𝙣𝙙"}`,
    { mentions: tagMentions }
  );
}

case "requests": {
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner) return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙧 𝙊𝙬𝙣𝙚𝙧 𝙤𝙣𝙡𝙮!");

  try {
    if (typeof sock.groupRequestParticipantsList !== "function")
      return reply("❌ 𝙅𝙤𝙞𝙣 𝙧𝙚𝙦𝙪𝙚𝙨𝙩𝙨 𝙖𝙧𝙚 𝙣𝙤𝙩 𝙨𝙪𝙥𝙥𝙤𝙧𝙩𝙚𝙙.");

    const reqs = await sock.groupRequestParticipantsList(jid);

    if (!reqs?.length)
      return reply("🌸 𝙉𝙤 𝙥𝙚𝙣𝙙𝙞𝙣𝙜 𝙟𝙤𝙞𝙣 𝙧𝙚𝙦𝙪𝙚𝙨𝙩𝙨.");

    const reqMentions = reqs.map(r => r.jid || r.id).filter(Boolean);

    let out = "💌 𝙅𝙊𝙄𝙉 𝙍𝙀𝙌𝙐𝙀𝙎𝙏𝙎\n\n";

    reqMentions.forEach((u, i) => {
      out += `🌷 ${i + 1}. @${u.split("@")[0]}\n`;
    });

    return reply(out, { mentions: reqMentions });
  } catch (e) {
    return reply(`❌ 𝙁𝙖𝙞𝙡𝙚𝙙\n📝 ${e?.message || ""}`);
  }
}

case "approve":
case "reject": {
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner) return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙧 𝙊𝙬𝙣𝙚𝙧 𝙤𝙣𝙡𝙮!");

  if (typeof sock.groupRequestParticipantsUpdate !== "function")
    return reply("❌ 𝙅𝙤𝙞𝙣 𝙧𝙚𝙦𝙪𝙚𝙨𝙩 𝙛𝙚𝙖𝙩𝙪𝙧𝙚 𝙣𝙤𝙩 𝙨𝙪𝙥𝙥𝙤𝙧𝙩𝙚𝙙.");

  let targetReqs =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  if (!targetReqs.length) {
    targetReqs = args
      .filter(x => /^[0-9]{6,20}$/.test(x))
      .map(x => x + "@s.whatsapp.net");
  }

  if (!targetReqs.length && args[0]) {
    try {
      const reqs = await sock.groupRequestParticipantsList(jid);
      const idx = Math.max(0, parseInt(args[0], 10) - 1);

      if (reqs[idx])
        targetReqs = [reqs[idx].jid || reqs[idx].id];
    } catch {}
  }

  if (!targetReqs.length)
    return reply(
      `💌 𝙐𝙨𝙚: .${command} <number>\n` +
      `🌷 𝙊𝙧: .${command} <list-number>`
    );

  try {
    await sock.groupRequestParticipantsUpdate(jid, targetReqs, command);

    const actionWord =
      command === "approve" ? "𝘼𝙥𝙥𝙧𝙤𝙫𝙚𝙙" : "𝙍𝙚𝙟𝙚𝙘𝙩𝙚𝙙";

    return reply(
      `${command === "approve" ? "💚" : "💔"} 𝙍𝙚𝙦𝙪𝙚𝙨𝙩 ${actionWord}\n` +
      `👤 𝘾𝙤𝙪𝙣𝙩: ${targetReqs.length}`,
      { mentions: targetReqs }
    );
  } catch (e) {
    return reply(`❌ 𝙁𝙖𝙞𝙡𝙚𝙙 𝙩𝙤 ${command}\n📝 ${e?.message || ""}`);
  }
}

case "lock":
case "unlock": {
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner) return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙧 𝙊𝙬𝙣𝙚𝙧 𝙤𝙣𝙡𝙮!");

  try {
    await sock.groupSettingUpdate(
      jid,
      command === "lock" ? "locked" : "unlocked"
    );

    return reply(
      command === "lock"
        ? "🔒 𝙂𝙧𝙤𝙪𝙥 𝙇𝙤𝙘𝙠𝙚𝙙 💗"
        : "🔓 𝙂𝙧𝙤𝙪𝙥 𝙐𝙣𝙡𝙤𝙘𝙠𝙚𝙙 🌸"
    );
  } catch (e) {
    return reply(`❌ 𝙁𝙖𝙞𝙡𝙚𝙙\n📝 ${e?.message || ""}`);
  }
}

case "disappear": {
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner) return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙧 𝙊𝙬𝙣𝙚𝙧 𝙤𝙣𝙡𝙮!");

  const d = (args[0] || "on").toLowerCase();

  const seconds =
    d === "off"
      ? 0
      : parseInt(d, 10) ||
        ({
          "24h": 86400,
          "7d": 604800,
          "90d": 7776000
        }[d] || 86400);

  try {
    await sock.groupSettingUpdate(jid, "ephemeral", seconds);

    return reply(
      seconds
        ? `👻 𝘿𝙞𝙨𝙖𝙥𝙥𝙚𝙖𝙧𝙞𝙣𝙜 𝙊𝙉 💗\n⏳ 𝘿𝙪𝙧𝙖𝙩𝙞𝙤𝙣: ${formatTime(seconds)}`
        : "🛑 𝘿𝙞𝙨𝙖𝙥𝙥𝙚𝙖𝙧𝙞𝙣𝙜 𝙊𝙁𝙁 🌸"
    );
  } catch (e) {
    return reply(`❌ 𝙎𝙚𝙩𝙩𝙞𝙣𝙜 𝙁𝙖𝙞𝙡𝙚𝙙\n📝 ${e?.message || ""}`);
  }
}

case "poll": {
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");

  const raw = q.trim();

  if (!raw)
    return reply(
      "📊 𝙋𝙊𝙇𝙇\n" +
      "💡 .poll Question | Option 1 | Option 2"
    );

  const parts = raw
    .split("|")
    .map(x => x.trim())
    .filter(Boolean);

  if (parts.length < 3)
    return reply(
      "❌ 𝙋𝙤𝙡𝙡 𝙣𝙚𝙚𝙙𝙨 𝙖 𝙦𝙪𝙚𝙨𝙩𝙞𝙤𝙣 + 2 𝙤𝙥𝙩𝙞𝙤𝙣𝙨.\n" +
      "🌷 .poll Favourite colour? | Red | Blue"
    );

  const [question, ...options] = parts;

  try {
    await sock.sendMessage(
      jid,
      {
        poll: {
          name: question,
          values: options.slice(0, 12),
          selectableCount: 1
        }
      },
      { quoted: msg }
    );

    return reply("💗 𝙋𝙤𝙡𝙡 𝘾𝙧𝙚𝙖𝙩𝙚𝙙 𝙎𝙪𝙘𝙘𝙚𝙨𝙨𝙛𝙪𝙡𝙡𝙮 🌸");
  } catch (e) {
    return reply(`❌ 𝙋𝙤𝙡𝙡 𝙁𝙖𝙞𝙡𝙚𝙙\n📝 ${e?.message || ""}`);
  }
}

case "tagall": {
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");

  const groupMetadata = await sock.groupMetadata(jid);
  const participants = groupMetadata.participants;

  let tagText = q
    ? `💗 𝙏𝙖𝙜 𝘼𝙡𝙡\n\n${q}\n\n`
    : "💗 𝙏𝙖𝙜 𝘼𝙡𝙡\n\n";

  for (const mem of participants) {
    tagText += `🌷 @${mem.id.split("@")[0]}\n`;
  }

  await sock.sendMessage(jid, {
    text: tagText,
    mentions: participants.map(a => a.id)
  });

  break;
}

case "hidetag": {
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");

  const groupMetaH = await sock.groupMetadata(jid);

  await sock.sendMessage(jid, {
    text: q || "💗 𝙃𝙞𝙙𝙙𝙚𝙣 𝙏𝙖𝙜",
    mentions: groupMetaH.participants.map(a => a.id)
  });

  break;
}

case "kick": {
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner)
    return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙣𝙡𝙮!");

  const ctxK = msg.message?.extendedTextMessage?.contextInfo;

  let targetK =
    ctxK?.participant ||
    ctxK?.mentionedJid?.[0] ||
    "";

  if (!targetK && args[0])
    targetK = args[0].replace(/[^0-9]/g, "");

  if (targetK && !targetK.includes("@"))
    targetK = `${targetK}@s.whatsapp.net`;

  if (!targetK)
    return reply("💡 𝙍𝙚𝙥𝙡𝙮 𝙤𝙧 𝙏𝙖𝙜 𝙖 𝙪𝙨𝙚𝙧 𝙩𝙤 𝙠𝙞𝙘𝙠!");

  try {
    const metaK = groupMeta || await sock.groupMetadata(jid);

    const botIdK = normalizeJid(sock.user?.id || "");
    const targetNormK = normalizeJid(targetK);

    const targetParticipantK = metaK.participants.find(
      p => normalizeJid(p.id) === targetNormK
    );

    const botParticipantK = metaK.participants.find(
      p => normalizeJid(p.id) === botIdK
    );

    if (!botParticipantK?.admin)
      return reply("❌ 𝘽𝙤𝙩 𝙢𝙪𝙨𝙩 𝙗𝙚 𝙖𝙣 𝙖𝙙𝙢𝙞𝙣!");

    if (!targetParticipantK)
      return reply("❌ 𝙐𝙨𝙚𝙧 𝙞𝙨 𝙣𝙤𝙩 𝙞𝙣 𝙩𝙝𝙚 𝙜𝙧𝙤𝙪𝙥!");

    if (normalizeJid(targetParticipantK.id) === botIdK)
      return reply("❌ 𝙄 𝙘𝙖𝙣'𝙩 𝙠𝙞𝙘𝙠 𝙢𝙮𝙨𝙚𝙡𝙛!");

    if (targetParticipantK.admin)
      return reply("❌ 𝘾𝙖𝙣'𝙩 𝙠𝙞𝙘𝙠 𝙖𝙣 𝙖𝙙𝙢𝙞𝙣!");

    await sock.groupParticipantsUpdate(
      jid,
      [targetParticipantK.id],
      "remove"
    );

    return reply("👢 𝙐𝙨𝙚𝙧 𝙆𝙞𝙘𝙠𝙚𝙙 💗");
  } catch (e) {
    console.error("Kick error:", e);
    return reply(`❌ 𝙆𝙞𝙘𝙠 𝙁𝙖𝙞𝙡𝙚𝙙\n📝 ${e?.message || ""}`);
  }
}

case "promote":
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner) return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙧 𝙊𝙬𝙣𝙚𝙧 𝙤𝙣𝙡𝙮!");

  const mentionP =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
    (args[0] && args[0].includes("@") ? args[0] : "");

  if (!mentionP) return reply("👤 𝙋𝙡𝙚𝙖𝙨𝙚 𝙩𝙖𝙜 𝙖 𝙪𝙨𝙚𝙧!");

  try {
    await sock.groupParticipantsUpdate(jid, [mentionP], "promote");
    await reply("👑 𝙐𝙨𝙚𝙧 𝙋𝙧𝙤𝙢𝙤𝙩𝙚𝙙 💗");
  } catch (e) {
    await reply("❌ 𝙋𝙧𝙤𝙢𝙤𝙩𝙚 𝙁𝙖𝙞𝙡𝙚𝙙!");
  }
  break;

case "demote":
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner) return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙧 𝙊𝙬𝙣𝙚𝙧 𝙤𝙣𝙡𝙮!");

  const mentionD =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
    (args[0] && args[0].includes("@") ? args[0] : "");

  if (!mentionD) return reply("👤 𝙋𝙡𝙚𝙖𝙨𝙚 𝙩𝙖𝙜 𝙖𝙣 𝙖𝙙𝙢𝙞𝙣!");

  try {
    await sock.groupParticipantsUpdate(jid, [mentionD], "demote");
    await reply("🌸 𝙐𝙨𝙚𝙧 𝘿𝙚𝙢𝙤𝙩𝙚𝙙");
  } catch (e) {
    await reply("❌ 𝘿𝙚𝙢𝙤𝙩𝙚 𝙁𝙖𝙞𝙡𝙚𝙙!");
  }
  break;

case "linkgc":
case "grouplink":
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner) return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙧 𝙊𝙬𝙣𝙚𝙧 𝙤𝙣𝙡𝙮!");

  try {
    const link = await sock.groupInviteCode(jid);
    await reply(
      `🔗 𝙂𝙍𝙊𝙐𝙋 𝙇𝙄𝙉𝙆\n\n` +
      `https://chat.whatsapp.com/${link}`
    );
  } catch (e) {
    await reply("❌ 𝙁𝙖𝙞𝙡𝙚𝙙 𝙩𝙤 𝙜𝙚𝙩 𝙜𝙧𝙤𝙪𝙥 𝙡𝙞𝙣𝙠!");
  }
  break;

case "revoke":
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner) return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙧 𝙊𝙬𝙣𝙚𝙧 𝙤𝙣𝙡𝙮!");

  try {
    await sock.groupRevokeInvite(jid);
    await reply("🔐 𝙂𝙧𝙤𝙪𝙥 𝙇𝙞𝙣𝙠 𝙍𝙚𝙫𝙤𝙠𝙚𝙙 💗");
  } catch (e) {
    await reply("❌ 𝙁𝙖𝙞𝙡𝙚𝙙 𝙩𝙤 𝙧𝙚𝙫𝙤𝙠𝙚 𝙡𝙞𝙣𝙠!");
  }
  break;

       case "mute":
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner) return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙧 𝙊𝙬𝙣𝙚𝙧 𝙤𝙣𝙡𝙮!");
  try {
    await sock.groupSettingUpdate(jid, "announcement");
    await reply("🔒 𝙈𝙪𝙩𝙚 𝙊𝙉\n👑 𝙊𝙣𝙡𝙮 𝙖𝙙𝙢𝙞𝙣𝙨 𝙘𝙖𝙣 𝙨𝙚𝙣𝙙 𝙢𝙚𝙨𝙨𝙖𝙜𝙚𝙨.");
  } catch (e) {
    await reply("❌ 𝙁𝙖𝙞𝙡𝙚𝙙 𝙩𝙤 𝙢𝙪𝙩𝙚 𝙜𝙧𝙤𝙪𝙥.");
  }
  break;

case "unmute":
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner) return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙧 𝙊𝙬𝙣𝙚𝙧 𝙤𝙣𝙡𝙮!");
  try {
    await sock.groupSettingUpdate(jid, "not_announcement");
    await reply("🔓 𝙈𝙪𝙩𝙚 𝙊𝙁𝙁\n💬 𝙀𝙫𝙚𝙧𝙮𝙤𝙣𝙚 𝙘𝙖𝙣 𝙨𝙚𝙣𝙙 𝙢𝙚𝙨𝙨𝙖𝙜𝙚𝙨.");
  } catch (e) {
    await reply("❌ 𝙁𝙖𝙞𝙡𝙚𝙙 𝙩𝙤 𝙪𝙣𝙢𝙪𝙩𝙚 𝙜𝙧𝙤𝙪𝙥.");
  }
  break;

case "setname":
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner) return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙧 𝙊𝙬𝙣𝙚𝙧 𝙤𝙣𝙡𝙮!");
  if (!q) return reply("💡 𝙐𝙨𝙚: .setname 𝙉𝙚𝙬 𝙂𝙧𝙤𝙪𝙥 𝙉𝙖𝙢𝙚");
  try {
    await sock.groupUpdateSubject(jid, q);
    await reply(`✨ 𝙂𝙧𝙤𝙪𝙥 𝙉𝙖𝙢𝙚 𝙐𝙥𝙙𝙖𝙩𝙚𝙙\n🏷️ ${q}`);
  } catch (e) {
    await reply("❌ 𝙁𝙖𝙞𝙡𝙚𝙙 𝙩𝙤 𝙘𝙝𝙖𝙣𝙜𝙚 𝙜𝙧𝙤𝙪𝙥 𝙣𝙖𝙢𝙚.");
  }
  break;

case "setdesc":
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner) return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙧 𝙊𝙬𝙣𝙚𝙧 𝙤𝙣𝙡𝙮!");
  if (!q) return reply("💡 𝙐𝙨𝙚: .setdesc 𝙔𝙤𝙪𝙧 𝘿𝙚𝙨𝙘𝙧𝙞𝙥𝙩𝙞𝙤𝙣");
  try {
    await sock.groupUpdateDescription(jid, q);
    await reply(`📝 𝙂𝙧𝙤𝙪𝙥 𝘿𝙚𝙨𝙘 𝙐𝙥𝙙𝙖𝙩𝙚𝙙\n💗 ${q}`);
  } catch (e) {
    await reply("❌ 𝙁𝙖𝙞𝙡𝙚𝙙 𝙩𝙤 𝙘𝙝𝙖𝙣𝙜𝙚 𝙙𝙚𝙨𝙘𝙧𝙞𝙥𝙩𝙞𝙤𝙣.");
  }
  break;

case "delete":
case "del":
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner) return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙧 𝙊𝙬𝙣𝙚𝙧 𝙤𝙣𝙡𝙮!");
  if (!msg.message?.extendedTextMessage?.contextInfo?.quotedMessage)
    return reply("💡 𝙍𝙚𝙥𝙡𝙮 𝙩𝙤 𝙖 𝙢𝙚𝙨𝙨𝙖𝙜𝙚 𝙖𝙣𝙙 𝙪𝙨𝙚 .delete");
  try {
    const quoted = msg.message.extendedTextMessage.contextInfo;
    await sock.sendMessage(jid, {
      delete: {
        remoteJid: jid,
        fromMe: false,
        id: quoted.stanzaId,
        participant: quoted.participant
      }
    });
  } catch (e) {
    await reply("❌ 𝙁𝙖𝙞𝙡𝙚𝙙 𝙩𝙤 𝙙𝙚𝙡𝙚𝙩𝙚 𝙢𝙚𝙨𝙨𝙖𝙜𝙚.");
  }
  break;

case "antigm": {
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner) return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙧 𝙊𝙬𝙣𝙚𝙧 𝙤𝙣𝙡𝙮!");

  const gmMode = (args[0] || "on").toLowerCase();

  if (!["on", "off"].includes(gmMode))
    return reply("💡 𝙐𝙨𝙚: .antigm on / .antigm off");

  if (gmMode === "on") {
    global.antigmMode[jid] = true;
    return reply("🛡️ 𝘼𝙣𝙩𝙞 𝙂𝙈 𝙊𝙉\n🗑️ 𝙂𝙧𝙤𝙪𝙥 𝙢𝙚𝙣𝙩𝙞𝙤𝙣 𝙨𝙩𝙤𝙧𝙮 𝙬𝙞𝙡𝙡 𝙗𝙚 𝙖𝙪𝙩𝙤 𝙙𝙚𝙡𝙚𝙩𝙚𝙙.");
  }

  delete global.antigmMode[jid];
  return reply("🛡️ 𝘼𝙣𝙩𝙞 𝙂𝙈 𝙊𝙁𝙁\n💗 𝙂𝙧𝙤𝙪𝙥 𝙢𝙚𝙣𝙩𝙞𝙤𝙣 𝙨𝙩𝙤𝙧𝙮 𝙖𝙪𝙩𝙤 𝙙𝙚𝙡𝙚𝙩𝙚 𝙙𝙞𝙨𝙖𝙗𝙡𝙚𝙙.");
}

case "antilink":
case "antilinkmode":
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner) return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙣𝙡𝙮!");

  const alMode = args[0]?.toLowerCase();

  if (!alMode) {
    return reply(
      "💗 𝘼𝙣𝙩𝙞𝙡𝙞𝙣𝙠\n" +
      "⚠️ .antilink warn\n" +
      "🗑️ .antilink delete\n" +
      "👢 .antilink kick\n" +
      "🌸 .antilink off"
    );
  }

  if (alMode === "off") {
    delete global.antilinkMode[jid];
    return reply("🌸 𝘼𝙣𝙩𝙞𝙡𝙞𝙣𝙠 𝙊𝙁𝙁");
  }

  if (!["warn", "delete", "kick"].includes(alMode))
    return reply("❌ 𝙄𝙣𝙫𝙖𝙡𝙞𝙙 𝙢𝙤𝙙𝙚");

  global.antilinkMode[jid] = alMode;

  if (alMode === "warn")
    return reply("🌷 𝘼𝙣𝙩𝙞𝙡𝙞𝙣𝙠 𝙒𝙖𝙧𝙣 𝙊𝙉\n⚠️ 𝙇𝙞𝙣𝙠 𝙙𝙚𝙡𝙚𝙩𝙚 + 𝙬𝙖𝙧𝙣");

  if (alMode === "delete")
    return reply("🧸 𝘼𝙣𝙩𝙞𝙡𝙞𝙣𝙠 𝘿𝙚𝙡𝙚𝙩𝙚 𝙊𝙉");

  if (alMode === "kick")
    return reply("🐰 𝘼𝙣𝙩𝙞𝙡𝙞𝙣𝙠 𝙆𝙞𝙘𝙠 𝙊𝙉");
  break;

case "welcome": {
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner) return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙧 𝙊𝙬𝙣𝙚𝙧 𝙤𝙣𝙡𝙮!");

  const wOption = args[0]?.toLowerCase();

  if (!wOption || !["on", "off"].includes(wOption))
    return reply("🌸 𝙒𝙚𝙡𝙘𝙤𝙢𝙚\n💗 .welcome on\n💗 .welcome off");

  const wData = loadWelcome();
  wData[jid] = wOption === "on";
  saveWelcome(wData);

  return reply(
    wOption === "on"
      ? "🌸 𝙒𝙚𝙡𝙘𝙤𝙢𝙚 𝙊𝙉\n💗 𝙉𝙚𝙬 𝙢𝙚𝙢𝙗𝙚𝙧𝙨 𝙬𝙞𝙡𝙡 𝙗𝙚 𝙬𝙚𝙡𝙘𝙤𝙢𝙚𝙙."
      : "🌷 𝙒𝙚𝙡𝙘𝙤𝙢𝙚 𝙊𝙁𝙁"
  );
}

case "goodbye": {
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isAdmin && !isOwner) return reply("❌ 𝘼𝙙𝙢𝙞𝙣 𝙤𝙧 𝙊𝙬𝙣𝙚𝙧 𝙤𝙣𝙡𝙮!");

  const gOption = args[0]?.toLowerCase();

  if (!gOption || !["on", "off"].includes(gOption))
    return reply("🌸 𝙂𝙤𝙤𝙙𝙗𝙮𝙚\n💗 .goodbye on\n💗 .goodbye off");

  const gData = loadGoodbye();
  gData[jid] = gOption === "on";
  saveGoodbye(gData);

  return reply(
    gOption === "on"
      ? "👋 𝙂𝙤𝙤𝙙𝙗𝙮𝙚 𝙊𝙉\n💗 𝙇𝙚𝙖𝙫𝙞𝙣𝙜 𝙢𝙚𝙢𝙗𝙚𝙧𝙨 𝙬𝙞𝙡𝙡 𝙧𝙚𝙘𝙚𝙞𝙫𝙚 𝙖 𝙜𝙤𝙤𝙙𝙗𝙮𝙚."
      : "🌷 𝙂𝙤𝙤𝙙𝙗𝙮𝙚 𝙊𝙁𝙁"
  );
}

case "gstatus": {
  if (!isGroup) return reply("❌ 𝙂𝙧𝙤𝙪𝙥 𝙤𝙣𝙡𝙮!");
  if (!isOwner) return reply("❌ 𝙊𝙬𝙣𝙚𝙧 𝙤𝙣𝙡𝙮!");

  const statusText = q.trim();
  const quotedContext = msg.message?.extendedTextMessage?.contextInfo;
  const quotedMessage = quotedContext?.quotedMessage;

  try {
    if (!statusText && !quotedMessage) {
      return reply(
        "🌸 𝙂𝙧𝙤𝙪𝙥 𝙎𝙩𝙖𝙩𝙪𝙨\n" +
        "📝 .gstatus Hello everyone!\n" +
        "🖼️ 𝙍𝙚𝙥𝙡𝙮 𝙩𝙤 𝙢𝙚𝙙𝙞𝙖 + .gstatus"
      );
    }

    await sock.sendMessage(jid, {
      react: { text: "⏳", key: msg.key }
    });

    let storyData;

    if (quotedMessage) {
      const media = await downloadQuotedMedia(quotedMessage);

      if (media) {
        const original = media.data;

        if (media.type === "image") {
          storyData = {
            image: media.buffer,
            caption: statusText || original.caption || ""
          };
        } else if (media.type === "video") {
          storyData = {
            video: media.buffer,
            caption: statusText || original.caption || ""
          };
        } else if (media.type === "audio") {
          storyData = {
            audio: media.buffer,
            mimetype: original.mimetype || "audio/ogg",
            ptt: !!original.ptt
          };
        } else if (media.type === "document") {
          storyData = {
            document: media.buffer,
            mimetype: original.mimetype || "application/octet-stream",
            fileName: original.fileName || "file"
          };
        }
      } else if (statusText) {
        storyData = {
          text: statusText,
          backgroundArgb: Math.floor(Math.random() * 0xffffffff),
          font: 1
        };
      }
    } else {
      storyData = {
        text: statusText,
        backgroundArgb: Math.floor(Math.random() * 0xffffffff),
        font: 1
      };
    }

    if (!storyData) {
      await sock.sendMessage(jid, {
        react: { text: "❌", key: msg.key }
      });
      return reply("❌ 𝙐𝙣𝙨𝙪𝙥𝙥𝙤𝙧𝙩𝙚𝙙 𝙢𝙚𝙙𝙞𝙖.");
    }

    await sendGroupStatus(sock, jid, storyData);

    await sock.sendMessage(jid, {
      react: { text: "✅", key: msg.key }
    });

    await reply("🌸 𝙂𝙧𝙤𝙪𝙥 𝙎𝙩𝙖𝙩𝙪𝙨 𝙎𝙚𝙣𝙩 💗");

  } catch (error) {
    console.error("gstatus command error:", error);

    try {
      await sock.sendMessage(jid, {
        react: { text: "❌", key: msg.key }
      });
    } catch {}

    await reply(`❌ 𝙂𝙧𝙤𝙪𝙥 𝙎𝙩𝙖𝙩𝙪𝙨 𝙁𝙖𝙞𝙡𝙚𝙙\n💡 ${error?.message || error}`);
  }
  break;
}

        case "wstatus":
          if (!isGroup) return reply("❌ Group only!");
          const wsData = loadWelcome();
          if (wsData[jid] === true) {
            await reply(`╭━━━〔 ✦ 𝐖𝐄𝐋𝐂𝐎𝐌𝐄 ✦ 〕━━━╮\n┃\n┃ 🟢 𝐖𝐄𝐋𝐂𝐎𝐌𝐄 𝐒𝐓𝐀𝐓𝐔𝐒 : 𝐎𝐍\n┃ ✅ এই group-এ welcome active\n┃\n┃ 🖤 𝙭 𝙣σвιтα\n╰━━━━━━━━━━━━━━━━━━━━╯`);
          } else {
            await reply(`╭━━━〔 ✦ 𝐖𝐄𝐋𝐂𝐎𝐌𝐄 ✦ 〕━━━╮\n┃\n┃ 🔴 𝐖𝐄𝐋𝐂𝐎𝐌𝐄 𝐒𝐓𝐀𝐓𝐔𝐒 : 𝐎𝐅𝐅\n┃ ❌ এই group-এ welcome off\n┃ 💡 On করতে: .welcome on\n┃\n┃ 🖤 𝙭 𝙣σвιтα\n╰━━━━━━━━━━━━━━━━━━━━╯`);
          }
          break;

        case "warn":
          if (!isGroup) return reply("❌ This command only works in groups!");
          if (!isAdmin && !isOwner) return reply("❌ Admin or Owner only!");
          const mentionW = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
          if (!mentionW) return reply("❌ Please mention the user.\n\nExample: .warn @user");
          const metaW = await sock.groupMetadata(jid);
          const botNum = sock.user.id.split(":")[0] + "@s.whatsapp.net";
          if (metaW.participants.find(p => p.id === mentionW)?.admin) return reply("❌ You cannot warn a group admin.");
          if (mentionW === botNum) return reply("❌ I cannot warn myself.");
          const warns = loadWarnings();
          if (!warns[jid]) warns[jid] = {};
          warns[jid][mentionW] = (warns[jid][mentionW] || 0) + 1;
          const countW = warns[jid][mentionW];
          if (countW >= 3) {
            delete warns[jid][mentionW];
            saveWarnings(warns);
            await reply(`╭━━━〔 ✦ 𝐖𝐀𝐑𝐍𝐈𝐍𝐆 ✦ 〕━━━╮\n┃\n┃ 👤 𝐔𝐒𝐄𝐑 : @${mentionW.split("@")[0]}\n┃ ⚠️ 𝐖𝐀𝐑𝐍 : 𝟑/𝟑\n┃\n┃ 🚫 𝐌𝐀𝐗 𝐖𝐀𝐑𝐍 𝐑𝐄𝐀𝐂𝐇𝐄𝐃\n┃ 👢 𝐔𝐒𝐄𝐑 𝐑𝐄𝐌𝐎𝐕𝐄𝐃\n┃\n┃ 🖤 𝙭 𝙣σвιтα\n╰━━━━━━━━━━━━━━━━━━━━╯`, { mentions: [mentionW] });
            try { await sock.groupParticipantsUpdate(jid, [mentionW], "remove"); } catch (e) {}
          } else {
            saveWarnings(warns);
            await reply(`╭━━━〔 ✦ 𝐖𝐀𝐑𝐍𝐈𝐍𝐆 ✦ 〕━━━╮\n┃\n┃ 👤 𝐔𝐒𝐄𝐑 : @${mentionW.split("@")[0]}\n┃ ⚠️ 𝐖𝐀𝐑𝐍 : ${countW}/3\n┃\n┃ 📌 𝟑 𝐖𝐀𝐑𝐍𝐈𝐍𝐆𝐒 = 𝐊𝐈𝐂𝐊\n┃\n┃ 🖤 𝙭 𝙣σвιтα\n╰━━━━━━━━━━━━━━━━━━━━╯`, { mentions: [mentionW] });
          }
          break;

        case "warnlist":
          if (!isGroup) return reply("❌ This command only works in groups!");
          const allWarns = loadWarnings();
          const groupWarns = allWarns[jid] || {};
          const warnUsers = Object.entries(groupWarns);
          if (!warnUsers.length) return reply(`╭━━━〔 ✦ 𝐖𝐀𝐑𝐍 𝐋𝐈𝐒𝐓 ✦ 〕━━━╮\n┃\n┃ ✅ No active warnings.\n┃\n╰━━━━━━━━━━━━━━━━━━━━╯`);
          let warnText = `╭━━━〔 ✦ 𝐖𝐀𝐑𝐍 𝐋𝐈𝐒𝐓 ✦ 〕━━━╮\n┃\n`;
          const warnMentions = [];
          for (const [uid, c] of warnUsers) {
            warnText += `┃ 👤 @${uid.split("@")[0]}\n┃ ⚠️ Warn : ${c}/3\n┃\n`;
            warnMentions.push(uid);
          }
          warnText += `╰━━━━━━━━━━━━━━━━━━━━╯`;
          await reply(warnText, { mentions: warnMentions });
          break;

        case "resetwarn":
          if (!isGroup) return reply("❌ This command only works in groups!");
          if (!isAdmin && !isOwner) return reply("❌ Admin or Owner only!");
          const mentionR = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
          if (!mentionR) return reply("❌ Mention a user.\n\nExample: .resetwarn @user");
          const rwData = loadWarnings();
          if (rwData[jid] && rwData[jid][mentionR]) {
            delete rwData[jid][mentionR];
            saveWarnings(rwData);
          }
          await reply(`╭━━━〔 ✦ 𝐖𝐀𝐑𝐍 RESET ✦ 〕━━━╮\n┃\n┃ 👤 @${mentionR.split("@")[0]}\n┃ ✅ Warning count reset.\n┃\n┃ 🖤 𝙭 𝙣σвιтα\n╰━━━━━━━━━━━━━━━━━━━━╯`, { mentions: [mentionR] });
          break;

        case "play":
          if (!q) return reply("Please provide a song name!");
          await reply("🔍 Searching song...");

          const search = await yts(q);
          const video = search.videos[0];
          if (!video) return reply("No results found.");

          await reply(`⏳ Downloading...\n🎵 ${video.title}`);

          // Temp directory
          const tempDir = path.join(__dirname, "temp");
          if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

          const safeFile = path.join(tempDir, `${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);

          try {
            // yt-dlp বাইনারি নেই হলে অটো ডাউনলোড করা (কিছু install করতে হবে না)
            const dlpBin = await ensureYtDlp();

            // yt-dlp দিয়ে audio download করা
            await new Promise((resolve, reject) => {
              exec(
                `"${dlpBin}" -f "ba/b" --extract-audio --audio-format mp3 --audio-quality 0 -o "${safeFile.replace(/"/g, "\\\"")}.%(ext)s" --no-playlist "${video.url}"`,
                { timeout: 300000, maxBuffer: 10 * 1024 * 1024 },
                (error, stdout, stderr) => {
                  if (error) reject(new Error((stderr || error.message || "unknown").slice(-300)));
                  else resolve();
                }
              );
            });

            // yt-dlp বেসনাম-এর সাথে format suffix যোগ করে ফাইল তৈরি করে (নাম.mp3 বা নাম.m4a)
            const downloaded = fs.readdirSync(tempDir).find(f => f.startsWith(path.basename(safeFile)) && /\.(mp3|m4a|webm|opus)$/i.test(f));
            const finalPath = downloaded ? path.join(tempDir, downloaded) : safeFile;

            if (!fs.existsSync(finalPath) || fs.statSync(finalPath).size < 10000) {
              throw new Error("File too small or missing");
            }

            // WhatsApp audio message হিসেবে পাঠানো
            await sock.sendMessage(
              jid,
              {
                audio: { url: finalPath },
                mimetype: "audio/mpeg",
                contextInfo: { mentionedJid: [sender] }
              },
              { quoted: msg }
            );

            await reply(`✅ Song sent!\n🎵 ${video.title}\n⏱ ${video.timestamp}\n🔗 ${video.url}\n\n✦ 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙯 ✦`);
          } catch (err) {
            console.log("Play Error:", err);
            await reply("❌ Song download failed. Try another song or check later.");
          } finally {
            // Temp file cleanup (৩ সেকেন্ড পর)
            setTimeout(() => {
              try {
                const leftover = fs.readdirSync(tempDir).filter(f => f.startsWith(path.basename(safeFile)));
                leftover.forEach(f => fs.unlinkSync(path.join(tempDir, f)));
              } catch (e) {}
            }, 3000);
          }
          break;

        case "vv": {
          // Reply to a View Once image/video/audio and use .vv
          const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
          const quotedMessage = contextInfo?.quotedMessage;

          if (!quotedMessage) {
            await reply("❌ *Reply to a View Once message first.*");
            break;
          }

          try {
            let inner = quotedMessage;

            const wrapper =
              inner.viewOnceMessageV2 ||
              inner.viewOnceMessageV2Extension ||
              inner.viewOnceMessage;

            if (wrapper?.message) inner = wrapper.message;
            if (inner.ephemeralMessage?.message) {
              inner = inner.ephemeralMessage.message;
            }

            let mediaType = null;
            let mediaMsg = null;

            if (inner.imageMessage) {
              mediaType = "image";
              mediaMsg = inner.imageMessage;
            } else if (inner.videoMessage) {
              mediaType = "video";
              mediaMsg = inner.videoMessage;
            } else if (inner.audioMessage) {
              mediaType = "audio";
              mediaMsg = inner.audioMessage;
            }

            if (!mediaMsg) {
              await reply("❌ *This is not a supported View Once media message.*");
              break;
            }

            await sock.sendMessage(jid, {
              react: { text: "⏳", key: msg.key }
            });

            const stream = await downloadContentFromMessage(mediaMsg, mediaType);
            const chunks = [];

            for await (const chunk of stream) {
              chunks.push(chunk);
            }

            const buffer = Buffer.concat(chunks);
            const caption = mediaMsg.caption || "";

            if (mediaType === "image") {
              await sock.sendMessage(
                jid,
                {
                  image: buffer,
                  caption: caption || "📸 *View Once Image*\n\n✦ 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙯 ✦"
                },
                { quoted: msg }
              );
            } else if (mediaType === "video") {
              await sock.sendMessage(
                jid,
                {
                  video: buffer,
                  caption: caption || "🎥 *View Once Video*\n\n✦ 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙯 ✦",
                  mimetype: mediaMsg.mimetype || "video/mp4"
                },
                { quoted: msg }
              );
            } else {
              await sock.sendMessage(
                jid,
                {
                  audio: buffer,
                  mimetype: mediaMsg.mimetype || "audio/ogg; codecs=opus",
                  ptt: !!mediaMsg.ptt
                },
                { quoted: msg }
              );
            }

            await sock.sendMessage(jid, {
              react: { text: "✅", key: msg.key }
            });
          } catch (error) {
            console.error("VV Error:", error);
            await sock.sendMessage(jid, {
              react: { text: "❌", key: msg.key }
            });
            await reply(`❌ *View Once retrieval failed.*\n\`${error?.message || error}\``);
          }
          break;
        }

        case "sticker":
          await reply("Sticker conversion is not implemented yet.");
          break;

        case "url":
        case "tourl":
        case "geturl": {
          // Reply করা message নাকি বর্তমান message-এ media আছে চেক করা
          const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          const target = quotedMsg ? { message: quotedMsg } : msg;

          let media;
          try {
            media = await downloadMedia(target);
          } catch (e) {
            await reply("❌ Media download failed. Try replying to a supported media.");
            break;
          }

          if (!media) {
            await reply(`╭━━〔 ✦ 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙯 ✦ 〕━━╮
┃
┃ ❌ 𝐍𝐨 𝐦𝐞𝐝𝐢𝐚 𝐟𝐨𝐮𝐧𝐝!
┃
┃ 📌 Reply to:
┃ • 🖼️ Image
┃ • 🎥 Video
┃ • 🎵 Audio
┃ • 📄 Document
┃ • 🏷️ Sticker
┃
┃ Then send:
┃ .url
┃
╰━━━━━━━━━━━━━━━━━━━━╯`);
            break;
          }

          await reply("⏳ Uploading media...");

          // Temp directory create করা
          const tempDir = path.join(__dirname, "temp");
          if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

          const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}${media.ext}`;
          const filePath = path.join(tempDir, fileName);
          fs.writeFileSync(filePath, media.buffer);

          let url = "";
          try {
            url = await uploadMedia(filePath, media.type);
          } catch (e) {
            console.error("[URL] Upload error:", e.message);
          } finally {
            setTimeout(() => {
              try {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
              } catch (e) {}
            }, 3000);
          }

          if (!url) {
            await reply(`❌ Upload failed.

✦ 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙯`);
            break;
          }

          await reply(`╭━━〔 ✦ 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙯 ✦ 〕━━╮
┃
┃ ✅ 𝐌𝐄𝐃𝐈𝐀 𝐔𝐏𝐋𝐎𝐀𝐃𝐄𝐃
┃
┃ 🔗 𝐔𝐑𝐋:
┃ ${url}
┃
╰━━━━━━━━━━━━━━━━━━━━╯`);
          break;
        }

        case "ai":
          if (!q) return reply("Please ask something!");
          await reply("Thinking...");
          try {
            const res = await axios.get(`https://api.simsimi.net/v2/?text=${encodeURIComponent(q)}&lc=en`);
            await reply(`*AI:* ${res.data.success}`);
          } catch (e) {
            await reply("AI is currently unavailable.");
          }
          break;

        // ───────────── FUN COMMANDS ─────────────

        case "joke":
          await reply(`😂 𝑱𝒐𝒌𝒆\n${randomPick(jokes)}\n\n✦ 𝙭 𝙣σвιтα ✦`);
          break;

        case "truth":
          await reply(`💭 𝑻𝒓𝒖𝒕𝒉\n${randomPick(truths)}\n\n✦ 𝙭 𝙣σвιтα ✦`);
          break;

        case "dare":
          await reply(`🔥 𝑫𝒂𝒓𝒆\n${randomPick(dares)}\n\n✦ 𝙭 𝙣σвιтα ✦`);
          break;

        case "riddle":
          await reply(`🧩 𝑹𝒊𝒅𝒅𝒍𝒆\n${randomPick(riddles)}\n\n✦ 𝙭 𝙣σвιтα ✦`);
          break;

        case "fact":
          await reply(`🌟 𝑭𝒂𝒄𝒕\n${randomPick(facts)}\n\n✦ 𝙭 𝙣σвιтα ✦`);
          break;

        case "8ball":
          await reply(`🎱 𝟴𝑩𝒂𝒍𝒍\n${randomPick(ballAnswers)}\n\n✦ 𝙭 𝙣σвιтα ✦`);
          break;

        case "dice":
          await reply(`🎲 𝑫𝒊𝒄𝒆\n🎯 𝑹𝒆𝒔𝒖𝒍𝒕 : ${Math.floor(Math.random() * 6) + 1}\n\n✦ 𝙭 𝙣σвιтα ✦`);
          break;

        case "coin":
          await reply(`🪙 𝑪𝒐𝒊𝒏\n${Math.random() < 0.5 ? "𝑯𝒆𝒂𝒅𝒔 🪙" : "𝑻𝒂𝒊𝒍𝒔 🪙"}\n\n✦ 𝙭 𝙣σвιтα ✦`);
          break;

        case "rate":
          await reply(`⭐ 𝑹𝒂𝒕𝒆\n𝑹𝒂𝒕𝒊𝒏𝒈 : ${Math.floor(Math.random() * 101)}%\n\n✦ 𝙭 𝙣σвιтα ✦`);
          break;

        case "howlucky":
          await reply(`🍀 𝑳𝒖𝒄𝒌\n𝑳𝒖𝒄𝒌 : ${Math.floor(Math.random() * 101)}%\n\n✦ 𝙭 𝙣σвιтα ✦`);
          break;

        case "howcute":
          await reply(`💖 𝑪𝒖𝒕𝒆\n𝑪𝒖𝒕𝒆𝒏𝒆𝒔𝒔 : ${Math.floor(Math.random() * 101)}%\n\n✦ 𝙭 𝙣σвιтα ✦`);
          break;

        case "anime":
          await sendAnime(sock, jid, msg, reply, q, "search");
          break;

        case "animesearch":
          await animeSearch(reply, q);
          break;

        case "animeinfo":
          await sendAnime(sock, jid, msg, reply, q, "info");
          break;

        case "manga":
          await manga(reply, q);
          break;

        case "character":
          await character(reply, q);
          break;

        case "waifu":
          await sendRandomImage(sock, jid, msg, reply, "waifu");
          break;

        case "waifuimage":
          await sendRandomImage(sock, jid, msg, reply, "waifu");
          break;

        case "husband":
          await sendRandomImage(sock, jid, msg, reply, "husband");
          break;

        case "neko":
          await sendRandomImage(sock, jid, msg, reply, "neko");
          break;

        case "animefact":
          animeFact(reply);
          break;

        default:
          break;
      }

      // --- SUCCESS EMOJI REACTION ---
      try {
        await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
      } catch (e) {
        console.error("Success Reaction Error:", e);
      }
      
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  };

  sock.ev.on("messages.upsert", async (data) => {
    for (const msg of data.messages) {
      if (!msg.message) continue;
      await processCommandMessage(msg);
      await handleAutoReact(sock, msg);
    }
  });

  return sock;
}

// The Telegram bot can start any user's session, while SessionManager keeps
// previously paired accounts alive across hosting restarts.
sessionManager = new SessionManager({
  startSession: (authDir, options = {}) => startBot(authDir, options),
  sessionsDir: path.join(process.cwd(), "sessions")
});

global.__nobitaSessionManager = sessionManager;
global.__nobitaStartSession = (authDir, options = {}) => startBot(authDir, options);

startTelegramPairing();

(async () => {
  // Restore all previously paired accounts first.
  await sessionManager.startAll();

  // Keep the original single-session mode when ./session has credentials.
  const mainCreds = path.join(process.cwd(), "session", "creds.json");
  if (fs.existsSync(mainCreds)) {
    startBot().catch((err) => console.error("Main session error:", err));
  } else if (sessionManager.sessions.size === 0) {
    // No existing account: start the normal pairing flow.
    startBot().catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
  }
})().catch((err) => {
  console.error("Fatal session-manager startup error:", err);
  process.exit(1);
});
