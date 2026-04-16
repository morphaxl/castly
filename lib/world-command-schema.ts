import { z } from "zod";

import {
  aiGeneratedObjectSchema,
  vec3TupleSchema,
  type GeneratedSceneDefinition,
  type PlacedGeneratedObject,
  type Vec3,
} from "@/lib/ai-object-schema";

export const worldCommandContextSchema = z
  .object({
    selectedObjectId: z.string().nullable(),
    lastCreatedObjectId: z.string().nullable(),
    recentCommands: z
      .array(
        z
          .object({
            prompt: z.string().min(1).max(240),
            targetObjectId: z.string().nullable(),
            timestamp: z.number(),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

export const worldCommandRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(240),
    player: z
      .object({
        name: z.string().min(1).max(40),
        color: z.string().min(1).max(20),
        position: vec3TupleSchema,
        rotationY: z.number(),
      })
      .strict(),
    context: worldCommandContextSchema,
    objects: z.array(
      z
        .object({
          id: z.string().min(1),
          prompt: z.string().min(1).max(240),
          label: z.string().min(1).max(60),
          createdAt: z.number(),
          createdBy: z.string().min(1).max(40),
          transform: z
            .object({
              position: vec3TupleSchema,
              rotation: vec3TupleSchema,
              scale: vec3TupleSchema,
            })
            .strict(),
          definition: aiGeneratedObjectSchema,
        })
        .strict(),
    ),
  })
  .strict();

const placedGeneratedObjectSchema = z
  .object({
    id: z.string().min(1),
    prompt: z.string().min(1).max(240),
    label: z.string().min(1).max(60),
    createdAt: z.number(),
    createdBy: z.string().min(1).max(40),
    transform: z
      .object({
        position: vec3TupleSchema,
        rotation: vec3TupleSchema,
        scale: vec3TupleSchema,
      })
      .strict(),
    definition: aiGeneratedObjectSchema,
  })
  .strict();

export const worldOperationSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("create"),
      object: placedGeneratedObjectSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("update"),
      object: placedGeneratedObjectSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("delete"),
      objectId: z.string().min(1),
    })
    .strict(),
]);

export const worldCommandResponseSchema = z
  .object({
    status: z.enum(["applied", "clarify", "no_change"]),
    message: z.string().min(1).max(240),
    selectedObjectId: z.string().nullable(),
    lastCreatedObjectId: z.string().nullable(),
    operations: z.array(worldOperationSchema),
  })
  .strict();

export type WorldCommandContext = z.infer<typeof worldCommandContextSchema>;
export type WorldCommandRequest = z.infer<typeof worldCommandRequestSchema>;
export type WorldOperation = z.infer<typeof worldOperationSchema>;
export type WorldCommandResponse = z.infer<typeof worldCommandResponseSchema>;

export const clonePlacedObject = (
  object: PlacedGeneratedObject,
): PlacedGeneratedObject => ({
  ...object,
  transform: {
    position: [...object.transform.position] as Vec3,
    rotation: [...object.transform.rotation] as Vec3,
    scale: [...object.transform.scale] as Vec3,
  },
  definition: JSON.parse(
    JSON.stringify(object.definition),
  ) as GeneratedSceneDefinition,
});
