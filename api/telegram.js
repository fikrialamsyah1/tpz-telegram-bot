const BOT_TOKEN = process.env.BOT_TOKEN;
const API_TOKEN = process.env.API_TOKEN;

const BASE_WEB_URL = "https://theplayzone.rf.gd";
const DEFAULT_TOKO = "R40 CENGKARENG";
const API_LAPORAN_TIKET = BASE_WEB_URL + "/api_laporan_ticket.php";

// ======================================================
// HELPER BULAN / FORMAT
// ======================================================

function bulanToNumber(text) {
  text = String(text || "").toLowerCase();

  const map = [
    ["januari", 1], ["jan", 1],
    ["februari", 2], ["feb", 2],
    ["maret", 3], ["mar", 3],
    ["april", 4], ["apr", 4],
    ["mei", 5],
    ["juni", 6], ["jun", 6],
    ["juli", 7], ["jul", 7],
    ["agustus", 8], ["agu", 8], ["aug", 8],
    ["september", 9], ["sep", 9],
    ["oktober", 10], ["okt", 10], ["oct", 10],
    ["november", 11], ["nov", 11],
    ["desember", 12], ["des", 12], ["dec", 12],
  ];

  for (const [nama, angka] of map) {
    if (text.includes(nama)) return angka;
  }

  return new Date().getMonth() + 1;
}

function ambilTahun(text) {
  const match = String(text || "").match(/20[0-9]{2}/);
  return match ? Number(match[0]) : new Date().getFullYear();
}

function angka(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// ======================================================
// FETCH DENGAN TIMEOUT
// ======================================================

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// ======================================================
// TELEGRAM API
// ======================================================

async function telegram(method, payload, timeoutMs = 12000) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    timeoutMs
  );

  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      raw: text,
    };
  }
}

async function sendMessage(chatId, text) {
  return telegram(
    "sendMessage",
    {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    },
    12000
  );
}

async function sendPhoto(chatId, photoUrl, caption = "") {
  return telegram(
    "sendPhoto",
    {
      chat_id: chatId,
      photo: photoUrl,
      caption,
    },
    12000
  );
}

async function sendDocument(chatId, documentUrl, caption = "") {
  return telegram(
    "sendDocument",
    {
      chat_id: chatId,
      document: documentUrl,
      caption,
    },
    15000
  );
}

// ======================================================
// AMBIL DATA DARI API PHP WEB KAMU
// ======================================================

async function getLaporanTiket(bulan, tahun) {
  const params = new URLSearchParams({
    token: API_TOKEN,
    bulan: String(bulan),
    tahun: String(tahun),
    toko: DEFAULT_TOKO,
  });

  const url = `${API_LAPORAN_TIKET}?${params.toString()}`;

  const res = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    },
    15000
  );

  const text = await res.text();

  if (!res.ok) {
    throw new Error("API laporan HTTP " + res.status + " - " + text.slice(0, 200));
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error("API laporan tidak mengirim JSON valid: " + text.slice(0, 200));
  }
}

// ======================================================
// HANDLE PESAN TELEGRAM
// ======================================================

