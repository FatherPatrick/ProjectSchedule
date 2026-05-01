import { prisma } from "./prisma";

const DEFAULT_GRANULARITY = 15;
export const BOOKING_INTERVAL_OPTIONS = [
  15,
  30,
  45,
  60,
  90,
  120,
  150,
  180,
  210,
  240,
  270,
  300,
] as const;

export interface AppSettings {
  slotGranularityMin: number;
  allowStartAtClose: boolean;
}

export async function getSettings(): Promise<AppSettings> {
  const row = await prisma.setting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      slotGranularityMin: DEFAULT_GRANULARITY,
      allowStartAtClose: false,
    },
  });
  return {
    slotGranularityMin: row.slotGranularityMin,
    allowStartAtClose: row.allowStartAtClose,
  };
}

export async function updateSettings(patch: Partial<AppSettings>) {
  return prisma.setting.upsert({
    where: { id: "default" },
    update: patch,
    create: {
      id: "default",
      slotGranularityMin: DEFAULT_GRANULARITY,
      allowStartAtClose: false,
      ...patch,
    },
  });
}
