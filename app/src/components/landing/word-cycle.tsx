"use client";

import { useEffect, useState } from "react";

const WORDS = ["curso", "preparatório", "resumão", "plataforma"];
const INTERVAL = 2600;

export function WordCycle() {
  const [idx, setIdx] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setExiting(true);
      setTimeout(() => {
        setIdx((i) => (i + 1) % WORDS.length);
        setExiting(false);
      }, 280);
    }, INTERVAL);
    return () => clearInterval(timer);
  }, []);

  return (
    <span
      className="inline-block transition-all duration-280"
      style={{
        opacity: exiting ? 0 : 1,
        transform: exiting ? "translateY(-12px)" : "translateY(0)",
        transition: "opacity 0.28s ease, transform 0.28s ease",
      }}
    >
      {WORDS[idx]}
    </span>
  );
}
