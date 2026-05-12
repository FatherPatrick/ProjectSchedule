import { prisma } from "../db/prisma";

const DEFAULT_GRANULARITY = 15;

export interface AppSettings {
  slotGranularityMin: number;
  /**
   * When true, the booking UI offers a final slot whose start time equals the
   * business close time (zero-length availability tail). Default false.
   */
  allowStartAtClose: boolean;
}

export async function getSettings(): Promise<AppSettings> {
  const row = await prisma.setting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", slotGranularityMin: DEFAULT_GRANULARITY },
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
    create: { id: "default", slotGranularityMin: DEFAULT_GRANULARITY, ...patch },
  });
}
