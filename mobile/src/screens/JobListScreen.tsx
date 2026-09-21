import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { api, Job } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "JobList">;

export default function JobListScreen({ navigation }: Props) {
  const { logout } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Job[]>("/jobs", { params: { mine: "true" } });
      setJobs(data);
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

      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>No jobs assigned to you yet.</Text> : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate("Record", { jobId: item.id, jobTitle: item.title })}
          >
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSub}>{item.client.name}</Text>
            <View style={styles.rowBetween}>
              <Text style={styles.badge}>{item.status.replace("_", " ")}</Text>
              {item.invoice && <Text style={styles.invoiceTag}>Invoice ready</Text>}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6f8", padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "700" },
  logout: { color: "#2563eb" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e4e9",
  },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardSub: { color: "#6b7280", marginTop: 2 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, alignItems: "center" },
  badge: {
    fontSize: 12,
    color: "#374151",
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  invoiceTag: { fontSize: 12, color: "#166534", fontWeight: "600" },
  empty: { textAlign: "center", color: "#6b7280", marginTop: 40 },
});
