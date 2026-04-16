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
  toStoredGeneratedObject,
  type PlacedGeneratedObject,
  type StoredGeneratedObject,
  type Vec3,
} from "@/lib/ai-object-schema";
import type {
  WorldCommandContext,
  WorldCommandResponse,
} from "@/lib/world-command-schema";
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

type GenerationPhase =
  | "idle"
  | "sending"
  | "imagining"
  | "building"
  | "placing"
  | "done"
  | "notice"
  | "error";

type OpDetail = { type: "create" | "update" | "delete"; label: string };

type GenerationState = {
  phase: GenerationPhase;
  prompt: string;
  message: string | null;
  error: string | null;
  opDetails: OpDetail[];
};

const GENERATION_IDLE: GenerationState = {
  phase: "idle",
  prompt: "",
  message: null,
  error: null,
  opDetails: [],
};

const PHASE_INDEX: Partial<Record<GenerationPhase, number>> = {
  sending: 0,
  imagining: 1,
  building: 2,
  placing: 3,
};

const LOADING_STEPS: { key: GenerationPhase; text: string }[] = [
  { key: "sending", text: "Sending" },
  { key: "imagining", text: "Imagining" },
  { key: "building", text: "Building" },
  { key: "placing", text: "Placing" },
];

function LoadingDot({ status }: { status: "done" | "active" | "pending" }) {
  if (status === "done") {
    return (
      <div className="flex h-3 w-3 items-center justify-center rounded-full bg-emerald-400/80">
        <Check className="h-2 w-2 text-[#0a0a1a]" strokeWidth={3.5} />
      </div>
    );
  }
  if (status === "active") {
    return (
      <div className="relative flex h-3 w-3 items-center justify-center">
        <div
          className="absolute inset-0 rounded-full bg-emerald-400/20"
          style={{ animation: "hud-pulse-dot 1.5s ease-in-out infinite" }}
        />
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </div>
    );
  }
  return <div className="ml-[3px] h-1.5 w-1.5 rounded-full bg-white/[0.08]" />;
}

const OP_ICON: Record<OpDetail["type"], { symbol: string; color: string }> = {
  create: { symbol: "+", color: "text-emerald-400/90" },
  update: { symbol: "~", color: "text-sky-400/90" },
  delete: { symbol: "−", color: "text-rose-400/90" },
};

