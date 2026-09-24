import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

// Separate client for unauthenticated, client-facing pages (e.g. /pay/:token).
// No auth header, no 401-redirect-to-login — a client with no account should
// never get bounced to the owner's login screen.
export const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api",
});

export interface Client {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  smsConsent?: boolean;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  notes?: string | null;
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  kind: "PART" | "LABOR";
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  publicToken: string;
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "VOID";
  subtotal: number;
  tax: number;
  total: number;
  notes?: string | null;
  dueDate?: string | null;
  sentAt?: string | null;
  paidAt?: string | null;
  createdAt: string;
  client: Client;
  lineItems: LineItem[];
}

export interface VoiceNote {
  id: string;
  status: string;
  transcript?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface Job {
  id: string;
  title: string;
  jobType?: string | null;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  scheduledAt?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  clientId?: string;
  assignedTechId?: string | null;
  client: Client;
  assignedTech?: { id: string; name: string } | null;
  invoice?: Invoice | null;
  voiceNotes?: VoiceNote[];
}

export interface Organization {
  id: string;
  name: string;
  taxRate: number;
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
}

export interface Tech {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "TECH";
  phone?: string | null;
}

export interface ReportSummary {
  totalRevenue: number;
  outstandingBalance: number;
  paidInvoiceCount: number;
  outstandingInvoiceCount: number;
  revenueByMonth: { month: string; total: number }[];
  jobTypeBreakdown: { jobType: string; count: number }[];
  busiestDays: { day: string; jobCount: number }[];
  jobStatusCounts: { scheduled: number; inProgress: number; completed: number; cancelled: number };
}
