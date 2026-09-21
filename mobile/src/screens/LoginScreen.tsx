import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Offices App</Text>
      <Text style={styles.subtitle}>Sign in to log jobs</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#f5f6f8" },
  title: { fontSize: 28, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#6b7280", textAlign: "center", marginBottom: 24 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e4e9",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  button: { backgroundColor: "#2563eb", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "#991b1b", marginBottom: 12, textAlign: "center" },
});
