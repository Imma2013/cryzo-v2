import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { streamText } from "ai";
import { createHash } from "crypto";
import { getAiModel } from "../../../lib/ai-model";
import { nextCronTickFromExpression } from "../../../lib/cron";

function describeSecret(secret: string | undefined) {
  const normalized = secret?.trim() ?? "";
  return {
    present: normalized.length > 0,
    length: normalized.length,
    sha256: normalized
      ? createHash("sha256").update(normalized).digest("hex").slice(0, 12)
      : null,
  };
}

export async function GET(req: Request) {
  const cronSecret =
    process.env.CRON_SECRET?.trim() || "default-cron-secret-change-me";
  const authHeader = req.headers.get("authorization")?.trim() ?? "";

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error("Cron auth mismatch", {
      provided: {
        present: authHeader.length > 0,
        length: authHeader.length,
        sha256: authHeader
          ? createHash("sha256").update(authHeader).digest("hex").slice(0, 12)
          : null,
      },
      expected: {
        bearerLength: `Bearer ${cronSecret}`.length,
        ...describeSecret(process.env.CRON_SECRET),
      },
    });
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
        const session = await composio.create(recipe.userId);
        const composioTools = await session.tools();

        const result = streamText({
          model: getAiModel({
            prompt: recipe.instruction,
            preferLarge: true,
          }),
          system: `You are Cryzo, an AI agent executing a scheduled recipe. Today is ${new Date().toLocaleDateString()}.`,
          prompt: recipe.instruction,
          tools: composioTools,
        });

        let finalText = "";
        for await (const chunk of result.textStream) {
          finalText += chunk;
        }

        const nextRun = nextCronTickFromExpression(recipe.cron, new Date());
        await convex.mutation(api.recipes.markRan, {
          recipeId: recipe._id,
          nextRunAt: nextRun ? nextRun.toISOString() : now,
          result: finalText.slice(0, 500),
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
