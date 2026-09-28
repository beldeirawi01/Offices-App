import { Audio } from "expo-av";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { api } from "../api/client";
import { enqueueVoiceNote } from "../services/uploadQueue";
import { RootStackParamList } from "../navigation/types";
import { colors, radius, spacing } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Record">;

type RecordingState = "idle" | "recording" | "uploading" | "processing" | "queued" | "error";

export default function RecordScreen({ route, navigation }: Props) {
  const { jobId, jobTitle, purpose } = route.params;
  const isQuote = purpose === "QUOTE";
  const [state, setState] = useState<RecordingState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startRecording = async () => {
    setErrorMessage(null);
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage("Microphone permission is required to record a job note.");
      return;
    }

    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    recordingRef.current = recording;
    setState("recording");
  };

  const stopAndUpload = async () => {
    const recording = recordingRef.current;
    if (!recording) return;

    setState("uploading");
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    recordingRef.current = null;
    if (!uri) {
      setState("error");
      setErrorMessage("Recording failed — no audio captured.");
      return;
    }

    try {
      const result = await enqueueVoiceNote({ jobId, purpose, audioUri: uri });
      if (result.queued) {
        // No signal right now — the recording is safely saved on-device and
        // will upload automatically once there's a connection. There's
        // nothing to review yet since the server hasn't processed it.
        setState("queued");
        return;
      }
      setState("processing");
      pollForResult(result.voiceNoteId!);
    } catch (err: any) {
      setState("error");
      setErrorMessage(err?.response?.data?.error ?? "Upload failed. Check your connection and try again.");
    }
  };

  const pollForResult = (voiceNoteId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/voice-notes/${voiceNoteId}`);
        if (data.status === "EXTRACTED") {
          if (pollRef.current) clearInterval(pollRef.current);
          navigation.replace(isQuote ? "QuoteReview" : "InvoiceReview", { voiceNoteId });
        } else if (data.status === "FAILED") {
          if (pollRef.current) clearInterval(pollRef.current);
          setState("error");
          setErrorMessage(data.errorMessage ?? "Processing failed.");
        }
      } catch (err: any) {
        if (pollRef.current) clearInterval(pollRef.current);
        setState("error");
        setErrorMessage(err?.response?.data?.error ?? "Lost connection while processing. Please try again.");
      }
    }, 2000);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.jobTitle}>{jobTitle}</Text>
      <Text style={styles.modeLabel}>{isQuote ? "ON-ARRIVAL QUOTE" : "JOB COMPLETION"}</Text>

      {state === "idle" && (
        <>
          <Text style={styles.instructions}>
            {isQuote
              ? "Tap record and give a rough estimate: the work needed, about how long it'll take, and roughly what it'll cost."
              : "Tap record and describe the job: customer, work done, time spent, and any parts used."}
          </Text>
          <TouchableOpacity style={styles.recordButton} onPress={startRecording}>
            <Text style={styles.recordButtonText}>● Record</Text>
          </TouchableOpacity>
        </>
      )}

      {state === "recording" && (
        <>
          <Text style={styles.recordingLabel}>Recording…</Text>
          <TouchableOpacity style={[styles.recordButton, styles.stopButton]} onPress={stopAndUpload}>
            <Text style={styles.recordButtonText}>■ Stop &amp; {isQuote ? "Generate Quote" : "Generate Invoice"}</Text>
          </TouchableOpacity>
        </>
      )}

      {(state === "uploading" || state === "processing") && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.signal} />
          <Text style={styles.processingLabel}>
            {state === "uploading"
              ? "Uploading voice note…"
              : isQuote
                ? "Transcribing and building your quote…"
                : "Transcribing and building your invoice…"}
          </Text>
        </View>
      )}

      {state === "queued" && (
        <View style={styles.centered}>
          <Text style={styles.queuedTitle}>Saved ✓</Text>
          <Text style={styles.queuedSub}>
            No signal right now — this recording is saved on your phone and will upload automatically once you're
            back online. You'll find the {isQuote ? "quote" : "invoice"} on this job once it's processed.
          </Text>
          <TouchableOpacity style={styles.recordButton} onPress={() => navigation.goBack()}>
            <Text style={styles.recordButtonText}>Back to job</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === "error" && (
        <View style={styles.centered}>
          <Text style={styles.error}>{errorMessage}</Text>
          <TouchableOpacity style={styles.recordButton} onPress={() => setState("idle")}>
            <Text style={styles.recordButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: spacing.xl, justifyContent: "center" },
  jobTitle: { fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 2, color: colors.ink },
  modeLabel: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: spacing.lg,
    color: colors.signal,
    letterSpacing: 0.6,
  },
  instructions: { color: colors.steel, textAlign: "center", marginBottom: spacing.xxl },
  recordButton: {
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    paddingVertical: 20,
    alignItems: "center",
    alignSelf: "center",
    paddingHorizontal: spacing.xxl,
  },
  stopButton: { backgroundColor: colors.ink },
  recordButtonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  recordingLabel: {
    textAlign: "center",
    fontSize: 18,
    color: colors.danger,
    marginBottom: spacing.xxl,
    fontWeight: "700",
  },
  centered: { alignItems: "center", gap: spacing.lg },
  processingLabel: { color: colors.steel, marginTop: spacing.md, textAlign: "center" },
  error: { color: colors.danger, textAlign: "center", marginBottom: spacing.lg },
  queuedTitle: { fontSize: 22, fontWeight: "800", color: colors.success, marginBottom: spacing.md },
  queuedSub: { color: colors.steel, textAlign: "center", marginBottom: spacing.xl, paddingHorizontal: spacing.md },
});
