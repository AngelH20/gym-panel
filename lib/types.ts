/** Tipos compartidos. Reflejan el esquema de 01_schema.sql. */

export type AdminRole = "superadmin" | "admin" | "profesor";
export type MemberStatus = "active" | "suspended";
export type MembershipStatus = "active" | "expired" | "cancelled";
export type PlanPeriod = "month" | "week" | "day";
export type CheckinSource = "qr" | "manual";
export type PaymentMethod = "cash" | "transfer";

/** Estado derivado que se muestra en la interfaz (view member_overview). */
export type EffectiveStatus =
  | "active"
  | "expired"
  | "exhausted"
  | "suspended"
  | "no_membership";

export type Plan = {
  id: string;
  name: string;
  description: string | null;
  uses_per_period: number;
  period: PlanPeriod;
  period_days: number;
  price_cash_cents: number | null;
  price_transfer_cents: number | null;
  currency: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Member = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  dni: string;
  photo_url: string | null;
  joined_on: string;
  status: MemberStatus;
  notes: string | null;
  qr_token: string;
  welcome_message: string | null;
  birth_date: string | null;
  created_at: string;
  updated_at: string;
};

/** Fila de la vista member_overview: socio + membresía activa + estado. */
export type MemberOverview = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  dni: string;
  photo_url: string | null;
  joined_on: string;
  member_status: MemberStatus;
  qr_token: string;
  membership_id: string | null;
  plan_id: string | null;
  plan_name: string | null;
  period_start: string | null;
  period_end: string | null;
  uses_total: number | null;
  uses_remaining: number | null;
  effective_status: EffectiveStatus;
  days_left: number | null;
  checked_in_today: boolean;
  visits_today: number;
  last_check_in_at: string | null;
  welcome_message: string | null;
  birth_date: string | null;
  next_birthday: string | null;
  days_to_birthday: number | null;
  is_birthday_today: boolean;
};

export type Membership = {
  id: string;
  member_id: string;
  plan_id: string;
  period_start: string;
  period_end: string;
  uses_total: number;
  uses_remaining: number;
  status: MembershipStatus;
  created_at: string;
};

/** Resultado de perform_check_in_by_dni(). */
export type CheckInResult = {
  ok: boolean;
  code:
    | "CHECKED_IN"
    | "ALREADY_CHECKED_IN"
    | "INVALID_DNI"
    | "BAD_QR"
    | "SUSPENDED"
    | "NO_MEMBERSHIP"
    | "EXPIRED"
    | "NO_USES_LEFT"
    | "COOLDOWN"
    | "RATE_LIMITED";
  message: string;
  member_name?: string;
  photo_url?: string | null;
  plan_name?: string;
  uses_remaining?: number;
  uses_total?: number;
  period_end?: string;
  visits_today?: number;
  checked_in_at?: string;
  is_birthday?: boolean;
};

export type AccessMode = "off" | "pin" | "rotating";

/** Una venta simulada: el cobro real pasa por MP, aparte. */
export type Payment = {
  id: string;
  member_id: string;
  membership_id: string;
  plan_id: string | null;
  plan_name: string;
  amount_cents: number;
  currency: string;
  method: PaymentMethod;
  local_date: string;
  paid_at: string;
  created_by: string | null;
};

/** Fondo inicial declarado al abrir la caja del día. Sin esto no se puede vender. */
export type CashOpening = {
  id: string;
  opening_date: string;
  opened_at: string;
  opened_by: string | null;
  starting_cash_cents: number;
  notes: string | null;
};

/** Un cierre de caja: fija los totales del día, ya no se puede vender ese día.
 *  Los campos de conciliación son null en cierres de antes de este parche. */
export type CashClosing = {
  id: string;
  closing_date: string;
  closed_at: string;
  closed_by: string | null;
  starting_cash_cents: number | null;
  total_cash_cents: number;
  total_transfer_cents: number;
  expected_cash_cents: number | null;
  counted_cash_cents: number | null;
  difference_cents: number | null;
  payments_count: number;
  notes: string | null;
};

/** Una cuenta con acceso al panel (tabla admins). */
export type Staff = {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string | null;
  role: AdminRole;
  created_at: string;
};
