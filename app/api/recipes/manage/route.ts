import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { api } from "../../../../convex/_generated/api";

export async function POST(req: Request) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ error: "Convex not configured" }, { status: 500 });
  }

  const { recipeId, userId, action, status } = (await req.json()) as {
    recipeId?: string;
    userId?: string;
    action?: "setStatus" | "delete";
    status?: "active" | "paused";
  };

  if (!recipeId || !userId || !action) {
    return NextResponse.json(
      { error: "recipeId, userId, and action are required" },
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

    if (action === "setStatus") {
      if (!status) {
        return NextResponse.json({ error: "status is required" }, { status: 400 });
      }

      if (recipe.mode === "trigger" && recipe.triggerId) {
        if (status === "paused") {
          await composio.triggers.disable(recipe.triggerId);
        } else {
          await composio.triggers.enable(recipe.triggerId);
        }
      }

      await convex.mutation(api.recipes.setStatus, {
        recipeId: recipeId as never,
        status,
      });

      return NextResponse.json({ success: true });
    }

    if (recipe.mode === "trigger" && recipe.triggerId) {
      await composio.triggers.delete(recipe.triggerId);
    }

    await convex.mutation(api.recipes.remove, {
      recipeId: recipeId as never,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
