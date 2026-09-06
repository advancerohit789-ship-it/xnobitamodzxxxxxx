// ═══════════════════════════════════════════════════════════════
// X NOBITA MODZ — AUTOMATION PLUGIN
// Commands: .autotyping / .autoread / .autostoryview
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'automation.json');

const DEFAULTS = {
  autotyping: false,
  autoread: false,
  autostoryview: false
};

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULTS, null, 2));
  }
}

function loadSettings() {
  try {
    ensureStorage();
    const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    return { ...DEFAULTS, ...saved };
  } catch (error) {
    return { ...DEFAULTS };
  }
}

let settings = loadSettings();

function saveSettings() {
  try {
    ensureStorage();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('[AUTOMATION SAVE ERROR]', error.message);
  }
}

function statusText(name) {
  return settings[name] ? '𝑶𝑵 🟢' : '𝑶𝑭𝑭 🔴';
}

function helpText(name) {
  const labels = {
    autotyping: '𝑨𝒖𝒕𝒐𝑻𝒚𝒑𝒊𝒏𝒈',
    autoread: '𝑨𝒖𝒕𝒐𝑹𝒆𝒂𝒅',
    autostoryview: '𝑨𝒖𝒕𝒐𝑺𝒕𝒐𝒓𝒚𝑽𝒊𝒆𝒘'
  };

  return (
    `⚙️ ${labels[name]}\n\n` +
    `➤ .${name} on\n` +
    `➤ .${name} off\n` +
    `➤ .${name} status\n\n` +
    `📊 Current : ${statusText(name)}\n\n` +
    '✦ 𝙭 𝙣σвιтα ✦'
  );
}

// Called by index.js command switch.
async function automationCommand(name, args, reply, isOwner) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULTS, name)) return;

  if (!isOwner) {
    return reply('❌ 𝑶𝒏𝒍𝒚 𝒐𝒘𝒏𝒆𝒓 𝒄𝒂𝒏 𝒄𝒉𝒂𝒏𝒈𝒆 𝒂𝒖𝒕𝒐𝒎𝒂𝒕𝒊𝒐𝒏 𝒔𝒆𝒕𝒕𝒊𝒏𝒈𝒔.');
  }

  const option = String(args?.[0] || '').trim().toLowerCase();

  if (option === 'on') {
    settings[name] = true;
    saveSettings();
    return reply(`⚡ ${name.toUpperCase()} : 𝑶𝑵 🟢\n\n✦ 𝙭 𝙣σвιтα ✦`);
  }

  if (option === 'off') {
    settings[name] = false;
    saveSettings();
    return reply(`⚡ ${name.toUpperCase()} : 𝑶𝑭𝑭 🔴\n\n✦ 𝙭 𝙣σвιтα ✦`);
  }

  if (option === 'status') {
    return reply(`⚡ ${name.toUpperCase()} : ${statusText(name)}\n\n✦ 𝙭 𝙣σвιтα ✦`);
  }

  return reply(helpText(name));
}

// Small cooldown maps prevent repeated API calls for duplicate/upsert events.
const lastTyping = new Map();
const TYPING_COOLDOWN = 2500;

function isUsableMessage(msg) {
  return Boolean(
    msg && msg.key && msg.key.remoteJid && msg.message && !msg.key.fromMe
  );
}

async function markRead(sock, key) {
  if (typeof sock.readMessages !== 'function') return;
  try {
    await sock.readMessages([key]);
  } catch (error) {
    // Some messages (especially broadcast/status events) can reject reads.
    console.error('[AUTOREAD ERROR]', error.message);
  }
}

async function handleTyping(sock, jid) {
  if (!jid || jid === 'status@broadcast') return;

  const now = Date.now();
  const last = lastTyping.get(jid) || 0;
  if (now - last < TYPING_COOLDOWN) return;
  lastTyping.set(jid, now);

  if (typeof sock.sendPresenceUpdate !== 'function') return;

  try {
    await sock.sendPresenceUpdate('composing', jid);
    setTimeout(() => {
      Promise.resolve(sock.sendPresenceUpdate('paused', jid)).catch(() => {});
    }, 900);
  } catch (error) {
    console.error('[AUTOTYPING ERROR]', error.message);
  }
}

// Called for every incoming message before command processing.
async function handleAutomation(sock, msg) {
  if (!isUsableMessage(msg)) return;

  const jid = msg.key.remoteJid;

  // WhatsApp status updates use status@broadcast.
  if (jid === 'status@broadcast') {
    if (settings.autostoryview) {
      await markRead(sock, msg.key);
    }
    return;
  }

  if (settings.autoread) {
    await markRead(sock, msg.key);
  }

  if (settings.autotyping) {
    await handleTyping(sock, jid);
  }
}

module.exports = {
  automationCommand,
  handleAutomation
};
