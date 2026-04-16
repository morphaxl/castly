# Castly

### A multiplayer 3D playground where you build worlds by typing.

Visit a URL. Pick a name. Walk around. Type *"add a dragon"* — and a dragon appears, built from AI-generated geometry, visible to every player in the room, persisted forever. No signup. No assets. No limits.

---

## ⚡ How It Works

1. Visit the URL, pick a name and color, click **Enter Live World**
2. Walk around with WASD + third-person camera
3. Type anything in the command bar: `"add a pine tree"`, `"place a red castle"`, `"make it bigger"`
4. The AI generates a declarative scene graph — a flat list of 3D primitives composing the object
5. The object appears at your position for **every player in the room**, instantly
6. Objects persist across page refreshes via Liveblocks Storage (CRDTs)

---

## 🎮 Key Features

- **Real-time multiplayer** — Liveblocks Presence broadcasts player position, rotation, and animation state at 30fps. See other players walking around with animated GLB avatars.
- **AI world editing agent** — not just "create object". A full tool-loop agent that can move, scale, recolor, replace, and delete objects via natural language.
- **Declarative scene graph architecture** — the AI composes complex objects from 6 primitive types (box, sphere, cylinder, cone, capsule, torus), rendered by a single generic component. No asset library. No registry.
- **Persistent shared world** — Liveblocks Storage with CRDT conflict resolution keeps the scene consistent across all clients and page refreshes.
- **Zero-friction join** — no auth, no signup. Just a name and a color, stored in localStorage.
- **Animated GLB characters** — idle, walk, run, and jump animations with smooth crossfade blending and a custom movement controller with gravity and jump physics.
- **Selection system** — click any object to select it, then say `"make it bigger"` or `"turn it red"`. The agent understands context.
- **Smart command interpretation** — the agent understands `"move it closer"`, `"make the tree taller"`, `"replace it with a spaceship"`. It can chain multiple operations in one command and ask clarifying questions when ambiguous.

---

## 🏗 Technical Architecture

```
Browser (Next.js 16)
├─ R3F Canvas (Three.js)
│  ├─ LocalPlayer (custom controller + GLB avatar + animations)
│  ├─ RemotePlayers (Liveblocks Presence → interpolated avatars)
│  └─ GeneratedObjects (AI JSON → primitive meshes)
├─ Command Bar → POST /api/scene/command
│  └─ World Editing Agent (GPT-5.4 + tool loop)
│     ├─ createObject (AI scene generation)
│     ├─ moveObject / scaleObject / recolorObject
│     ├─ replaceObject / deleteObject
│     ├─ inspectWorld / findObjects
│     └─ requestClarification
└─ Liveblocks
   ├─ Presence (player positions @ 30fps)
   └─ Storage (scene objects, CRDT persistence)
```

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| 3D Engine | React Three Fiber + drei |
| AI | Vercel AI SDK + GPT-5.4 (tool-loop agent) |
| Multiplayer | Liveblocks (Presence + Storage) |
| Styling | Tailwind CSS 4 + shadcn/ui |
| Character | GLB avatar with idle/walk/run/jump animations |
| Language | TypeScript (strict) |
| Deployment | Vercel |

---

## The AI Scene Graph

There are no pre-built 3D components. No asset library. No registry.

The AI generates a **declarative scene graph** — a flat list of up to 12 primitives, each with geometry type, position, rotation, scale, and a full PBR material (color, roughness, metalness, emissive, opacity). A single `GeneratedObject` component maps this JSON directly to R3F meshes.

```json
{
  "label": "Pine Tree",
  "parts": [
    {
      "name": "trunk",
      "geometry": { "type": "cylinder", "radiusTop": 0.1, "radiusBottom": 0.3, "height": 1.2, ... },
      "material": { "type": "standard", "color": "#5C3A1E", "roughness": 0.9, "metalness": 0, "flatShading": true, ... },
      "position": { "x": 0, "y": 0.6, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": 0 },
      "scale": { "x": 1, "y": 1, "z": 1 }
    },
    {
      "name": "lower-canopy",
      "geometry": { "type": "cone", "radius": 0.8, "height": 1.5, ... },
      "material": { "type": "standard", "color": "#2D6A2D", "flatShading": true, ... },
      "position": { "x": 0, "y": 1.8, "z": 0 }, "rotation": ..., "scale": ...
    },
    {
      "name": "upper-canopy",
      "geometry": { "type": "cone", "radius": 0.6, "height": 1.2, ... },
      "material": { "type": "standard", "color": "#3A7A3A", "flatShading": true, ... },
      "position": { "x": 0, "y": 2.8, "z": 0 }, "rotation": ..., "scale": ...
    }
  ]
}
```

