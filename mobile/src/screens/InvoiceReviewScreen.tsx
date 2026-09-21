import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { api, LineItem, VoiceNote } from "../api/client";
import { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "InvoiceReview">;

export default function InvoiceReviewScreen({ route, navigation }: Props) {
  const { voiceNoteId } = route.params;
  const [voiceNote, setVoiceNote] = useState<VoiceNote | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api.get<VoiceNote>(`/voice-notes/${voiceNoteId}`).then((res) => {
      setVoiceNote(res.data);
      if (res.data.job.invoice) {
        setLineItems(res.data.job.invoice.lineItems);
        setNotes(res.data.job.invoice.notes ?? "");
      }
    });
  }, [voiceNoteId]);

  const updateLineItem = (id: string, field: "description" | "quantity" | "unitPrice", value: string) => {
    setLineItems((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: field === "description" ? value : Number(value) || 0,
              amount:
                field === "quantity"
                  ? (Number(value) || 0) * item.unitPrice
                  : field === "unitPrice"
                    ? item.quantity * (Number(value) || 0)
                    : item.amount,
            }
          : item,
      ),
    );
  };

  const total = lineItems.reduce((sum, item) => sum + item.amount, 0);

  const onSendInvoice = async () => {
    const invoice = voiceNote?.job.invoice;
    if (!invoice) return;

    setSaving(true);
    try {
      await api.put(`/invoices/${invoice.id}`, {
        notes,
        lineItems: lineItems.map((item) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          kind: item.kind,
        })),
      });
      await api.post(`/invoices/${invoice.id}/send`);
      setSent(true);
    } finally {
      setSaving(false);
    }
  };

  if (!voiceNote) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (sent) {
    return (
      <View style={styles.centered}>
        <Text style={styles.doneTitle}>Invoice sent ✓</Text>
        <Text style={styles.doneSub}>The client will receive it by text and/or email.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.popToTop()}>
          <Text style={styles.primaryButtonText}>Back to jobs</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Review invoice</Text>
      <Text style={styles.transcriptLabel}>What we heard:</Text>
      <Text style={styles.transcript}>{voiceNote.transcript}</Text>

      {lineItems.map((item) => (
        <View key={item.id} style={styles.lineItem}>
          <TextInput
            style={styles.descriptionInput}
            value={item.description}
            onChangeText={(v) => updateLineItem(item.id, "description", v)}
          />
          <View style={styles.lineItemRow}>
            <TextInput
              style={styles.numberInput}
              value={String(item.quantity)}
              keyboardType="numeric"
              onChangeText={(v) => updateLineItem(item.id, "quantity", v)}
            />
            <Text style={styles.times}>×</Text>
            <TextInput
              style={styles.numberInput}
              value={String(item.unitPrice)}
              keyboardType="numeric"
              onChangeText={(v) => updateLineItem(item.id, "unitPrice", v)}
            />
            <Text style={styles.amount}>${item.amount.toFixed(2)}</Text>
          </View>
        </View>
      ))}

      <Text style={styles.notesLabel}>Notes to client</Text>
      <TextInput style={styles.notesInput} value={notes} onChangeText={setNotes} multiline />

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={onSendInvoice} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Send to client</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6f8" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#f5f6f8" },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  transcriptLabel: { color: "#6b7280", fontSize: 12, textTransform: "uppercase", marginBottom: 4 },
  transcript: { fontStyle: "italic", color: "#374151", marginBottom: 20 },
  lineItem: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e4e9",
  },
  descriptionInput: { fontSize: 15, fontWeight: "600", marginBottom: 8 },
  lineItemRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  numberInput: {
    borderWidth: 1,
    borderColor: "#e2e4e9",
    borderRadius: 6,
    padding: 6,
    width: 70,
    textAlign: "center",
  },
  times: { color: "#6b7280" },
  amount: { marginLeft: "auto", fontWeight: "700" },
  notesLabel: { color: "#6b7280", fontSize: 12, textTransform: "uppercase", marginTop: 12, marginBottom: 4 },
  notesInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e4e9",
    borderRadius: 8,
    padding: 10,
    minHeight: 60,
    textAlignVertical: "top",
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 20, marginBottom: 20 },
  totalLabel: { fontSize: 18, fontWeight: "700" },
  totalValue: { fontSize: 18, fontWeight: "700" },
  primaryButton: { backgroundColor: "#2563eb", borderRadius: 8, padding: 16, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  doneTitle: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
  doneSub: { color: "#6b7280", marginBottom: 24, textAlign: "center" },
});
