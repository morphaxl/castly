"use client";

import { LiveList } from "@liveblocks/client";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Canvas } from "@react-three/fiber";
import { nanoid } from "nanoid";

import {
  aiGeneratedObjectSchema,
  parseStoredGeneratedObject,
  serializeGeneratedObjectDefinition,
  type PlacedGeneratedObject,
  type StoredGeneratedObject,
  type Vec3,
} from "@/lib/ai-object-schema";
import {
  RoomProvider,
  useMutation,
  useStorage,
} from "@/lib/liveblocks.config";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { getSpawnPositionForIdentity } from "@/lib/player-identity";
import { FloatingChatBox } from "./FloatingChatBox";
import { Scene } from "./Scene";

const ROOM_ID = "public-demo";

type MultiplayerWorldContentProps = {
  identity: {
    name: string;
    color: string;
  };
  playerSpawnPosition: Vec3;
};

function MultiplayerWorldContent({
  identity,
  playerSpawnPosition,
}: MultiplayerWorldContentProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const playerTransformRef = useRef<{
    position: Vec3;
    rotation: number;
  }>({
    position: playerSpawnPosition,
    rotation: 0,
  });

  const handlePlayerTransformChange = useCallback(
    (position: Vec3, rotation: number) => {
      playerTransformRef.current = { position, rotation };
    },
    [],
  );

  useEffect(() => {
    playerTransformRef.current = {
      position: playerSpawnPosition,
      rotation: 0,
    };
  }, [playerSpawnPosition]);

  const storedObjects = useStorage((root) => root.objects);
  const addGeneratedObject = useMutation(
    ({ storage }, object: StoredGeneratedObject) => {
      storage.get("objects").push(object);
    },
    [],
  );

  const generatedObjects = useMemo(
    () =>
      (storedObjects ?? [])
        .map((object) => parseStoredGeneratedObject(object))
        .filter(
          (object): object is PlacedGeneratedObject => object !== null,
        ),
    [storedObjects],
  );

  const handlePromptSubmit = useCallback(async (prompt: string) => {
    setIsGenerating(true);
    setGenerationError(null);

    try {
      const response = await fetch("/api/scene/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to generate object.",
        );
      }

      const definition = aiGeneratedObjectSchema.parse(payload.object);
      const { position, rotation } = playerTransformRef.current;
      const x = position[0];
      const z = position[2];
      const spawnDistance = 3.2;
      const spawnPosition: Vec3 = [
        x + Math.sin(rotation) * spawnDistance,
        0,
        z + Math.cos(rotation) * spawnDistance,
      ];

      addGeneratedObject({
        id: nanoid(),
        version: 1,
        prompt,
        label: definition.label,
        createdBy: identity.name,
        createdAt: Date.now(),
        transform: {
          position: spawnPosition,
          rotation: [0, rotation, 0],
          scale: [1, 1, 1],
        },
        definitionJson: serializeGeneratedObjectDefinition(definition),
      });
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : "Failed to generate asset.",
      );
    } finally {
      setIsGenerating(false);
    }
  }, [addGeneratedObject, identity.name]);

  return (
    <div className="relative h-screen w-screen bg-[#0a0a1a]">
      <Canvas
        shadows
        camera={{ fov: 55, near: 0.1, far: 250, position: [0, 3, 8] }}
      >
        <Suspense fallback={null}>
          <Scene
            objects={generatedObjects}
            onPlayerTransformChange={handlePlayerTransformChange}
            playerIdentity={identity}
            playerSpawnPosition={playerSpawnPosition}
          />
        </Suspense>
      </Canvas>

      <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/10 bg-black/25 px-4 py-2 text-xs tracking-[0.24em] text-white/65 uppercase backdrop-blur-md">
        WASD to move · Hold shift to run · Drag to orbit
      </div>

      <div className="pointer-events-none absolute left-4 top-16 rounded-full border border-white/10 bg-black/25 px-4 py-2 text-[11px] tracking-[0.18em] text-white/55 uppercase backdrop-blur-md">
        In room {ROOM_ID} as {identity.name}
      </div>

      {isGenerating ? (
        <div className="pointer-events-none absolute right-4 top-4 rounded-full border border-emerald-400/18 bg-emerald-400/10 px-4 py-2 text-xs font-medium tracking-[0.2em] text-emerald-100 uppercase backdrop-blur-md">
          AI generating asset
        </div>
      ) : null}

      {generationError ? (
        <div className="pointer-events-none absolute right-4 top-4 rounded-full border border-rose-400/18 bg-rose-400/10 px-4 py-2 text-xs font-medium text-rose-100 backdrop-blur-md">
          {generationError}
        </div>
      ) : null}

      <FloatingChatBox
        isGenerating={isGenerating}
        onSubmit={handlePromptSubmit}
      />
    </div>
  );
}

export default function WorldScene() {
  const { identity, isReady } = usePlayerIdentity();
  const playerSpawnPosition = useMemo(
    () => getSpawnPositionForIdentity(identity),
    [identity],
  );
  const initialStorage = useMemo(
    () => ({
      objects: new LiveList<StoredGeneratedObject>([]),
    }),
    [],
  );

  if (!isReady) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a1a]">
        <p className="text-sm text-white/40">Joining multiplayer world...</p>
      </div>
    );
  }

  return (
    <RoomProvider
      id={ROOM_ID}
      initialPresence={{
        name: identity.name,
        color: identity.color,
        position: playerSpawnPosition,
        rotation: [0, 0, 0, 1],
        animation: "idle",
      }}
      initialStorage={initialStorage}
    >
      <MultiplayerWorldContent
        identity={identity}
        playerSpawnPosition={playerSpawnPosition}
      />
    </RoomProvider>
  );
}
