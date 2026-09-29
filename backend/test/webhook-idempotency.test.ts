import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { app, request, registerOwner, createClient, prisma } from "./helpers";

// Builds a real, verifiably-signed Stripe webhook request the same way
// Stripe itself would, using the SDK's own test-signature helper against the
// dummy secret configured in .env.test — this exercises actual signature
// verification end to end instead of mocking it away.
function signedWebhookRequest(secret: string, event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return { payload, header };
}

function paymentIntentSucceededEvent(id: string, invoiceId: string, amount: number) {
  return {
    id,
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: `pi_${id}`,
        amount,
        metadata: { invoiceId },
      },
    },
  };
}

async function createDraftInvoice(token: string, clientId: string) {
  const res = await request(app)
    .post("/api/invoices")
    .set("Authorization", `Bearer ${token}`)
    .send({ clientId, lineItems: [{ description: "Work", quantity: 1, unitPrice: 100, kind: "PART" }] });
  if (res.status !== 201) throw new Error(`createDraftInvoice failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

describe("Stripe webhook idempotency", () => {
  it("processes a payment_intent.succeeded event exactly once even if Stripe redelivers it", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token);
    const invoice = await createDraftInvoice(owner.token, client.id);

    const event = paymentIntentSucceededEvent(`evt_${Date.now()}_${Math.random()}`, invoice.id, 10000);
    const { payload, header } = signedWebhookRequest("whsec_test_dummy", event);

    const first = await request(app)
      .post("/api/payments/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", header)
      .send(payload);
    expect(first.status).toBe(200);

    // Stripe redelivers the identical event (same event id) on a retry.
    const second = await request(app)
      .post("/api/payments/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", header)
      .send(payload);
    expect(second.status).toBe(200);

    const paidInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(paidInvoice.status).toBe("PAID");

    const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
    expect(payments).toHaveLength(1);

    const claimed = await prisma.stripeWebhookEvent.findUnique({ where: { id: event.id } });
    expect(claimed).not.toBeNull();
  });

  it("rejects a webhook with an invalid signature", async () => {
    const event = paymentIntentSucceededEvent(`evt_${Date.now()}_${Math.random()}`, "nonexistent", 10000);
    const payload = JSON.stringify(event);

    const res = await request(app)
      .post("/api/payments/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", "t=1,v1=deadbeef")
      .send(payload);

    expect(res.status).toBe(400);
  });
});
