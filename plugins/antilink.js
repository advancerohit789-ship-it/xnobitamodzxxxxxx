const { generateWAMessageFromContent } = require("@whiskeysockets/baileys");

const warnings = new Map();
const MAX_WARN = 3;

async function createContactPreview(conn, jid) {
    const contactNumber = String(global.config?.ownerNumber || "917699121991").replace(/\D/g, "");
    const vcard = `
BEGIN:VCARD
VERSION:3.0
FN:𝐗 𝐍𝐎𝐁𝐈𝐓𝐀 𝐌𝐎𝐃𝐙
ORG:X NOBITA MODZ
TEL;type=CELL;type=VOICE;waid=${contactNumber}:+${contactNumber}
END:VCARD
`;

    return generateWAMessageFromContent(
        jid,
        {
            contactMessage: {
                displayName: "⎯꯭̽ꪹ𝐗 𝐍𝐎𝐁𝐈𝐓𝐀 𝐌𝐎𝐃𝐙⎯꯭̽💜",
                vcard
            }
        },
        { userJid: conn.user?.id }
    );
}

async function sendWithContact(conn, jid, text, options = {}) {
    const contactPreview = await createContactPreview(conn, jid);
    return conn.sendMessage(jid, { text, ...options }, { quoted: contactPreview });
}

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
            await sendWithContact(conn, jid,
                `🚫 @${sender.split("@")[0]} | 𝐖𝐚𝐫𝐧 𝟑/𝟑 🔴
👢 𝐊𝐢𝐜𝐤𝐞𝐝
🛡️ 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙯 ✦`,
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
                warnMsg = `⚠️ @${sender.split("@")[0]} | 𝐖𝐚𝐫𝐧 𝟏/𝟑 🟡
🛡️ 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙯 ✦`;
            } else if (warn === 2) {
                warnMsg = `⚠️ @${sender.split("@")[0]} | 𝐖𝐚𝐫𝐧 𝟐/𝟑 🟠
🔗 𝐋𝐢𝐧𝐤 𝐃𝐞𝐭𝐞𝐜𝐭𝐞𝐝
🛡️ 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙯 ✦`;
            } else {
                warnMsg = `🚫 @${sender.split("@")[0]} | 𝐖𝐚𝐫𝐧 𝟑/𝟑 🔴
👢 𝐊𝐢𝐜𝐤𝐞𝐝
🛡️ 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙯 ✦`;
            }

            await sendWithContact(conn, jid, warnMsg, { mentions: [sender] });

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
