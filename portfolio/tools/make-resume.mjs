// Renders resume.html to ../assets/Baraa_Eldeirawi_Resume.pdf with Chromium.
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
await page.goto(new URL("./resume.html", import.meta.url).href);
await page.pdf({ path: new URL("../assets/Baraa_Eldeirawi_Resume.pdf", import.meta.url).pathname, format: "Letter", preferCSSPageSize: true, printBackground: true });
await browser.close();
