import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { api } from "../../../../convex/_generated/api";
import { executeRecipeRun } from "../../../../lib/recipe-runner";

export async function POST(req: Request) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ error: "Convex not configured" }, { status: 500 });
  }

  const { recipeId, userId, inputData } = (await req.json()) as {
    recipeId?: string;
    userId?: string;
    inputData?: unknown;
  };

  if (!recipeId || !userId) {
    return NextResponse.json(
      { error: "recipeId and userId are required" },
      { status: 400 },
    );
  }

  const convex = new ConvexHttpClient(convexUrl);
  const composio = new Composio({ provider: new VercelProvider() });

  try {
    const recipe = await convex.query(api.recipes.getById, {
      recipeId: recipeId as never,
      userId,
    });

    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    const output = await executeRecipeRun({
      convex,
      composio,
      recipe,
      source: "manual",
      inputData,
    });

    return NextResponse.json({
      success: true,
      recipeId,
      output,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
