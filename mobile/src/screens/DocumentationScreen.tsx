import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { enqueueDocumentation } from "../services/uploadQueue";
import { RootStackParamList } from "../navigation/types";
import { colors, radius, spacing } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Documentation">;

type Stage = "ARRIVAL" | "MID_JOB" | "COMPLETION";
const STAGES: { value: Stage; label: string }[] = [
  { value: "ARRIVAL", label: "Arrival" },
  { value: "MID_JOB", label: "Mid-job" },
  { value: "COMPLETION", label: "Completion" },
];

/**
 * Captures a photo (required) plus an optional voice note as standalone
 * liability/warranty evidence — separate from the job-notes timeline that
 * feeds the quote/invoice. Geotags the photo automatically when location
 * permission is granted; skips it silently otherwise.
 */
export default function DocumentationScreen({ route, navigation }: Props) {
  const { jobId, jobTitle } = route.params;
  const [stage, setStage] = useState<Stage>("ARRIVAL");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [queued, setQueued] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const onTakePhoto = async () => {
    setErrorMessage(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage("Camera permission is required to document this job.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const startRecording = async () => {
    setErrorMessage(null);
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage("Microphone permission is required to add a voice note.");
      return;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    recordingRef.current = recording;
    setIsRecording(true);
  };

  const stopRecording = async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    recordingRef.current = null;
    setIsRecording(false);
    if (uri) setAudioUri(uri);
  };

  const getCoords = async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return null;
      const position = await Location.getCurrentPositionAsync({});
      return { latitude: position.coords.latitude, longitude: position.coords.longitude };
    } catch {
      return null;
    }
  };

  const onSave = async () => {
    if (!photoUri) {
      setErrorMessage("Take a photo first.");
      return;
    }
    setUploading(true);
    setErrorMessage(null);
    try {
      const coords = await getCoords();

      const result = await enqueueDocumentation({
        jobId,
        stage,
        photoUri,
        audioUri,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      });
      if (result.queued) setQueued(true);
      setSaved(true);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.error ?? "Could not save documentation. Try again.");
    } finally {
      setUploading(false);
    }
  };

  if (saved) {
    return (
      <View style={styles.centered}>
        <Text style={styles.doneTitle}>Documentation saved ✓</Text>
        <Text style={styles.doneSub}>
          {queued
            ? "No signal right now — saved on your phone and will upload automatically once you're back online."
            : "Kept as evidence for this job — not sent to the client."}
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.primaryButtonText}>Back to job</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{jobTitle}</Text>
      <Text style={styles.sectionLabel}>Stage</Text>
      <View style={styles.stageRow}>
        {STAGES.map((s) => (
          <TouchableOpacity
            key={s.value}
            style={[styles.stageChip, stage === s.value && styles.stageChipActive]}
            onPress={() => setStage(s.value)}
          >
            <Text style={[styles.stageChipText, stage === s.value && styles.stageChipTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Photo</Text>
      {photoUri ? (
        <TouchableOpacity onPress={onTakePhoto}>
          <Image source={{ uri: photoUri }} style={styles.photoPreview} />
          <Text style={styles.retakeLabel}>Tap to retake</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.captureButton} onPress={onTakePhoto}>
          <Text style={styles.captureButtonText}>📷 Take photo</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionLabel}>Voice note (optional)</Text>
      {audioUri ? (
        <Text style={styles.audioSaved}>Voice note recorded ✓</Text>
      ) : isRecording ? (
        <TouchableOpacity style={[styles.captureButton, styles.stopButton]} onPress={stopRecording}>
          <Text style={styles.captureButtonText}>■ Stop recording</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.captureButton} onPress={startRecording}>
          <Text style={styles.captureButtonText}>● Add voice note</Text>
        </TouchableOpacity>
      )}

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      <TouchableOpacity style={styles.primaryButton} onPress={onSave} disabled={uploading}>
        {uploading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Save documentation</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl, backgroundColor: colors.paper },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink, marginBottom: spacing.lg },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: colors.steel, textTransform: "uppercase", marginTop: spacing.lg, marginBottom: spacing.sm },
  stageRow: { flexDirection: "row", gap: spacing.sm },
  stageChip: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  stageChipActive: { backgroundColor: colors.denim, borderColor: colors.denim },
  stageChipText: { color: colors.steel, fontWeight: "600" },
  stageChipTextActive: { color: colors.white },
  captureButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  stopButton: { backgroundColor: colors.dangerBg, borderColor: colors.danger },
  captureButtonText: { color: colors.ink, fontWeight: "700" },
  photoPreview: { width: "100%", aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.surfaceSunken },
  retakeLabel: { textAlign: "center", color: colors.denim, marginTop: spacing.xs, fontWeight: "600" },
  audioSaved: { color: colors.success, fontWeight: "700" },
  error: { color: colors.danger, marginTop: spacing.lg, textAlign: "center" },
  primaryButton: {
    backgroundColor: colors.signal,
    borderRadius: radius.sm,
    paddingVertical: spacing.lg,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  primaryButtonText: { color: colors.white, fontWeight: "700", fontSize: 16 },
  doneTitle: { fontSize: 22, fontWeight: "800", marginBottom: spacing.sm, color: colors.ink },
  doneSub: { color: colors.steel, marginBottom: spacing.xl, textAlign: "center" },
});
