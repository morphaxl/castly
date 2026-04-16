"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";

const MAX_PROMPT_LENGTH = 200;

type FloatingChatBoxProps = {
  isGenerating?: boolean;
  onSubmit: (prompt: string) => Promise<void> | void;
};

export function FloatingChatBox({
  isGenerating = false,
  onSubmit,
}: FloatingChatBoxProps) {
  const [draft, setDraft] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      inputRef.current?.blur();
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    const handleSlashFocus = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleSlashFocus);
    return () => window.removeEventListener("keydown", handleSlashFocus);
  }, []);

  const canSend = draft.trim().length > 0 && !isGenerating;
  const charCount = draft.length;
  const isNearLimit = charCount > MAX_PROMPT_LENGTH * 0.8;
  const isOverLimit = charCount > MAX_PROMPT_LENGTH;

  const handleSend = useCallback(async () => {
    const prompt = draft.trim();
    if (!prompt || isGenerating || isOverLimit) return;

    try {
      await onSubmit(prompt);
      setDraft("");
      inputRef.current?.blur();
    } catch (error) {
      console.error(error);
    }
  }, [draft, isGenerating, isOverLimit, onSubmit]);

  const generatingBorderStyle = isGenerating
    ? { animation: "chatbox-border-pulse 2s ease-in-out infinite" }
    : undefined;

  return (
    <aside className="pointer-events-none absolute inset-x-4 bottom-4 z-20 sm:bottom-6">
      <div className="mx-auto w-full max-w-xl">
        <div className="flex flex-col items-center gap-1.5">
          {isFocused && !isGenerating && draft.length === 0 && (
            <div
              className="flex items-center gap-3 text-[11px] text-white/25"
              style={{ animation: "hud-fade-in 0.25s ease-out both" }}
            >
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Try &ldquo;a red dragon&rdquo; or &ldquo;medieval castle&rdquo;
              </span>
            </div>
          )}

          <div
            ref={containerRef}
            className={[
              "pointer-events-auto flex h-12 w-full items-center gap-2 rounded-2xl border px-4 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-2xl transition-all duration-300",
              isGenerating
                ? "border-emerald-400/15 bg-emerald-950/20"
                : isFocused
                  ? "border-white/[0.14] bg-white/[0.08] shadow-[0_8px_40px_rgba(0,0,0,0.45)]"
                  : "border-white/[0.06] bg-white/[0.04]",
            ].join(" ")}
            style={generatingBorderStyle}
          >
            {isGenerating && (
              <div className="flex shrink-0 items-center gap-1.5">
                <div
                  className="h-3 w-3 rounded-full border-[1.5px] border-emerald-400/20 border-t-emerald-400/70"
                  style={{ animation: "hud-spinner 0.8s linear infinite" }}
                />
              </div>
            )}

            <label className="sr-only" htmlFor="scene-chat-input">
              Describe what to create
            </label>
            <input
              ref={inputRef}
              id="scene-chat-input"
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              disabled={isGenerating}
              maxLength={MAX_PROMPT_LENGTH + 20}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
                if (event.key === "Escape") {
                  inputRef.current?.blur();
                }
              }}
              placeholder={
                isGenerating
                  ? "Working on your world..."
                  : "Create or edit the world..."
              }
              className={[
                "min-w-0 flex-1 bg-transparent text-[0.875rem] focus:outline-none",
                isGenerating
                  ? "text-emerald-200/50 placeholder:text-emerald-300/25 cursor-not-allowed"
                  : "text-white/90 placeholder:text-white/25",
              ].join(" ")}
            />

            <div className="flex shrink-0 items-center gap-2">
              {isFocused && charCount > 0 && (
                <span
                  className={[
                    "text-[10px] tabular-nums transition-colors",
                    isOverLimit
                      ? "text-rose-400/80"
                      : isNearLimit
                        ? "text-amber-400/50"
                        : "text-white/20",
                  ].join(" ")}
                >
                  {charCount}/{MAX_PROMPT_LENGTH}
                </span>
              )}

              {!isFocused && !isGenerating && draft.length === 0 && (
                <kbd className="hidden rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/20 sm:inline-block">
                  /
                </kbd>
              )}

              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!canSend || isOverLimit}
                aria-label="Send prompt"
                className={[
                  "flex size-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
                  canSend && !isOverLimit
                    ? "bg-white/[0.14] text-white/90 hover:bg-white/[0.22] hover:text-white active:scale-95"
                    : "text-white/15 pointer-events-none",
                ].join(" ")}
              >
                <ArrowUp className="size-3.5" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
