import { SignInForm } from "./SignInForm";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <div className="max-w-sm mx-auto space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-sm text-neutral-600">
        Enter your phone number and we&apos;ll text you a 6-digit code.
      </p>
      <SignInForm callbackUrl={callbackUrl ?? "/admin"} devHint={isDev} />
    </div>
  );
}
