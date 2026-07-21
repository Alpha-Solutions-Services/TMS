export type LoadInput = {
  origin_city: string;
  origin_state: string;
  destination_city: string;
  destination_state: string;
  pickup_date?: string | null;
  delivery_date?: string | null;
  equipment_type?: string | null;
  weight_lbs?: number | null;
  rate?: number | null;
  notes?: string | null;
};

export type LoadRecord = LoadInput & {
  id: string;
  load_number: string | null;
  status: string;
  carrier_id: string | null;
  driver_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export function loadStatusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
