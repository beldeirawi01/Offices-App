import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { api, Client, Paginated } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { RootStackParamList } from "../navigation/types";
import { colors, radius, spacing } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "NewJob">;

/**
 * Lets a tech start a job that wasn't pre-scheduled by the owner — a walk-in
 * or unscheduled call. Search an existing client or add a new one inline,
 * then jump straight to recording.
 */
export default function NewJobScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Client[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(() => {
      api
        .get<Paginated<Client>>("/clients", { params: { search, pageSize: 10 } })
        .then((res) => setResults(res.data.data))
        .catch((err) => console.error("Client search failed", err))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const onStart = async () => {
    setError(null);
    if (!title.trim()) {
      setError("Give the job a short title, e.g. 'Kitchen sink leak'.");
      return;
    }
    if (!selectedClient && !newClientName.trim()) {
      setError("Select an existing client or enter a name for a new one.");
      return;
    }

    setCreating(true);
    try {
      let clientId = selectedClient?.id;
      if (!clientId) {
        const { data: client } = await api.post<Client>("/clients", {
          name: newClientName,
          phone: newClientPhone || undefined,
        });
        clientId = client.id;
      }

      const { data: job } = await api.post("/jobs", {
        clientId,
        title,
        assignedTechId: user?.id,
        status: "IN_PROGRESS",
      });

      // Walk-ins are created already IN_PROGRESS (the tech is on-site doing
      // the work now, not quoting it for later), so this goes straight to
      // the completion note rather than an on-arrival quote.
      navigation.replace("Record", { jobId: job.id, jobTitle: job.title, purpose: "INVOICE" });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Could not start this job. Try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Job title</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Kitchen sink leak"
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Client</Text>
      {selectedClient ? (
        <View style={styles.selectedClient}>
          <Text style={styles.selectedClientName}>{selectedClient.name}</Text>
          <TouchableOpacity onPress={() => setSelectedClient(null)}>
            <Text style={styles.changeLink}>Change</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Search existing clients..."
            value={search}
            onChangeText={setSearch}
          />
          {searching && <ActivityIndicator style={{ marginTop: 8 }} />}
          {results.length > 0 && (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              style={styles.resultsList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.resultRow}
                  onPress={() => {
                    setSelectedClient(item);
                    setSearch("");
                    setResults([]);
                  }}
                >
                  <Text>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          )}

          <Text style={styles.orLabel}>Or add a new client</Text>
          <TextInput
            style={styles.input}
            placeholder="New client name"
            value={newClientName}
            onChangeText={setNewClientName}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone (optional)"
            keyboardType="phone-pad"
            value={newClientPhone}
            onChangeText={setNewClientPhone}
          />
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.startButton} onPress={onStart} disabled={creating}>
        {creating ? <ActivityIndicator color={colors.white} /> : <Text style={styles.startButtonText}>Start job</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg },
  label: { fontSize: 13, fontWeight: "700", color: colors.steel, marginBottom: 6, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  selectedClient: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectedClientName: { fontWeight: "700", color: colors.ink },
  changeLink: { color: colors.denim, fontWeight: "600" },
  resultsList: { maxHeight: 160, backgroundColor: colors.surface, borderRadius: radius.sm, marginTop: 4 },
  resultRow: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  orLabel: { fontSize: 12, color: colors.steelLight, marginTop: spacing.lg, marginBottom: 6, textAlign: "center" },
  error: { color: colors.danger, marginTop: spacing.md, textAlign: "center" },
  startButton: {
    backgroundColor: colors.signal,
    borderRadius: radius.sm,
    paddingVertical: spacing.lg,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  startButtonText: { color: colors.white, fontWeight: "700", fontSize: 16 },
});
