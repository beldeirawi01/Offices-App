import { test, expect } from "@playwright/test";

/**
 * The core value chain of the whole app, driven through the real UI against
 * a real backend + database (see playwright.config.ts — offices_app_e2e,
 * fully separate from dev/test data): register a business, add a client,
 * schedule a job, hand-create an invoice (the non-voice path, so this needs
 * no OpenAI/Anthropic/Twilio/Stripe credentials), and mark it paid.
 *
 * One long test rather than several — each Playwright test gets a fresh
 * browser context (empty localStorage), and this flow is inherently
 * sequential (you can't invoice a client that doesn't exist yet), so
 * splitting it up would just mean re-logging-in between steps for no benefit.
 */
test("register a business, create a client and job, invoice it, and mark it paid", async ({ page }) => {
  const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `e2e-${runId}@example.com`;
  const password = "password123";
  const ownerName = "Pat Playwright";
  const clientName = `Jamie Testcustomer ${runId}`;
  const jobTitle = `AC repair ${runId}`;

  await test.step("register a new business", async () => {
    await page.goto("/register");
    await page.getByLabel("Business name").fill("Playwright Test Trades");
    await page.getByLabel("Your name").fill(ownerName);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByText(ownerName)).toBeVisible();
  });

  await test.step("create a client", async () => {
    await page.getByRole("link", { name: "Clients" }).click();
    await expect(page).toHaveURL("/clients");
    // Two "New client" buttons exist (page header + empty-state action) when
    // there are no clients yet — either toggles the same form.
    await page.getByRole("button", { name: "New client" }).first().click();
    await page.getByLabel("Name").fill(clientName);
    await page.getByRole("button", { name: "Save client" }).click();

    await expect(page.getByRole("link", { name: clientName })).toBeVisible();
  });

  await test.step("schedule a job for that client", async () => {
    await page.getByRole("link", { name: "Scheduling" }).click();
    await expect(page).toHaveURL("/jobs");
    // Same page-header + empty-state duplication as the New client button.
    await page.getByRole("button", { name: "New job" }).first().click();
    // Not getByLabel: for a <label> that wraps a <select> (rather than using
    // htmlFor/id), Playwright's label-text matching doesn't exclude the
    // select's own rendered option text, so it never exact-matches "Client"
    // and just hangs retrying. getByRole uses real accessible-name
    // computation (the same thing a screen reader sees) and works correctly.
    await page.getByRole("combobox", { name: "Client", exact: true }).selectOption({ label: clientName });
    await page.getByLabel("Job title").fill(jobTitle);
    await page.getByRole("button", { name: "Save job" }).click();

    await expect(page.getByRole("link", { name: jobTitle })).toBeVisible();
  });

  await test.step("create a manual invoice for the job", async () => {
    await page.getByRole("link", { name: "Invoices" }).click();
    await expect(page).toHaveURL("/invoices");
    // Same page-header + empty-state duplication as the other "New X" links.
    await page.getByRole("link", { name: "New invoice" }).first().click();

    await page.getByRole("combobox", { name: "Client", exact: true }).selectOption({ label: clientName });
    await page.getByRole("combobox", { name: "Job (optional)" }).selectOption({ label: jobTitle });

    const lineItemRow = page.locator(".line-item-row").first();
    await lineItemRow.getByPlaceholder("e.g. Capacitor replacement").fill("Capacitor replacement");
    const numberInputs = lineItemRow.locator('input[type="number"]');
    await numberInputs.nth(0).fill("2"); // quantity
    await numberInputs.nth(1).fill("19.99"); // unit price

    // 2 * 19.99 computed client-side as a live preview before the
    // authoritative (Decimal-exact) total comes back from the server.
    await expect(page.getByText("$39.98")).toBeVisible();

    await page.getByRole("button", { name: "Create draft invoice" }).click();

    await expect(page).toHaveURL(/\/invoices\/.+/);
    await expect(page.getByText("DRAFT", { exact: false })).toBeVisible();
    // The server-computed total is a plain JSON number (Prisma Decimal
    // serialized via the toJSON patch), not a string — if that ever broke,
    // this would render "NaN" or throw instead of showing a real amount.
    // $39.98 legitimately appears more than once on the invoice detail page
    // (e.g. the line item row and the totals summary), so .first() rather
    // than requiring a single match.
    await expect(page.getByText("$39.98").first()).toBeVisible();
  });

  await test.step("mark the invoice paid (cash/check)", async () => {
    await page.getByRole("button", { name: "Mark as paid (cash/check)" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Mark as paid", exact: true }).click();

    // Not a loose text match: the success toast ("Invoice marked as paid.")
    // also contains "paid" case-insensitively, so this targets the actual
    // status badge specifically.
    await expect(page.locator(".badge-paid")).toHaveText("PAID");
    await expect(page.getByRole("button", { name: "Mark as paid (cash/check)" })).toHaveCount(0);
  });
});

test("shows an error on an invalid login instead of silently failing", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.locator(".error-banner")).toBeVisible();
  await expect(page).toHaveURL("/login");
});
