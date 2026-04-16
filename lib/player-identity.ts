export type PlayerIdentity = {
  name: string;
  color: string;
};

export const PLAYER_IDENTITY_STORAGE_KEY = "castly-player";
export const PLAYER_IDENTITY_SESSION_KEY = "castly-player-session";

export const GUEST_NAMES = [
  "Guest Fox",
  "Guest Pine",
  "Guest Reef",
  "Guest Spark",
  "Guest Nova",
  "Guest Echo",
  "Guest Drift",
  "Guest Fern",
] as const;

export const PLAYER_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#6b7280",
  "#f5f5f5",
] as const;

const isPlayerIdentity = (value: unknown): value is PlayerIdentity => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0 &&
    typeof candidate.color === "string" &&
    PLAYER_COLORS.includes(candidate.color as (typeof PLAYER_COLORS)[number])
  );
};

export const getRandomGuestName = () =>
  GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)];

export const getRandomPlayerColor = () =>
  PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];

export const getFallbackPlayerIdentity = (): PlayerIdentity => ({
  name: getRandomGuestName(),
  color: getRandomPlayerColor(),
});

export const getSpawnPositionForIdentity = (
  identity: PlayerIdentity,
): [number, number, number] => {
  const seed = `${identity.name}:${identity.color}`;
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  const angle = (hash % 360) * (Math.PI / 180);
  const radius = 3.25;

  return [
    Math.round(Math.sin(angle) * radius * 100) / 100,
    0,
    Math.round(Math.cos(angle) * radius * 100) / 100,
  ];
};

const parsePlayerIdentity = (value: string | null): PlayerIdentity | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return isPlayerIdentity(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const readPlayerIdentity = (): PlayerIdentity | null => {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    parsePlayerIdentity(
      window.sessionStorage.getItem(PLAYER_IDENTITY_SESSION_KEY),
    ) ??
    parsePlayerIdentity(window.localStorage.getItem(PLAYER_IDENTITY_STORAGE_KEY))
  );
};

export const writePlayerIdentity = (identity: PlayerIdentity) => {
  if (typeof window === "undefined") {
    return;
  }

  const serialized = JSON.stringify(identity);
  window.sessionStorage.setItem(PLAYER_IDENTITY_SESSION_KEY, serialized);
  window.localStorage.setItem(PLAYER_IDENTITY_STORAGE_KEY, serialized);
};
