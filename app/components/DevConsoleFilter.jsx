"use client";

import { useEffect } from "react";

/**
 * Daily/WebRTC often logs benign disconnect messages as console.error, which triggers
 * Next.js devtools overlay. Filter only known noise in development.
 */
export function DevConsoleFilter() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }
    const orig = console.error;
    console.error = (...args) => {
      const first = args[0];
      const s = typeof first === "string" ? first : String(first ?? "");
      if (
        s.includes("send transport changed to disconnected") ||
        s.includes("recv transport changed to disconnected")
      ) {
        return;
      }
      orig.apply(console, args);
    };
    return () => {
      console.error = orig;
    };
  }, []);
  return null;
}