The AI can compose anything from these 6 primitives. A dragon is a cone body, sphere head, cone wings, cylinder neck and tail, cone horns. All geometry parameters are validated and clamped before rendering.

---

## The World Editing Agent

The command bar doesn't call a simple "generate object" endpoint. It hits a **ToolLoopAgent** built with Vercel AI SDK's `generateText` in a tool-use loop.

The agent has 9 tools:

| Tool | What it does |
|---|---|
| `inspectWorld` | Lists all room objects with distances and selection state |
| `createObject` | Generates a new scene graph at the player's position |
| `replaceObject` | Swaps an existing object with a newly generated one |
| `scaleObject` | Resizes an object by a multiplier |
| `recolorObject` | Changes the color of all parts in an object |
| `moveObject` | Repositions an object in world space |
| `deleteObject` | Removes an object from the scene |
| `findObjects` | Searches the scene by label or proximity |
| `requestClarification` | Asks the user a follow-up question when the command is ambiguous |

The agent receives full context with every request: the selected object, the last created object, all room objects sorted by distance to the player, and the player's current position and facing direction. This lets it handle commands like `"move it closer"` or `"make the tree bigger"` without needing the user to specify which object.

---

## Multiplayer

Liveblocks Presence broadcasts each player's position, rotation, velocity, and animation state at 30fps. Remote players are rendered with **snapshot interpolation** — a 100ms delay buffer smooths out network jitter, and velocity-based extrapolation fills gaps between packets.

Scene objects live in Liveblocks Storage as a `LiveList`. CRDTs handle concurrent edits from multiple players without conflicts. A player joining mid-session gets the full current scene state immediately.

---

## Getting Started

```bash
git clone https://github.com/your-username/castly
cd castly
pnpm install
```

Create a `.env.local` file:

```
NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY=pk_...
LIVEBLOCKS_SECRET_KEY=sk_...
OPENAI_API_KEY=sk-...
```

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
castly/
├── app/
│   ├── page.tsx                       # Landing page
│   ├── world/page.tsx                 # 3D playground (client component)
│   └── api/scene/
│       ├── command/route.ts           # World editing agent endpoint
│       └── generate/route.ts          # Direct scene generation endpoint
├── components/
│   ├── world/
│   │   ├── WorldScene.tsx             # Canvas + RoomProvider + HUD overlay
│   │   ├── Scene.tsx                  # R3F scene (ground, grid, lighting)
│   │   ├── LocalPlayer.jsx            # WASD movement + GLB avatar + animations
│   │   ├── RemotePlayer.jsx           # Interpolated remote avatar
│   │   ├── RemotePlayers.tsx          # Liveblocks Presence → avatars
│   │   ├── GeneratedObject.tsx        # JSON parts[] → R3F meshes
│   │   ├── FloatingChatBox.tsx        # Natural language command input
│   │   ├── CharacterCamera.tsx        # Third-person camera follow
│   │   └── SceneErrorBoundary.tsx     # Graceful error handling for 3D
│   └── landing/
│       └── JoinCard.tsx               # Name + color picker
├── lib/
│   ├── ai-object-schema.ts            # Zod schemas + sanitization
│   ├── scene-generation.ts            # AI scene graph generation
│   ├── world-command-schema.ts        # World command request/response types
│   ├── liveblocks.config.ts           # Presence + Storage types
│   └── player-identity.ts             # Identity persistence + spawn logic
└── hooks/
    ├── useCharacterControls.ts        # WASD + sprint + jump input
    └── usePlayerIdentity.ts           # Name + color from localStorage
```

---

**Built with** Next.js 16 · React Three Fiber · drei · Three.js · Vercel AI SDK · GPT-5.4 · Liveblocks · Tailwind CSS 4 · shadcn/ui · Zod · TypeScript
