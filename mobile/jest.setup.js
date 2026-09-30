// AsyncStorage's native module doesn't exist in the Jest environment (no
// real device/simulator) — this is the library's own documented mock,
// needed by anything that touches it directly or transitively (e.g.
// src/i18n, secureStorage's web fallback, the upload queue).
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
