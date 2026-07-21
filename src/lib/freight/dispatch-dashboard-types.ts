export type DispatchSheetRow = {
  sr: string;
  bookedBy: string;
  rcDate: string;
  truckTrailer: string;
  companyName: string;
  broker: string;
  loadDetails: string;
  pickupDateTime: string;
  deliveryDateTime: string;
  miles: number;
  loadNumber: string;
  states: string;
  rcInvoice: number;
  dispatchPercent: number;
  dispatchFee: number;
  invoice: string;
  received: number;
  balance: number;
  notes: string;
  claim: string;
  status: string;
  cpay: string;
  dtp: string;
  brokerAgentName: string;
  email: string;
  phone: string;
  extraNotes: string;
};

export type SummaryCard = {
  title: string;
  value: number;
  currency?: "USD";
  icon: string;
  highlight?: "green" | "orange";
};

export type FleetOverview = {
  total_units: number;
  active: number;
  available: number;
  in_transit: number;
};

export type RevenuePoint = {
  day: string;
  amount: number;
};

export type DashboardAlert = {
  type: string;
  message: string;
  severity: "high" | "medium" | "low";
};

export type DashboardLoad = {
  load_id: string;
  sr: string;
  booked_by: string;
  rc_date: string;
  truck_trailer: string;
  carrier: string;
  broker: string;
  load_details: string;
  origin: string;
  destination: string;
  pickup: string;
  delivery: string;
  miles: number;
  load_number: string;
  states: string;
  rate: number;
  dispatch_percent: number;
  dispatch_fee: number;
  invoice_status: string;
  received: number;
  balance: number;
  notes: string;
  claim: string;
  status: string;
  cpay: string;
  dtp: string;
  broker_agent: string;
  email: string;
  phone: string;
  /** Supabase dispatch_loads.id when sourced from DB */
  db_id?: string;
  data_source?: "supabase" | "sheet";
};

export type DashboardCarrier = {
  carrier_id: string;
  company_name: string;
  equipment: string;
  location: string;
  status: string;
  loads_count: number;
  source: "sheet" | "supabase";
};

export type DashboardInvoice = {
  invoice_id: string;
  carrier: string;
  amount: number;
  received: number;
  balance: number;
  due_date: string;
  status: string;
};

export type QuickAction = {
  name: string;
  icon: string;
  href: string;
};

export type TopBooker = {
  name: string;
  loads: number;
  revenue: number;
  commission: number;
};

export type CarrierRosterItem = {
  id: string;
  source: "sheet" | "dispatcher" | "supabase";
  active: boolean;
  mc: string;
  mcAge: string;
  contactName: string;
  phone: string;
  companyName: string;
  truck: string;
  email: string;
  address: string;
  dispatchReview: string;
  status: string;
  salesReview: string;
  salesAttention: string;
  documentLink: string;
  loadsBooked?: number;
};

export type DriverRosterItem = {
  id: string;
  driverName: string;
  driverEmail: string;
  driverPhone: string;
  carrierCompanyName: string;
  carrierProfileId: string | null;
  notes: string;
};

/** Open AR aging — filled from dispatched sent invoices when available. */
export type DashboardInvoiceAging = {
  asOf: string;
  totalOpen: number;
  totalOpenAmount: number;
  buckets: {
    id: string;
    label: string;
    count: number;
    amount: number;
  }[];
};

export type DispatchDashboardData = {
  company: { name: string; logo: string };
  summary_cards: SummaryCard[];
  fleet_overview: FleetOverview;
  revenue_chart: { period: string; data: RevenuePoint[] };
  alerts: DashboardAlert[];
  loads: DashboardLoad[];
  carriers: DashboardCarrier[];
  invoices: DashboardInvoice[];
  invoice_aging?: DashboardInvoiceAging;
  quick_actions: QuickAction[];
  top_bookers: TopBooker[];
  carrier_roster: CarrierRosterItem[];
  driver_roster: DriverRosterItem[];
  footer_stats: {
    carriers_managed: number;
    revenue_this_week: number;
    commission_earned: number;
    unpaid_invoices: number;
    total_miles: number;
  };
  sheet_meta: {
    connected: boolean;
    row_count: number;
    last_synced: string;
    source: string;
    workbook_name: string;
    active_tab: string;
    available_tabs: string[];
    carrier_sheet_connected: boolean;
  };
};
