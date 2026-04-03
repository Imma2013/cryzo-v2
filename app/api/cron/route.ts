import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { nextCronTickFromExpression } from "../../../lib/cron";
import { executeRecipeRun } from "../../../lib/recipe-runner";

export async function GET(req: Request) {
  const cronSecret =
    process.env.CRON_SECRET?.trim() || "default-cron-secret-change-me";
  const authHeader = req.headers.get("authorization")?.trim() ?? "";

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ error: "Convex not configured" }, { status: 500 });
  }

  const convex = new ConvexHttpClient(convexUrl);
  const composio = new Composio({ provider: new VercelProvider() });
  const now = new Date().toISOString();

  try {
    const dueRecipes = await convex.query(api.recipes.getDueRecipes, { now });

    if (dueRecipes.length === 0) {
      return NextResponse.json({ message: "No recipes due", count: 0 });
    }

    const results = [];

    for (const recipe of dueRecipes) {
      try {
        const nextRun = recipe.cron
          ? nextCronTickFromExpression(recipe.cron, new Date())
          : null;
        const finalText = await executeRecipeRun({
          convex,
          composio,
          recipe,
          source: "schedule",
          nextRunAt: nextRun?.toISOString(),
        });

        results.push({
          recipeId: recipe._id,
          title: recipe.title,
          success: true,
          result: finalText.slice(0, 200),
        });
      } catch (error) {
        results.push({
          recipeId: recipe._id,
          title: recipe.title,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return NextResponse.json({
      message: `Executed ${dueRecipes.length} recipes`,
      count: dueRecipes.length,
      results,
    });
  } catch (error) {
    console.error("Cron dispatch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
