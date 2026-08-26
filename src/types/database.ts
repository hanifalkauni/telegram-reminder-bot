export interface UserRecord {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  is_activated: boolean;
  is_admin: boolean;
  active_until: string | null;
  created_at: string;
  updated_at: string;
}

export type UserAccessState = 'ADMIN' | 'ACTIVE_SUBSCRIBER' | 'FREE_TRIAL' | 'EXPIRED';

export type RecurringType = 'NONE' | 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'YEARLY' | 'FIVE_YEARS';

export interface CategoryRecord {
  id: number;
  code: string;
  name: string;
  icon: string;
  default_reminder_days: number[];
  is_active: boolean;
  created_at: string;
}

export interface ReminderItemRecord {
  id: number;
  user_id: number;
  category_id: number | null;
  title: string;
  notes: string | null;
  due_date: string; // YYYY-MM-DD
  estimated_cost: number;
  reminder_intervals: number[];
  photo_file_id: string | null;
  is_recurring: boolean;
  recurring_type: RecurringType;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
  category?: CategoryRecord;
}

export interface ReminderDeliveryLogRecord {
  id: number;
  reminder_item_id: number;
  days_before: number;
  delivery_date: string;
  status: 'SENT' | 'FAILED';
  sent_at: string;
}

export interface SubscriptionPackageRecord {
  id: number;
  name: string;
  duration_days: number;
  price: number;
  badge: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PaymentMethodRecord {
  id: number;
  name: string;
  account_number: string | null;
  account_name: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ConfirmationCodeRecord {
  id: number;
  code: string;
  duration_days: number;
  is_used: boolean;
  used_by: number | null;
  used_at: string | null;
  created_by: number | null;
  created_at: string;
}
