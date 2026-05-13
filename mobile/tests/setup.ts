/**
 * Vitest setup — runs once before every test file.
 *
 * Mocks every native Expo module the code under test imports, so the
 * non-RN logic (token store, AuthContext, apiFetch) can be exercised
 * inside jsdom.
 */
import { vi } from "vitest";

// Behave like an in-memory SecureStore. Each test starts clean because
// `tokenStoreReset()` is called from the relevant test setup.
const memoryStore = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) =>
    memoryStore.has(key) ? memoryStore.get(key)! : null
  ),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    memoryStore.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    memoryStore.delete(key);
  }),
}));

// Helper exposed to tests so they can reset state between cases.
(globalThis as unknown as { __secureStoreReset: () => void }).__secureStoreReset =
  () => memoryStore.clear();

// Pin a deterministic API base so apiFetch produces stable URLs in tests.
process.env.EXPO_PUBLIC_API_BASE_URL = "http://api.test";
