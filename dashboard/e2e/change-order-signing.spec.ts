import { test, expect } from "@playwright/test";

// Must match playwright.config.ts's BACKEND_PORT — used here for a direct API
// call to fetch the change order's public token, since the dashboard UI
// doesn't display the raw client-facing link anywhere (the real flow sends
// it by SMS/email, which needs Twilio/Brevo credentials this sandbox
// doesn't have — see golden-path.spec.ts's own note on the same tradeoff).
const BACKEND_PORT = 4010;

test("owner creates a change order, and the client approves it with a drawn signature on the public page", async ({
  page,
  request,
}) => {
  const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `e2e-${runId}@example.com`;
  const password = "password123";
  const clientName = `Jamie Testcustomer ${runId}`;
  const jobTitle = `AC repair ${runId}`;

  await test.step("register and create a client + job", async () => {
    await page.goto("/register");
    await page.getByLabel("Business name").fill("Playwright Test Trades");
    await page.getByLabel("Your name").fill("Pat Playwright");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL("/");

    await page.getByRole("link", { name: "Clients" }).click();
    await page.getByRole("button", { name: "New client" }).first().click();
    await page.getByLabel("Name").fill(clientName);
    await page.getByRole("button", { name: "Save client" }).click();
    await expect(page.getByRole("link", { name: clientName })).toBeVisible();

    await page.getByRole("link", { name: "Scheduling" }).click();
    await page.getByRole("button", { name: "New job" }).first().click();
    await page.getByRole("combobox", { name: "Client", exact: true }).selectOption({ label: clientName });
    await page.getByLabel("Job title").fill(jobTitle);
    await page.getByRole("button", { name: "Save job" }).click();
    await expect(page.getByRole("link", { name: jobTitle })).toBeVisible();
    await page.getByRole("link", { name: jobTitle }).click();
  });

  let publicToken = "";

  await test.step("create a change order from the job detail page", async () => {
    await page.getByRole("button", { name: "+ New change order" }).click();
    await page.getByLabel("What's changing").fill("Found corroded wiring behind the wall, needs replacing");
    await page.getByLabel("Additional cost").fill("150");
    await page.getByRole("button", { name: "Create change order" }).click();

    await expect(page.getByText("Found corroded wiring behind the wall, needs replacing")).toBeVisible();
    await expect(page.getByText("pending")).toBeVisible();

    // The dashboard has no UI for the raw client-facing link (real delivery
    // is SMS/email, unavailable in this sandbox) — fetch it directly via the
    // same API the dashboard itself just used, with the session's own token.
    const token = await page.evaluate(() => localStorage.getItem("token"));
    const jobId = page.url().split("/jobs/")[1];
    const res = await request.get(`http://localhost:${BACKEND_PORT}/api/jobs/${jobId}/change-orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBe(true);
    const changeOrders = await res.json();
    expect(changeOrders).toHaveLength(1);
    publicToken = changeOrders[0].publicToken;
    expect(publicToken).toBeTruthy();
  });

  await test.step("client views the change order and approves it with a drawn signature", async () => {
    await page.goto(`/change-orders/view/${publicToken}`);
    await expect(page.getByText("Found corroded wiring behind the wall, needs replacing")).toBeVisible();
    await expect(page.getByText("$150.00")).toBeVisible();

    await page.getByRole("button", { name: "Approve this change" }).click();
    await page.getByLabel("Your full name").fill("Jamie Testcustomer");

    const canvas = page.locator(".signature-canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Signature canvas did not render");
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 10);
    await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
    await page.mouse.up();

    await page.getByRole("button", { name: "Sign and approve" }).click();
    await expect(page.getByText("You've approved this change order.")).toBeVisible();
  });
});
