# ⏰ TempoGuard: Telegram Reminder SaaS Bot

TempoGuard adalah platform SaaS bot Telegram untuk memantau dan mengingatkan tanggal jatuh tempo / kedaluwarsa dokumen dan barang penting secara otomatis, seperti:
- 🎂 **Ulang Tahun & Anniversary** (Perulangan Tahunan Otomatis)
- 🚗 **Pajak STNK & SIM Kendaraan** (Siklus 1 Tahun & 5 Tahun)
- 🛠️ **Servis AC, Kendaraan & Rumah** (Siklus 3 Bulan / 6 Bulan)
- 💊 **Kesehatan, Obat & Perawatan** (Obat rutin, vaksin hewan, MCU)
- 💳 **Kartu ATM, Finansial & Tagihan** (Sewa kos, IPL, tagihan kartu kredit)
- 🕌 **Ibadah, Zakat & Haul** (Haul Zakat Maal, qadha puasa, kurban)
- 👔 **Karier, Pajak SPT & Kontrak Kerja** (Batas lapor SPT, probation, SKCK)
- 🎓 **Pendidikan, SPP & UKT Kuliah** (SPP bulanan, uang semester)
- 💻 **Garansi Elektronik & Gadget** (Laptop, HP, kulkas, AC, dsb)
- 📄 **Paspor, Visa & Lisensi Profesi** (STR, KTA, lisensi kerja, sertifikasi)
- ✈️ **Travel, Visa & Poin/Miles** (Masa berlaku visa, miles penerbangan, tiket)
- 🌐 **Domain, Hosting & Subscription** (Cloud, domain, Netflix, dsb)
- 🏠 **Sewa Properti & Tagihan Berkala**
- 🪴 **Tanaman & Perawatan Kebun** (Jadwal pemupukan & repotting)
- 🐾 **Perawatan Hewan Peliharaan** (Obat cacing, tetes kutu, vaksin)

Dibangun dengan arsitektur **Clean Code**, **TypeScript**, **grammY Framework**, **Supabase PostgreSQL**, dan **Vercel Serverless Functions & Cron**.

---

## 🌟 Fitur Utama

- 🎁 **Model Bisnis SaaS Freemium**: Free Trial hingga 2 item aktif; akses tanpa batas (*Unlimited*) untuk Pro Subscriber.
- 💵 **Pencatatan Estimasi Biaya (*Budget Tracking*)**: Input perkiraan dana (misal Pajak STNK Rp 2,5jt) untuk membantu persiapan cashflow saat jatuh tempo.
- 📅 **1-Klik Simpan ke Google Calendar**: Link direct sync langsung ke Google Calendar di setiap notifikasi dan detail item.
- 📊 **Agenda Bulanan & Rekap Dana (`/agenda` / `/upcoming`)**: Melihat seluruh agenda jatuh tempo bulan berjalan beserta total estimasi pengeluaran.
- 🔄 **Siklus Perulangan Fleksibel (*Flexible Recurrence*)**: Mendukung perulangan otomatis Bulanan, 3 Bulanan, 6 Bulanan, 1 Tahunan, dan 5 Tahunan.
- ⚡ **Tombol Quick Renew 1-Klik**: Perpanjang item secara instan `[+1 Bln]`, `[+3 Bln]`, `[+6 Bln]`, atau `[+1 Thn]` langsung dari Telegram.
- 🤖 **Arsitektur Dual Bot**:
  - **User Bot**: Pengingat berkala, wizard pencatatan `/add`, ekspor data CSV `/export`, dan pembayaran invoice.
  - **Admin Bot**: Persetujuan bukti transfer 1-klik (*One-Tap Approve/Reject*), generator kode voucher (`/generate_code`), manajemen paket/rekening, dan analitik bisnis (`/admin_stats`).
- ⏰ **Pengingat Berkala Otomatis**: Vercel Cron berjalan setiap pukul **07:00 WIB** (`00:00 UTC`) memproses pengingat H-60, H-30, H-14, H-7, H-3, H-1, dan hari H.
- 🛡️ **Anti-Spam & Rate Limiter**: Proteksi *flood control* 3 req/2s dan batas harian tiket bantuan `/contact` 3 pesan/24 jam.
- 🔒 **Zero Duplicate Alerts**: Idempotency log table menjamin tidak ada notifikasi ganda.
- 💸 **100% Free-Tier Friendly**: Berjalan mulus di free tier Vercel & Supabase tanpa biaya server.

---

## 🛠️ Panduan Instalasi & Menjalankan

### 1. Clone Repository & Install Dependencies
```bash
git clone https://github.com/hanifalkauni/telegram-reminder-bot.git
cd telegram-reminder-bot
npm install
```

### 2. Setup Database Supabase
1. Buat project baru di [Supabase Dashboard](https://supabase.com/).
2. Buka **SQL Editor**, salin dan jalankan seluruh isi file `src/db/schema.sql`.

### 3. Konfigurasi Environment Variables
Salin file `.env.example` menjadi `.env`:
```env
BOT_TOKEN_USER=your_user_bot_token
BOT_TOKEN_ADMIN=your_admin_bot_token

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

ADMIN_MASTER_CODE=KODEMASTERADMINRAHASIA
TELEGRAM_SECRET_TOKEN=secret_token_webhook
CRON_SECRET=secret_token_cron
```

### 4. Development Lokal (Long Polling)
- Jalankan User Bot: `npm run dev:user`
- Jalankan Admin Bot: `npm run dev:admin`

---

## 🚀 Deploy ke Vercel (Production Webhook Mode)

1. Hubungkan repository ke **Vercel**.
2. Masukkan environment variables di pengaturan project Vercel.
3. Atur Webhook Telegram:
   - **User Bot**:
     ```
     https://api.telegram.org/bot<BOT_TOKEN_USER>/setWebhook?url=https://your-domain.vercel.app/api/bot/user-webhook&secret_token=<TELEGRAM_SECRET_TOKEN>
     ```
   - **Admin Bot**:
     ```
     https://api.telegram.org/bot<BOT_TOKEN_ADMIN>/setWebhook?url=https://your-domain.vercel.app/api/bot/admin-webhook&secret_token=<TELEGRAM_SECRET_TOKEN>
     ```

---

## 📄 Lisensi
ISC License
