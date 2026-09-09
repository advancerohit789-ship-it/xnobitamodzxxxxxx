const warnings = new Map();
const botSettings = require("../botSettings");
const MAX_WARN = 3;

function getMessageText(mek) {
    const msg = mek?.message || {};
    // Handle common wrappers used by WhatsApp/Baileys.
    const inner =
        msg.ephemeralMessage?.message ||
        msg.viewOnceMessage?.message ||
        msg.viewOnceMessageV2?.message ||
        msg.documentWithCaptionMessage?.message ||
        msg;

    return (
        inner.conversation ||
        inner.extendedTextMessage?.text ||
        inner.imageMessage?.caption ||
        inner.videoMessage?.caption ||
        inner.documentMessage?.caption ||
        ""
    );
}

function getSender(mek) {
    return mek?.key?.participant || mek?.participant || "";
}

async function sendAntiLinkText(conn, jid, text, sender) {
    // Baileys sendMessage requires a message-content object, not a raw string.
    return conn.sendMessage(
        jid,
        { text, mentions: sender ? [sender] : [] },
        {}
    );
}

async function antiLinkHandler(conn, mek, botJid) {
    const jid = mek?.key?.remoteJid;
    if (!jid?.endsWith("@g.us")) return;
    if (mek?.key?.fromMe) return;

    const mode = botSettings.group(botJid, "antilink")?.[jid];
    if (!mode) return;

    const text = getMessageText(mek);
    const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[^\s]+|t\.me\/[^\s]+)/i;
    if (!linkRegex.test(text)) return;

    const sender = getSender(mek);
    if (!sender) return;

    let metadata;
    try {
        metadata = await conn.groupMetadata(jid);
    } catch (e) {
        console.error("AntiLink metadata error:", e?.message || e);
        return;
    }

    const participant = metadata.participants.find(
        p => p.id === sender || p.jid === sender || p.phoneNumber === sender
    );
    if (participant?.admin) return;

    const key = `${botJid}:${jid}:${sender}`;

    try {
        // Always delete the offending message first.
        await conn.sendMessage(jid, {
            delete: {
                remoteJid: jid,
                fromMe: !!mek.key.fromMe,
                id: mek.key.id,
                participant: sender
            }
        });

        if (mode === "delete") {
            await sendAntiLinkText(
                conn,
                jid,
                `🗑️ @${sender.split("@")[0]} ᴀɴᴛɪʟɪɴᴋ • ʟɪɴᴋ ᴅᴇʟᴇᴛᴇᴅ`,
                sender
            );
            return;
        }

        if (mode === "kick") {
            // Send the notice before removing the user so the mention/output
            // can be delivered while the participant is still in the group.
            await sendAntiLinkText(
                conn,
                jid,
                `🚫 @${sender.split("@")[0]} ᴀɴᴛɪʟɪɴᴋ ᴅᴇᴛᴇᴄᴛᴇᴅ • ʟɪɴᴋ ᴅᴇʟᴇᴛᴇᴅ • ᴋɪᴄᴋᴇᴅ`,
                sender
            );
            await conn.groupParticipantsUpdate(jid, [sender], "remove");
            return;
        }

        if (mode === "warn") {
            let warn = (warnings.get(key) || 0) + 1;

            if (warn >= MAX_WARN) {
                // Show the final warning before kicking.
                await sendAntiLinkText(
                    conn,
                    jid,
                    `🚫 @${sender.split("@")[0]} ᴡᴀʀɴɪɴɢ ③/③ • ʟɪɴᴋ ᴅᴇʟᴇᴛᴇᴅ • ᴋɪᴄᴋᴇᴅ`,
                    sender
                );
                await conn.groupParticipantsUpdate(jid, [sender], "remove");
                warnings.delete(key);
                return;
            }

            warnings.set(key, warn);

            const warnMsg =
                warn === 1
                    ? `⚠️ @${sender.split("@")[0]} ᴀɴᴛɪʟɪɴᴋ ᴅᴇᴛᴇᴄᴛᴇᴅ • ʟɪɴᴋ ᴅᴇʟᴇᴛᴇᴅ • ᴡᴀʀɴ ①/③`
                    : `⚠️ @${sender.split("@")[0]} ᴀɴᴛɪʟɪɴᴋ ᴅᴇᴛᴇᴄᴛᴇᴅ • ʟɪɴᴋ ᴅᴇʟᴇᴛᴇᴅ • ᴡᴀʀɴ ②/③`;

            await sendAntiLinkText(conn, jid, warnMsg, sender);
        }
    } catch (error) {
        console.error("AntiLink Error:", error?.message || error);
    }
}

module.exports = { antiLinkHandler };
