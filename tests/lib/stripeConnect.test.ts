/**
 * Covers the Stripe Connect onboarding domain logic in
 * `src/lib/domain/stripeConnect.ts` (docs/STRIPE_SPEC.md §2). Mocks both
 * Prisma and the Stripe client so these run without hitting a DB or Stripe.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  salon: {
    findUniqueOrThrow: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));
const stripeMock = vi.hoisted(() => ({
  accounts: {
    create: vi.fn(),
    createLoginLink: vi.fn(),
  },
  accountLinks: {
    create: vi.fn(),
  },
}));
const getStripeClientMock = vi.hoisted(() => vi.fn(() => stripeMock));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/integrations/stripe", () => ({
  getStripeClient: getStripeClientMock,
}));

import {
  createExpressLoginLink,
  getConnectStatus,
  startConnectOnboarding,
  syncAccountFromWebhook,
} from "@/lib/domain/stripeConnect";

const SALON_ID = "salon_1";

beforeEach(() => {
  prismaMock.salon.findUniqueOrThrow.mockReset();
  prismaMock.salon.findUnique.mockReset();
  prismaMock.salon.update.mockReset();
  stripeMock.accounts.create.mockReset();
  stripeMock.accounts.createLoginLink.mockReset();
  stripeMock.accountLinks.create.mockReset();
  getStripeClientMock.mockClear();
});

describe("getConnectStatus", () => {
  it("maps the salon's Stripe fields to a ConnectStatus", async () => {
    const updatedAt = new Date("2026-06-01T00:00:00Z");
    prismaMock.salon.findUniqueOrThrow.mockResolvedValueOnce({
      stripeAccountId: "acct_1",
      stripeChargesEnabled: true,
      stripePayoutsEnabled: false,
      stripeDetailsSubmitted: true,
      stripeAccountUpdatedAt: updatedAt,
    });
    const status = await getConnectStatus(SALON_ID);
    expect(status).toEqual({
      accountId: "acct_1",
      chargesEnabled: true,
      payoutsEnabled: false,
      detailsSubmitted: true,
      updatedAt,
    });
  });
});

describe("startConnectOnboarding", () => {
  it("creates a new Express account and persists it when the salon has none yet", async () => {
    prismaMock.salon.findUniqueOrThrow.mockResolvedValueOnce({
      stripeAccountId: null,
      name: "Polished Nail Studio",
    });
    stripeMock.accounts.create.mockResolvedValueOnce({ id: "acct_new" });
    stripeMock.accountLinks.create.mockResolvedValueOnce({
      url: "https://connect.stripe.com/setup/acct_new",
    });

    const url = await startConnectOnboarding(SALON_ID, {
      refreshUrl: "https://salon.example.com/admin/payments",
      returnUrl: "https://salon.example.com/admin/payments?saved=stripe_returned",
    });

    expect(stripeMock.accounts.create).toHaveBeenCalledWith({
      type: "express",
      business_profile: { name: "Polished Nail Studio" },
    });
    expect(prismaMock.salon.update).toHaveBeenCalledWith({
      where: { id: SALON_ID },
      data: { stripeAccountId: "acct_new" },
    });
    expect(stripeMock.accountLinks.create).toHaveBeenCalledWith({
      account: "acct_new",
      refresh_url: "https://salon.example.com/admin/payments",
      return_url: "https://salon.example.com/admin/payments?saved=stripe_returned",
      type: "account_onboarding",
    });
    expect(url).toBe("https://connect.stripe.com/setup/acct_new");
  });

  it("reuses an existing account id instead of creating a second one", async () => {
    prismaMock.salon.findUniqueOrThrow.mockResolvedValueOnce({
      stripeAccountId: "acct_existing",
      name: "Polished Nail Studio",
    });
    stripeMock.accountLinks.create.mockResolvedValueOnce({
      url: "https://connect.stripe.com/setup/acct_existing",
    });

    await startConnectOnboarding(SALON_ID, {
      refreshUrl: "https://salon.example.com/admin/payments",
      returnUrl: "https://salon.example.com/admin/payments?saved=stripe_returned",
    });

    expect(stripeMock.accounts.create).not.toHaveBeenCalled();
    expect(prismaMock.salon.update).not.toHaveBeenCalled();
    expect(stripeMock.accountLinks.create).toHaveBeenCalledWith(
      expect.objectContaining({ account: "acct_existing" })
    );
  });
});

describe("createExpressLoginLink", () => {
  it("returns the Express dashboard login link URL for a connected account", async () => {
    prismaMock.salon.findUniqueOrThrow.mockResolvedValueOnce({
      stripeAccountId: "acct_1",
    });
    stripeMock.accounts.createLoginLink.mockResolvedValueOnce({
      url: "https://connect.stripe.com/express/acct_1",
    });

    const url = await createExpressLoginLink(SALON_ID);
    expect(stripeMock.accounts.createLoginLink).toHaveBeenCalledWith("acct_1");
    expect(url).toBe("https://connect.stripe.com/express/acct_1");
  });

  it("throws when the salon has no connected account", async () => {
    prismaMock.salon.findUniqueOrThrow.mockResolvedValueOnce({
      stripeAccountId: null,
    });
    await expect(createExpressLoginLink(SALON_ID)).rejects.toThrow(
      "Salon has no connected Stripe account."
    );
    expect(stripeMock.accounts.createLoginLink).not.toHaveBeenCalled();
  });
});

describe("syncAccountFromWebhook", () => {
  it("updates the owning salon's Stripe status fields", async () => {
    prismaMock.salon.findUnique.mockResolvedValueOnce({
      id: SALON_ID,
      paymentsEnabled: true,
    });

    await syncAccountFromWebhook("acct_1", {
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
    });

    expect(prismaMock.salon.update).toHaveBeenCalledWith({
      where: { id: SALON_ID },
      data: {
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeDetailsSubmitted: true,
        stripeAccountUpdatedAt: expect.any(Date),
        paymentsEnabled: true,
      },
    });
  });

  it("auto-disables paymentsEnabled when Stripe flips charges off (KYC lapse, dispute threshold)", async () => {
    prismaMock.salon.findUnique.mockResolvedValueOnce({
      id: SALON_ID,
      paymentsEnabled: true,
    });

    await syncAccountFromWebhook("acct_1", {
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: true,
    });

    expect(prismaMock.salon.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentsEnabled: false }) })
    );
  });

  it("is a no-op when no salon owns this Stripe account id", async () => {
    prismaMock.salon.findUnique.mockResolvedValueOnce(null);

    await syncAccountFromWebhook("acct_unknown", {
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
    });

    expect(prismaMock.salon.update).not.toHaveBeenCalled();
  });
});
