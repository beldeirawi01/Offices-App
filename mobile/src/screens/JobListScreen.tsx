import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { api, Job, Paginated } from "../api/client";
import { subscribeToQueue } from "../services/uploadQueue";
import { useAuth } from "../context/AuthContext";
import { setLanguage } from "../i18n";
import { RootStackParamList } from "../navigation/types";
import { colors, radius, spacing } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "JobList">;

export default function JobListScreen({ navigation }: Props) {
  const { logout } = useAuth();
  const { t, i18n } = useTranslation();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState(0);

  useEffect(() => subscribeToQueue((items) => setPendingUploads(items.length)), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Paginated<Job>>("/jobs", { params: { mine: "true", pageSize: 100 } });
      setJobs(data.data);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err?.response?.data?.error ?? t("jobList.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("jobList.title")}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setLanguage(i18n.language === "es" ? "en" : "es")}>
            <Text style={styles.languageLink}>{t("jobList.language")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout}>
            <Text style={styles.logout}>{t("jobList.logOut")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.newJobButton} onPress={() => navigation.navigate("NewJob")}>
        <Text style={styles.newJobButtonText}>{t("jobList.newJob")}</Text>
      </TouchableOpacity>

      {loadError && <Text style={styles.loadError}>{loadError}</Text>}
      {pendingUploads > 0 && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingBannerText}>{t("jobList.pendingUpload", { count: pendingUploads })}</Text>
        </View>
      )}

      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={!loading && !loadError ? <Text style={styles.empty}>{t("jobList.empty")}</Text> : null}
        renderItem={({ item }) => {
          // No quote yet: the tech is still on arrival, giving a price before
          // starting work. Once a quote exists, subsequent recordings are
          // the post-job completion note that drafts the invoice.
          const purpose: "QUOTE" | "INVOICE" = item.quote ? "INVOICE" : "QUOTE";
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate("JobDetail", { jobId: item.id })}
            >
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSub}>{item.client.name}</Text>
              <View style={styles.rowBetween}>
                <Text style={styles.badge}>{item.status.replace("_", " ").toLowerCase()}</Text>
                <View style={styles.tagRow}>
                  {item.quote && (
                    <Text style={styles.quoteTag}>
                      {t("jobList.quoteTag", { status: item.quote.status.toLowerCase() })}
                    </Text>
                  )}
                  {item.invoice && <Text style={styles.invoiceTag}>{t("jobList.invoiceReady")}</Text>}
                </View>
              </View>
              <Text style={styles.actionHint}>
                {purpose === "QUOTE" ? t("jobList.tapToRecordQuote") : t("jobList.tapToViewTimeline")}
              </Text>
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
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  languageLink: { color: colors.steel, fontWeight: "600" },
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
  loadError: { textAlign: "center", color: colors.danger, marginBottom: spacing.md },
  pendingBanner: {
    backgroundColor: colors.warningBg,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  pendingBannerText: { color: colors.warning, fontWeight: "600", textAlign: "center", fontSize: 13 },
});