function OpList({ details }: { details: OpDetail[] }) {
  if (details.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      {details.map((op, i) => {
        const icon = OP_ICON[op.type];
        return (
          <div key={`${op.type}-${op.label}`} className="flex items-center gap-1.5">
            <span className={`w-3 text-center font-mono text-[11px] font-semibold leading-none ${icon.color}`}>
              {icon.symbol}
            </span>
            <span className="truncate text-[10px] text-white/45">
              {op.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function GenerationStatus({
  state,
  onDismiss,
}: {
  state: GenerationState;
  onDismiss: () => void;
}) {
  if (state.phase === "idle") return null;

  const isLoading =
    state.phase === "sending" ||
    state.phase === "imagining" ||
    state.phase === "building" ||
    state.phase === "placing";
  const isDone = state.phase === "done";
  const isNotice = state.phase === "notice";
  const isError = state.phase === "error";
  const isResult = isDone || isNotice || isError;
  const activeIndex = PHASE_INDEX[state.phase] ?? -1;

  const Tag = isResult ? "button" : "div";

  return (
    <Tag
      {...(isResult ? { type: "button" as const, onClick: onDismiss } : {})}
      className={[
        "flex w-[240px] flex-col rounded-xl text-left backdrop-blur-2xl transition-colors duration-300",
        isResult
          ? "pointer-events-auto cursor-pointer bg-black/50"
          : "bg-black/40",
      ].join(" ")}
      style={{
        animation: isLoading
          ? "hud-slide-in-right 0.3s ease-out both"
          : undefined,
      }}
    >
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-1.5">
        <p className="min-w-0 flex-1 truncate text-[11px] text-white/30">
          {state.prompt}
        </p>
        {isLoading && (
          <div
            className="h-3 w-3 shrink-0 rounded-full border-[1.5px] border-white/[0.06] border-t-white/40"
            style={{ animation: "hud-spinner 0.7s linear infinite" }}
          />
        )}
        {isResult && (
          <span className="shrink-0 text-[9px] text-white/20">
            click to dismiss
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex gap-3 px-3.5 pb-3 pt-1">
          {LOADING_STEPS.map((step, i) => {
            const dotStatus: "done" | "active" | "pending" =
              i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
            return (
              <div key={step.key} className="flex flex-col items-center gap-1">
                <LoadingDot status={dotStatus} />
                <span
                  className={[
                    "text-[9px] leading-none",
                    dotStatus === "active"
                      ? "font-medium text-white/50"
                      : dotStatus === "done"
                        ? "text-white/25"
                        : "text-white/[0.1]",
                  ].join(" ")}
                >
                  {step.text}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {isDone && (
        <div
          className="flex flex-col gap-2.5 border-t border-white/[0.05] px-3.5 py-2.5"
          style={{ animation: "hud-fade-in 0.25s ease-out both" }}
        >
          <div className="flex items-start gap-2">
            <div className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-400/80">
              <Check className="h-2 w-2 text-[#0a0a1a]" strokeWidth={3.5} />
            </div>
            <span className="text-[11px] leading-relaxed text-white/70">
              {state.message}
            </span>
          </div>
          <OpList details={state.opDetails} />
        </div>
      )}

      {isNotice && (
        <div
          className="flex flex-col gap-1.5 border-t border-white/[0.05] px-3.5 py-2.5"
          style={{ animation: "hud-fade-in 0.25s ease-out both" }}
        >
          <div className="flex items-start gap-2">
            <div className="mt-[3px] h-2 w-2 shrink-0 rounded-full bg-amber-400/70" />
            <span className="text-[11px] leading-relaxed text-white/60">
              {state.message}
            </span>
          </div>
        </div>
      )}

      {isError && (
        <div
          className="flex flex-col gap-1.5 border-t border-white/[0.05] px-3.5 py-2.5"
          style={{ animation: "hud-fade-in 0.25s ease-out both" }}
        >
          <div className="flex items-start gap-2">
            <div className="mt-[3px] h-2 w-2 shrink-0 rounded-full bg-rose-400/70" />
            <span className="text-[11px] leading-relaxed text-white/60">
              {state.error}
            </span>
          </div>
        </div>
      )}
    </Tag>
  );
}

const ROOM_ID = "public-demo";
const MAX_RECENT_COMMANDS = 6;

type MultiplayerWorldContentProps = {
  identity: {
    name: string;
    color: string;
  };
  playerSpawnPosition: Vec3;
};

function RoomLifecycleManager() {
  const room = useRoom();
  const teardownTriggeredRef = useRef(false);

  useEffect(() => {
    const destroyRoom = () => {
      if (teardownTriggeredRef.current) {
        return;
      }

      teardownTriggeredRef.current = true;

      const destroy = Reflect.get(room, "destroy");
      if (typeof destroy === "function") {
        try {
          destroy.call(room);
        } catch {
          room.disconnect();
        }
      } else {
        room.disconnect();
      }
    };

    window.addEventListener("pagehide", destroyRoom);
    window.addEventListener("beforeunload", destroyRoom);

    return () => {
      window.removeEventListener("pagehide", destroyRoom);
      window.removeEventListener("beforeunload", destroyRoom);
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
      const t = setTimeout(() => setGen(GENERATION_IDLE), 8000);
      return () => clearTimeout(t);
    }
    if (phase === "notice") {
      const t = setTimeout(() => setGen(GENERATION_IDLE), 7000);
      return () => clearTimeout(t);
    }
    if (phase === "error") {
      const t = setTimeout(() => setGen(GENERATION_IDLE), 8000);
      return () => clearTimeout(t);
    }
  }, [phase, setGen]);
}

function MultiplayerWorldContent({
  identity,
  playerSpawnPosition,
}: MultiplayerWorldContentProps) {
  const [gen, setGen] = useState<GenerationState>(GENERATION_IDLE);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [lastCreatedObjectId, setLastCreatedObjectId] = useState<string | null>(
    null,
  );
  const [recentCommands, setRecentCommands] = useState<
    WorldCommandContext["recentCommands"]
  >([]);
  const playerTransformRef = useRef<{
    position: Vec3;
    rotation: number;
  }>({
    position: playerSpawnPosition,
    rotation: 0,
  });

  useGenerationTimers(gen.phase, setGen);

  const isGenerating = gen.phase !== "idle" && gen.phase !== "done" && gen.phase !== "notice" && gen.phase !== "error";

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
  const applyWorldOperations = useMutation(
    ({ storage }, operations: WorldCommandResponse["operations"]) => {
      const objects = storage.get("objects");

      const findIndexById = (objectId: string) =>
        objects.findIndex((candidate) => candidate.id === objectId);

      for (const operation of operations) {
        if (operation.type === "create") {
          objects.push(toStoredGeneratedObject(operation.object));
          continue;
        }

        if (operation.type === "update") {
          const index = findIndexById(operation.object.id);
          if (index >= 0) {
            objects.set(index, toStoredGeneratedObject(operation.object));
          }
          continue;
        }

        const index = findIndexById(operation.objectId);
        if (index >= 0) {
          objects.delete(index);
        }
      }
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

  useEffect(() => {
    const validIds = new Set(generatedObjects.map((object) => object.id));

    if (selectedObjectId && !validIds.has(selectedObjectId)) {
      setSelectedObjectId(null);
    }

    if (lastCreatedObjectId && !validIds.has(lastCreatedObjectId)) {
      setLastCreatedObjectId(null);
    }
  }, [generatedObjects, lastCreatedObjectId, selectedObjectId]);

  const handlePromptSubmit = useCallback(async (prompt: string) => {
    setGen({ phase: "sending", prompt, message: null, error: null, opDetails: [] });

    try {
      const response = await fetch("/api/scene/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          player: {
            name: identity.name,
            color: identity.color,
            position: playerTransformRef.current.position,
            rotationY: playerTransformRef.current.rotation,
          },
          context: {
            selectedObjectId,
            lastCreatedObjectId,
            recentCommands,
          },
          objects: generatedObjects,
        }),
      });

      const payload = (await response.json()) as WorldCommandResponse | {
        error?: string;
      };

      if (!response.ok) {
        console.error("Scene generation request failed", {
          prompt,
          status: response.status,
          payload,
        });
        throw new Error(
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Failed to update world.",
        );
      }

      const result = payload as WorldCommandResponse;

      const opDetails: OpDetail[] = result.operations.map((op) => {
        if (op.type === "delete") {
          const original = generatedObjects.find((o) => o.id === op.objectId);
          return { type: "delete", label: original?.label ?? "Object" };
        }
        return { type: op.type, label: op.object.label };
      });

      if (result.operations.length > 0) {
        setGen((s) => ({ ...s, phase: "placing", message: result.message, opDetails }));
        applyWorldOperations(result.operations);
      }

      setSelectedObjectId(result.selectedObjectId);
      setLastCreatedObjectId(result.lastCreatedObjectId);
      setRecentCommands((current) =>
        [
          ...current,
          {
            prompt,
            targetObjectId: result.selectedObjectId,
            timestamp: Date.now(),
          },
        ].slice(-MAX_RECENT_COMMANDS),
      );

      await new Promise((r) => setTimeout(r, result.operations.length > 0 ? 450 : 150));

      if (result.status === "applied") {
        setGen((s) => ({ ...s, phase: "done", message: result.message, opDetails }));
        return;
      }

      setGen((s) => ({
        ...s,
        phase: "notice",
        message: result.message,
        error: null,
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to update world.";
      setGen((s) => ({ ...s, phase: "error", error: msg }));
    }
  }, [
    applyWorldOperations,
    generatedObjects,
    identity.color,
    identity.name,
    lastCreatedObjectId,
    recentCommands,
    selectedObjectId,
  ]);

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
              selectedObjectId={selectedObjectId}
              onSelectObject={setSelectedObjectId}
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
        <GenerationStatus state={gen} onDismiss={() => setGen(GENERATION_IDLE)} />
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
