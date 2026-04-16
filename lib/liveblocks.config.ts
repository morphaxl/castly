import { LiveList, createClient } from "@liveblocks/client";
import { createRoomContext } from "@liveblocks/react";
import type { StoredGeneratedObject } from "@/lib/ai-object-schema";

const publicApiKey = process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY;

if (!publicApiKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY for multiplayer world setup.",
  );
}

export type PlayerAnimation = "idle" | "walk" | "run" | "jump";

export type Presence = {
  name: string;
  color: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  velocity: [number, number, number];
  animation: PlayerAnimation;
};

type Storage = {
  objects: LiveList<StoredGeneratedObject>;
};

declare global {
  interface Liveblocks {
    Presence: Presence;
    Storage: Storage;
  }
}

const client = createClient({
  publicApiKey,
  throttle: 16,
});

export const {
  RoomProvider,
  useMutation,
  useOther,
  useOthersConnectionIds,
  useRoom,
  useStatus,
  useStorage,
  useUpdateMyPresence,
} = createRoomContext<Presence, Storage>(client);
