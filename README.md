# ⏰ TempoGuard: Telegram Reminder SaaS Bot

TempoGuard adalah platform SaaS bot Telegram untuk memantau dan mengingatkan tanggal jatuh tempo / kedaluwarsa dokumen dan barang penting secara otomatis, seperti:
- 🎂 **Ulang Tahun & Anniversary (Perulangan Tahunan Otomatis)**
- 💻 **Garansi Elektronik & Gadget**
- 🚗 **Pajak STNK & SIM Kendaraan**
- 📄 **Paspor, Asuransi & Dokumen Legalitas**
- 🌐 **Domain, Hosting & Subscription**
- 🏠 **Sewa Properti & Tagihan Berkala**

Dibangun dengan arsitektur **Clean Code**, **TypeScript**, **grammY Framework**, **Supabase PostgreSQL**, dan **Vercel Serverless Functions & Cron**.

---

## 🌟 Fitur Utama

- 🎁 **Model Bisnis SaaS Freemium**: Free Trial hingga 2 item aktif; akses tanpa batas (*Unlimited*) untuk Pro Subscriber.
- 🤖 **Arsitektur Dual Bot**:
  - **User Bot**: Pengingat berkala, wizard pencatatan `/add`, ekspor data CSV `/export`, dan pembayaran invoice.
  - **Admin Bot**: Persetujuan bukti transfer 1-klik (*One-Tap Approve/Reject*), generator kode voucher (`/generate_code`), manajemen paket/rekening, dan analitik bisnis (`/admin_stats`).
- ⏰ **Pengingat Berkala Otomatis**: Vercel Cron berjalan setiap pukul **07:00 WIB** (`00:00 UTC`) memproses pengingat H-30, H-14, H-7, H-3, H-1, dan hari H.
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
