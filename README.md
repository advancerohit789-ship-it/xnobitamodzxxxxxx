# X NOBITA MODZ — Fixed Version (README)

This version fixes the **"Couldn't link device"** error that occurs with the original code.

## What was wrong in the original code

| Problem | Original Code | Fixed Code |
|---|---|---|
| WhatsApp version | `fetchLatestBaileysVersion()` — returns a **stale, hardcoded** version that WhatsApp now **rejects** with "Connection Failure" (405/401) | `fetchLatestWaWebVersion()` — always reads the **live** version from web.whatsapp.com |
| Browser identity | `["X NOBITA MODZ", "Chrome", "1.0.0"]` — unknown brand, WhatsApp may reject it | `["Ubuntu", "Chrome", "20.0.04"]` — a real, accepted identity |
| Pairing code timing | Requested right after socket creation (socket not ready → "Connection Closed" 428) | Requested from the `connection.update` event, only **once** per run |
| Reconnect loop | Immediate 5-second retries → WhatsApp rate limit (429) and suspicious-activity blocks | Exponential backoff (10s → 20s → ... → max 60s) |
| Session handling | Exited on any 401 (even transient login failures) | Exits only on a **true logout** after a successful pairing |

## How to use

1. Upload the files to your hosting (must support **Node.js** — Railway, Render, VPS, etc.).
2. Run `npm install` once.
3. Start the bot: `node index.js` (or `npm start`).
4. When the **Pairing Code** appears in the logs, open WhatsApp on your phone:
   - **Settings → Linked Devices → Link a Device → Link with phone number**
   - Enter the 8-digit code **quickly** (it expires).
5. Keep the code **private** — anyone with it can connect to your WhatsApp.

If your `config.js` number is correct and the bot is online, you will see:

```
✅ X NOBITA MODZ is online!
📞 Linked number: 917699121991:xxxx@s.whatsapp.net
```

## Commands

`.menu` · `.ping` · `.alive` · `.owner`

## If pairing still fails

WhatsApp sometimes **temporarily blocks new device linking from a server/datacenter IP** (this is a server-side restriction, not a code bug — well documented in Baileys GitHub issues #2679, #2691, #2702). In that case:

1. **Wait 30–60 minutes** (or up to 24 hours after many failed attempts) and try again. The bot retries automatically.
2. Try from a **different network** (e.g., your home internet / VPS in another region) — the block is per-IP.
3. Make sure the number in `config.js` is correct and can open WhatsApp normally.
4. On your phone: **clear WhatsApp cache** and make sure the app is updated.
5. Only use `node index.js` in **one place at a time** — two instances with the same session will conflict.
6. If it fails forever on pairing code, the **QR code** method usually works on the same IP: temporarily comment out the pairing block and set `printQRInTerminal: true` to scan a QR instead.

## Notes

- `config.js`: change `ownerNumber`, `ownerName`, `botName`, `prefix` as needed.
- Never share the `./session` folder — it contains your login keys.


## Telegram pairing control

The bot can now generate a WhatsApp pairing code from Telegram. Create a file named `.env` in the project root (or set the same values in your hosting environment):

```bash
TELEGRAM_BOT_TOKEN=123456:YOUR_BOT_TOKEN
TELEGRAM_OWNER_ID=123456789
AUTO_PAIRING=false
```

`TELEGRAM_BOT_TOKEN` is the token received from BotFather. `TELEGRAM_OWNER_ID` must be your private Telegram numeric chat ID; only this chat can use the pairing controls. The bot loads `.env` automatically at startup. Do not put the token in a public file or share it.

Start the bot normally with `npm start`, then open your Telegram bot and send:

```text
/start
/pair 919812345678
/status
```

The `/pair` command expects the WhatsApp number in international format without `+`, spaces, or hyphens. After receiving the code, open WhatsApp and go to **Settings → Linked Devices → Link a device → Link with phone number**, then enter the code quickly. The command has an owner-only check and a 60-second cooldown to reduce accidental or repeated requests.

The old console-based automatic pairing is disabled by default. To enable it temporarily, set `AUTO_PAIRING=true`. Telegram pairing is preferred because the code is sent only to the authorized Telegram chat.

The WhatsApp credentials remain in `./session`; never upload or share that directory.

### Finding Telegram owner ID

Send any message to your Telegram bot and inspect the numeric `chat.id` using a trusted Telegram ID utility or a temporary debug handler. Use the numeric ID, not the username.

### Pairing limitations

WhatsApp may temporarily reject new device linking from a datacenter IP or after repeated attempts. If that happens, wait before retrying and avoid running multiple instances with the same `session` directory.

### Security note

This integration uses Telegram polling and does not open a public pairing HTTP endpoint. Keep both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_OWNER_ID` private, and use HTTPS or a protected hosting environment for the server itself.

## References

- [1] [Baileys GitHub repository](https://github.com/WhiskeySockets/Baileys) — WhatsApp Web socket library used by this project.
- [2] [Telegram Bot API](https://core.telegram.org/bots/api) — Telegram bot interface used by the control module.

— **Manus AI**
