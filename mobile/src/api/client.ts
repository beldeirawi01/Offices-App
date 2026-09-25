import axios from "axios";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

const apiBaseUrl = (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? "http://localhost:4000/api";

export const api = axios.create({ baseURL: apiBaseUrl });

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface Client {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
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
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  notes?: string | null;
  lineItems: LineItem[];
}

export interface Quote {
  id: string;
  quoteNumber: string;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  notes?: string | null;
  lineItems: LineItem[];
}

export interface JobVoiceNote {
  id: string;
  status: string;
  purpose?: "QUOTE" | "INVOICE";
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
  client: Client;
  invoice?: Invoice | null;
  quote?: Quote | null;
  voiceNotes?: JobVoiceNote[];
}

export interface VoiceNote {
  id: string;
  status: string;
  purpose?: "QUOTE" | "INVOICE";
  transcript?: string | null;
  errorMessage?: string | null;
  job: Job;
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
