import { describe, expect, it } from "vitest";
import twilio from "twilio";
import { app, request, registerOwner, createClient, prisma } from "./helpers";

const AUTH_TOKEN = "test_twilio_auth_token"; // matches .env.test
const WEBHOOK_URL = "http://localhost:4001/api/webhooks/twilio/sms";

function signedSmsRequest(params: Record<string, string>) {
  const signature = twilio.getExpectedTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, params);
  return request(app)
    .post("/api/webhooks/twilio/sms")
    .set("X-Twilio-Signature", signature)
    .type("form")
    .send(params);
}

describe("Twilio inbound SMS webhook (STOP/START handling)", () => {
  it("flips smsConsent to false when a client texts STOP, using a differently-formatted stored number", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "Opted-in client", phone: "(555) 123-4567" });
    await prisma.client.update({ where: { id: client.id }, data: { smsConsent: true } });

    const res = await signedSmsRequest({ From: "+15551234567", Body: "STOP" });

    expect(res.status).toBe(200);
    expect(res.text).toContain("unsubscribed");

    const updated = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
    expect(updated.smsConsent).toBe(false);
  });

  it("flips smsConsent back to true when a client texts START", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "Opted-out client", phone: "555-987-6543" });
    await prisma.client.update({ where: { id: client.id }, data: { smsConsent: false } });

    const res = await signedSmsRequest({ From: "+15559876543", Body: "start" });

    expect(res.status).toBe(200);
    const updated = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
    expect(updated.smsConsent).toBe(true);
  });

  it("applies STOP across every client sharing that phone number, not just one org's", async () => {
    const ownerA = await registerOwner();
    const ownerB = await registerOwner();
    const clientA = await createClient(ownerA.token, { name: "Shared number A", phone: "+15555550123" });
    const clientB = await createClient(ownerB.token, { name: "Shared number B", phone: "555-555-0123" });
    await prisma.client.updateMany({ where: { id: { in: [clientA.id, clientB.id] } }, data: { smsConsent: true } });

    await signedSmsRequest({ From: "+15555550123", Body: "STOP" });

    const updatedA = await prisma.client.findUniqueOrThrow({ where: { id: clientA.id } });
    const updatedB = await prisma.client.findUniqueOrThrow({ where: { id: clientB.id } });
    expect(updatedA.smsConsent).toBe(false);
    expect(updatedB.smsConsent).toBe(false);
  });

  it("ignores an ordinary reply that isn't a STOP/START keyword", async () => {
    const owner = await registerOwner();
    const client = await createClient(owner.token, { name: "Chatty client", phone: "+15551110000" });
    await prisma.client.update({ where: { id: client.id }, data: { smsConsent: true } });

    const res = await signedSmsRequest({ From: "+15551110000", Body: "Thanks, see you then!" });

    expect(res.status).toBe(200);
    const updated = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
    expect(updated.smsConsent).toBe(true);
  });

  it("rejects a request with an invalid signature", async () => {
    const res = await request(app)
      .post("/api/webhooks/twilio/sms")
      .set("X-Twilio-Signature", "not-a-real-signature")
      .type("form")
      .send({ From: "+15550000000", Body: "STOP" });

    expect(res.status).toBe(400);
  });
});
