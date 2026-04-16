import { openai } from "@ai-sdk/openai";
import {
  extractJsonMiddleware,
  generateText,
  NoObjectGeneratedError,
  Output,
  wrapLanguageModel,
} from "ai";
import type { OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";

import {
  aiGeneratedObjectSchema,
  sanitizeGeneratedObject,
  type GeneratedSceneDefinition,
} from "@/lib/ai-object-schema";

const promptExamples = `Examples:
- "insert a tree" -> a simple stylized tree using a cylinder trunk and cone or sphere foliage.
- "insert a car" -> a simple toy car using boxes for the body and four torus wheels.
- "make it a castle" -> a compact toy-like castle silhouette with towers and a gate.

Always simplify aggressively if needed.`;

const baseModel = wrapLanguageModel({
  model: openai("gpt-5.4"),
  middleware: extractJsonMiddleware(),
});

const systemPrompt = `You design one stylized low-poly 3D object for a multiplayer world.

Hard rules:
- Return exactly one object that matches the schema or requested JSON structure.
- Use only these geometry types: box, sphere, cylinder, cone, capsule, torus.
- Keep the object compact, readable, and toy-like.
- All positions, rotations, and scales are local to the object, not world coordinates.
- Keep the object centered near x=0 and z=0.
- The lowest visible point should sit near y=0 so the object rests on the ground.
- Use between 1 and 12 parts.
- Favor a bold silhouette over tiny details.
- Use sensible, low-poly segment counts.
- Use flat shading.
- Use hex colors for color and emissive.
- Use emissive only when it improves readability.

${promptExamples}`;

export async function generateSceneObjectFromPrompt(
  prompt: string,
): Promise<GeneratedSceneDefinition> {
  const generateDefinition = async (strictJsonSchema = true) => {
    const result = await generateText({
      model: baseModel,
      maxOutputTokens: 1400,
      temperature: 0.2,
      providerOptions: strictJsonSchema
        ? undefined
        : {
            openai: {
              strictJsonSchema: false,
            } satisfies OpenAILanguageModelResponsesOptions,
          },
      output: Output.object({
        name: "generated_scene_object",
        description:
          "A single stylized low-poly object definition for a React Three Fiber primitive renderer.",
        schema: aiGeneratedObjectSchema,
      }),
      system: systemPrompt,
      prompt: `Create one recognizable object for this request: "${prompt}".

Make it feel playful and clear from a third-person distance.`,
    });

    return sanitizeGeneratedObject(result.output);
  };

  const generateDefinitionFromJson = async () => {
    const result = await generateText({
      model: baseModel,
      maxOutputTokens: 1400,
      temperature: 0.2,
      output: Output.json({
        name: "generated_scene_object_json",
        description:
          "A JSON object describing one stylized low-poly scene object for a React Three Fiber primitive renderer.",
      }),
      system: `${systemPrompt}

Return a single JSON object with this exact structure:
{
  "label": string,
  "parts": [
    {
      "name": string,
      "geometry": {
        "type": "box" | "sphere" | "cylinder" | "cone" | "capsule" | "torus",
        "width": number | null,
        "height": number | null,
        "depth": number | null,
        "radius": number | null,
        "widthSegments": number | null,
        "heightSegments": number | null,
        "radiusTop": number | null,
        "radiusBottom": number | null,
        "radialSegments": number | null,
        "length": number | null,
        "capSegments": number | null,
        "tube": number | null,
        "tubularSegments": number | null
      },
      "material": {
        "type": "standard",
        "color": "#RRGGBB",
        "roughness": number,
        "metalness": number,
        "emissive": "#RRGGBB",
        "emissiveIntensity": number,
        "opacity": number,
        "flatShading": boolean
      },
      "position": { "x": number, "y": number, "z": number },
      "rotation": { "x": number, "y": number, "z": number },
      "scale": { "x": number, "y": number, "z": number }
    }
  ]
}

Use null for geometry fields that do not apply to the chosen type.`,
      prompt: `Create one recognizable object for this request: "${prompt}".

Make it feel playful and clear from a third-person distance.`,
    });

    const parsed = aiGeneratedObjectSchema.parse(result.output);
    return sanitizeGeneratedObject(parsed);
  };

  try {
    return await generateDefinition(true);
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error)) {
      throw error;
    }

    try {
      return await generateDefinition(false);
    } catch (retryError) {
      if (!NoObjectGeneratedError.isInstance(retryError)) {
        throw retryError;
      }

      return await generateDefinitionFromJson();
    }
  }
}
