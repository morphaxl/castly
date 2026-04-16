"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

type FloatingChatBoxProps = {
  isGenerating?: boolean;
  onSubmit: (prompt: string) => Promise<void> | void;
};

export function FloatingChatBox({
  isGenerating = false,
  onSubmit,
}: FloatingChatBoxProps) {
  const [draft, setDraft] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      (document.activeElement as HTMLElement)?.blur();
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const canSend = draft.trim().length > 0;

  const handleSend = async () => {
    const prompt = draft.trim();

    if (!prompt || isGenerating) {
      return;
    }

    try {
      await onSubmit(prompt);
      setDraft("");
      (document.activeElement as HTMLElement)?.blur();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <aside className="pointer-events-none absolute inset-x-4 bottom-4 z-20 sm:bottom-6">
      <div className="mx-auto w-full max-w-xl">
        <div ref={containerRef} className="pointer-events-auto flex h-12 items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.05] px-5 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-2xl transition-all duration-300 focus-within:border-white/[0.12] focus-within:bg-white/[0.07] focus-within:shadow-[0_8px_40px_rgba(0,0,0,0.4)]">
          <label className="sr-only" htmlFor="scene-chat-input">
            Describe what to create
          </label>
          <input
            id="scene-chat-input"
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={isGenerating}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleSend();
                (event.target as HTMLInputElement).blur();
              }
              if (event.key === "Escape") {
                (event.target as HTMLInputElement).blur();
              }
            }}
            placeholder={
              isGenerating
                ? "AI is shaping your asset..."
                : "Describe what to create..."
            }
            className="min-w-0 flex-1 bg-transparent text-[0.9rem] text-white/90 placeholder:text-white/25 focus:outline-none disabled:cursor-wait"
          />
          <button
            type="button"
            onClick={() => {
              void handleSend();
            }}
            disabled={!canSend || isGenerating}
            aria-label="Send prompt"
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-white/30 transition-all duration-200 disabled:pointer-events-none enabled:bg-white/[0.12] enabled:text-white/80 enabled:hover:bg-white/[0.2] enabled:hover:text-white"
          >
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </aside>
  );
}
