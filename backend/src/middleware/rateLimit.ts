import rateLimit from "express-rate-limit";

// Generous general limit — mainly to blunt scripted abuse, not real usage.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// Tight limit on login/register to slow down credential brute-forcing.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later" },
});

// Voice uploads trigger paid Whisper + Claude API calls — cap per-user cost exposure.
export const voiceUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many voice notes uploaded this hour, please try again later" },
});
