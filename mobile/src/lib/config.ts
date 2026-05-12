/**
 * Mobile app runtime config.
 *
 * `API_BASE_URL` points at the Next.js backend. Override per-environment by
 * setting `EXPO_PUBLIC_API_BASE_URL` (e.g. in `.env` or via EAS secrets).
 *
 * For local dev on a physical phone, `localhost` will not work — set
 * `EXPO_PUBLIC_API_BASE_URL=http://<your-LAN-ip>:3000` so the phone can reach
 * your dev machine.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
