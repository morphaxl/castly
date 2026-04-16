import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";

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

    const result = await generateText({
      model: openai("gpt-5.4"),
      maxOutputTokens: 1400,
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
- Use emissive only when it improves readability.`,
      prompt: `Create one recognizable object for this request: "${prompt}".

Make it feel playful and clear from a third-person distance.`,
    });

    const object = sanitizeGeneratedObject(result.output);

    return Response.json({ object });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate object.";

    return Response.json({ error: message }, { status: 400 });
  }
}
