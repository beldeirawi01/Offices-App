# Extraction eval set

`extraction.service.test.ts` (in `test/`) only checks JSON parsing and Zod
schema validation against hand-crafted input — it never calls Claude and
can't tell you whether the model actually gets *realistic trade dictation*
right. This directory is that missing check.

## What's here

- `dataset.ts` — 35 realistic field-technician dictation samples (HVAC,
  plumbing, electrical), each with the structured output a reasonable person
  would expect the model to extract from it: customer name, labor
  hours/rate, and line items (description keywords, quantity, unit price,
  kind).
- `run-eval.ts` — sends each transcript through the real extraction pipeline
  (`extractJobDetails`/`extractQuoteDetails`, i.e. an actual Claude call) and
  scores the result against what's expected.

## Running it

```
npm run eval:extraction
```

Requires `ANTHROPIC_API_KEY` to be set — this makes real, billed Claude
calls (35 of them per run) and is **not** part of `npm test` or CI for
exactly that reason: it costs money and its outcome depends on the model's
current behavior, not just your code.

## Reading the output

For each case it prints PASS/FAIL/ERROR, then a summary (cases fully
passed, and the finer-grained percentage of individual field checks that
passed), then a detailed breakdown of every failing check: what was
expected vs. what the model actually returned.

A case only needs the customer's name to *contain* the expected name
(case-insensitive) — the model paraphrasing "the Martinez job" as customer
name "Martinez" vs. "Martinez family" shouldn't fail the eval. Numbers
(quantity, unit price, labor hours/rate) and line item order are checked
exactly, since a transcript states those unambiguously and drift there is
exactly the kind of hallucination risk this app cares most about.

## When to run this

- After changing `SYSTEM_PROMPT`/`QUOTE_SYSTEM_PROMPT` in
  `src/services/extraction.service.ts`.
- After changing `ANTHROPIC_MODEL`.
- Periodically, since a model can change behavior on Anthropic's end even
  with the same prompt and same model id.

A dip in the pass rate after a prompt/model change is a real regression
signal — go read the specific failing cases printed out, not just the
percentage.

## Extending the dataset

Add cases to `dataset.ts` following the existing `EvalCase` shape. Keep
transcripts as natural speech, not neatly formatted invoices — filler
words, numbers spoken as words, prices mentioned mid-sentence. That's the
actual input this pipeline has to handle in the field.
