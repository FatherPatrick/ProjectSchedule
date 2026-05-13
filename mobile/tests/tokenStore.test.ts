import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearTokens,
  loadTokens,
  saveTokens,
  type StoredTokens,
} from "@/auth/tokenStore";

declare const __secureStoreReset: () => void;

const SAMPLE: StoredTokens = {
  accessToken: "access-1",
  accessTokenExpiresAt: "2026-05-13T18:00:00.000Z",
  refreshToken: "refresh-1",
  refreshTokenExpiresAt: "2026-06-13T18:00:00.000Z",
};

beforeEach(() => __secureStoreReset());
afterEach(() => __secureStoreReset());

describe("tokenStore", () => {
  it("returns null when nothing has been saved", async () => {
    expect(await loadTokens()).toBeNull();
  });

  it("round-trips a saved token bundle", async () => {
    await saveTokens(SAMPLE);
    expect(await loadTokens()).toEqual(SAMPLE);
  });

  it("returns null if any single field is missing (partial corruption)", async () => {
    await saveTokens(SAMPLE);
    // Simulate a partial wipe by clearing the refresh expiry only.
    const { deleteItemAsync } = await import("expo-secure-store");
    await deleteItemAsync("mobile.refreshTokenExpiresAt");
    expect(await loadTokens()).toBeNull();
  });

  it("clearTokens removes every key, leaving load null", async () => {
    await saveTokens(SAMPLE);
    await clearTokens();
    expect(await loadTokens()).toBeNull();
  });
});
