import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app, request, registerOwner, createClient, createJob, prisma } from "./helpers";
import { createOAuthState, verifyOAuthState, getAuthorizationUrl } from "../src/services/quickbooks.service";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, statusText: "", json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

async function connectQuickbooks(organizationId: string) {
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      quickbooksRealmId: "test-realm",
      quickbooksAccessToken: "test-access-token",
      quickbooksRefreshToken: "test-refresh-token",
      // Far enough in the future that getValidCredentials never tries to refresh
      // (and therefore never makes an extra, unmocked fetch call) during a test.
      quickbooksTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      quickbooksConnectedAt: new Date(),
    },
  });
}

describe("QuickBooks OAuth state token", () => {
  it("round-trips an organization id through a signed state token", () => {
    const state = createOAuthState("org-123");
    expect(verifyOAuthState(state)).toBe("org-123");
  });

  it("rejects a tampered state token", () => {
    const state = createOAuthState("org-123");
    expect(() => verifyOAuthState(state + "x")).toThrow();
  });

  it("builds an authorization URL carrying the client id and a state token", () => {
    const url = getAuthorizationUrl("org-123");
    expect(url).toContain("client_id=test_qbo_client_id");
    expect(url).toMatch(/state=[^&]+/);
  });
});

describe("QuickBooks connect/disconnect routes", () => {
  it("refuses connect/disconnect/sync to a non-owner", async () => {
    const owner = await registerOwner();
    const techRes = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Tech", email: `tech-${Date.now()}@test.com`, password: "password123", role: "TECH" });
    const techLogin = await request(app).post("/api/auth/login").send({ email: techRes.body.email, password: "password123" });

    for (const path of ["connect", "disconnect", "sync"]) {
      const res = await request(app)
        .post(`/api/organizations/me/quickbooks/${path}`)
        .set("Authorization", `Bearer ${techLogin.body.token}`);
      expect(res.status).toBe(403);
    }
  });

  it("returns an authorization url for the owner", async () => {
    const owner = await registerOwner();
    const res = await request(app)
      .post("/api/organizations/me/quickbooks/connect")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.body.url).toContain("appcenter.intuit.com");
  });

  it("never exposes the raw QuickBooks tokens through GET /organizations/me", async () => {
    const owner = await registerOwner();
    await connectQuickbooks(owner.user.organizationId);

    const res = await request(app).get("/api/organizations/me").set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.body.quickbooksConnected).toBe(true);
    expect(res.body).not.toHaveProperty("quickbooksAccessToken");
    expect(res.body).not.toHaveProperty("quickbooksRefreshToken");
  });

  it("clears stored tokens on disconnect", async () => {
    const owner = await registerOwner();
    await connectQuickbooks(owner.user.organizationId);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));

    const res = await request(app)
      .post("/api/organizations/me/quickbooks/disconnect")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(204);

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: owner.user.organizationId } });
    expect(org.quickbooksAccessToken).toBeNull();
    expect(org.quickbooksRealmId).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("QuickBooks invoice/payment sync", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses to sync when QuickBooks isn't connected", async () => {
    const owner = await registerOwner();
    const res = await request(app)
      .post("/api/organizations/me/quickbooks/sync")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(400);
  });

  it("pushes a sent invoice's customer and invoice to QuickBooks, then records a payment once paid", async () => {
    const owner = await registerOwner();
    await connectQuickbooks(owner.user.organizationId);
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);

    const invoiceRes = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        clientId: client.id,
        jobId: jobRes.body.id,
        lineItems: [{ description: "Capacitor", quantity: 1, unitPrice: 50, kind: "PART" }],
      });
    expect(invoiceRes.status).toBe(201);
    const invoiceId = invoiceRes.body.id;

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "cust-1" } })) // create customer
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: {} })) // item lookup: not found
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: { Account: [{ Id: "acct-1" }] } })) // income account lookup
      .mockResolvedValueOnce(jsonResponse({ Item: { Id: "item-1" } })) // create item
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "qbo-inv-1" } })) // create invoice
      .mockResolvedValueOnce(jsonResponse({ Payment: { Id: "qbo-pay-1" } })); // record payment

    const syncRes = await request(app)
      .post("/api/organizations/me/quickbooks/sync")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(syncRes.status).toBe(200); // invoice is still DRAFT — nothing eligible to sync yet
    expect(syncRes.body).toEqual({ synced: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();

    await request(app).post(`/api/invoices/${invoiceId}/mark-paid`).set("Authorization", `Bearer ${owner.token}`);

    // mark-paid fires both the invoice sync and (chained after it) the
    // payment sync fire-and-forget — give them a tick to run.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.quickbooksInvoiceId).toBe("qbo-inv-1");
    expect(invoice.quickbooksPaymentId).toBe("qbo-pay-1");
    // customer create + item lookup + account lookup + item create + invoice
    // create + payment create — the payment step reuses the now-cached
    // customer, so it's exactly one more call, not a second customer lookup.
    expect(fetchMock).toHaveBeenCalledTimes(6);

    const client2 = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
    expect(client2.quickbooksCustomerId).toBe("cust-1");

    // Syncing again is a no-op — no new fetch calls, since everything is
    // already recorded as synced.
    const before = fetchMock.mock.calls.length;
    const secondSync = await request(app)
      .post("/api/organizations/me/quickbooks/sync")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(secondSync.status).toBe(200);
    expect(secondSync.body).toEqual({ synced: 0, failed: 0 });
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it("records a sync error on the invoice instead of failing the request when QuickBooks rejects the push", async () => {
    const owner = await registerOwner();
    await connectQuickbooks(owner.user.organizationId);
    const client = await createClient(owner.token);
    const jobRes = await createJob(owner.token, client.id);
    const invoiceRes = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        clientId: client.id,
        jobId: jobRes.body.id,
        lineItems: [{ description: "Part", quantity: 1, unitPrice: 10, kind: "PART" }],
      });
    const invoiceId = invoiceRes.body.id;

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse({ Fault: { Error: [{ Message: "DisplayName already in use" }] } }, false, 400),
    );

    await request(app).post(`/api/invoices/${invoiceId}/mark-paid`).set("Authorization", `Bearer ${owner.token}`);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.quickbooksInvoiceId).toBeNull();
    expect(invoice.quickbooksSyncError).toContain("DisplayName already in use");
  });
});
