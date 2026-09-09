const botSettings = require('../botSettings');
const DEFAULTS = { autotyping:false, autoread:false, autostoryview:false };
function getSettings(botJid) { return botSettings.get(botJid).automation; }
function statusText(name, botJid) { return getSettings(botJid)[name] ? '𝑶𝑵 🟢' : '𝑶𝑭𝑭 🔴'; }
function helpText(name, botJid) {
  return `⚙️ ${name}\n\n➤ .${name} on\n➤ .${name} off\n➤ .${name} status\n\n📊 Current : ${statusText(name, botJid)}\n\n✦ 𝙭 𝙣σвιтα ✦`;
}
async function automationCommand(name, args, reply, isOwner, botJid) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULTS,name)) return;
  if (!isOwner) return reply('❌ 𝑶𝒏𝒍𝒚 𝒐𝒘𝒏𝒆𝒓 𝒄𝒂𝒏 𝒄𝒉𝒂𝒏𝒈𝒆 𝒂𝒖𝒕𝒐𝒎𝒂𝒕𝒊𝒐𝒏 𝒔𝒆𝒕𝒕𝒊𝒏𝒈𝒔.');
  const option = String(args?.[0]||'').trim().toLowerCase();
  if (option === 'on' || option === 'off') {
    const value = option === 'on';
    botSettings.update(botJid, s => { s.automation[name]=value; return s; });
    return reply(`⚡ ${name.toUpperCase()} : ${value?'𝑶𝑵 🟢':'𝑶𝑭𝑭 🔴'}\n\n✦ 𝙭 𝙣σвιтα ✦`);
  }
  if (option === 'status') return reply(`⚡ ${name.toUpperCase()} : ${statusText(name,botJid)}\n\n✦ 𝙭 𝙣σвιтα ✦`);
  return reply(helpText(name,botJid));
}
function isUsableMessage(msg){ return Boolean(msg&&msg.key&&msg.key.remoteJid&&msg.message&&!msg.key.fromMe); }
async function markRead(sock,key){ if(typeof sock.readMessages!=='function') return; try{await sock.readMessages([key]);}catch(e){} }
const lastTyping = new Map();
async function handleTyping(sock,jid,botJid){ if(!jid||jid==='status@broadcast') return; const k=`${botJid}:${jid}`; const now=Date.now(); const last=lastTyping.get(k)||0; if(now-last<2500)return; lastTyping.set(k,now); if(typeof sock.sendPresenceUpdate!=='function')return; try{await sock.sendPresenceUpdate('composing',jid);setTimeout(()=>Promise.resolve(sock.sendPresenceUpdate('paused',jid)).catch(()=>{}),900);}catch(e){} }
async function handleAutomation(sock,msg,botJid){
  if(!isUsableMessage(msg))return;
  const jid=msg.key.remoteJid, s=getSettings(botJid);
  if(jid==='status@broadcast'){if(s.autostoryview)await markRead(sock,msg.key);return;}
  if(s.autoread)await markRead(sock,msg.key);
  if(s.autotyping)await handleTyping(sock,jid,botJid);
}
module.exports={automationCommand,handleAutomation};
