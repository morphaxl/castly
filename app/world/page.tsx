"use client";

import dynamic from "next/dynamic";

const WorldScene = dynamic(() => import("@/components/world/WorldScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a1a]">
      <p className="text-sm text-white/40">Loading world...</p>
    </div>
  ),
});

export default function WorldPage() {
  return <WorldScene />;
}
