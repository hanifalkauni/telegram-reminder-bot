-- =================================================================================
-- TEMPO GUARD SAAS: SUPABASE POSTGRESQL DATABASE SCHEMA MIGRATION
-- =================================================================================

-- 1. TABEL PENGGUNA (users)
CREATE TABLE IF NOT EXISTS public.users (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    is_activated BOOLEAN DEFAULT FALSE,
    is_admin BOOLEAN DEFAULT FALSE,
    active_until TIMESTAMPTZ NULL, -- NULL = Lifetime jika is_activated=true
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON public.users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(is_activated, active_until);

-- 2. TABEL KATEGORI ITEM (categories)
CREATE TABLE IF NOT EXISTS public.categories (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(10) DEFAULT '📌',
    default_reminder_days INT[] DEFAULT '{30, 7, 3, 1, 0}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABEL ITEM PENGINGAT (reminder_items)
CREATE TABLE IF NOT EXISTS public.reminder_items (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    category_id INT REFERENCES public.categories(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    notes TEXT,
    due_date DATE NOT NULL,
    estimated_cost NUMERIC(14, 2) DEFAULT 0, -- Estimasi biaya / dana yang perlu disiapkan (Rp)
    reminder_intervals INT[] DEFAULT '{30, 7, 3, 1, 0}', -- H minus berapa saja notifikasi dikirim
    photo_file_id TEXT, -- ID file telegram jika user upload nota/kartu
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_type VARCHAR(20) DEFAULT 'NONE', -- NONE, MONTHLY, QUARTERLY, SEMI_ANNUAL, YEARLY, FIVE_YEARS, HIJRI_YEARLY
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_items_user_id ON public.reminder_items(user_id);
CREATE INDEX IF NOT EXISTS idx_reminder_items_due_date ON public.reminder_items(due_date);
CREATE INDEX IF NOT EXISTS idx_reminder_items_active ON public.reminder_items(is_completed);

-- 4. TABEL LOG PENGIRIMAN NOTIFIKASI (reminder_delivery_logs)
-- Mencegah duplicate notification / Idempotency
CREATE TABLE IF NOT EXISTS public.reminder_delivery_logs (
    id BIGSERIAL PRIMARY KEY,
    reminder_item_id BIGINT NOT NULL REFERENCES public.reminder_items(id) ON DELETE CASCADE,
    days_before INT NOT NULL, -- 30, 7, 3, 1, 0
    delivery_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'SENT', -- SENT, FAILED
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(reminder_item_id, days_before, delivery_date)
);

CREATE INDEX IF NOT EXISTS idx_delivery_logs_check ON public.reminder_delivery_logs(reminder_item_id, days_before, delivery_date);

-- 5. TABEL PAKET LANGGANAN (subscription_packages)
CREATE TABLE IF NOT EXISTS public.subscription_packages (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    duration_days INT NOT NULL, -- 0 = lifetime, 365 = 1 tahun
    price NUMERIC(12, 2) NOT NULL,
    badge VARCHAR(50), -- 'Hemat 50%', 'Populer'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TABEL METODE PEMBAYARAN (payment_methods)
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL, -- 'Bank BCA', 'QRIS All Payment'
    account_number VARCHAR(100),
    account_name VARCHAR(100),
    image_url TEXT, -- Telegram file_id atau URL gambar untuk barcode QRIS
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. TABEL KODE KONFIRMASI VOUCHER (confirmation_codes)
CREATE TABLE IF NOT EXISTS public.confirmation_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    duration_days INT NOT NULL DEFAULT 30, -- 0 = lifetime
    is_used BOOLEAN DEFAULT FALSE,
    used_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ NULL,
    created_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_confirmation_codes_code ON public.confirmation_codes(code);


-- =================================================================================
-- INITIAL SEED DATA
-- =================================================================================

-- Seed Kategori Preset
INSERT INTO public.categories (code, name, icon, default_reminder_days)
VALUES 
    ('birthday', 'Ulang Tahun & Anniversary', '🎂', '{14, 7, 3, 1, 0}'),
    ('vehicle', 'Pajak STNK & SIM Kendaraan', '🚗', '{30, 14, 7, 3, 1, 0}'),
    ('maintenance', 'Servis AC, Kendaraan & Rumah', '🛠️', '{14, 7, 3, 1, 0}'),
    ('health', 'Kesehatan, Obat & Perawatan', '💊', '{14, 7, 3, 1, 0}'),
    ('financial', 'Kartu ATM, Finansial & Tagihan', '💳', '{14, 7, 3, 1, 0}'),
    ('spiritual', 'Ibadah, Donasi & Hari Keagamaan', '🕊️', '{30, 14, 7, 3, 0}'),
    ('career', 'Karier, Pajak SPT & Kontrak', '👔', '{30, 14, 7, 3, 1, 0}'),
    ('education', 'Pendidikan, SPP & UKT', '🎓', '{30, 14, 7, 3, 1, 0}'),
    ('electronics', 'Garansi Elektronik & Gadget', '💻', '{30, 7, 3, 1, 0}'),
    ('document', 'Paspor, Visa & Lisensi Legal', '📄', '{60, 30, 14, 7, 0}'),
    ('travel', 'Travel, Visa & Poin/Miles', '✈️', '{14, 7, 3, 1, 0}'),
    ('digital', 'Domain, Hosting & Subscription', '🌐', '{14, 7, 3, 1, 0}'),
    ('property', 'Sewa Rumah, Kos & Properti', '🏠', '{30, 14, 7, 3, 1, 0}'),
    ('plant', 'Tanaman & Perawatan Kebun', '🪴', '{7, 3, 1, 0}'),
    ('pet', 'Perawatan Hewan Peliharaan', '🐾', '{7, 3, 1, 0}'),
    ('custom', 'Lainnya / Kebutuhan Pribadi', '📌', '{30, 7, 3, 1, 0}')
ON CONFLICT (code) DO NOTHING;

-- Seed Paket Langganan Default
INSERT INTO public.subscription_packages (name, duration_days, price, badge, is_active)
VALUES 
    ('Paket 1 Tahun (Pro)', 365, 29000, 'Populer 🔥', TRUE),
    ('Paket Lifetime (Unlimited)', 0, 69000, 'Hemat 70% ♾️', TRUE)
ON CONFLICT DO NOTHING;

-- Seed Rekening & QRIS Dummy Default
INSERT INTO public.payment_methods (name, account_number, account_name, is_active)
VALUES 
    ('Bank BCA', '1234567890', 'a.n. Ingatin Official', TRUE),
    ('QRIS All Payment', 'QRIS Dinamis', 'a.n. Ingatin Official', TRUE)
ON CONFLICT DO NOTHING;
