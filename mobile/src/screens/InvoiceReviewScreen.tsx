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
import { colors, radius, spacing } from "../theme";

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
        <ActivityIndicator size="large" color={colors.signal} />
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
        {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Send to client</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    backgroundColor: colors.paper,
  },
  title: { fontSize: 22, fontWeight: "800", marginBottom: spacing.md, color: colors.ink },
  transcriptLabel: { color: colors.steel, fontSize: 12, textTransform: "uppercase", marginBottom: 4, fontWeight: "600" },
  transcript: { fontStyle: "italic", color: colors.steel, marginBottom: spacing.xl },
  lineItem: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  descriptionInput: { fontSize: 15, fontWeight: "700", marginBottom: spacing.sm, color: colors.ink },
  lineItemRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  numberInput: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.sm - 2,
    padding: 6,
    width: 70,
    textAlign: "center",
  },
  times: { color: colors.steel },
  amount: { marginLeft: "auto", fontWeight: "700", color: colors.ink },
  notesLabel: {
    color: colors.steel,
    fontSize: 12,
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginBottom: 4,
    fontWeight: "600",
  },
  notesInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.sm,
    padding: 10,
    minHeight: 60,
    textAlignVertical: "top",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.lineStrong,
    borderStyle: "dashed",
    paddingTop: spacing.md,
  },
  totalLabel: { fontSize: 18, fontWeight: "700", color: colors.ink },
  totalValue: { fontSize: 18, fontWeight: "700", color: colors.ink },
  primaryButton: { backgroundColor: colors.signal, borderRadius: radius.sm, padding: spacing.lg, alignItems: "center" },
  primaryButtonText: { color: colors.white, fontWeight: "700", fontSize: 16 },
  doneTitle: { fontSize: 22, fontWeight: "800", marginBottom: spacing.sm, color: colors.ink },
  doneSub: { color: colors.steel, marginBottom: spacing.xl, textAlign: "center" },
});
