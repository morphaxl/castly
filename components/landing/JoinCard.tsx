"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PLAYER_COLORS,
  writePlayerIdentity,
} from "@/lib/player-identity";

const DEFAULT_PLACEHOLDER = "Guest Fox";
const DEFAULT_COLOR = PLAYER_COLORS[0];

export function JoinCard() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const playerName = name.trim() || DEFAULT_PLACEHOLDER;
    writePlayerIdentity({ name: playerName, color });
    router.push("/world");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 backdrop-blur-sm"
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <label
            htmlFor="name"
            className="block text-xs font-medium tracking-wide text-white/30 uppercase"
          >
            Your name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={DEFAULT_PLACEHOLDER}
            maxLength={20}
            autoComplete="off"
            className="h-10 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06]"
          />
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-medium tracking-wide text-white/30 uppercase">
            Pick a color
          </span>
          <div className="flex w-full justify-between">
            {PLAYER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="size-8 rounded-full transition-all duration-150 hover:scale-110 active:scale-90"
                style={{
                  backgroundColor: c,
                  outline:
                    color === c ? `2px solid ${c}` : "2px solid transparent",
                  outlineOffset: color === c ? "3px" : "0px",
                }}
                aria-label={`Select color ${c}`}
              />
            ))}
          </div>
        </div>

        <Button
          type="submit"
          size="lg"
          className="h-11 w-full gap-2 rounded-lg bg-white text-sm font-semibold text-black transition-all hover:bg-white/90 hover:shadow-[0_0_20px_rgba(255,255,255,0.15)]"
        >
          Enter Live World
          <ArrowRight className="size-4" />
        </Button>

        <p className="text-center text-xs text-white/20">
          No signup required
        </p>
      </div>
    </form>
  );
}
