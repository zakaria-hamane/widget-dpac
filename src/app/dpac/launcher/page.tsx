"use client";

import { useEffect } from "react";

export default function LauncherPage() {
  // Notify parent that launcher is loaded
  useEffect(() => {
    try {
      if (window && window.parent) {
        window.parent.postMessage(
          { type: "dpac.widget.loaded", payload: { source: "launcher" } },
          "*"
        );
      }
    } catch {
      // ignore
    }
  }, []);

  // Renders the widget launcher image at 60px and posts a message on click
  const handleClick = () => {
    try {
      if (window && window.parent) {
        window.parent.postMessage({ type: "dpac.widget.open" }, "*");
      }
    } catch {
      // ignore
    }
  };

  return (
    <button
      onClick={handleClick}
      title="DPaC Assistant"
      aria-label="DPaC Assistant"
      style={{
        width: 60,
        height: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        overflow: "hidden",
        border: "none",
        padding: 0,
        background: "transparent",
        cursor: "pointer",
      }}
    >
      <img
        src="/dpac-embed/images/launcher.svg"
        alt="DPaC Assistant"
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </button>
  );
}

