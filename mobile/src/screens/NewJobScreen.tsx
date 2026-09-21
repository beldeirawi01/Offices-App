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

      navigation.replace("Record", { jobId: job.id, jobTitle: job.title });
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
        {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.startButtonText}>Start job</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6f8", padding: 16 },
  label: { fontSize: 13, fontWeight: "700", color: "#6b7280", marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e4e9",
    borderRadius: 8,
    padding: 12,
  },
  selectedClient: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e4e9",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectedClientName: { fontWeight: "600" },
  changeLink: { color: "#2563eb", fontWeight: "600" },
  resultsList: { maxHeight: 160, backgroundColor: "#fff", borderRadius: 8, marginTop: 4 },
  resultRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  orLabel: { fontSize: 12, color: "#9ca3af", marginTop: 16, marginBottom: 6, textAlign: "center" },
  error: { color: "#991b1b", marginTop: 12, textAlign: "center" },
  startButton: {
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  startButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
