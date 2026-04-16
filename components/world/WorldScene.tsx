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
import { Check, X } from "lucide-react";
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
import { SceneErrorBoundary } from "./SceneErrorBoundary";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[5px] border border-white/[0.12] bg-white/[0.07] px-1.5 font-mono text-[11px] font-medium leading-none text-white/70">
      {children}
    </kbd>
  );
}

function ControlsHint() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFading(true);
      setTimeout(() => setVisible(false), 400);
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (["w", "a", "s", "d"].includes(e.key.toLowerCase())) {
        setFading(true);
        setTimeout(() => setVisible(false), 400);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="pointer-events-auto flex flex-col gap-2 cursor-pointer text-left"
      onClick={() => {
        setFading(true);
        setTimeout(() => setVisible(false), 400);
      }}
      style={{
        animation: fading
          ? "hud-fade-out 0.4s ease-out forwards"
          : "hud-fade-in 0.5s ease-out both",
      }}
    >
      <div className="flex items-center gap-3 rounded-lg bg-black/30 px-3 py-2 backdrop-blur-xl">
        <div className="flex items-center gap-1.5">
          <div className="flex flex-col items-center gap-0.5">
            <Kbd>W</Kbd>
            <div className="flex gap-0.5">
              <Kbd>A</Kbd>
              <Kbd>S</Kbd>
              <Kbd>D</Kbd>
            </div>
          </div>
          <span className="ml-1 text-[11px] text-white/40">Move</span>
        </div>

        <div className="h-4 w-px bg-white/[0.08]" />

        <div className="flex items-center gap-1.5">
          <Kbd>Shift</Kbd>
          <span className="text-[11px] text-white/40">Run</span>
        </div>

        <div className="h-4 w-px bg-white/[0.08]" />

        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-white/50" aria-hidden="true">
            <path d="M7 1.5v11M7 1.5L4 4.5M7 1.5l3 3M1.5 7h11M12.5 7L9.5 4M12.5 7l-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-[11px] text-white/40">Drag to look</span>
        </div>
      </div>
    </button>
  );
}

function RoomBadge({ roomId, playerName, playerColor }: { roomId: string; playerName: string; playerColor: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg bg-black/25 px-2.5 py-1.5 backdrop-blur-xl"
      style={{ animation: "hud-fade-in 0.5s ease-out 0.15s both" }}
    >
      <span
        className="block h-2 w-2 rounded-full"
        style={{
          backgroundColor: playerColor,
          animation: "hud-pulse-dot 2.5s ease-in-out infinite",
        }}
      />
      <span className="text-[11px] text-white/45">
        {roomId}
      </span>
      <span className="text-[11px] text-white/20">·</span>
      <span className="text-[11px] font-medium text-white/60">
        {playerName}
      </span>
    </div>
  );
}

function GeneratingIndicator() {
  return (
    <div
      className="flex items-center gap-2.5 rounded-lg bg-emerald-500/[0.08] px-3 py-2 backdrop-blur-xl"
      style={{ animation: "hud-slide-in-right 0.35s ease-out both" }}
    >
      <div
        className="h-3.5 w-3.5 rounded-full border-[1.5px] border-emerald-400/20 border-t-emerald-400/80"
        style={{ animation: "hud-spinner 0.8s linear infinite" }}
      />
      <span className="text-[11px] font-medium text-emerald-300/80">
        Generating...
      </span>
    </div>
  );
}

function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className="pointer-events-auto flex items-center gap-2 rounded-lg bg-rose-500/[0.1] px-3 py-2 backdrop-blur-xl"
      style={{ animation: "hud-slide-in-right 0.35s ease-out both" }}
    >
      <div className="h-1.5 w-1.5 rounded-full bg-rose-400/80" />
      <span className="max-w-[220px] truncate text-[11px] text-rose-200/80">
        {message}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-1 flex h-4 w-4 items-center justify-center rounded text-rose-300/50 transition-colors hover:text-rose-200"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

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
        console.error("Scene generation request failed", {
          prompt,
          status: response.status,
          payload,
        });
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
      <SceneErrorBoundary>
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
      </SceneErrorBoundary>

      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
        <ControlsHint />
        <RoomBadge
          roomId={ROOM_ID}
          playerName={identity.name}
          playerColor={identity.color}
        />
      </div>

      <div className="pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-2">
        {isGenerating && <GeneratingIndicator />}
        {generationError && (
          <ErrorToast
            message={generationError}
            onDismiss={() => setGenerationError(null)}
          />
        )}
      </div>

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
        velocity: [0, 0, 0],
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
