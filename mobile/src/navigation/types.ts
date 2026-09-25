export type RootStackParamList = {
  JobList: undefined;
  NewJob: undefined;
  JobDetail: { jobId: string };
  Record: { jobId: string; jobTitle: string; purpose: "QUOTE" | "INVOICE" };
  QuoteReview: { voiceNoteId: string };
  InvoiceReview: { voiceNoteId: string };
  Documentation: { jobId: string; jobTitle: string };
};
