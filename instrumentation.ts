/**
 * Next.js instrumentation hook — runs once per server process at boot,
 * before the first request is served.
 *
 * Two responsibilities:
 *
 *   1. `register()` — validate environment variables. Misconfigured
 *      deploys crash the server with a complete list of problems
 *      instead of failing deep inside Twilio / Resend / Prisma at
 *      request time.
 *
 *   2. `onRequestError` — capture every uncaught server-side error
 *      (route handlers, RSC, middleware) and emit a structured log
 *      record so it shows up in Vercel's Logs / Observability tab
 *      with route / digest metadata. This is the central seam: when
 *      we eventually wire Sentry, only `reportError` needs to change.
 *
 * See https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register(): Promise<void> {
  // Only run on the Node.js server runtime (skip Edge / browser).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateEnv } = await import("./src/lib/env");
  validateEnv();
}

type OnRequestErrorContext = {
  routerKind: "Pages Router" | "App Router";
  routePath: string;
  routeType: "render" | "route" | "action" | "middleware";
  renderSource?: "react-server-components" | "react-server-components-payload" | "server-rendering";
  revalidateReason?: "on-demand" | "stale" | undefined;
  renderType?: "dynamic" | "dynamic-resume";
};

type OnRequestErrorRequest = {
  path: string;
  method: string;
  headers: { [key: string]: string | string[] | undefined };
};

/**
 * Called by Next.js for every uncaught server-side error. Signature is
 * documented at:
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation#onrequesterror-optional
 */
export async function onRequestError(
  err: unknown,
  request: OnRequestErrorRequest,
  context: OnRequestErrorContext
): Promise<void> {
  // Lazy-load so the boot path stays cheap and so test runs that never
  // import this module don't pay the cost.
  const { reportError } = await import("./src/lib/observability/reportError");
  reportError(err, {
    where: "next.onRequestError",
    route: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    method: request.method,
    path: request.path,
  });
}

