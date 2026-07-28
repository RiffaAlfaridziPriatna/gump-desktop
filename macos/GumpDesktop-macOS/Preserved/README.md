# Preserved Vision face detection

Snapshot of `GumpLocalStorage.mm` taken before switching the live macOS
culling path to shared C++ SCRFD+OCEC (`GumpSharedFaceDetection`).

- Not compiled into the app target.
- Live Vision implementation still exists in `GumpLocalStorage.mm` as
  `-facesFromCGImageUsingVision:` for fallback / A-B
  (`GUMP_FACE_ENGINE=vision`).
- To fully restore Vision-only: set `GUMP_FACE_ENGINE=vision`, or point
  `-facesFromCGImage:` back at the Vision method.
