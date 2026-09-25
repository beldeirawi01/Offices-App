export type RootStackParamList = {
  JobList: undefined;
  NewJob: undefined;
  Record: { jobId: string; jobTitle: string; purpose: "QUOTE" | "INVOICE" };
  QuoteReview: { voiceNoteId: string };
  InvoiceReview: { voiceNoteId: string };
};
