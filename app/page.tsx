"use client";

import { useEffect, useState } from "react";
import { JoinCard } from "@/components/landing/JoinCard";

export default function Page() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="dark relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-[#050507]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 60%, rgba(251,146,60,0.05) 0%, transparent 70%)",
        }}
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, white 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage:
            "radial-gradient(ellipse 50% 50% at 50% 50%, black 30%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 50% 50% at 50% 50%, black 30%, transparent 70%)",
        }}
      />

      <div
        className="relative z-10 flex flex-col items-center gap-8 px-6 transition-all duration-700 ease-out"
        style={{
          opacity: show ? 1 : 0,
          transform: show ? "translateY(0)" : "translateY(16px)",
        }}
      >
        <span className="text-[0.65rem] font-semibold tracking-[0.35em] text-white/20 uppercase">
          Castly
        </span>

        <h1 className="max-w-md text-center text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
          Build worlds together by typing.
        </h1>

        <p className="max-w-sm text-center text-sm leading-relaxed text-white/40">
          Type &quot;add a pine tree&quot; and watch it appear for everyone. No
          signup. Just join and create.
        </p>

        <JoinCard />
      </div>
    </div>
  );
}
