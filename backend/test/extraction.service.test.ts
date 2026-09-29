import { describe, expect, it } from "vitest";
import { extractJsonFromText, extractedJobSchema } from "../src/services/extraction.service";

describe("extractJsonFromText", () => {
  it("extracts a clean JSON object with no surrounding text", () => {
    const input = '{"customerName": "Jane", "summary": "Fixed the sink"}';
    expect(JSON.parse(extractJsonFromText(input))).toEqual({ customerName: "Jane", summary: "Fixed the sink" });
  });

  it("strips markdown code fences around the JSON", () => {
    const input = '```json\n{"customerName": "Jane"}\n```';
    expect(JSON.parse(extractJsonFromText(input))).toEqual({ customerName: "Jane" });
  });

  it("throws when there is no JSON object in the text", () => {
    expect(() => extractJsonFromText("Sorry, I could not process that.")).toThrow();
  });
});

describe("extractedJobSchema", () => {
  it("accepts a fully populated valid extraction", () => {
    const result = extractedJobSchema.parse({
      customerName: "Jane",
      jobType: "HVAC repair",
      summary: "Replaced capacitor",
      laborHours: 1.5,
      laborRate: 90,
      lineItems: [{ description: "Capacitor", quantity: 1, unitPrice: 25, kind: "PART" }],
      notes: null,
    });
    expect(result.lineItems).toHaveLength(1);
  });

  it("defaults lineItems to an empty array when omitted", () => {
    const result = extractedJobSchema.parse({
      customerName: null,
      jobType: null,
      summary: "Did some work",
      laborHours: null,
      laborRate: null,
      notes: null,
    });
    expect(result.lineItems).toEqual([]);
  });

  it("rejects a hallucinated negative unitPrice or quantity on a line item", () => {
    expect(() =>
      extractedJobSchema.parse({
        customerName: "Jane",
        jobType: null,
        summary: "Did some work",
        laborHours: null,
        laborRate: null,
        lineItems: [{ description: "Capacitor", quantity: 1, unitPrice: -50, kind: "PART" }],
        notes: null,
      }),
    ).toThrow();

    expect(() =>
      extractedJobSchema.parse({
        customerName: "Jane",
        jobType: null,
        summary: "Did some work",
        laborHours: null,
        laborRate: null,
        lineItems: [{ description: "Capacitor", quantity: -1, unitPrice: 50, kind: "PART" }],
        notes: null,
      }),
    ).toThrow();
  });

  it("rejects a negative laborHours or laborRate", () => {
    expect(() =>
      extractedJobSchema.parse({
        customerName: "Jane",
        jobType: null,
        summary: "Did some work",
        laborHours: -2,
        laborRate: 90,
        lineItems: [],
        notes: null,
      }),
    ).toThrow();

    expect(() =>
      extractedJobSchema.parse({
        customerName: "Jane",
        jobType: null,
        summary: "Did some work",
        laborHours: 2,
        laborRate: -90,
        lineItems: [],
        notes: null,
      }),
    ).toThrow();
  });
});
