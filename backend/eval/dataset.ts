/**
 * Realistic field-technician dictation samples for evaluating extraction
 * quality — distinct from extraction.service.test.ts, which only tests JSON
 * parsing and schema validation against hand-crafted input, never whether
 * the model actually gets realistic trade dictation right (natural speech
 * patterns, filler words, spoken-out numbers, ambiguous phrasing).
 *
 * `expected` only asserts what a transcript unambiguously states — line
 * item order matches the order things are mentioned, since that's how a
 * tech naturally dictates and how the model is expected to report them.
 */

export interface ExpectedLineItem {
  /** At least one of these must appear (case-insensitive) in the actual description. */
  descriptionKeywords: string[];
  quantity: number;
  unitPrice: number;
  kind: "PART" | "LABOR";
}

export interface EvalCase {
  id: string;
  purpose: "INVOICE" | "QUOTE";
  transcript: string;
  expected: {
    /** undefined = don't check; null = expect it to be null. */
    customerName?: string | null;
    laborHours?: number | null;
    laborRate?: number | null;
    lineItems: ExpectedLineItem[];
  };
}

export const evalCases: EvalCase[] = [
  {
    id: "hvac-capacitor-replacement",
    purpose: "INVOICE",
    transcript:
      "This is for the Martinez job on Oak Street. AC wasn't kicking on, turned out to be a bad run capacitor. Replaced it with a 45/5 microfarad capacitor, that part was about 38 dollars. Took me an hour and a half, I bill 95 an hour for labor.",
    expected: {
      customerName: "Martinez",
      laborHours: 1.5,
      laborRate: 95,
      lineItems: [{ descriptionKeywords: ["capacitor"], quantity: 1, unitPrice: 38, kind: "PART" }],
    },
  },
  {
    id: "plumbing-leak-simple",
    purpose: "INVOICE",
    transcript:
      "Job for Denise Coleman. Found a slow leak under the kitchen sink, the P-trap was cracked. Swapped in a new P-trap, cost me about 12 bucks for the part. Whole thing took maybe 40 minutes, flat 85 dollar service call for anything under an hour.",
    expected: {
      customerName: "Denise Coleman",
      laborHours: null,
      laborRate: null,
      lineItems: [
        { descriptionKeywords: ["p-trap", "trap"], quantity: 1, unitPrice: 12, kind: "PART" },
        { descriptionKeywords: ["service call", "labor"], quantity: 1, unitPrice: 85, kind: "LABOR" },
      ],
    },
  },
  {
    id: "electrical-outlet-gfci",
    purpose: "INVOICE",
    transcript:
      "Customer is Tom Bricker. Bathroom outlet wasn't tripping right, needed a new GFCI outlet. Installed one GFCI outlet, that's 22 dollars for the part. Labor was half an hour at 110 an hour.",
    expected: {
      customerName: "Tom Bricker",
      laborHours: 0.5,
      laborRate: 110,
      lineItems: [{ descriptionKeywords: ["gfci", "outlet"], quantity: 1, unitPrice: 22, kind: "PART" }],
    },
  },
  {
    id: "hvac-tuneup-no-parts",
    purpose: "INVOICE",
    transcript:
      "Annual tune-up for the Hendersons. Cleaned the coils, checked refrigerant levels, they were fine, replaced the filter which was a standard 16 by 25, that's 8 dollars. No other parts needed. Took about an hour, flat rate 120 for the tune-up.",
    expected: {
      customerName: "Hendersons",
      laborHours: null,
      laborRate: null,
      lineItems: [
        { descriptionKeywords: ["filter"], quantity: 1, unitPrice: 8, kind: "PART" },
        { descriptionKeywords: ["tune-up", "tune up", "labor"], quantity: 1, unitPrice: 120, kind: "LABOR" },
      ],
    },
  },
  {
    id: "plumbing-water-heater-quote",
    purpose: "QUOTE",
    transcript:
      "Giving the Alvarez family a quote to replace their water heater. It's a 40 gallon gas unit, roughly 650 dollars for the tank itself. Labor to pull the old one and install the new one, install kit and venting, I'd estimate about 4 hours at 90 an hour.",
    expected: {
      customerName: "Alvarez",
      laborHours: 4,
      laborRate: 90,
      lineItems: [{ descriptionKeywords: ["water heater", "tank"], quantity: 1, unitPrice: 650, kind: "PART" }],
    },
  },
  {
    id: "electrical-panel-quote",
    purpose: "QUOTE",
    transcript:
      "Estimate for a panel upgrade at the Okafor residence, no customer first name given to me. Going from a 100 amp panel to 200 amp. Panel and breakers together run about 900 dollars. This is a full day job, figure 8 hours at 100 an hour.",
    expected: {
      customerName: "Okafor",
      laborHours: 8,
      laborRate: 100,
      lineItems: [{ descriptionKeywords: ["panel"], quantity: 1, unitPrice: 900, kind: "PART" }],
    },
  },
  {
    id: "hvac-condenser-fan-motor",
    purpose: "INVOICE",
    transcript:
      "This one's for Priya Nair. Outdoor unit was making a grinding noise, condenser fan motor was seized up. New motor was 165 dollars. Also had to replace the fan blade since the old one was bent, that was another 25 dollars. Two hours of labor, 95 an hour.",
    expected: {
      customerName: "Priya Nair",
      laborHours: 2,
      laborRate: 95,
      lineItems: [
        { descriptionKeywords: ["motor"], quantity: 1, unitPrice: 165, kind: "PART" },
        { descriptionKeywords: ["fan blade", "blade"], quantity: 1, unitPrice: 25, kind: "PART" },
      ],
    },
  },
  {
    id: "plumbing-toilet-multiple",
    purpose: "INVOICE",
    transcript:
      "Fixed two toilets for the Whitfield place, both upstairs bathrooms. Each one needed a new fill valve, those were 9 dollars each, so two of them. Also one of them needed a new flapper too, that's 6 bucks. Hour and fifteen minutes total, my rate's 85.",
    expected: {
      customerName: "Whitfield",
      laborHours: 1.25,
      laborRate: 85,
      lineItems: [
        { descriptionKeywords: ["fill valve", "valve"], quantity: 2, unitPrice: 9, kind: "PART" },
        { descriptionKeywords: ["flapper"], quantity: 1, unitPrice: 6, kind: "PART" },
      ],
    },
  },
  {
    id: "electrical-ceiling-fan-install",
    purpose: "INVOICE",
    transcript:
      "Installed a ceiling fan for customer Greg Sunderland, he supplied the fan himself so no part cost from me, just labor. Took about an hour and a half at 100 per hour.",
    expected: {
      customerName: "Greg Sunderland",
      laborHours: 1.5,
      laborRate: 100,
      lineItems: [],
    },
  },
  {
    id: "hvac-refrigerant-recharge",
    purpose: "INVOICE",
    transcript:
      "Job at the Castellanos house. System was low on refrigerant, found and sealed a small leak on a fitting, then recharged with R410A, about 3 pounds at 22 dollars a pound so that's 66 dollars for refrigerant. Sealant kit for the leak was 15 dollars. Labor was two and a half hours at 95.",
    expected: {
      customerName: "Castellanos",
      laborHours: 2.5,
      laborRate: 95,
      lineItems: [
        { descriptionKeywords: ["refrigerant", "r410a"], quantity: 3, unitPrice: 22, kind: "PART" },
        { descriptionKeywords: ["sealant", "seal"], quantity: 1, unitPrice: 15, kind: "PART" },
      ],
    },
  },
  {
    id: "plumbing-sump-pump-quote",
    purpose: "QUOTE",
    transcript:
      "Quote for a new sump pump for the Larkins family, basement was flooding during the last storm. A quarter horsepower pump runs about 180 dollars. I'd also throw in a battery backup for another 220. Install is about 3 hours, 90 an hour.",
    expected: {
      customerName: "Larkins",
      laborHours: 3,
      laborRate: 90,
      lineItems: [
        { descriptionKeywords: ["sump pump", "pump"], quantity: 1, unitPrice: 180, kind: "PART" },
        { descriptionKeywords: ["battery backup", "backup"], quantity: 1, unitPrice: 220, kind: "PART" },
      ],
    },
  },
  {
    id: "electrical-breaker-replacement",
    purpose: "INVOICE",
    transcript:
      "Quick one for Sam Delgado. Breaker kept tripping, was just worn out, swapped a 20 amp breaker, that's 14 dollars for the part. Fifteen minutes of work, charging the 85 dollar minimum service call.",
    expected: {
      customerName: "Sam Delgado",
      laborHours: null,
      laborRate: null,
      lineItems: [
        { descriptionKeywords: ["breaker"], quantity: 1, unitPrice: 14, kind: "PART" },
        { descriptionKeywords: ["service call", "minimum"], quantity: 1, unitPrice: 85, kind: "LABOR" },
      ],
    },
  },
  {
    id: "hvac-thermostat-install",
    purpose: "INVOICE",
    transcript:
      "Installed a smart thermostat for the Ferraro household. They picked out the unit themselves and had it shipped, so I'm only billing for labor. Took about 45 minutes, my rate is 100 an hour.",
    expected: {
      customerName: "Ferraro",
      laborHours: 0.75,
      laborRate: 100,
      lineItems: [],
    },
  },
  {
    id: "plumbing-drain-snake",
    purpose: "INVOICE",
    transcript:
      "Cleared a clogged main line for Jordan Pfeiffer. Used the snake, pulled out a bunch of roots. No parts used. Job took about two hours, flat rate for drain clearing is 175.",
    expected: {
      customerName: "Jordan Pfeiffer",
      laborHours: null,
      laborRate: null,
      lineItems: [{ descriptionKeywords: ["drain", "snake", "clear"], quantity: 1, unitPrice: 175, kind: "LABOR" }],
    },
  },
  {
    id: "electrical-smoke-detector-quote",
    purpose: "QUOTE",
    transcript:
      "Rough estimate for the Achebe family, they want hardwired smoke detectors in every bedroom, that's 4 rooms. Detectors run about 35 dollars each. Figure a full day, 6 hours at 100 an hour since it's an older house and wiring might be tricky.",
    expected: {
      customerName: "Achebe",
      laborHours: 6,
      laborRate: 100,
      lineItems: [{ descriptionKeywords: ["smoke detector", "detector"], quantity: 4, unitPrice: 35, kind: "PART" }],
    },
  },
  {
    id: "hvac-duct-repair",
    purpose: "INVOICE",
    transcript:
      "Repaired a disconnected duct run in the attic for the Whitcombs, no first name mentioned. Used some flex duct and mastic sealant, parts came to about 40 dollars total. Hour and a half up in that attic, 95 an hour.",
    expected: {
      customerName: "Whitcombs",
      laborHours: 1.5,
      laborRate: 95,
      lineItems: [{ descriptionKeywords: ["duct", "mastic", "flex"], quantity: 1, unitPrice: 40, kind: "PART" }],
    },
  },
  {
    id: "plumbing-faucet-replace",
    purpose: "INVOICE",
    transcript:
      "Replaced a kitchen faucet for customer Ana Reyes. She bought the faucet herself, a nice pull-down model, so I'm just charging labor, hour and a quarter at 85 per hour.",
    expected: {
      customerName: "Ana Reyes",
      laborHours: 1.25,
      laborRate: 85,
      lineItems: [],
    },
  },
  {
    id: "electrical-light-fixture-multi",
    purpose: "INVOICE",
    transcript:
      "Job for the Boyko family. Installed three recessed lights in the kitchen and one pendant light over the island. The recessed lights were 18 dollars each, the pendant was 65 dollars since they picked something nicer. Two hours of labor at 100 an hour.",
    expected: {
      customerName: "Boyko",
      laborHours: 2,
      laborRate: 100,
      lineItems: [
        { descriptionKeywords: ["recessed"], quantity: 3, unitPrice: 18, kind: "PART" },
        { descriptionKeywords: ["pendant"], quantity: 1, unitPrice: 65, kind: "PART" },
      ],
    },
  },
  {
    id: "hvac-compressor-quote",
    purpose: "QUOTE",
    transcript:
      "This is a big one, quote for the Sandovals. Compressor's shot on their 15 year old system. New compressor alone is around 850 dollars, but honestly at that age I'd tell them to consider replacing the whole condenser unit instead. Just quoting the compressor swap for now, that's about 5 hours labor at 100 an hour.",
    expected: {
      customerName: "Sandovals",
      laborHours: 5,
      laborRate: 100,
      lineItems: [{ descriptionKeywords: ["compressor"], quantity: 1, unitPrice: 850, kind: "PART" }],
    },
  },
  {
    id: "plumbing-garbage-disposal",
    purpose: "INVOICE",
    transcript:
      "Swapped out a broken garbage disposal for Melissa Tran. Half horsepower unit, 95 dollars for the disposal itself. Forty-five minutes of install time, I charge 85 an hour.",
    expected: {
      customerName: "Melissa Tran",
      laborHours: 0.75,
      laborRate: 85,
      lineItems: [{ descriptionKeywords: ["disposal"], quantity: 1, unitPrice: 95, kind: "PART" }],
    },
  },
  {
    id: "electrical-outlet-multiple-rooms",
    purpose: "INVOICE",
    transcript:
      "Added new outlets for the Kowalczyks — two in the home office and one in the garage, so three outlets total. Standard outlets, 6 dollars each. This took about three hours since I had to run new wire to the garage, 100 an hour.",
    expected: {
      customerName: "Kowalczyks",
      laborHours: 3,
      laborRate: 100,
      lineItems: [{ descriptionKeywords: ["outlet"], quantity: 3, unitPrice: 6, kind: "PART" }],
    },
  },
  {
    id: "hvac-filter-only",
    purpose: "INVOICE",
    transcript:
      "Quick filter swap for the Dubois residence, no name given beyond that. Just a standard filter change, 20 by 20, that's 10 dollars. Fifteen minutes, minimum service charge of 75.",
    expected: {
      customerName: "Dubois",
      laborHours: null,
      laborRate: null,
      lineItems: [
        { descriptionKeywords: ["filter"], quantity: 1, unitPrice: 10, kind: "PART" },
        { descriptionKeywords: ["service", "minimum"], quantity: 1, unitPrice: 75, kind: "LABOR" },
      ],
    },
  },
  {
    id: "plumbing-repipe-quote",
    purpose: "QUOTE",
    transcript:
      "Big quote for the Fitzgeralds, they want to repipe the whole house from galvanized to PEX. Materials I'm estimating around 1200 dollars for pipe, fittings, and shutoffs. This is a two day job, 14 hours total, 90 an hour.",
    expected: {
      customerName: "Fitzgeralds",
      laborHours: 14,
      laborRate: 90,
      lineItems: [{ descriptionKeywords: ["pex", "pipe", "repipe"], quantity: 1, unitPrice: 1200, kind: "PART" }],
    },
  },
  {
    id: "electrical-ev-charger-quote",
    purpose: "QUOTE",
    transcript:
      "Estimate for Wei Chen, wants a level 2 EV charger installed in the garage. The charger unit they're buying separately. Just quoting labor and the circuit run — new 240 volt circuit, dedicated breaker, that's about 4 hours at 100 an hour.",
    expected: {
      customerName: "Wei Chen",
      laborHours: 4,
      laborRate: 100,
      lineItems: [],
    },
  },
  {
    id: "hvac-no-customer-name",
    purpose: "INVOICE",
    transcript:
      "Didn't catch the customer's name on this one, they weren't home, dealt with the property manager. Replaced a failed contactor in the outdoor unit, contactor was 18 dollars. Half hour of work, 95 an hour.",
    expected: {
      customerName: null,
      laborHours: 0.5,
      laborRate: 95,
      lineItems: [{ descriptionKeywords: ["contactor"], quantity: 1, unitPrice: 18, kind: "PART" }],
    },
  },
  {
    id: "plumbing-hose-bib",
    purpose: "INVOICE",
    transcript:
      "Replaced a frozen and cracked outdoor hose bib for the Petrovs. Frost-free hose bib was 28 dollars. Half hour job, minimum charge is 80.",
    expected: {
      customerName: "Petrovs",
      laborHours: null,
      laborRate: null,
      lineItems: [
        { descriptionKeywords: ["hose bib", "bib"], quantity: 1, unitPrice: 28, kind: "PART" },
        { descriptionKeywords: ["service", "minimum", "charge"], quantity: 1, unitPrice: 80, kind: "LABOR" },
      ],
    },
  },
  {
    id: "electrical-dimmer-switches",
    purpose: "INVOICE",
    transcript:
      "Installed five dimmer switches throughout the house for Natalie Osei. Dimmers were 14 dollars each. About two hours total, 100 an hour.",
    expected: {
      customerName: "Natalie Osei",
      laborHours: 2,
      laborRate: 100,
      lineItems: [{ descriptionKeywords: ["dimmer"], quantity: 5, unitPrice: 14, kind: "PART" }],
    },
  },
  {
    id: "hvac-evaporator-coil-quote",
    purpose: "QUOTE",
    transcript:
      "Quote for the Yamamotos. Evaporator coil is leaking, needs full replacement. Coil itself runs about 480 dollars. This is a longer job because of the refrigerant recovery and recharge after, figure 5 hours at 95 an hour.",
    expected: {
      customerName: "Yamamotos",
      laborHours: 5,
      laborRate: 95,
      lineItems: [{ descriptionKeywords: ["coil", "evaporator"], quantity: 1, unitPrice: 480, kind: "PART" }],
    },
  },
  {
    id: "plumbing-water-softener-quote",
    purpose: "QUOTE",
    transcript:
      "Quote for the Abernathys on a water softener install. The unit is about 750 dollars, they picked a mid-range one. Install including the bypass loop, figure 3 and a half hours at 90 an hour.",
    expected: {
      customerName: "Abernathys",
      laborHours: 3.5,
      laborRate: 90,
      lineItems: [{ descriptionKeywords: ["softener"], quantity: 1, unitPrice: 750, kind: "PART" }],
    },
  },
  {
    id: "electrical-service-call-no-parts",
    purpose: "INVOICE",
    transcript:
      "Went out to the Marchetti place, they thought they had an electrical problem but it was actually just a tripped breaker they didn't know how to reset. Reset it, tested a few outlets, everything's fine. No parts, just the 85 dollar service call.",
    expected: {
      customerName: "Marchetti",
      laborHours: null,
      laborRate: null,
      lineItems: [{ descriptionKeywords: ["service call"], quantity: 1, unitPrice: 85, kind: "LABOR" }],
    },
  },
  {
    id: "hvac-zone-damper",
    purpose: "INVOICE",
    transcript:
      "Fixed a stuck zone damper for the Ibrahims. The damper motor had failed, replaced it, that part was 55 dollars. Hour of labor, 95 an hour.",
    expected: {
      customerName: "Ibrahims",
      laborHours: 1,
      laborRate: 95,
      lineItems: [{ descriptionKeywords: ["damper"], quantity: 1, unitPrice: 55, kind: "PART" }],
    },
  },
  {
    id: "plumbing-shower-valve",
    purpose: "INVOICE",
    transcript:
      "Replaced a leaking shower valve cartridge for Beatriz Solano. Just the cartridge, 22 dollars. Forty-five minutes of work, 85 an hour.",
    expected: {
      customerName: "Beatriz Solano",
      laborHours: 0.75,
      laborRate: 85,
      lineItems: [{ descriptionKeywords: ["cartridge", "valve"], quantity: 1, unitPrice: 22, kind: "PART" }],
    },
  },
  {
    id: "electrical-generator-transfer-switch-quote",
    purpose: "QUOTE",
    transcript:
      "Quote for the Lindqvists on a manual transfer switch for a portable generator setup. Transfer switch and inlet box together run about 380 dollars. Install is roughly 5 hours, 100 an hour.",
    expected: {
      customerName: "Lindqvists",
      laborHours: 5,
      laborRate: 100,
      lineItems: [{ descriptionKeywords: ["transfer switch", "switch"], quantity: 1, unitPrice: 380, kind: "PART" }],
    },
  },
  {
    id: "hvac-multiple-parts-mixed-labor",
    purpose: "INVOICE",
    transcript:
      "Bigger job for the Castillos. Replaced the blower motor, that was 210 dollars, and also the run capacitor while I was in there since it was on its way out, 15 dollars for that. On top of parts, three hours of labor at 95 an hour.",
    expected: {
      customerName: "Castillos",
      laborHours: 3,
      laborRate: 95,
      lineItems: [
        { descriptionKeywords: ["blower motor", "motor"], quantity: 1, unitPrice: 210, kind: "PART" },
        { descriptionKeywords: ["capacitor"], quantity: 1, unitPrice: 15, kind: "PART" },
      ],
    },
  },
];
