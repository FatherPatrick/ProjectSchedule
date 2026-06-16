export interface ServiceLite {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  description: string | null;
}

export interface Slot {
  startISO: string;
  label: string;
}
