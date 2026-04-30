import { signIn } from "@/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  return (
    <div className="max-w-sm mx-auto space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-sm text-neutral-600">
        Enter your email and we&apos;ll send you a magic link to sign in.
      </p>
      <form
        action={async (formData) => {
          "use server";
          await signIn("resend", {
            email: String(formData.get("email")),
            redirectTo: callbackUrl ?? "/",
          });
        }}
        className="space-y-2"
      >
        <input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2"
        />
        <button className="w-full rounded-full bg-pink-600 text-white py-2 font-medium">
          Email me a sign-in link
        </button>
      </form>
    </div>
  );
}
