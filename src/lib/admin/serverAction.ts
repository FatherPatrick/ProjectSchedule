import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin";

/**
 * Wraps the admin server-action tail that was repeated across the services and
 * hours pages: assert admin → run the mutation → revalidate → redirect with a
 * `?saved=` key for the toaster.
 *
 * Import this into a file that already declares `"use server"` on its actions
 * (it's a plain helper, not itself a server action). Put the action's parsing
 * and validation *inside* `work` so `assertAdmin()` always runs first.
 *
 * ⚠️ `redirect()` throws Next's control-flow signal, so this returns `never`
 * and must not be wrapped in a swallowing try/catch. Actions that branch to
 * `?error=` should `redirect()` early, before calling this.
 */
export async function adminAction(
  path: string,
  savedKey: string,
  work: () => Promise<void>
): Promise<never> {
  await assertAdmin();
  await work();
  revalidatePath(path);
  redirect(`${path}?saved=${savedKey}`);
}
