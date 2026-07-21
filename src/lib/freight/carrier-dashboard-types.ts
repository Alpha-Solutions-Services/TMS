export type CarrierProfile = {
  carrier_id: string;
  company_name: string;
  mc_number: string;
  dot_number: string;
  owner: string;
  status: string;
};

export type CarrierSummary = {
  weekly_revenue: number;
  monthly_revenue: number;
  active_loads: number;
  rpm: number;
  miles_driven: number;
  outstanding_invoices: number;
};

export type CarrierCurrentLoad = {
  load_number: string;
  pickup: string;
  delivery: string;
  rate: number;
  status: string;
  eta: string;
  truck_location?: string;
};

export type CarrierTruck = {
  truck_id: string;
  truck_number: string;
  driver: string;
  equipment: string;
  location: string;
  status: string;
  lat?: number;
  lng?: number;
};

export type CarrierDriver = {
  driver_id: string;
  name: string;
  phone: string;
  status: string;
  score?: number;
};

export type CarrierLoadRow = {
  load_id: string;
  load_number: string;
  pickup: string;
  delivery: string;
  rate: number;
  status: string;
  dispatcher: string;
  miles?: number;
};

export type CarrierPayments = {
  paid_this_month: number;
  unpaid_invoices: number;
  factoring_status: string;
  total_earnings_ytd: number;
};

export type CarrierDocument = {
  document_type: string;
  expiration_date: string;
  status: string;
  file_url?: string;
};

export type CarrierCompliance = {
  insurance_status: string;
  insurance_expiry: string;
  mc_authority: string;
  mc_expiry: string;
  cdl_expiry: string;
  ifta_due: string;
  registration_expiry: string;
};

export type CarrierDispatcher = {
  name: string;
  email: string;
  phone: string;
};

export type RevenuePoint = {
  label: string;
  amount: number;
};

export type CarrierDashboardData = {
  carrier: CarrierProfile;
  summary: CarrierSummary;
  current_load: CarrierCurrentLoad | null;
  trucks: CarrierTruck[];
  drivers: CarrierDriver[];
  loads: CarrierLoadRow[];
  payments: CarrierPayments;
  documents: CarrierDocument[];
  compliance: CarrierCompliance;
  dispatcher: CarrierDispatcher;
  revenue_weekly: RevenuePoint[];
  revenue_monthly: RevenuePoint[];
  rpm_trend: RevenuePoint[];
  fuel_expense_month: number;
  maintenance_alerts: number;
  ai_load_recommendations: CarrierLoadRow[];
  data_source: "live" | "mock" | "hybrid";
};
