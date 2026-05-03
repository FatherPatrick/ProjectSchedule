import { prisma } from "./prisma";

const DEFAULT_GRANULARITY = 15;

export interface AppSettings {
  slotGranularityMin: number;
}

export async function getSettings(): Promise<AppSettings> {
  const row = await prisma.setting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", slotGranularityMin: DEFAULT_GRANULARITY },
  });
  return { slotGranularityMin: row.slotGranularityMin };
}

export async function updateSettings(patch: Partial<AppSettings>) {
  return prisma.setting.upsert({
    where: { id: "default" },
    update: patch,
    create: { id: "default", slotGranularityMin: DEFAULT_GRANULARITY, ...patch },
  });
}
