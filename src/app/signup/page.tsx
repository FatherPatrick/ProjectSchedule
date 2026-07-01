import { SignupForm } from "./SignupForm";
import { APP_BASE_DOMAIN } from "@/lib/config";

export default function SignupPage() {
  return (
    <div className="max-w-sm mx-auto space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create your salon</h1>
        <p className="text-sm text-neutral-600">
          Set up your booking page in under a minute. No credit card required.
        </p>
      </div>
      <SignupForm baseDomain={APP_BASE_DOMAIN} />
      <p className="text-xs text-center text-neutral-500">
        Already have a salon?{" "}
        <a href="/auth/sign-in" className="underline">
          Sign in
        </a>
      </p>
    </div>
  );
}
