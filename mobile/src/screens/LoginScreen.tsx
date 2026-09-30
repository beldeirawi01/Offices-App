import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { setLanguage } from "../i18n";
import { colors, radius, spacing } from "../theme";

export default function LoginScreen() {
  const { login } = useAuth();
  const { t, i18n } = useTranslation();
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
      setError(err?.response?.data?.error ?? t("login.genericError"));
    } finally {
      setLoading(false);
    }
  };

  // A tech may need to switch language before they've even signed in (a
  // shared/company phone's OS language might not match who's using it right
  // now) — every other screen assumes a signed-in user, so this is the one
  // place a language switch has to be reachable pre-login.
  const toggleLanguage = () => setLanguage(i18n.language === "es" ? "en" : "es");

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.languageToggle} onPress={toggleLanguage}>
        <Text style={styles.languageToggleText}>{i18n.language === "es" ? "English" : "Español"}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{t("login.title")}</Text>
      <Text style={styles.subtitle}>{t("login.subtitle")}</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <TextInput
        style={styles.input}
        placeholder={t("login.email")}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder={t("login.password")}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>{t("login.signIn")}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: spacing.xl, backgroundColor: colors.paper },
  languageToggle: { position: "absolute", top: spacing.xl * 2, right: spacing.xl, padding: spacing.sm },
  languageToggleText: { color: colors.denim, fontWeight: "600" },
  title: { fontSize: 30, fontWeight: "800", textAlign: "center", color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: colors.steel, textAlign: "center", marginBottom: spacing.xl },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  button: {
    backgroundColor: colors.signal,
    borderRadius: radius.sm,
    padding: spacing.md + 2,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  buttonText: { color: colors.white, fontWeight: "700" },
  error: { color: colors.danger, marginBottom: spacing.md, textAlign: "center" },
});
