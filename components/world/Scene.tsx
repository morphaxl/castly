"use client";

import { Grid } from "@react-three/drei";

import { GeneratedObject } from "./GeneratedObject";
import { LocalPlayer } from "./LocalPlayer";
import { RemotePlayers } from "./RemotePlayers";
import { SceneErrorBoundary } from "./SceneErrorBoundary";
import type { PlacedGeneratedObject, Vec3 } from "@/lib/ai-object-schema";
import type { PlayerIdentity } from "@/lib/player-identity";

type SceneProps = {
  objects: PlacedGeneratedObject[];
  onPlayerTransformChange: (position: Vec3, rotation: number) => void;
  playerSpawnPosition: Vec3;
  playerIdentity: PlayerIdentity;
  selectedObjectId: string | null;
  onSelectObject: (objectId: string) => void;
};

export function Scene({
  objects,
  onPlayerTransformChange,
  playerSpawnPosition,
  playerIdentity,
  selectedObjectId,
  onSelectObject,
}: SceneProps) {
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

      {objects.map((object) => (
        <SceneErrorBoundary key={object.id} silent>
          <GeneratedObject
            object={object}
            isSelected={object.id === selectedObjectId}
            onSelect={onSelectObject}
          />
        </SceneErrorBoundary>
      ))}

      <RemotePlayers />
      <LocalPlayer
        identity={playerIdentity}
        initialPosition={playerSpawnPosition}
        onTransformChange={onPlayerTransformChange}
      />
    </>
  );
}
