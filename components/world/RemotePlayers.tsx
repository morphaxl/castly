"use client";

import { useOthersConnectionIds } from "@/lib/liveblocks.config";
import { RemotePlayer } from "./RemotePlayer";

export function RemotePlayers() {
  const connectionIds = useOthersConnectionIds();

  return (
    <>
      {connectionIds.map((connectionId) => (
        <RemotePlayer key={connectionId} connectionId={connectionId} />
      ))}
    </>
  );
}
