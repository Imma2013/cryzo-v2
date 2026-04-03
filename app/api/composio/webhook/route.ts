import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { api } from "../../../../convex/_generated/api";
import { executeRecipeRun } from "../../../../lib/recipe-runner";

export async function POST(req: Request) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const webhookSecret = process.env.COMPOSIO_WEBHOOK_SECRET?.trim();

  if (!convexUrl) {
    return NextResponse.json({ error: "Convex not configured" }, { status: 500 });
  }

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "COMPOSIO_WEBHOOK_SECRET is not configured" },
      { status: 500 },
    );
  }

  const webhookId = req.headers.get("webhook-id");
  const webhookTimestamp = req.headers.get("webhook-timestamp");
  const webhookSignature = req.headers.get("webhook-signature");

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json(
      { error: "Missing webhook verification headers" },
      { status: 400 },
    );
  }

  const rawBody = await req.text();
  const composio = new Composio({ provider: new VercelProvider() });

  try {
    const verified = await composio.triggers.verifyWebhook({
      id: webhookId,
      timestamp: webhookTimestamp,
      signature: webhookSignature,
      payload: rawBody,
      secret: webhookSecret,
    });

    const convex = new ConvexHttpClient(convexUrl);
    const recipes = await convex.query(api.recipes.getTriggerRecipes, {
      userId: verified.payload.userId,
      triggerId: verified.payload.id,
      triggerSlug: verified.payload.triggerSlug,
    });

    if (recipes.length === 0) {
      return NextResponse.json({
        success: true,
        matchedRecipes: 0,
        triggerId: verified.payload.id,
        triggerSlug: verified.payload.triggerSlug,
      });
    }

    const results = [];

    for (const recipe of recipes) {
      try {
        const finalText = await executeRecipeRun({
          convex,
          composio,
          recipe,
          source: "trigger",
          triggerContext: {
            triggerId: verified.payload.id,
            triggerSlug: verified.payload.triggerSlug,
            payload: verified.payload.payload,
          },
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
      success: true,
      matchedRecipes: recipes.length,
      triggerId: verified.payload.id,
      triggerSlug: verified.payload.triggerSlug,
      results,
    });
  } catch (error) {
    console.error("Composio webhook processing failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid webhook" },
      { status: 401 },
    );
  }
}
