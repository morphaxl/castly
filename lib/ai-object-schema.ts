import { z } from "zod";

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export type Vec3 = [number, number, number];
export const vec3TupleSchema = z.tuple([z.number(), z.number(), z.number()]);

export const vector3Schema = z
  .object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  })
  .strict();

export const geometrySchema = z
  .object({
    type: z.enum([
      "box",
      "sphere",
      "cylinder",
      "cone",
      "capsule",
      "torus",
    ]),
    width: z.number().nullable(),
    height: z.number().nullable(),
    depth: z.number().nullable(),
    radius: z.number().nullable(),
    widthSegments: z.number().nullable(),
    heightSegments: z.number().nullable(),
    radiusTop: z.number().nullable(),
    radiusBottom: z.number().nullable(),
    radialSegments: z.number().nullable(),
    length: z.number().nullable(),
    capSegments: z.number().nullable(),
    tube: z.number().nullable(),
    tubularSegments: z.number().nullable(),
  })
  .strict();

export const materialSchema = z
  .object({
    type: z.literal("standard"),
    color: z.string(),
    roughness: z.number(),
    metalness: z.number(),
    emissive: z.string(),
    emissiveIntensity: z.number(),
    opacity: z.number(),
    flatShading: z.boolean(),
  })
  .strict();

export const partSchema = z
  .object({
    name: z.string().min(1).max(40),
    geometry: geometrySchema,
    material: materialSchema,
    position: vector3Schema,
    rotation: vector3Schema,
    scale: vector3Schema,
  })
  .strict();

export const aiGeneratedObjectSchema = z
  .object({
    label: z.string().min(1).max(60),
    parts: z.array(partSchema).min(1).max(12),
  })
  .strict();

export const generationRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(240),
  })
  .strict();

export type GeneratedVector3 = z.infer<typeof vector3Schema>;
export type GeneratedGeometry = z.infer<typeof geometrySchema>;
export type GeneratedMaterial = z.infer<typeof materialSchema>;
export type GeneratedPart = z.infer<typeof partSchema>;
export type GeneratedSceneDefinition = z.infer<typeof aiGeneratedObjectSchema>;

export type PlacedGeneratedObject = {
  id: string;
  prompt: string;
  label: string;
  createdAt: number;
  createdBy: string;
  transform: {
    position: Vec3;
    rotation: Vec3;
    scale: Vec3;
  };
  definition: GeneratedSceneDefinition;
};

export const storedGeneratedObjectSchema = z
  .object({
    id: z.string().min(1),
    version: z.literal(1),
    prompt: z.string().trim().min(1).max(240),
    label: z.string().min(1).max(60),
    createdBy: z.string().trim().min(1).max(40),
    createdAt: z.number().int(),
    transform: z
      .object({
        position: vec3TupleSchema,
        rotation: vec3TupleSchema,
        scale: vec3TupleSchema,
      })
      .strict(),
    definitionJson: z.string().min(2),
  })
  .strict();

export type StoredGeneratedObject = z.infer<typeof storedGeneratedObjectSchema>;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const round = (value: number, precision = 3) => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const sanitizeColor = (value: string, fallback: string) =>
  HEX_COLOR_REGEX.test(value) ? value : fallback;

const sanitizeVector3 = (
  value: GeneratedVector3,
  limits: { min: number; max: number },
): GeneratedVector3 => ({
  x: round(clamp(value.x, limits.min, limits.max)),
  y: round(clamp(value.y, limits.min, limits.max)),
  z: round(clamp(value.z, limits.min, limits.max)),
});

const sanitizeInteger = (value: number, min: number, max: number) =>
  Math.round(clamp(value, min, max));

const emptyGeometryFields = {
  width: null,
  height: null,
  depth: null,
  radius: null,
  widthSegments: null,
  heightSegments: null,
  radiusTop: null,
  radiusBottom: null,
  radialSegments: null,
  length: null,
  capSegments: null,
  tube: null,
  tubularSegments: null,
} satisfies Omit<GeneratedGeometry, "type">;

