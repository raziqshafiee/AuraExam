// src/lib/face/human-config.ts
import type { Config } from "@vladmandic/human";

// Bump this whenever public/models/ is re-vendored from a new @vladmandic/human
// version. Stored per-enrollment in face_enrollments.model_version so a future
// upgrade can be detected and force re-enrollment instead of silently
// degrading accuracy (Global Constraint #7 / spec §4.4).
export const MODEL_VERSION = "human-3.3.6-faceres";

export const HUMAN_CONFIG: Partial<Config> = {
  modelBasePath: "/models/",
  backend: "webgl",
  cacheSensitivity: 0,
  warmup: "none",
  filter: { enabled: false },
  face: {
    enabled: true,
    detector: { rotation: false, maxDetected: 1, return: false },
    mesh: { enabled: true },
    iris: { enabled: false },
    description: { enabled: true },
    emotion: { enabled: false },
    antispoof: { enabled: true },
    liveness: { enabled: true },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
  segmentation: { enabled: false },
};