async function handleTelegramUpdate(update) {
  if (!update || !update.message) return;

  const chatId = update.message.chat.id;
  const text = update.message.text || "";
  const lower = text.toLowerCase();

  if (lower === "/start") {
    await sendMessage(
      chatId,
      "Halo, ini Bot Laporan <b>THE PLAY ZONE</b>.\n\n" +
        "Contoh perintah:\n" +
        "<code>payout tiket mei 2026</code>\n" +
        "<code>laporan tiket juni 2026</code>\n\n" +
        "Bot akan mengirim ringkasan, preview gambar, dan file Excel."
    );
    return;
  }

  const isLaporanTiket =
    (lower.includes("payout") || lower.includes("laporan") || lower.includes("rekap")) &&
    (lower.includes("tiket") || lower.includes("ticket"));

  if (!isLaporanTiket) {
    await sendMessage(
      chatId,
      "Perintah belum dikenali.\n\n" +
        "Contoh:\n" +
        "<code>payout tiket mei 2026</code>"
    );
    return;
  }

  const bulan = bulanToNumber(lower);
  const tahun = ambilTahun(lower);

  await sendMessage(chatId, "Sedang mengambil laporan, tunggu sebentar...");

  let data;

  try {
    data = await getLaporanTiket(bulan, tahun);
  } catch (e) {
    await sendMessage(
      chatId,
      "Gagal mengambil API laporan dari web.\n\n" +
        "Error:\n<code>" +
        escapeHtml(e.message) +
        "</code>"
    );
    return;
  }

  if (!data.ok) {
    await sendMessage(
      chatId,
      "API laporan gagal:\n<code>" +
        escapeHtml(data.message || data.error || "Unknown error") +
        "</code>"
    );
    return;
  }

  const s = data.summary;
  const periode = data.filter.periode;

  const previewUrl = data.files.preview_image_url + "&v=" + Date.now();
  const excelUrl = data.files.excel_url + "&v=" + Date.now();

  // Kirim ringkasan + link dulu supaya tidak terasa diam lama
  const pesan =
    `<b>THE PLAY ZONE CENGKARENG</b>\n` +
    `<b>Laporan Payout Tiket ${escapeHtml(periode)}</b>\n\n` +
    `Total Laporan: <b>${angka(s.total_laporan)}</b>\n` +
    `Total Mesin: <b>${angka(s.total_mesin)}</b>\n` +
    `Total Omset: <b>${escapeHtml(s.format.total_omset)}</b>\n` +
    `Ticket Keluar: <b>${escapeHtml(s.format.total_ticket_keluar)}</b>\n` +
    `Nilai Ticket: <b>${escapeHtml(s.format.total_nilai_ticket_rp)}</b>\n` +
    `Payout: <b>${escapeHtml(s.format.payout_persen)}</b>\n\n` +
    `<b>Link Preview:</b>\n${previewUrl}\n\n` +
    `<b>Link Excel:</b>\n${excelUrl}`;

  await sendMessage(chatId, pesan);

  await sendMessage(
    chatId,
    "Ringkasan sudah dikirim ✅\nSekarang mencoba kirim preview gambar dan file Excel..."
  );

  // Kirim preview gambar. Kalau gagal, jangan bikin bot berhenti.
  try {
    const photoResult = await sendPhoto(chatId, previewUrl, "Preview laporan " + periode);

    if (!photoResult.ok) {
      console.log("PHOTO FAILED:", JSON.stringify(photoResult));
      await sendMessage(
        chatId,
        "Preview gambar gagal dikirim otomatis. Silakan buka link preview di atas."
      );
    }
  } catch (e) {
    console.log("PHOTO ERROR:", e.message);
    await sendMessage(
      chatId,
      "Preview gambar terlalu lama / gagal dikirim. Silakan buka link preview di atas."
    );
  }

  // Kirim Excel. Kalau gagal, jangan bikin bot berhenti.
  try {
    const docResult = await sendDocument(chatId, excelUrl, "File Excel asli " + periode);

    if (!docResult.ok) {
      console.log("DOCUMENT FAILED:", JSON.stringify(docResult));
      await sendMessage(
        chatId,
        "File Excel gagal dikirim otomatis. Silakan buka link Excel di atas."
      );
    }
  } catch (e) {
    console.log("DOCUMENT ERROR:", e.message);
    await sendMessage(
      chatId,
      "File Excel terlalu lama / gagal dikirim. Silakan buka link Excel di atas."
    );
  }
}

// ======================================================
// VERCEL HANDLER
// ======================================================

module.exports = async function handler(req, res) {
  console.log("METHOD:", req.method);

  if (!BOT_TOKEN) {
    return res.status(200).send("ERROR: BOT_TOKEN belum diset di Vercel Environment Variables");
  }

  if (!API_TOKEN) {
    return res.status(200).send("ERROR: API_TOKEN belum diset di Vercel Environment Variables");
  }

  // Test manual dari browser:
  // /api/telegram
  // /api/telegram?chat_id=123456789
  if (req.method === "GET") {
    const chatId = req.query.chat_id;

    if (chatId) {
      const result = await sendMessage(chatId, "Test kirim dari Vercel berhasil ✅");

      return res.status(200).json({
        mode: "manual_send_test",
        telegram_result: result,
      });
    }

    return res.status(200).send(
      "TPZ Telegram Bot API aktif ✅\n\n" +
        "Webhook endpoint:\n" +
        "/api/telegram\n\n" +
        "Test manual kirim pesan:\n" +
        "/api/telegram?chat_id=CHAT_ID_KAMU"
    );
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    // Vercel biasanya sudah parse req.body jadi object.
    // Tapi kalau masih string, kita parse manual.
    let update = req.body;

    if (typeof update === "string") {
      update = JSON.parse(update);
    }

    console.log("UPDATE:", JSON.stringify(update || {}).slice(0, 1000));

    await handleTelegramUpdate(update);

    return res.status(200).send("OK");
  } catch (err) {
    console.log("ERROR:", err.message);

    // Tetap 200 supaya Telegram tidak spam retry terus.
    return res.status(200).send("ERROR: " + err.message);
  }
};
