export interface ServiceLite {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

export type ClientMode = "existing" | "new";
