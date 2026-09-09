// ═══════════════════════════════════════
//        ✦ X NOBITA AUTOREACT ✦
//        — adapted for single-file bot —
// ═══════════════════════════════════════

// ───────────── REACTIONS POOL ─────────────

const reactions = [
    "❤️","🩷","🧡","💛","💚","💙","💜","🤎","🖤","🤍",
    "💖","💗","💓","💞","💕","💘","💝","💟","❤️‍🔥","❤️‍🩹",
    "🥰","😍","😘","😚","😙","😗","🫶","🤗","😊","☺️",
    "😌","😇","🥹","🥺","🫂","🌹","🌷","🌸","🌺","🌻",
    "✨","💫","⭐","🌟","💐","🦋","🌙","🌈","🍫","🎀",
    "💋","👀","🙈","🙉","🙊","😻","😽","😺","😸","😹",
    "😿","😢","😭","😔","😞","😟","😕","🙁","☹️","🥲",
    "💔","😣","😖","😫","😩","🥀","🌧️","💌","💎","🪽",
    "🕊️","☁️","🌌","🫀","🫰","🤞","✌️","💍","🎁","🌹",
    "💜","💙","💗","💖","💞","💕","❤️","🩷","🥰","✨"
];

// ───────────── SETTINGS ─────────────

const botSettings = require("../botSettings");
const lastReaction = new Map();

// Cooldown: prevents reacting too rapidly (ms)
const COOLDOWN = 1500;
const lastReactTime = new Map();

// ───────────── RANDOM REACTION ─────────────

function getRandomReaction(botJid) {
    let reaction;
    const previous = lastReaction.get(botJid);

    do {
        reaction =
            reactions[Math.floor(Math.random() * reactions.length)];
    } while (
        reaction === previous &&
        reactions.length > 1
    );

    lastReaction.set(botJid, reaction);
    return reaction;
}

// ───────────── AUTOREACT COMMAND ─────────────
// (called from processCommandMessage switch in index.js)

function autoreactCommand(args, reply, isOwner, botJid) {
    if (!isOwner) {
        return reply("❌ 𝑶𝒏𝒍𝒚 𝒐𝒘𝒏𝒆𝒓 𝒄𝒂𝒏 𝒄𝒉𝒂𝒏𝒈𝒆 𝒂𝒖𝒕𝒐𝒓𝒆𝒂𝒄𝒕.");
    }

    const option = (args[0] || "").toLowerCase();

    if (option === "on") {
        botSettings.update(botJid, s => { s.autoreact = true; return s; });

        return reply(
            "⚡ 𝑨𝒖𝒕𝒐𝒓𝒆𝒂𝒄𝒕 : 𝑶𝑵\n\n" +
            "💖 𝑹𝒂𝒏𝒅𝒐𝒎 𝒓𝒆𝒂𝒄𝒕𝒊𝒐𝒏𝒔 𝒆𝒏𝒂𝒃𝒍𝒆𝒅\n" +
            "✦ 𝙭 𝙣σвιтα ✦"
        );
    }

    if (option === "off") {
        botSettings.update(botJid, s => { s.autoreact = false; return s; });

        return reply(
            "⚡ 𝑨𝒖𝒕𝒐𝒓𝒆𝒂𝒄𝒕 : 𝑶𝑭𝑭\n\n" +
            "✦ 𝙭 𝙣σвιтα ✦"
        );
    }

    if (option === "status") {
        return reply(
            `⚡ 𝑨𝒖𝒕𝒐𝒓𝒆𝒂𝒄𝒕 : ${botSettings.get(botJid).autoreact ? "𝑶𝑵 🟢" : "𝑶𝑭𝑭 🔴"}\n` +
            `💖 𝑹𝒆𝒂𝒄𝒕𝒊𝒐𝒏𝒔 : ${reactions.length}\n\n` +
            "✦ 𝙭 𝙣σвιтα ✦"
        );
    }

    return reply(
        "⚡ 𝑨𝒖𝒕𝒐𝒓𝒆𝒂𝒄𝒕\n\n" +
        "➤ .autoreact on\n" +
        "➤ .autoreact off\n" +
        "➤ .autoreact status\n\n" +
        "✦ 𝙭 𝙣σвιтα ✦"
    );
}

// ═══════════════════════════════════════
//          AUTO REACTION HANDLER
// ═══════════════════════════════════════

async function handleAutoReact(conn, m, botJid) {

    if (!botSettings.get(botJid).autoreact) return;

    // Ignore messages sent by the bot itself
    if (m.key && m.key.fromMe) return;

    // Cooldown
    const now = Date.now();

    const lastTime = lastReactTime.get(botJid) || 0;

    if (now - lastTime < COOLDOWN) {
        return;
    }

    lastReactTime.set(botJid, now);

    const reaction = getRandomReaction(botJid);

    try {
        await conn.sendMessage(
            m.key.remoteJid,
            {
                react: {
                    text: reaction,
                    key: m.key
                }
            }
        );
    } catch (error) {
        console.log(
            "[AUTOREACT ERROR]",
            error.message
        );
    }
}

// Export handler + command function for index.js
module.exports = {
    handleAutoReact,
    autoreactCommand
};
