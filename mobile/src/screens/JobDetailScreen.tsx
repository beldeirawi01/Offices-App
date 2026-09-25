import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { api, Job } from "../api/client";
import { RootStackParamList } from "../navigation/types";
import { colors, radius, spacing } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "JobDetail">;

interface DocumentationEntry {
  id: string;
  stage: "ARRIVAL" | "MID_JOB" | "COMPLETION";
  createdAt: string;
}

const STAGE_LABELS: Record<DocumentationEntry["stage"], string> = {
  ARRIVAL: "Arrival",
  MID_JOB: "Mid-job",
  COMPLETION: "Completion",
};

/**
 * A job can collect several voice notes over the course of a visit — an
 * on-arrival quote, then one or more completion notes as work progresses.
 * This timeline shows all of them so the tech (and the eventual invoice)
 * reflects everything that was said, not just the most recent recording.
 */
export default function JobDetailScreen({ route, navigation }: Props) {
  const { jobId } = route.params;
  const [job, setJob] = useState<Job | null>(null);
  const [docs, setDocs] = useState<DocumentationEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<Job>(`/jobs/${jobId}`),
      api.get<DocumentationEntry[]>(`/jobs/${jobId}/documentation`),
    ])
      .then(([jobRes, docsRes]) => {
        setJob(jobRes.data);
        setDocs(docsRes.data);
      })
      .finally(() => setLoading(false));
  }, [jobId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading && !job) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.signal} />
      </View>
    );
  }
  if (!job) return null;

  // No quote yet: the next recording is the on-arrival quote. Once a quote
  // exists, every subsequent recording is a completion note.
  const nextPurpose: "QUOTE" | "INVOICE" = job.quote ? "INVOICE" : "QUOTE";
  const notes = [...(job.voiceNotes ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <Text style={styles.title}>{job.title}</Text>
      <Text style={styles.sub}>{job.client.name}</Text>
      <Text style={styles.badge}>{job.status.replace("_", " ").toLowerCase()}</Text>

      {job.quote && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Quote</Text>
          <Text style={styles.summaryValue}>
            ${job.quote.total.toFixed(2)} — {job.quote.status.toLowerCase()}
          </Text>
        </View>
      )}
      {job.invoice && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Invoice</Text>
          <Text style={styles.summaryValue}>
            ${job.invoice.total.toFixed(2)} — {job.invoice.status.toLowerCase()}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.recordButton}
        onPress={() => navigation.navigate("Record", { jobId: job.id, jobTitle: job.title, purpose: nextPurpose })}
      >
        <Text style={styles.recordButtonText}>
          {nextPurpose === "QUOTE" ? "+ Record on-arrival quote" : "+ Record job note"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.documentButton}
        onPress={() => navigation.navigate("Documentation", { jobId: job.id, jobTitle: job.title })}
      >
        <Text style={styles.documentButtonText}>📷 Document this job (photo + note)</Text>
      </TouchableOpacity>

      {docs.length > 0 && (
        <>
          <Text style={styles.sectionHeading}>Documentation</Text>
          <View style={styles.docTagRow}>
            {docs.map((doc) => (
              <Text key={doc.id} style={styles.docTag}>
                {STAGE_LABELS[doc.stage]} — {new Date(doc.createdAt).toLocaleDateString()}
              </Text>
            ))}
          </View>
        </>
      )}

      <Text style={styles.sectionHeading}>Timeline</Text>
      {notes.length === 0 ? (
        <Text style={styles.empty}>No voice notes recorded for this job yet.</Text>
      ) : (
        notes.map((note) => (
          <View key={note.id} style={styles.noteCard}>
            <View style={styles.noteHeader}>
              <Text style={styles.notePurpose}>{note.purpose === "QUOTE" ? "Quote note" : "Job note"}</Text>
              <Text style={styles.noteTime}>{new Date(note.createdAt).toLocaleString()}</Text>
            </View>
            <Text style={[styles.noteStatus, note.status === "FAILED" && styles.noteStatusFailed]}>
              {note.status.toLowerCase()}
            </Text>
            {note.transcript && <Text style={styles.noteTranscript}>{note.transcript}</Text>}
            {note.errorMessage && <Text style={styles.noteError}>{note.errorMessage}</Text>}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.paper },
  title: { fontSize: 22, fontWeight: "800", color: colors.ink },
  sub: { color: colors.steel, marginTop: 2 },
  badge: {
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: "600",
    color: colors.steel,
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
    textTransform: "capitalize",
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  summaryLabel: { fontSize: 12, fontWeight: "700", color: colors.steelLight, textTransform: "uppercase" },
  summaryValue: { fontSize: 16, fontWeight: "700", color: colors.ink, marginTop: 2 },
  recordButton: {
    backgroundColor: colors.signal,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  recordButtonText: { color: colors.white, fontWeight: "700" },
  documentButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  documentButtonText: { color: colors.ink, fontWeight: "700" },
  docTagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  docTag: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.denim,
    backgroundColor: colors.denimTint,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  sectionHeading: { fontSize: 16, fontWeight: "800", color: colors.ink, marginTop: spacing.xl, marginBottom: spacing.sm },
  empty: { color: colors.steel },
  noteCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 3,
    borderLeftColor: colors.denim,
  },
  noteHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  notePurpose: { fontWeight: "700", color: colors.ink },
  noteTime: { fontSize: 12, color: colors.steelLight },
  noteStatus: { fontSize: 12, color: colors.steel, marginTop: 2, textTransform: "capitalize" },
  noteStatusFailed: { color: colors.danger },
  noteTranscript: { color: colors.steel, marginTop: spacing.sm },
  noteError: { color: colors.danger, marginTop: spacing.sm },
});
