/**
 * Runs every case in dataset.ts against the LIVE extraction pipeline (real
 * Whisper-adjacent Claude calls — this costs money and is non-deterministic,
 * which is exactly why it's a separate script and not part of `npm test`).
 *
 * Usage: npm run eval:extraction
 * Requires ANTHROPIC_API_KEY to be set (reads the same .env as the app).
 */
import { env } from "../src/config/env";
import { extractJobDetails, extractQuoteDetails, ExtractedJob } from "../src/services/extraction.service";
import { EvalCase, evalCases } from "./dataset";

interface Check {
  name: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
}

interface CaseResult {
  id: string;
  passed: boolean;
  checks: Check[];
  error?: string;
}

function scoreCase(evalCase: EvalCase, actual: ExtractedJob): Check[] {
  const checks: Check[] = [];
  const { expected } = evalCase;

  if (expected.customerName !== undefined) {
    const passed =
      expected.customerName === null
        ? actual.customerName === null
        : typeof actual.customerName === "string" &&
          actual.customerName.toLowerCase().includes(expected.customerName.toLowerCase());
    checks.push({ name: "customerName", passed, expected: expected.customerName, actual: actual.customerName });
  }

  if (expected.laborHours !== undefined) {
    checks.push({
      name: "laborHours",
      passed: actual.laborHours === expected.laborHours,
      expected: expected.laborHours,
      actual: actual.laborHours,
    });
  }

  if (expected.laborRate !== undefined) {
    checks.push({
      name: "laborRate",
      passed: actual.laborRate === expected.laborRate,
      expected: expected.laborRate,
      actual: actual.laborRate,
    });
  }

  checks.push({
    name: "lineItems.length",
    passed: actual.lineItems.length === expected.lineItems.length,
    expected: expected.lineItems.length,
    actual: actual.lineItems.length,
  });

  const sharedLength = Math.min(actual.lineItems.length, expected.lineItems.length);
  for (let i = 0; i < sharedLength; i++) {
    const exp = expected.lineItems[i];
    const act = actual.lineItems[i];
    const descriptionMatches = exp.descriptionKeywords.some((keyword) =>
      act.description.toLowerCase().includes(keyword.toLowerCase()),
    );
    checks.push({
      name: `lineItems[${i}].description`,
      passed: descriptionMatches,
      expected: exp.descriptionKeywords,
      actual: act.description,
    });
    checks.push({ name: `lineItems[${i}].quantity`, passed: act.quantity === exp.quantity, expected: exp.quantity, actual: act.quantity });
    checks.push({
      name: `lineItems[${i}].unitPrice`,
      passed: act.unitPrice === exp.unitPrice,
      expected: exp.unitPrice,
      actual: act.unitPrice,
    });
    checks.push({ name: `lineItems[${i}].kind`, passed: act.kind === exp.kind, expected: exp.kind, actual: act.kind });
  }

  return checks;
}

async function main() {
  if (!env.anthropicApiKey) {
    console.error("ANTHROPIC_API_KEY is not set — this eval makes real Claude calls and needs a working key.");
    process.exit(1);
  }

  const results: CaseResult[] = [];

  for (const evalCase of evalCases) {
    process.stdout.write(`${evalCase.id} ... `);
    try {
      const extraction =
        evalCase.purpose === "QUOTE" ? await extractQuoteDetails(evalCase.transcript) : await extractJobDetails(evalCase.transcript);
      const checks = scoreCase(evalCase, extraction.result);
      const passed = checks.every((c) => c.passed);
      results.push({ id: evalCase.id, passed, checks });
      console.log(passed ? "PASS" : "FAIL");
    } catch (err) {
      results.push({ id: evalCase.id, passed: false, checks: [], error: err instanceof Error ? err.message : String(err) });
      console.log("ERROR");
    }
  }

  const totalChecks = results.reduce((sum, r) => sum + r.checks.length, 0);
  const passedChecks = results.reduce((sum, r) => sum + r.checks.filter((c) => c.passed).length, 0);
  const casesPassed = results.filter((r) => r.passed).length;

  console.log(`\n${casesPassed}/${results.length} cases fully passed`);
  if (totalChecks > 0) {
    console.log(`${passedChecks}/${totalChecks} individual field checks passed (${((passedChecks / totalChecks) * 100).toFixed(1)}%)`);
  }

  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const result of failures) {
      console.log(`\n  ${result.id}`);
      if (result.error) {
        console.log(`    extraction threw: ${result.error}`);
        continue;
      }
      for (const check of result.checks.filter((c) => !c.passed)) {
        console.log(`    ${check.name}: expected ${JSON.stringify(check.expected)}, got ${JSON.stringify(check.actual)}`);
      }
    }
  }

  process.exit(casesPassed === results.length ? 0 : 1);
}

main();
