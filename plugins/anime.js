// ═══════════════════════════════════════
//          ✦ X NOBITA ANIME ✦
//          Jikan + Waifu.pics
// ═══════════════════════════════════════

const axios = require("axios");

const JIKAN = "https://api.jikan.moe/v4";
const WAIFU = "https://api.waifu.pics";

async function jikan(path) {
    const res = await axios.get(`${JIKAN}${path}`, {
        timeout: 15000,
        headers: { "User-Agent": "X-NOBITA-MODZ/2.0.0" }
    });
    return res.data;
}

function clean(text = "") {
    return String(text).replace(/\s+/g, " ").trim();
}

function animeCard(a) {
    const title = clean(a.title || a.title_english || "Unknown");
    const score = a.score ?? "N/A";
    const episodes = a.episodes ?? "N/A";
    const status = clean(a.status || "Unknown");
    const year = a.year || a.aired?.prop?.from?.year || "N/A";
    const genres = (a.genres || []).slice(0, 5).map(g => g.name).join(", ") || "N/A";
    return `╭━━〔 ✦ 𝑨𝑵𝑰𝑴𝑬 ✦ 〕━━╮
┃ 🎬 𝐓𝐢𝐭𝐥𝐞 : ${title}
┃ ⭐ 𝐒𝐜𝐨𝐫𝐞 : ${score}
┃ 📺 𝐄𝐩𝐢𝐬𝐨𝐝𝐞𝐬 : ${episodes}
┃ 📅 𝐘𝐞𝐚𝐫 : ${year}
┃ 📡 𝐒𝐭𝐚𝐭𝐮𝐬 : ${status}
┃ 🎭 𝐆𝐞𝐧𝐫𝐞𝐬 : ${genres}
╰━━━━━━━━━━━━━━━━━━╯`;
}

async function sendAnime(sock, jid, msg, reply, query, mode = "search") {
    if (!query) return reply(`❌ Please provide an anime name.\n\nExample: .${mode === "info" ? "animeinfo" : "anime"} Naruto`);

    try {
        const data = await jikan(`/anime?q=${encodeURIComponent(query)}&limit=1`);
        const a = data?.data?.[0];
        if (!a) return reply("❌ Anime not found.");

        const text = animeCard(a) +
            `\n\n📝 𝐒𝐲𝐧𝐨𝐩𝐬𝐢𝐬 : ${clean(a.synopsis || "No synopsis available.").slice(0, 900)}` +
            `\n\n🔗 ${a.url || ""}` +
            `\n\n✦ 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙕 ✦`;

        const image = a.images?.jpg?.large_image_url || a.images?.jpg?.image_url;
        if (image) {
            await sock.sendMessage(jid, { image: { url: image }, caption: text }, { quoted: msg });
        } else {
            await reply(text);
        }
    } catch (e) {
        console.error("[ANIME ERROR]", e?.message || e);
        await reply("❌ Anime service is temporarily unavailable. Try again later.");
    }
}

async function animeSearch(reply, query) {
    if (!query) return reply("❌ Example: .animesearch One Piece");
    try {
        const data = await jikan(`/anime?q=${encodeURIComponent(query)}&limit=5`);
        const list = data?.data || [];
        if (!list.length) return reply("❌ No anime found.");

        let out = `╭━━〔 ✦ 𝑨𝑵𝑰𝑴𝑬 𝑺𝑬𝑨𝑹𝑪𝑯 ✦ 〕━━╮\n`;
        list.forEach((a, i) => {
            out += `┃ ${i + 1}. ${clean(a.title).slice(0, 55)}\n┃    ⭐ ${a.score ?? "N/A"} | 📺 ${a.episodes ?? "N/A"} eps\n`;
        });
        out += `╰━━━━━━━━━━━━━━━━━━━━╯\n\n✦ 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙕 ✦`;
        return reply(out);
    } catch (e) {
        console.error("[ANIME SEARCH ERROR]", e?.message || e);
        return reply("❌ Anime search is temporarily unavailable.");
    }
}

