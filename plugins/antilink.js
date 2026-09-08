const { generateWAMessageFromContent } = require("@whiskeysockets/baileys");

const warnings = new Map();
const MAX_WARN = 3;


async function antiLinkHandler(conn, mek, m) {
    if (!mek.key.remoteJid.endsWith("@g.us")) return;
    if (mek.key.fromMe) return;

    const jid = mek.key.remoteJid;
    const mode = global.antilinkMode?.[jid];
    if (!mode) return;

    const text =
        mek.message?.conversation ||
        mek.message?.extendedTextMessage?.text ||
        mek.message?.imageMessage?.caption ||
        mek.message?.videoMessage?.caption ||
        "";

    const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[^\s]+|t\.me\/[^\s]+)/i;
    if (!linkRegex.test(text)) return;

    const sender = mek.key.participant || mek.key.remoteJid;

    let metadata;
    try {
        metadata = await conn.groupMetadata(jid);
    } catch (e) {
        return;
    }

    const participant = metadata.participants.find(p => p.id === sender);
    if (participant?.admin) return;

    try {
        await conn.sendMessage(jid, { delete: mek.key });

        if (mode === "delete") return;

        if (mode === "kick") {
            await conn.groupParticipantsUpdate(jid, [sender], "remove");
            await conn.sendMessage(jid,
                `🚫 @${sender.split("@")[0]} ᴀɴᴛɪʟɪɴᴋ ᴅᴇᴛᴇᴄᴛᴇᴅ • ʟɪɴᴋ ᴅᴇʟᴇᴛᴇᴅ • ᴋɪᴄᴋᴇᴅ`,
                { mentions: [sender] }
            );
            return;
        }

        if (mode === "warn") {
            const key = `${jid}:${sender}`;
            let warn = warnings.get(key) || 0;
            warn++;
            warnings.set(key, warn);

            let warnMsg;
            if (warn === 1) {
                warnMsg = `⚠️ @${sender.split("@")[0]} ᴀɴᴛɪʟɪɴᴋ ᴅᴇᴛᴇᴄᴛᴇᴅ • ʟɪɴᴋ ᴅᴇʟᴇᴛᴇᴅ • ᴡᴀʀɴ ①/③`;
            } else if (warn === 2) {
                warnMsg = `⚠️ @${sender.split("@")[0]} ᴀɴᴛɪʟɪɴᴋ ᴅᴇᴛᴇᴄᴛᴇᴅ • ʟɪɴᴋ ᴅᴇʟᴇᴛᴇᴅ • ᴡᴀʀɴ ②/③`;
            } else {
                warnMsg = `🚫 @${sender.split("@")[0]} ᴡᴀʀɴɪɴɢ ③/③ • ʟɪɴᴋ ᴅᴇʟᴇᴛᴇᴅ • ᴋɪᴄᴋᴇᴅ`;
            }

            await conn.sendMessage(jid, warnMsg, { mentions: [sender] });

            if (warn >= MAX_WARN) {
                await conn.groupParticipantsUpdate(jid, [sender], "remove");
                warnings.delete(key);
            }
        }
    } catch (error) {
        console.log("AntiLink Error:", error);
    }
}

module.exports = { antiLinkHandler };
