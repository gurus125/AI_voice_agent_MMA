"use client";

import { useEffect, useState } from "react";
import { greetingForHour } from "@/lib/profile";

/** Time-of-day greeting for the dashboard (not spoken by the AI). Uses the viewer's own clock. */
export function Greeting({ name }: { name: string }) {
  // Start empty and fill in after mounting so the server and browser HTML always match.
  const [text, setText] = useState("");
  useEffect(() => {
    const update = () => setText(greetingForHour(new Date().getHours()));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <p className="text-lg font-medium text-white sm:text-xl" aria-live="polite">
      {text || "Hello"}
      {name ? <>, <span className="text-accent">{name}</span></> : null}
    </p>
  );
}
