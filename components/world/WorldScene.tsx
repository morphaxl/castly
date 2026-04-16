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
import { Check } from "lucide-react";
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
  useRoom,
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

type GenerationPhase = "idle" | "sending" | "imagining" | "building" | "placing" | "done" | "error";

type GenerationState = {
  phase: GenerationPhase;
  prompt: string;
  label: string | null;
  error: string | null;
};

const GENERATION_IDLE: GenerationState = { phase: "idle", prompt: "", label: null, error: null };

const GENERATION_STEPS = [
  { key: "sending", label: "Sending" },
  { key: "imagining", label: "Imagining" },
  { key: "building", label: "Building" },
  { key: "placing", label: "Placing" },
] as const;

const STEP_ORDER: Record<string, number> = { sending: 0, imagining: 1, building: 2, placing: 3, done: 4 };

function StepDot({ status }: { status: "done" | "active" | "pending" }) {
  if (status === "done") {
    return (
      <div className="flex h-[14px] w-[14px] items-center justify-center rounded-full bg-emerald-400/80">
        <Check className="h-2.5 w-2.5 text-[#0a0a1a]" strokeWidth={3} />
      </div>
    );
  }
  if (status === "active") {
    return (
      <div className="relative flex h-[14px] w-[14px] items-center justify-center">
        <div
          className="absolute inset-0 rounded-full bg-emerald-400/25"
          style={{ animation: "hud-pulse-dot 1.5s ease-in-out infinite" }}
        />
        <div className="h-[6px] w-[6px] rounded-full bg-emerald-400" />
      </div>
    );
  }
  return <div className="h-[6px] w-[6px] rounded-full bg-white/[0.1] ml-1" />;
}

function GenerationStatus({ state }: { state: GenerationState }) {
  if (state.phase === "idle") return null;

  const isDone = state.phase === "done";
  const isError = state.phase === "error";
  const currentIndex = STEP_ORDER[state.phase] ?? -1;

  return (
    <div
      className="flex w-[200px] flex-col gap-2.5 rounded-xl bg-black/35 px-3.5 py-3 backdrop-blur-2xl"
      style={{
        animation: isDone || isError
          ? undefined
          : "hud-slide-in-right 0.3s ease-out both",
      }}
    >
      <p className="truncate text-[11px] italic text-white/30">
        &ldquo;{state.prompt}&rdquo;
      </p>

      {isError ? (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400/80" />
          <span className="truncate text-[11px] text-rose-300/80">
            {state.error ?? "Generation failed"}
          </span>
        </div>
      ) : isDone ? (
        <div className="flex items-center gap-2">
          <div className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full bg-emerald-400/80">
            <Check className="h-2.5 w-2.5 text-[#0a0a1a]" strokeWidth={3} />
          </div>
          <span className="truncate text-[11px] font-medium text-emerald-300/90">
            {state.label ?? "Object placed"}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {GENERATION_STEPS.map((step, i) => {
            const status: "done" | "active" | "pending" =
              i < currentIndex ? "done" : i === currentIndex ? "active" : "pending";
            return (
              <div key={step.key} className="flex items-center gap-2">
                <StepDot status={status} />
                <span
                  className={[
                    "text-[11px] transition-colors duration-300",
                    status === "active"
                      ? "font-medium text-white/70"
                      : status === "done"
                        ? "text-white/30"
                        : "text-white/15",
                  ].join(" ")}
                >
                  {step.label}
                </span>
                {status === "active" && (
                  <div
                    className="ml-auto h-3 w-3 rounded-full border-[1.5px] border-emerald-400/20 border-t-emerald-400/70"
                    style={{ animation: "hud-spinner 0.8s linear infinite" }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
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

function RoomLifecycleManager() {
  const room = useRoom();

  useEffect(() => {
    const destroyRoom = () => {
      const destroy = Reflect.get(room, "destroy");
      if (typeof destroy === "function") {
        destroy.call(room);
      } else {
        room.disconnect();
      }
    };

    window.addEventListener("pagehide", destroyRoom);
    window.addEventListener("beforeunload", destroyRoom);

    return () => {
      window.removeEventListener("pagehide", destroyRoom);
      window.removeEventListener("beforeunload", destroyRoom);
      destroyRoom();
    };
  }, [room]);

  return null;
}

function useGenerationTimers(
  phase: GenerationPhase,
  setGen: React.Dispatch<React.SetStateAction<GenerationState>>,
) {
  useEffect(() => {
    if (phase === "sending") {
      const t = setTimeout(() => setGen((s) => ({ ...s, phase: "imagining" })), 400);
      return () => clearTimeout(t);
    }
    if (phase === "imagining") {
      const t = setTimeout(() => setGen((s) => ({ ...s, phase: "building" })), 2200);
      return () => clearTimeout(t);
    }
    if (phase === "done") {
      const t = setTimeout(() => setGen(GENERATION_IDLE), 3000);
      return () => clearTimeout(t);
    }
    if (phase === "error") {
      const t = setTimeout(() => setGen(GENERATION_IDLE), 6000);
      return () => clearTimeout(t);
    }
  }, [phase, setGen]);
}

function MultiplayerWorldContent({
  identity,
  playerSpawnPosition,
}: MultiplayerWorldContentProps) {
  const [gen, setGen] = useState<GenerationState>(GENERATION_IDLE);
  const playerTransformRef = useRef<{
    position: Vec3;
    rotation: number;
  }>({
    position: playerSpawnPosition,
    rotation: 0,
  });

  useGenerationTimers(gen.phase, setGen);

  const isGenerating = gen.phase !== "idle" && gen.phase !== "done" && gen.phase !== "error";

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
    setGen({ phase: "sending", prompt, label: null, error: null });

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

      setGen((s) => ({ ...s, phase: "placing", label: definition.label }));

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

      await new Promise((r) => setTimeout(r, 600));
      setGen((s) => ({ ...s, phase: "done" }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate asset.";
      setGen((s) => ({ ...s, phase: "error", error: message }));
    }
  }, [addGeneratedObject, identity.name]);

  return (
    <div className="relative h-screen w-screen bg-[#0a0a1a]">
      <RoomLifecycleManager />

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

      <div className="pointer-events-none absolute right-4 top-4">
        <GenerationStatus state={gen} />
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
