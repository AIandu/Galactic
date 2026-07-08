---
name: WebGL in Replit preview
description: WebGL context creation fails in the Replit preview iframe; React Three Fiber Canvas crashes without a fallback.
---

The Replit preview pane (proxied iframe) cannot create a WebGL context. Three.js logs `THREE.WebGLRenderer: Error creating WebGL context` and crashes.

**Why:** The Replit preview sandbox runs in a headless/restricted GPU environment that rejects WebGL context creation.

**How to apply:** For any R3F / Three.js app:
1. Check `isWebGLAvailable()` before rendering the Canvas (tests `canvas.getContext('webgl')`).
2. Wrap the Canvas in a `WebGLErrorBoundary` (React class component with `getDerivedStateFromError`) to catch runtime failures.
3. Provide a 2D canvas fallback (pure HTML5 Canvas API) that renders the same data without WebGL.
This pattern is implemented in `artifacts/orion/src/components/WebGLFallback.tsx`.
The full 3D experience works correctly when deployed or viewed in a real browser with GPU support.
