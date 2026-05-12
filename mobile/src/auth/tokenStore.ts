/**
 * SecureStore-backed persistence of the mobile auth tokens.
 *
 * On iOS this is the Keychain; on Android it's the Keystore-encrypted
 * SharedPreferences. Tokens never touch AsyncStorage.
 */
import * as SecureStore from "expo-secure-store";

const ACCESS_KEY = "mobile.accessToken";
const ACCESS_EXP_KEY = "mobile.accessTokenExpiresAt";
const REFRESH_KEY = "mobile.refreshToken";
const REFRESH_EXP_KEY = "mobile.refreshTokenExpiresAt";

export type StoredTokens = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

export async function loadTokens(): Promise<StoredTokens | null> {
  const [a, ae, r, re] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(ACCESS_EXP_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
    SecureStore.getItemAsync(REFRESH_EXP_KEY),
  ]);
  if (!a || !ae || !r || !re) return null;
  return {
    accessToken: a,
    accessTokenExpiresAt: ae,
    refreshToken: r,
    refreshTokenExpiresAt: re,
  };
}

export async function saveTokens(t: StoredTokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, t.accessToken),
    SecureStore.setItemAsync(ACCESS_EXP_KEY, t.accessTokenExpiresAt),
    SecureStore.setItemAsync(REFRESH_KEY, t.refreshToken),
    SecureStore.setItemAsync(REFRESH_EXP_KEY, t.refreshTokenExpiresAt),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(ACCESS_EXP_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
    SecureStore.deleteItemAsync(REFRESH_EXP_KEY),
  ]);
}
