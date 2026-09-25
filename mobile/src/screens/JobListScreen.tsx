import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { api, Job, Paginated } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { RootStackParamList } from "../navigation/types";
import { colors, radius, spacing } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "JobList">;

export default function JobListScreen({ navigation }: Props) {
  const { logout } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Paginated<Job>>("/jobs", { params: { mine: "true", pageSize: 100 } });
      setJobs(data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Today's jobs</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logout}>Log out</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.newJobButton} onPress={() => navigation.navigate("NewJob")}>
        <Text style={styles.newJobButtonText}>+ New unscheduled job</Text>
      </TouchableOpacity>

      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>No jobs assigned to you yet.</Text> : null
        }
        renderItem={({ item }) => {
          // No quote yet: the tech is still on arrival, giving a price before
          // starting work. Once a quote exists, subsequent recordings are
          // the post-job completion note that drafts the invoice.
          const purpose: "QUOTE" | "INVOICE" = item.quote ? "INVOICE" : "QUOTE";
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate("Record", { jobId: item.id, jobTitle: item.title, purpose })}
            >
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSub}>{item.client.name}</Text>
              <View style={styles.rowBetween}>
                <Text style={styles.badge}>{item.status.replace("_", " ").toLowerCase()}</Text>
                <View style={styles.tagRow}>
                  {item.quote && <Text style={styles.quoteTag}>Quote {item.quote.status.toLowerCase()}</Text>}
                  {item.invoice && <Text style={styles.invoiceTag}>Invoice ready</Text>}
                </View>
              </View>
              <Text style={styles.actionHint}>{purpose === "QUOTE" ? "Tap to record a quote" : "Tap to record completion note"}</Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink, letterSpacing: -0.3 },
  logout: { color: colors.denim, fontWeight: "600" },
  newJobButton: {
    backgroundColor: colors.signal,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  newJobButtonText: { color: colors.white, fontWeight: "700" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 3,
    borderLeftColor: colors.signal,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.ink },
  cardSub: { color: colors.steel, marginTop: 2 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md, alignItems: "center" },
  badge: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.steel,
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: "hidden",
    textTransform: "capitalize",
  },
  tagRow: { flexDirection: "row", gap: spacing.sm },
  invoiceTag: { fontSize: 12, color: colors.success, fontWeight: "700" },
  quoteTag: { fontSize: 12, color: colors.denim, fontWeight: "700" },
  actionHint: { fontSize: 12, color: colors.steelLight, marginTop: spacing.sm },
  empty: { textAlign: "center", color: colors.steel, marginTop: 40 },
});
