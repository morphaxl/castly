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
  generationRequestSchema,
  sanitizeGeneratedObject,
} from "@/lib/ai-object-schema";

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 500 },
    );
  }

  try {
    const body = await request.json();
    const { prompt } = generationRequestSchema.parse(body);
    const baseModel = wrapLanguageModel({
      model: openai("gpt-5.4"),
      middleware: extractJsonMiddleware(),
    });
    const promptExamples = `Examples:
- "insert a tree" -> a simple stylized tree using a cylinder trunk and cone or sphere foliage.
- "insert a car" -> a simple toy car using boxes for the body and four torus wheels.

Always simplify aggressively if needed.`;

    const generateDefinition = async (strictJsonSchema = true) => {
      const result = await generateText({
        model: baseModel,
        maxOutputTokens: 1400,
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
        system: `You design one stylized low-poly 3D object for a multiplayer world.

Hard rules:
- Return exactly one object that matches the schema.
- Use only these geometry types: box, sphere, cylinder, cone, capsule, torus.
- Keep the object compact, readable, and toy-like.
- All positions, rotations, and scales are local to the object, not world coordinates.
- Keep the object centered near x=0 and z=0.
- The lowest visible point should sit near y=0 so the object rests on the ground.
- Use between 1 and 12 parts.
- Favor a bold silhouette over tiny details.
- Use sensible, low-poly segment counts.
- Use flat shading.
- Every material must use hex colors.
- Use emissive only when it improves readability.

${promptExamples}`,
        prompt: `Create one recognizable object for this request: "${prompt}".

Make it feel playful and clear from a third-person distance.`,
      });

      return sanitizeGeneratedObject(result.output);
    };

    const generateDefinitionFromJson = async () => {
      const result = await generateText({
        model: baseModel,
        maxOutputTokens: 1400,
        output: Output.json({
          name: "generated_scene_object_json",
          description:
            "A JSON object describing one stylized low-poly scene object for a React Three Fiber primitive renderer.",
        }),
        system: `You design one stylized low-poly 3D object for a multiplayer world.

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

Hard rules:
- Return only one object.
- Use only the listed geometry types.
- Keep it compact, readable, and toy-like.
- Keep the object centered near x=0 and z=0.
- Lowest visible point near y=0.
- Use between 1 and 12 parts.
- Use hex colors for color and emissive.
- Use null for geometry fields that do not apply to the chosen type.

${promptExamples}`,
        prompt: `Create one recognizable object for this request: "${prompt}".

Make it feel playful and clear from a third-person distance.`,
      });

      const parsed = aiGeneratedObjectSchema.parse(result.output);
      return sanitizeGeneratedObject(parsed);
    };

    let object;

    try {
      object = await generateDefinition(true);
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error)) {
        throw error;
      }
      try {
        object = await generateDefinition(false);
      } catch (retryError) {
        if (!NoObjectGeneratedError.isInstance(retryError)) {
          throw retryError;
        }

        object = await generateDefinitionFromJson();
      }
    }

    return Response.json({ object });
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      console.error("AI object generation failed", {
        message: error.message,
        finishReason: error.finishReason,
        cause:
          error.cause instanceof Error ? error.cause.message : error.cause,
        text: error.text,
        response: error.response,
        usage: error.usage,
      });
    } else {
      console.error("AI object generation route error", error);
    }

    const message = NoObjectGeneratedError.isInstance(error)
      ? `No output generated${
          error.finishReason ? ` (${error.finishReason})` : ""
        }.`
      : error instanceof Error
        ? error.message
        : "Failed to generate object.";

    return Response.json({ error: message }, { status: 400 });
  }
}
