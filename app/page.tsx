"use client";

import { useEffect } from "react";

export default function GalleryPage() {
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void import("../src/main").then(({ bootstrap }) => {
      if (!cancelled) {
        const mount = document.getElementById("app");
        if (mount) cleanup = bootstrap(mount);
      }
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return <main id="app" />;
}
