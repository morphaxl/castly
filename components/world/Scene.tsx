"use client";

import { Grid } from "@react-three/drei";

import { LocalPlayer } from "./LocalPlayer";

export function Scene() {
  return (
    <>
      <color attach="background" args={["#0a0a1a"]} />
      <fog attach="fog" args={["#0a0a1a", 30, 150]} />

      <ambientLight intensity={1.1} />
      <directionalLight
        castShadow
        position={[10, 18, 8]}
        intensity={1.7}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <hemisphereLight
        args={["#d8ecff", "#0d1222", 0.55]}
        position={[0, 20, 0]}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>

      <Grid
        position={[0, 0.01, 0]}
        infiniteGrid
        cellSize={1}
        cellThickness={0.5}
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#4a4a6a"
        cellColor="#2a2a4a"
        fadeDistance={80}
        fadeStrength={1.5}
      />

      <LocalPlayer />
    </>
  );
}
