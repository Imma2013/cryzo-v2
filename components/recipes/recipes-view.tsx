"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

type RecipesViewProps = {
  userId: string | null;
};

function formatDate(value?: string) {
  if (!value) return "Not scheduled";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatJson(value: unknown) {
  if (value == null) return "None";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function RecipesView({ userId }: RecipesViewProps) {
  const recipes = useQuery(api.recipes.list, userId ? { userId } : "skip");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    if (!recipes || recipes.length === 0) {
      setSelectedRecipeId(null);
      return;
    }

    if (!selectedRecipeId || !recipes.some((recipe) => String(recipe._id) === selectedRecipeId)) {
      setSelectedRecipeId(String(recipes[0]._id));
    }
  }, [recipes, selectedRecipeId]);

  const selectedRecipe = useMemo(
    () => recipes?.find((recipe) => String(recipe._id) === selectedRecipeId) ?? null,
    [recipes, selectedRecipeId],
  );

  const executions = useQuery(
    api.recipes.listExecutions,
    userId && selectedRecipe
      ? {
          recipeId: selectedRecipe._id,
          userId,
          limit: 8,
        }
      : "skip",
  );

  const activeCount = recipes?.filter((recipe) => recipe.status === "active").length ?? 0;

  async function toggleRecipeStatus() {
    if (!selectedRecipe || !userId) return;
    setIsMutating(true);
    try {
      await fetch("/api/recipes/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeId: String(selectedRecipe._id),
          userId,
          action: "setStatus",
          status: selectedRecipe.status === "active" ? "paused" : "active",
        }),
      });
    } finally {
      setIsMutating(false);
    }
  }

  async function handleDelete() {
    if (!selectedRecipe || !userId) return;
    setIsMutating(true);
    try {
      await fetch("/api/recipes/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeId: String(selectedRecipe._id),
          userId,
          action: "delete",
        }),
      });
      setSelectedRecipeId(null);
    } finally {
      setIsMutating(false);
    }
  }

  async function handleRunNow() {
    if (!selectedRecipe || !userId) return;
    setIsRunning(true);
    setRunError(null);
    try {
      const res = await fetch("/api/recipes/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeId: String(selectedRecipe._id),
          userId,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "Failed to run recipe");
      }
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
    }
  }

  if (!userId) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-50 p-6">
      <div className="mx-auto flex h-full w-full max-w-7xl min-h-0 flex-col gap-6">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-black">Tasks</h2>
          <p className="mt-2 max-w-3xl text-sm text-neutral-500">
            Saved automations behave like reusable recipes underneath: definition, schedule,
            params, and execution history.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Saved tasks</p>
              <p className="mt-3 text-3xl font-semibold text-black">{recipes?.length ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Active tasks</p>
              <p className="mt-3 text-3xl font-semibold text-black">{activeCount}</p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Latest run</p>
              <p className="mt-3 text-sm font-medium text-black">
                {formatDate(selectedRecipe?.lastRunAt)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
            <div className="border-b border-neutral-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-black">Task list</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Definition, status, next run, integrations, and quick actions.
              </p>
            </div>
            <div className="max-h-full overflow-y-auto p-3">
              {!recipes ? (
                <div className="p-4 text-sm text-neutral-400">Loading tasks...</div>
              ) : recipes.length === 0 ? (
                <div className="p-4 text-sm text-neutral-400">
                  No tasks yet. Ask the agent to create a recurring automation.
                </div>
              ) : (
                <div className="space-y-3">
                  {recipes.map((recipe) => {
                    const selected = String(recipe._id) === selectedRecipeId;
                    return (
                      <button
                        key={String(recipe._id)}
                        onClick={() => setSelectedRecipeId(String(recipe._id))}
                        className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                          selected
                            ? "border-black bg-neutral-50"
                            : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-black">{recipe.title}</p>
                            <p className="mt-1 text-xs text-neutral-500">
                              {recipe.mode === "trigger" ? "Trigger task" : "Scheduled task"}
                            </p>
                          </div>
                          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
                            {recipe.status}
                          </span>
                        </div>
                        <div className="mt-4 space-y-2 text-xs text-neutral-500">
                          <p>{recipe.cronHuman || recipe.triggerSlug || "No schedule attached"}</p>
                          <p>Next run {formatDate(recipe.nextRunAt)}</p>
                          <p>
                            {(recipe.integrationSlugs ?? []).length > 0
                              ? recipe.integrationSlugs.join(", ")
                              : "No integrations tagged"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto rounded-3xl border border-neutral-200 bg-white shadow-sm">
            {!selectedRecipe ? (
              <div className="p-6 text-sm text-neutral-400">
                Select a task to inspect its recipe definition and execution history.
              </div>
            ) : (
              <div className="space-y-6 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-neutral-500">Recipe</p>
                    <h3 className="mt-2 text-2xl font-semibold text-black">
                      {selectedRecipe.title}
                    </h3>
                    <p className="mt-2 max-w-3xl text-sm text-neutral-500">
                      {selectedRecipe.description || selectedRecipe.instruction}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void handleRunNow()}
                      disabled={isRunning || isMutating}
                      className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {isRunning ? "Running..." : "Run now"}
                    </button>
                    <button
                      onClick={() => void toggleRecipeStatus()}
                      disabled={isMutating}
                      className="rounded-xl border border-neutral-200 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
                    >
                      {selectedRecipe.status === "active" ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => void handleDelete()}
                      disabled={isMutating}
                      className="rounded-xl border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {runError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {runError}
                  </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-neutral-500">Schedule</p>
                    <div className="mt-3 space-y-2 text-sm text-black">
                      <p>{selectedRecipe.cronHuman || selectedRecipe.triggerSlug || "No schedule"}</p>
                      <p>Timezone: {selectedRecipe.timezone}</p>
                      <p>Next run: {formatDate(selectedRecipe.nextRunAt)}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-neutral-500">Integrations</p>
                    <div className="mt-3 text-sm text-black">
                      {(selectedRecipe.integrationSlugs ?? []).length > 0
                        ? selectedRecipe.integrationSlugs.join(", ")
                        : "No integrations tagged"}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-neutral-200 p-4">
                    <p className="text-xs uppercase tracking-wide text-neutral-500">Input schema</p>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-neutral-700">
                      {formatJson(selectedRecipe.inputSchema)}
                    </pre>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 p-4">
                    <p className="text-xs uppercase tracking-wide text-neutral-500">Output schema</p>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-neutral-700">
                      {formatJson(selectedRecipe.outputSchema)}
                    </pre>
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-200 p-4">
                  <p className="text-xs uppercase tracking-wide text-neutral-500">Workflow code</p>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-neutral-700">
                    {selectedRecipe.workflowCode || selectedRecipe.instruction}
                  </pre>
                </div>

                <div className="rounded-2xl border border-neutral-200 p-4">
                  <p className="text-xs uppercase tracking-wide text-neutral-500">Default params</p>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-neutral-700">
                    {formatJson(selectedRecipe.defaultInputData ?? selectedRecipe.scheduleParams)}
                  </pre>
                </div>

                <div className="rounded-2xl border border-neutral-200 p-4">
                  <p className="text-xs uppercase tracking-wide text-neutral-500">Recent runs</p>
                  <div className="mt-4 space-y-3">
                    {!executions ? (
                      <div className="text-sm text-neutral-400">Loading run history...</div>
                    ) : executions.length === 0 ? (
                      <div className="text-sm text-neutral-400">No executions yet.</div>
                    ) : (
                      executions.map((execution) => (
                        <div
                          key={String(execution._id)}
                          className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium text-black">
                              {execution.source} · {execution.status}
                            </div>
                            <div className="text-xs text-neutral-500">
                              {formatDate(execution.createdAt)}
                            </div>
                          </div>
                          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-neutral-700">
                            {formatJson(
                              execution.outputData ??
                                execution.error ??
                                execution.inputData ??
                                execution.eventPayload,
                            )}
                          </pre>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
