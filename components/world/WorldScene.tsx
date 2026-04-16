"use client";

import { Suspense } from "react";

import { Canvas } from "@react-three/fiber";
import { FloatingChatBox } from "./FloatingChatBox";
import { Scene } from "./Scene";

export default function WorldScene() {
  return (
    <div className="relative h-screen w-screen bg-[#0a0a1a]">
      <Canvas
        shadows
        camera={{ fov: 55, near: 0.1, far: 250, position: [0, 3, 8] }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>

      <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/10 bg-black/25 px-4 py-2 text-xs tracking-[0.24em] text-white/65 uppercase backdrop-blur-md">
        WASD to move · Hold shift to run · Drag to orbit
      </div>

      <FloatingChatBox />
    </div>
  );
}
