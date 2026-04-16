import {
  generationRequestSchema,
} from "@/lib/ai-object-schema";
import { generateSceneObjectFromPrompt } from "@/lib/scene-generation";

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
    const object = await generateSceneObjectFromPrompt(prompt);
    return Response.json({ object });
  } catch (error) {
    console.error("AI object generation route error", error);
    const message = error instanceof Error
        ? error.message
        : "Failed to generate object.";

    return Response.json({ error: message }, { status: 400 });
  }
}
