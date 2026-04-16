"use client";

import { useState } from "react";

import {
  getFallbackPlayerIdentity,
  readPlayerIdentity,
  type PlayerIdentity,
} from "@/lib/player-identity";

type UsePlayerIdentityResult = {
  identity: PlayerIdentity;
  isReady: boolean;
};

export function usePlayerIdentity(): UsePlayerIdentityResult {
  const [identity] = useState<PlayerIdentity>(
    () => readPlayerIdentity() ?? getFallbackPlayerIdentity(),
  );
  const isReady = true;

  return { identity, isReady };
}
