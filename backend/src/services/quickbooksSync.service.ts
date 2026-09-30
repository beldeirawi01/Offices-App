import { prisma } from "../db/prisma";
import { HttpError } from "../middleware/errorHandler";
import { qboRequest } from "./quickbooks.service";

interface QboQueryResponse<TKey extends string, T> {
  QueryResponse?: Record<TKey, T[]>;
}

/**
 * QBO invoice lines each require a reference to a catalog "Item" — Jobscribe
 * has no pricebook of its own to map real line items to real QBO items, so
 * one generic "Jobscribe Services" Item stands in for all of them (the
 * actual description still carries over per line). Created once per
 * organization on first use and cached on Organization.quickbooksDefaultItemId
 * after that, since creating one needs a query + a create, not worth
 * repeating on every invoice.
 */
async function getDefaultServiceItemId(organizationId: string): Promise<string> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (org.quickbooksDefaultItemId) return org.quickbooksDefaultItemId;

  const existing = await qboRequest<QboQueryResponse<"Item", { Id: string }>>(
    organizationId,
    "GET",
    `query?query=${encodeURIComponent("SELECT Id FROM Item WHERE Name = 'Jobscribe Services'")}`,
  );
  const foundId = existing.QueryResponse?.Item?.[0]?.Id;
  if (foundId) {
    await prisma.organization.update({ where: { id: organizationId }, data: { quickbooksDefaultItemId: foundId } });
    return foundId;
  }

  const incomeAccounts = await qboRequest<QboQueryResponse<"Account", { Id: string }>>(
    organizationId,
    "GET",
    `query?query=${encodeURIComponent("SELECT Id FROM Account WHERE AccountType = 'Income' MAXRESULTS 1")}`,
  );
  const incomeAccountId = incomeAccounts.QueryResponse?.Account?.[0]?.Id;
  if (!incomeAccountId) {
    throw new Error("Could not find an income account in this QuickBooks company to attach a service item to");
  }

  const created = await qboRequest<{ Item: { Id: string } }>(organizationId, "POST", "item", {
    Name: "Jobscribe Services",
    Type: "Service",
    IncomeAccountRef: { value: incomeAccountId },
  });
  await prisma.organization.update({
    where: { id: organizationId },
    data: { quickbooksDefaultItemId: created.Item.Id },
  });
  return created.Item.Id;
}

/**
 * Pushes (or reuses) the QBO Customer for a client. `DisplayName` must be
 * unique within a QBO company — a real collision surfaces as a QuickBooks
 * API error, which callers here treat like any other sync failure (recorded
 * on the invoice, not fatal to the rest of the app).
 */
async function ensureQuickbooksCustomer(organizationId: string, clientId: string): Promise<string> {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  if (client.quickbooksCustomerId) return client.quickbooksCustomerId;

  const created = await qboRequest<{ Customer: { Id: string } }>(organizationId, "POST", "customer", {
    DisplayName: client.name,
    PrimaryEmailAddr: client.email ? { Address: client.email } : undefined,
    PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined,
    BillAddr: client.addressLine1
      ? {
          Line1: client.addressLine1,
          Line2: client.addressLine2 ?? undefined,
          City: client.city ?? undefined,
          CountrySubDivisionCode: client.state ?? undefined,
          PostalCode: client.postalCode ?? undefined,
        }
      : undefined,
  });
  await prisma.client.update({ where: { id: clientId }, data: { quickbooksCustomerId: created.Customer.Id } });
  return created.Customer.Id;
}

/**
 * Creates the QBO Invoice for a Jobscribe invoice. Only ever creates, never
 * updates — an invoice's line items are frozen once it's SENT (the point
 * this is called from), so there's nothing to reconcile on a second call;
 * an already-synced invoice is just skipped. Sales tax is added as a plain
 * extra line rather than using QBO's own tax engine, since that needs a
 * TaxCodeRef specific to how each company has sales tax configured there —
 * this keeps the QBO invoice's total matching ours exactly without needing
 * to know that.
 *
 * Returns whether a sync was actually attempted (false when the org isn't
 * connected to QuickBooks or was already synced) — a caller uses this to
 * decide whether to stamp `quickbooksSyncedAt`.
 */
