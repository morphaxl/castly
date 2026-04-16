import { openai } from "@ai-sdk/openai";
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { nanoid } from "nanoid";
import { z } from "zod";

import {
  type PlacedGeneratedObject,
  type Vec3,
} from "@/lib/ai-object-schema";
import { generateSceneObjectFromPrompt } from "@/lib/scene-generation";
import {
  clonePlacedObject,
  worldCommandRequestSchema,
  worldCommandResponseSchema,
  type WorldCommandResponse,
  type WorldOperation,
} from "@/lib/world-command-schema";

type CatalogItem = {
  alias: string;
  object: PlacedGeneratedObject;
  distanceToPlayer: number;
  isSelected: boolean;
  isLastCreated: boolean;
};

const colorNameToHex: Record<string, string> = {
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  green: "#22c55e",
  blue: "#3b82f6",
  purple: "#8b5cf6",
  pink: "#ec4899",
  white: "#f8fafc",
  black: "#0f172a",
  gray: "#6b7280",
  grey: "#6b7280",
  silver: "#94a3b8",
  gold: "#f59e0b",
  brown: "#92400e",
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const round = (value: number, precision = 3) => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const summarizeObject = (item: CatalogItem) => {
  const flags = [
    item.isSelected ? "selected" : null,
    item.isLastCreated ? "last-created" : null,
    item.object.createdBy ? `by ${item.object.createdBy}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return `${item.alias}: "${item.object.label}" (${flags || "room object"}, ${item.distanceToPlayer.toFixed(1)}m away)`;
};

const buildCatalog = (
  objects: PlacedGeneratedObject[],
  playerPosition: Vec3,
  selectedObjectId: string | null,
  lastCreatedObjectId: string | null,
) => {
  const catalog = [...objects]
    .map((object) => {
      const dx = object.transform.position[0] - playerPosition[0];
      const dz = object.transform.position[2] - playerPosition[2];
      return {
        object,
        distanceToPlayer: Math.hypot(dx, dz),
      };
    })
    .sort((a, b) => a.distanceToPlayer - b.distanceToPlayer)
    .map((entry, index) => ({
      alias: `obj${index + 1}`,
      object: entry.object,
      distanceToPlayer: entry.distanceToPlayer,
      isSelected: entry.object.id === selectedObjectId,
      isLastCreated: entry.object.id === lastCreatedObjectId,
    }));

  return catalog;
};

const buildPromptContext = (
  prompt: string,
  catalog: CatalogItem[],
  selectedObjectId: string | null,
  lastCreatedObjectId: string | null,
  recentCommands: Array<{
    prompt: string;
    targetObjectId: string | null;
    timestamp: number;
  }>,
) => {
  const selectedAlias =
    catalog.find((item) => item.object.id === selectedObjectId)?.alias ?? "none";
  const lastCreatedAlias =
    catalog.find((item) => item.object.id === lastCreatedObjectId)?.alias ?? "none";
  const recentHistory =
    recentCommands.length > 0
      ? recentCommands
          .slice(-4)
          .map((entry) => `  - ${entry.prompt}`)
          .join("\n")
      : "  - none";

  return `Current room context:
- Selected object: ${selectedAlias}
- Last created object: ${lastCreatedAlias}
- Recent commands:
${recentHistory}
- Objects in room:
${catalog.length > 0 ? catalog.map((item) => `  - ${summarizeObject(item)}`).join("\n") : "  - none"}

User command:
${prompt}`;
};

const normalizeColor = (input: string) => {
  const trimmed = input.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed;
  }
  return colorNameToHex[trimmed] ?? "#a3a3a3";
};

const createSpawnPosition = (
  playerPosition: Vec3,
  rotationY: number,
  distance = 3.2,
): Vec3 => [
  round(playerPosition[0] + Math.sin(rotationY) * distance),
  0,
  round(playerPosition[2] + Math.cos(rotationY) * distance),
];

const cloneDefinition = (object: PlacedGeneratedObject) =>
  JSON.parse(JSON.stringify(object.definition)) as PlacedGeneratedObject["definition"];

const maxComponent = (...values: number[]) =>
  values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const body = worldCommandRequestSchema.parse(rawBody);

    const catalog = buildCatalog(
      body.objects,
      body.player.position,
      body.context.selectedObjectId,
      body.context.lastCreatedObjectId,
    );
    const aliasToId = new Map(catalog.map((item) => [item.alias, item.object.id]));

    const objectsById = new Map(
      body.objects.map((object) => [object.id, clonePlacedObject(object)]),
    );
    const pending = new Map<string, WorldOperation>();
    let selectedObjectId = body.context.selectedObjectId;
    let lastCreatedObjectId = body.context.lastCreatedObjectId;
    let clarifyMessage: string | null = null;

    const getObjectByAlias = (objectAlias: string) => {
      const objectId = aliasToId.get(objectAlias);
      if (!objectId) {
        throw new Error(`Unknown object alias "${objectAlias}".`);
      }
      const object = objectsById.get(objectId);
      if (!object) {
        throw new Error(`Object "${objectAlias}" could not be found.`);
      }
      return object;
    };

    const upsertCreate = (object: PlacedGeneratedObject) => {
      pending.set(object.id, { type: "create", object: clonePlacedObject(object) });
    };

    const upsertUpdate = (object: PlacedGeneratedObject) => {
      const existing = pending.get(object.id);
      if (existing?.type === "create") {
        pending.set(object.id, {
          type: "create",
          object: clonePlacedObject(object),
        });
        return;
      }

      pending.set(object.id, { type: "update", object: clonePlacedObject(object) });
    };

    const applyDelete = (objectId: string) => {
      const existing = pending.get(objectId);
      if (existing?.type === "create") {
        pending.delete(objectId);
      } else {
        pending.set(objectId, { type: "delete", objectId });
      }
      objectsById.delete(objectId);
      if (selectedObjectId === objectId) {
        selectedObjectId = null;
      }
      if (lastCreatedObjectId === objectId) {
        lastCreatedObjectId = null;
      }
    };

    const findObjectsTool = tool({
      description:
        "Find room objects by a natural language query such as 'car', 'tree', 'selected', 'last created', or 'nearest'.",
      inputSchema: z
        .object({
          query: z.string().min(1).max(80),
        })
        .strict(),
      execute: async ({ query }) => {
        const lower = query.toLowerCase();
        const results = catalog
          .map((item) => {
            let score = 0;
            if (item.isSelected && /selected|that|it/.test(lower)) score += 5;
            if (item.isLastCreated && /last|recent|it|that/.test(lower)) score += 4;
            if (item.object.label.toLowerCase().includes(lower)) score += 6;
            if (item.object.prompt.toLowerCase().includes(lower)) score += 4;
            if (item.object.createdBy.toLowerCase().includes(lower)) score += 1;
            if (/nearest|closest|near me/.test(lower)) {
              score += Math.max(0, 3 - item.distanceToPlayer / 2);
            }
            return { ...item, score };
          })
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score || a.distanceToPlayer - b.distanceToPlayer)
          .slice(0, 5)
          .map((item) => ({
            alias: item.alias,
            id: item.object.id,
            label: item.object.label,
            distanceToPlayer: round(item.distanceToPlayer, 2),
            createdBy: item.object.createdBy,
          }));

        return { matches: results };
      },
    });

    const requestClarificationTool = tool({
      description:
        "Ask a short clarification question when the target object is ambiguous or missing. Do not call any mutating tools after this.",
      inputSchema: z
        .object({
          question: z.string().min(1).max(180),
        })
        .strict(),
      execute: async ({ question }) => {
        clarifyMessage = question;
        return { question };
      },
    });

    const createObjectTool = tool({
      description:
        "Create a brand-new object near the player from a natural language prompt.",
      inputSchema: z
        .object({
          prompt: z.string().min(1).max(240),
        })
        .strict(),
      execute: async ({ prompt }) => {
        const definition = await generateSceneObjectFromPrompt(prompt);
        const object: PlacedGeneratedObject = {
          id: nanoid(),
          prompt,
          label: definition.label,
          createdAt: Date.now(),
          createdBy: body.player.name,
          transform: {
            position: createSpawnPosition(
              body.player.position,
              body.player.rotationY,
            ),
            rotation: [0, body.player.rotationY, 0],
            scale: [1, 1, 1],
          },
          definition,
        };

        objectsById.set(object.id, object);
        upsertCreate(object);
        selectedObjectId = object.id;
        lastCreatedObjectId = object.id;

        return {
          objectId: object.id,
          label: object.label,
        };
      },
    });

    const replaceObjectTool = tool({
      description:
        "Replace an existing room object with a new object generated from a prompt while keeping its transform.",
      inputSchema: z
        .object({
          objectAlias: z.string().min(1).max(20),
          prompt: z.string().min(1).max(240),
        })
        .strict(),
      execute: async ({ objectAlias, prompt }) => {
        const current = getObjectByAlias(objectAlias);
        const definition = await generateSceneObjectFromPrompt(prompt);
        const updated: PlacedGeneratedObject = {
          ...current,
          prompt,
          label: definition.label,
          definition,
        };
        objectsById.set(updated.id, updated);
        upsertUpdate(updated);
        selectedObjectId = updated.id;

        return {
          objectId: updated.id,
          label: updated.label,
        };
      },
    });

    const scaleObjectTool = tool({
      description:
        "Resize an existing object by multiplying its current transform scale by a factor.",
      inputSchema: z
        .object({
          objectAlias: z.string().min(1).max(20),
          factor: z.number(),
        })
        .strict(),
      execute: async ({ objectAlias, factor }) => {
        const current = getObjectByAlias(objectAlias);
        const safeFactor = clamp(factor, 0.35, 3);
        const nextScale = current.transform.scale.map((value) =>
          round(clamp(value * safeFactor, 0.2, 6)),
        ) as Vec3;

        const updated: PlacedGeneratedObject = {
          ...current,
          transform: {
            ...current.transform,
            scale: nextScale,
          },
        };

        objectsById.set(updated.id, updated);
        upsertUpdate(updated);
        selectedObjectId = updated.id;

        return {
          objectId: updated.id,
          label: updated.label,
          scale: updated.transform.scale,
        };
      },
    });

    const recolorObjectTool = tool({
      description:
        "Change the visible color of an object by recoloring all of its parts.",
      inputSchema: z
        .object({
          objectAlias: z.string().min(1).max(20),
          color: z.string().min(1).max(30),
        })
        .strict(),
      execute: async ({ objectAlias, color }) => {
        const current = getObjectByAlias(objectAlias);
        const nextColor = normalizeColor(color);
        const updated: PlacedGeneratedObject = {
          ...current,
          definition: {
            ...cloneDefinition(current),
            parts: current.definition.parts.map((part) => ({
              ...part,
              material: {
                ...part.material,
                color: nextColor,
              },
            })),
          },
        };

        objectsById.set(updated.id, updated);
        upsertUpdate(updated);
        selectedObjectId = updated.id;

        return {
          objectId: updated.id,
          label: updated.label,
          color: nextColor,
        };
      },
    });

    const moveObjectTool = tool({
      description:
        "Move an object relative to the player or vertically in the world.",
      inputSchema: z
        .object({
          objectAlias: z.string().min(1).max(20),
          relation: z.enum([
            "left",
            "right",
            "forward",
            "backward",
            "ahead",
            "behind",
            "closer",
            "farther",
            "up",
            "down",
          ]),
          distance: z.number(),
        })
        .strict(),
      execute: async ({ objectAlias, relation, distance }) => {
        const current = getObjectByAlias(objectAlias);
        const amount = clamp(Math.abs(distance), 0.25, 8);
        const [x, y, z] = current.transform.position;
        const rotationY = body.player.rotationY;

        let nextPosition: Vec3 = [x, y, z];

        if (relation === "up" || relation === "down") {
          nextPosition = [
            x,
            round(clamp(y + (relation === "up" ? amount : -amount), 0, 10)),
            z,
          ];
        } else if (relation === "closer" || relation === "farther") {
          const dx = body.player.position[0] - x;
          const dz = body.player.position[2] - z;
          const length = Math.hypot(dx, dz) || 1;
          const direction = relation === "closer" ? 1 : -1;
          nextPosition = [
            round(x + (dx / length) * amount * direction),
            y,
            round(z + (dz / length) * amount * direction),
          ];
        } else {
          const basis =
            relation === "left"
              ? [-Math.cos(rotationY), Math.sin(rotationY)]
              : relation === "right"
                ? [Math.cos(rotationY), -Math.sin(rotationY)]
                : relation === "backward" || relation === "behind"
                  ? [-Math.sin(rotationY), -Math.cos(rotationY)]
                  : [Math.sin(rotationY), Math.cos(rotationY)];

          nextPosition = [
            round(x + basis[0] * amount),
            y,
            round(z + basis[1] * amount),
          ];
        }

        const updated: PlacedGeneratedObject = {
          ...current,
          transform: {
            ...current.transform,
            position: nextPosition,
          },
        };

        objectsById.set(updated.id, updated);
        upsertUpdate(updated);
        selectedObjectId = updated.id;

        return {
          objectId: updated.id,
          label: updated.label,
          position: updated.transform.position,
        };
      },
    });

    const deleteObjectTool = tool({
      description: "Delete an object from the room.",
      inputSchema: z
        .object({
          objectAlias: z.string().min(1).max(20),
        })
        .strict(),
      execute: async ({ objectAlias }) => {
        const current = getObjectByAlias(objectAlias);
        applyDelete(current.id);
        return {
          objectId: current.id,
          label: current.label,
        };
      },
    });

    const worldAgent = new ToolLoopAgent({
      model: openai("gpt-5.4"),
      instructions: `You are Castly's multiplayer world editing agent.

Your job is to understand scene-editing commands and use tools to update the shared world.

Rules:
- Use tools to make changes. Do not describe changes without calling a tool.
- Prefer editing an existing object over creating a new one when the user says things like "make it bigger", "change it", "remove it", or "make the car red".
- Use the selected object first for pronouns like "it" and "that", then the last-created object.
- If the user names an object like "the car" or "the tree", use findObjects when needed before mutating.
- If the request is genuinely ambiguous, call requestClarification and stop.
- For "bigger" use a factor around 1.35. For "smaller" use a factor around 0.72 unless the user specifies a size.
- For "change X to Y" or "turn it into Y", use replaceObject.
- For "make it red" or similar, use recolorObject.
- For move commands such as "move it closer" or "put it behind me", use moveObject.
- If the user asks to create something new, use createObject.
- Keep responses short and practical.`,
      tools: {
        inspectWorld: tool({
          description: "Inspect the current room objects and targeting context.",
          inputSchema: z.object({}).strict(),
          execute: async () => ({
            selectedObjectAlias:
              catalog.find((item) => item.object.id === selectedObjectId)?.alias ??
              null,
            lastCreatedObjectAlias:
              catalog.find((item) => item.object.id === lastCreatedObjectId)?.alias ??
              null,
            objects: catalog.map((item) => ({
              alias: item.alias,
              label: item.object.label,
              createdBy: item.object.createdBy,
              distanceToPlayer: round(item.distanceToPlayer, 2),
              isSelected: item.isSelected,
              isLastCreated: item.isLastCreated,
            })),
          }),
        }),
        findObjects: findObjectsTool,
        requestClarification: requestClarificationTool,
        createObject: createObjectTool,
        replaceObject: replaceObjectTool,
        scaleObject: scaleObjectTool,
        recolorObject: recolorObjectTool,
        moveObject: moveObjectTool,
        deleteObject: deleteObjectTool,
      },
      temperature: 0.2,
      stopWhen: stepCountIs(6),
      prepareStep: async ({ stepNumber }) => {
        if (stepNumber === 0) {
          return {
            toolChoice: "required",
          };
        }

        return {};
      },
    });

    const result = await worldAgent.generate({
      prompt: buildPromptContext(
        body.prompt,
        catalog,
        body.context.selectedObjectId,
        body.context.lastCreatedObjectId,
        body.context.recentCommands,
      ),
    });

    const operations = Array.from(pending.values());
    const status: WorldCommandResponse["status"] = clarifyMessage
      ? "clarify"
      : operations.length > 0
        ? "applied"
        : "no_change";

    const response = worldCommandResponseSchema.parse({
      status,
      message:
        clarifyMessage ??
        (operations.length > 0
          ? result.text.trim() || "Applied changes."
          : result.text.trim() || "No shared world change was applied."),
      selectedObjectId,
      lastCreatedObjectId,
      operations,
    });

    return Response.json(response);
  } catch (error) {
    console.error("World command agent failed", error);

    return Response.json(
      {
        status: "clarify",
        message:
          error instanceof Error
            ? error.message
            : "I couldn't understand that change request.",
        selectedObjectId: null,
        lastCreatedObjectId: null,
        operations: [],
      } satisfies WorldCommandResponse,
      { status: 400 },
    );
  }
}