async function manga(reply, query) {
    if (!query) return reply("❌ Example: .manga One Piece");
    try {
        const data = await jikan(`/manga?q=${encodeURIComponent(query)}&limit=1`);
        const m = data?.data?.[0];
        if (!m) return reply("❌ Manga not found.");
        const authors = (m.authors || []).map(x => x.name).join(", ") || "N/A";
        return reply(`╭━━〔 ✦ 𝑴𝑨𝑵𝑮𝑨 ✦ 〕━━╮
┃ 📖 𝐓𝐢𝐭𝐥𝐞 : ${clean(m.title)}
┃ ⭐ 𝐒𝐜𝐨𝐫𝐞 : ${m.score ?? "N/A"}
┃ 📚 𝐂𝐡𝐚𝐩𝐭𝐞𝐫𝐬 : ${m.chapters ?? "N/A"}
┃ 📕 𝐕𝐨𝐥𝐮𝐦𝐞𝐬 : ${m.volumes ?? "N/A"}
┃ ✍️ 𝐀𝐮𝐭𝐡𝐨𝐫 : ${authors}
┃ 📡 𝐒𝐭𝐚𝐭𝐮𝐬 : ${clean(m.status || "Unknown")}
┃
┃ 📝 ${clean(m.synopsis || "No synopsis available.").slice(0, 700)}
┃
┃ 🔗 ${m.url || ""}
╰━━━━━━━━━━━━━━━━━━━━╯`);
    } catch (e) {
        console.error("[MANGA ERROR]", e?.message || e);
        return reply("❌ Manga service is temporarily unavailable.");
    }
}

async function character(reply, query) {
    if (!query) return reply("❌ Example: .character Naruto");
    try {
        const data = await jikan(`/characters?q=${encodeURIComponent(query)}&limit=1`);
        const c = data?.data?.[0];
        if (!c) return reply("❌ Character not found.");
        const about = clean(c.about || "No character information available.").slice(0, 900);
        return reply(`╭━━〔 ✦ 𝑪𝑯𝑨𝑹𝑨𝑪𝑻𝑬𝑹 ✦ 〕━━╮
┃ 👤 𝐍𝐚𝐦𝐞 : ${clean(c.name)}
┃ 🔥 𝐅𝐚𝐯𝐨𝐫𝐢𝐭𝐞𝐬 : ${c.favorites ?? "N/A"}
┃
┃ 📝 ${about}
┃
┃ 🔗 ${c.url || ""}
╰━━━━━━━━━━━━━━━━━━━━╯`);
    } catch (e) {
        console.error("[CHARACTER ERROR]", e?.message || e);
        return reply("❌ Character service is temporarily unavailable.");
    }
}

async function randomImage(reply, type) {
    const endpoint = type === "waifu" ? "sfw/waifu" :
        type === "husband" ? "sfw/husbando" : "sfw/neko";
    try {
        const res = await axios.get(`${WAIFU}/${endpoint}`, { timeout: 15000 });
        const url = res.data?.url;
        if (!url) return reply("❌ No image found.");
        return { url };
    } catch (e) {
        console.error("[WAIFU ERROR]", e?.message || e);
        await reply("❌ Image service is temporarily unavailable.");
        return null;
    }
}

async function sendRandomImage(sock, jid, msg, reply, type) {
    const result = await randomImage(reply, type);
    if (!result) return;
    await sock.sendMessage(jid, {
        image: { url: result.url },
        caption: `╭━━〔 ✦ 𝑨𝑵𝑰𝑴𝑬 ✦ 〕━━╮
┃ 💕 𝐑𝐚𝐧𝐝𝐨𝐦 : ${type.toUpperCase()}
┃ ✨ 𝙓 𝙉𝙊𝘽𝙄𝙏𝘼 𝙈𝙊𝘿𝙕
╰━━━━━━━━━━━━━━━━━━╯`
    }, { quoted: msg });
}

const facts = [
    "One Piece was created by Eiichiro Oda and began serialization in 1997. 🏴‍☠️",
    "Naruto's creator is Masashi Kishimoto. 🍥",
    "Demon Slayer is also known as Kimetsu no Yaiba. ⚔️",
    "Attack on Titan was created by Hajime Isayama. 🪽",
    "My Hero Academia is also known as Boku no Hero Academia. 💥",
    "Death Note was written by Tsugumi Ohba and illustrated by Takeshi Obata. 📓"
];

function animeFact(reply) {
    return reply(`╭━━〔 ✦ 𝑨𝑵𝑰𝑴𝑬 𝑭𝑨𝑪𝑻 ✦ 〕━━╮
┃ 🧠 ${facts[Math.floor(Math.random() * facts.length)]}
╰━━━━━━━━━━━━━━━━━━━━╯`);
}

module.exports = {
    sendAnime,
    animeSearch,
    manga,
    character,
    sendRandomImage,
    animeFact
};
