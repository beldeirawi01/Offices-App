import { Audio } from "expo-av";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { api } from "../api/client";
import { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Record">;

type RecordingState = "idle" | "recording" | "uploading" | "processing" | "error";

export default function RecordScreen({ route, navigation }: Props) {
  const { jobId, jobTitle } = route.params;
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
      const formData = new FormData();
      formData.append("audio", {
        uri,
        name: "job-note.m4a",
        type: "audio/m4a",
      } as any);

      const { data } = await api.post(`/jobs/${jobId}/voice-notes`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setState("processing");
      pollForResult(data.voiceNoteId);
    } catch (err: any) {
      setState("error");
      setErrorMessage(err?.response?.data?.error ?? "Upload failed. Check your connection and try again.");
    }
  };

  const pollForResult = (voiceNoteId: string) => {
    pollRef.current = setInterval(async () => {
      const { data } = await api.get(`/voice-notes/${voiceNoteId}`);
      if (data.status === "EXTRACTED") {
        if (pollRef.current) clearInterval(pollRef.current);
        navigation.replace("InvoiceReview", { voiceNoteId });
      } else if (data.status === "FAILED") {
        if (pollRef.current) clearInterval(pollRef.current);
        setState("error");
        setErrorMessage(data.errorMessage ?? "Processing failed.");
      }
    }, 2000);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.jobTitle}>{jobTitle}</Text>

      {state === "idle" && (
        <>
          <Text style={styles.instructions}>
            Tap record and describe the job: customer, work done, time spent, and any parts used.
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
            <Text style={styles.recordButtonText}>■ Stop &amp; Generate Invoice</Text>
          </TouchableOpacity>
        </>
      )}

      {(state === "uploading" || state === "processing") && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.processingLabel}>
            {state === "uploading" ? "Uploading voice note…" : "Transcribing and building your invoice…"}
          </Text>
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
  container: { flex: 1, backgroundColor: "#f5f6f8", padding: 24, justifyContent: "center" },
  jobTitle: { fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 16 },
  instructions: { color: "#6b7280", textAlign: "center", marginBottom: 32 },
  recordButton: {
    backgroundColor: "#ef4444",
    borderRadius: 100,
    paddingVertical: 20,
    alignItems: "center",
    alignSelf: "center",
    paddingHorizontal: 32,
  },
  stopButton: { backgroundColor: "#111827" },
  recordButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  recordingLabel: { textAlign: "center", fontSize: 18, color: "#ef4444", marginBottom: 32, fontWeight: "600" },
  centered: { alignItems: "center", gap: 16 },
  processingLabel: { color: "#6b7280", marginTop: 12, textAlign: "center" },
  error: { color: "#991b1b", textAlign: "center", marginBottom: 16 },
});