const sanitizeGeometry = (geometry: GeneratedGeometry): GeneratedGeometry => {
  switch (geometry.type) {
    case "box":
      return {
        type: "box",
        ...emptyGeometryFields,
        width: round(clamp(geometry.width ?? 1, 0.1, 8)),
        height: round(clamp(geometry.height ?? 1, 0.1, 8)),
        depth: round(clamp(geometry.depth ?? 1, 0.1, 8)),
      };
    case "sphere":
      return {
        type: "sphere",
        ...emptyGeometryFields,
        radius: round(clamp(geometry.radius ?? 0.8, 0.08, 4)),
        widthSegments: sanitizeInteger(geometry.widthSegments ?? 10, 4, 18),
        heightSegments: sanitizeInteger(geometry.heightSegments ?? 8, 4, 18),
      };
    case "cylinder":
      return {
        type: "cylinder",
        ...emptyGeometryFields,
        radiusTop: round(clamp(geometry.radiusTop ?? 0.3, 0.05, 4)),
        radiusBottom: round(clamp(geometry.radiusBottom ?? 0.3, 0.05, 4)),
        height: round(clamp(geometry.height ?? 1.2, 0.1, 10)),
        radialSegments: sanitizeInteger(geometry.radialSegments ?? 8, 3, 18),
      };
    case "cone":
      return {
        type: "cone",
        ...emptyGeometryFields,
        radius: round(clamp(geometry.radius ?? 0.35, 0.05, 4)),
        height: round(clamp(geometry.height ?? 1.2, 0.1, 10)),
        radialSegments: sanitizeInteger(geometry.radialSegments ?? 8, 3, 18),
      };
    case "capsule":
      return {
        type: "capsule",
        ...emptyGeometryFields,
        radius: round(clamp(geometry.radius ?? 0.25, 0.05, 3)),
        length: round(clamp(geometry.length ?? 1, 0.05, 8)),
        capSegments: sanitizeInteger(geometry.capSegments ?? 4, 2, 12),
        radialSegments: sanitizeInteger(geometry.radialSegments ?? 8, 4, 18),
      };
    case "torus":
      return {
        type: "torus",
        ...emptyGeometryFields,
        radius: round(clamp(geometry.radius ?? 0.7, 0.1, 4)),
        tube: round(clamp(geometry.tube ?? 0.15, 0.02, 2)),
        radialSegments: sanitizeInteger(geometry.radialSegments ?? 8, 3, 16),
        tubularSegments: sanitizeInteger(
          geometry.tubularSegments ?? 12,
          4,
          24,
        ),
      };
  }
};

const sanitizeMaterial = (
  material: GeneratedMaterial,
): GeneratedMaterial => ({
  type: "standard",
  color: sanitizeColor(material.color, "#a3a3a3"),
  roughness: round(clamp(material.roughness, 0, 1), 2),
  metalness: round(clamp(material.metalness, 0, 1), 2),
  emissive: sanitizeColor(material.emissive, "#000000"),
  emissiveIntensity: round(clamp(material.emissiveIntensity, 0, 2.5), 2),
  opacity: round(clamp(material.opacity, 0.2, 1), 2),
  flatShading: material.flatShading,
});

const sanitizePart = (part: GeneratedPart): GeneratedPart => ({
  name: part.name.trim().slice(0, 40) || "part",
  geometry: sanitizeGeometry(part.geometry),
  material: sanitizeMaterial(part.material),
  position: sanitizeVector3(part.position, { min: -12, max: 12 }),
  rotation: sanitizeVector3(part.rotation, {
    min: -Math.PI * 2,
    max: Math.PI * 2,
  }),
  scale: sanitizeVector3(part.scale, { min: 0.1, max: 6 }),
});

export const toVec3Tuple = (vector: GeneratedVector3): Vec3 => [
  vector.x,
  vector.y,
  vector.z,
];

export const sanitizeGeneratedObject = (
  definition: GeneratedSceneDefinition,
): GeneratedSceneDefinition => ({
  label: definition.label.trim().slice(0, 60) || "Generated Object",
  parts: definition.parts.slice(0, 12).map(sanitizePart),
});

export const serializeGeneratedObjectDefinition = (
  definition: GeneratedSceneDefinition,
) => JSON.stringify(definition);

export const parseStoredGeneratedObject = (
  value: unknown,
): PlacedGeneratedObject | null => {
  const storedResult = storedGeneratedObjectSchema.safeParse(value);
  if (!storedResult.success) {
    return null;
  }

  try {
    const parsedDefinition = JSON.parse(storedResult.data.definitionJson);
    const definitionResult = aiGeneratedObjectSchema.safeParse(parsedDefinition);

    if (!definitionResult.success) {
      return null;
    }

    return {
      id: storedResult.data.id,
      prompt: storedResult.data.prompt,
      label: storedResult.data.label,
      createdAt: storedResult.data.createdAt,
      createdBy: storedResult.data.createdBy,
      transform: storedResult.data.transform,
      definition: definitionResult.data,
    };
  } catch {
    return null;
  }
};