async function syncInvoiceToQuickbooks(invoiceId: string): Promise<boolean> {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { lineItems: true, organization: true },
  });
  if (!invoice.organization.quickbooksAccessToken) return false;
  if (invoice.quickbooksInvoiceId) return true;

  const customerId = await ensureQuickbooksCustomer(invoice.organizationId, invoice.clientId);
  const itemId = await getDefaultServiceItemId(invoice.organizationId);

  const lines = invoice.lineItems.map((item) => ({
    Amount: item.amount.toNumber(),
    DetailType: "SalesItemLineDetail",
    Description: item.description,
    SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: item.quantity, UnitPrice: item.unitPrice.toNumber() },
  }));
  if (invoice.tax.greaterThan(0)) {
    lines.push({
      Amount: invoice.tax.toNumber(),
      DetailType: "SalesItemLineDetail",
      Description: "Sales tax",
      SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: 1, UnitPrice: invoice.tax.toNumber() },
    });
  }

  const created = await qboRequest<{ Invoice: { Id: string } }>(invoice.organizationId, "POST", "invoice", {
    CustomerRef: { value: customerId },
    DocNumber: invoice.invoiceNumber,
    Line: lines,
  });
  await prisma.invoice.update({ where: { id: invoiceId }, data: { quickbooksInvoiceId: created.Invoice.Id } });
  return true;
}

/**
 * Records a QBO Payment against the already-synced QBO Invoice once ours is
 * marked paid. No-ops if the invoice itself was never synced (nothing to
 * attach a payment to) or a payment was already recorded.
 */
async function syncInvoicePaymentToQuickbooks(invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { organization: true } });
  if (!invoice.organization.quickbooksAccessToken) return;
  if (!invoice.quickbooksInvoiceId || invoice.quickbooksPaymentId) return;

  const customerId = await ensureQuickbooksCustomer(invoice.organizationId, invoice.clientId);
  const created = await qboRequest<{ Payment: { Id: string } }>(invoice.organizationId, "POST", "payment", {
    CustomerRef: { value: customerId },
    TotalAmt: invoice.total.toNumber(),
    Line: [{ Amount: invoice.total.toNumber(), LinkedTxn: [{ TxnId: invoice.quickbooksInvoiceId, TxnType: "Invoice" }] }],
  });
  await prisma.invoice.update({ where: { id: invoiceId }, data: { quickbooksPaymentId: created.Payment.Id } });
}

async function recordSyncError(invoiceId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : "Unknown QuickBooks sync error";
  console.error(`QuickBooks sync failed for invoice ${invoiceId}`, err);
  await prisma.invoice.update({ where: { id: invoiceId }, data: { quickbooksSyncError: message } }).catch(() => {});
}

/**
 * Best-effort, non-throwing sync of a just-sent invoice — called
 * fire-and-forget from invoices.routes.ts so a QuickBooks outage never
 * blocks sending an invoice to a client. Failures are recorded on the
 * invoice (`quickbooksSyncError`) rather than surfaced to the request.
 */
export async function syncInvoiceBestEffort(invoiceId: string): Promise<void> {
  try {
    const attempted = await syncInvoiceToQuickbooks(invoiceId);
    if (attempted) {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { quickbooksSyncedAt: new Date(), quickbooksSyncError: null },
      });
    }
  } catch (err) {
    await recordSyncError(invoiceId, err);
  }
}

/** Same best-effort contract as syncInvoiceBestEffort, for the payment side. */
export async function syncInvoicePaymentBestEffort(invoiceId: string): Promise<void> {
  try {
    await syncInvoicePaymentToQuickbooks(invoiceId);
  } catch (err) {
    await recordSyncError(invoiceId, err);
  }
}

/**
 * Manual "Sync now" — catches up anything not yet pushed (or that failed on
 * an earlier attempt): invoices never synced, invoices with a recorded
 * error, and paid invoices missing their payment record. Used right after
 * first connecting QuickBooks (to push everything that predates the
 * connection) and as a manual retry after an outage.
 */
export async function syncUnsyncedInvoices(organizationId: string): Promise<{ synced: number; failed: number }> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (!org.quickbooksAccessToken) {
    throw new HttpError(400, "Connect QuickBooks in Settings before syncing");
  }

  const candidates = await prisma.invoice.findMany({
    where: {
      organizationId,
      status: { in: ["SENT", "PAID", "OVERDUE"] },
      OR: [
        { quickbooksInvoiceId: null },
        { quickbooksSyncError: { not: null } },
        { AND: [{ status: "PAID" }, { quickbooksPaymentId: null }] },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  let synced = 0;
  let failed = 0;
  for (const invoice of candidates) {
    try {
      const attempted = await syncInvoiceToQuickbooks(invoice.id);
      if (invoice.status === "PAID") {
        await syncInvoicePaymentToQuickbooks(invoice.id);
      }
      if (attempted) {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { quickbooksSyncedAt: new Date(), quickbooksSyncError: null },
        });
      }
      synced++;
    } catch (err) {
      failed++;
      await recordSyncError(invoice.id, err);
    }
  }
  return { synced, failed };
}
