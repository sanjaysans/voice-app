"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";

export function MockAudioPlayer({ duration }: { duration: string }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(18);

  useEffect(() => {
    if (!playing) {
      return;
    }

    const timer = window.setInterval(() => {
      setProgress((current) => (current >= 100 ? 0 : current + 4));
    }, 500);

    return () => window.clearInterval(timer);
  }, [playing]);

  return (
    <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
      <div className="flex flex-wrap items-center gap-4">
        <button
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white"
          onClick={() => setPlaying((current) => !current)}
          type="button"
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="h-2 rounded-full bg-[rgba(102,89,255,0.12)]">
            <div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-[#6D6D78]">
            <span>{playing ? "Playing sample call audio" : "Paused sample call audio"}</span>
            <span>{duration}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
