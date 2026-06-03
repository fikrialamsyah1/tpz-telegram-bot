const BOT_TOKEN = process.env.BOT_TOKEN;

async function telegram(method, payload) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      raw: text
    };
  }
}

module.exports = async function handler(req, res) {
  console.log("METHOD:", req.method);
  console.log("BODY:", JSON.stringify(req.body || {}));

  if (!BOT_TOKEN) {
    return res.status(200).send("ERROR: BOT_TOKEN belum diset di Vercel");
  }

  // TEST MANUAL DARI BROWSER:
  // /api/telegram?chat_id=123456789
  if (req.method === "GET") {
    const chatId = req.query.chat_id;

    if (chatId) {
      const result = await telegram("sendMessage", {
        chat_id: chatId,
        text: "Test kirim dari Vercel berhasil ✅"
      });

      return res.status(200).json({
        mode: "manual_send_test",
        telegram_result: result
      });
    }

    return res.status(200).send(
      "TPZ Telegram Bot API aktif ✅\n\n" +
      "Untuk test kirim manual:\n" +
      "/api/telegram?chat_id=CHAT_ID_KAMU"
    );
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const update = req.body;

    if (!update || !update.message) {
      console.log("NO MESSAGE UPDATE");
      return res.status(200).send("NO MESSAGE");
    }

    const chatId = update.message.chat.id;
    const text = update.message.text || "";

    const result = await telegram("sendMessage", {
      chat_id: chatId,
      text: "Webhook masuk ke Vercel ✅\nPesan kamu: " + text
    });

    console.log("SEND RESULT:", JSON.stringify(result));

    return res.status(200).send("OK");
  } catch (err) {
    console.log("ERROR:", err.message);
    return res.status(200).send("ERROR: " + err.message);
  }
};
