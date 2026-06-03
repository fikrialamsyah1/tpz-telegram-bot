const BOT_TOKEN = process.env.BOT_TOKEN;
const API_TOKEN = process.env.API_TOKEN;

const BASE_WEB_URL = "https://theplayzone.rf.gd";
const DEFAULT_TOKO = "R40 CENGKARENG";
const API_LAPORAN_TIKET = BASE_WEB_URL + "/api_laporan_tiket.php";

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
    ["desember", 12], ["des", 12], ["dec", 12]
  ];

  for (const [name, num] of map) {
    if (text.includes(name)) return num;
  }

  return new Date().getMonth() + 1;
}

function ambilTahun(text) {
  const match = String(text || "").match(/20[0-9]{2}/);
  return match ? Number(match[0]) : new Date().getFullYear();
}

async function telegram(method, payload) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return await res.json();
}

async function sendMessage(chatId, text) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML"
  });
}

async function sendPhoto(chatId, photoUrl, caption = "") {
  return telegram("sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption
  });
}

async function sendDocument(chatId, documentUrl, caption = "") {
  return telegram("sendDocument", {
    chat_id: chatId,
    document: documentUrl,
    caption
  });
}

async function getLaporanTiket(bulan, tahun) {
  const params = new URLSearchParams({
    token: API_TOKEN,
    bulan: String(bulan),
    tahun: String(tahun),
    toko: DEFAULT_TOKO
  });

  const url = `${API_LAPORAN_TIKET}?${params.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "accept": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error("API laporan error HTTP " + res.status);
  }

  return await res.json();
}

async function handleTelegramUpdate(update) {
  if (!update.message) return;

  const chatId = update.message.chat.id;
  const text = update.message.text || "";
  const lower = text.toLowerCase();

  if (lower === "/start") {
    await sendMessage(
      chatId,
      "Halo, ini Bot Laporan <b>THE PLAY ZONE</b>.\n\n" +
      "Contoh perintah:\n" +
      "<code>payout tiket mei 2026</code>\n" +
      "<code>laporan tiket juni 2026</code>"
    );
    return;
  }

  const isLaporanTiket =
    (lower.includes("payout") || lower.includes("laporan")) &&
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

  const data = await getLaporanTiket(bulan, tahun);

  if (!data.ok) {
    await sendMessage(
      chatId,
      "API laporan gagal: " + (data.message || data.error || "Unknown error")
    );
    return;
  }

  const s = data.summary;
  const periode = data.filter.periode;

  const pesan =
    `<b>THE PLAY ZONE CENGKARENG</b>\n` +
    `<b>Laporan Payout Tiket ${periode}</b>\n\n` +
    `Total Laporan: <b>${s.total_laporan}</b>\n` +
    `Total Mesin: <b>${s.total_mesin}</b>\n` +
    `Total Omset: <b>${s.format.total_omset}</b>\n` +
    `Ticket Keluar: <b>${s.format.total_ticket_keluar}</b>\n` +
    `Nilai Ticket: <b>${s.format.total_nilai_ticket_rp}</b>\n` +
    `Payout: <b>${s.format.payout_persen}</b>`;

  await sendMessage(chatId, pesan);

  const previewUrl = data.files.preview_image_url + "&v=" + Date.now();
  const excelUrl = data.files.excel_url + "&v=" + Date.now();

  await sendPhoto(chatId, previewUrl, "Preview laporan " + periode);
  await sendDocument(chatId, excelUrl, "File Excel asli " + periode);
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).send("TPZ Telegram Bot API aktif ✅");
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    if (!BOT_TOKEN || !API_TOKEN) {
      return res.status(200).send("ERROR: BOT_TOKEN atau API_TOKEN belum diset di Vercel Environment Variables");
    }

    await handleTelegramUpdate(req.body);

    return res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    return res.status(200).send("ERROR: " + err.message);
  }
}
