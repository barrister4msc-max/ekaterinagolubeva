import { describe, expect, test } from "bun:test";
import { createGeminiAdapter, createOpenAiAdapter } from "../functions/_shared/ai/provider-adapters.ts";
import { getModelDescriptor, evaluateModelEligibility } from "../functions/_shared/ai/model-registry.ts";
import { getModelPolicy } from "../functions/_shared/ai/model-policy.ts";
import { getLocalProviderState } from "../functions/_shared/ai/provider-registry.ts";
import type { ModelDescriptor, ProviderState } from "../functions/_shared/ai/model-types.ts";

const checkedProvider: ProviderState = {
  registered: true,
  configured: true,
  authorized: true,
  model_available: true,
  reachable: true,
  checked_at: "2026-08-28T00:00:00.000Z",
};

function descriptor(provider: "gemini" | "openai", model: string): ModelDescriptor {
  const found = getModelDescriptor({ provider, model });
  if (!found) throw new Error(`missing fixture descriptor: ${provider}/${model}`);
  return found;
}

describe("P1-A Provider / Model Capability Foundation", () => {
  test("local provider health checks configuration without treating a key as authorization", () => {
    const state = getLocalProviderState("openai", (name) => name === "OPENAI_API_KEY" ? "configured" : undefined, "2026-08-28T00:00:00.000Z");

    expect(state).toEqual({
      registered: true,
      configured: true,
      authorized: null,
      model_available: null,
      reachable: null,
      checked_at: "2026-08-28T00:00:00.000Z",
    });
  });

  test("does not inherit Gemini production baseline approval to an OpenAI reserve", () => {
    const policy = getModelPolicy("classification");
    const baseline = evaluateModelEligibility({
      descriptor: descriptor("gemini", "gemini-2.5-flash"),
      policy,
      provider_state: checkedProvider,
      adapter_registered: true,
      production_baseline_approvals: [{ provider: "gemini", model: "gemini-2.5-flash", task_type: "classification" }],
      benchmark_approvals: [],
      remaining_budget_allows_attempt: true,
      policy_allows_model: true,
    });
    const reserve = evaluateModelEligibility({
      descriptor: descriptor("openai", "gpt-5.6-luna"),
      policy,
      provider_state: checkedProvider,
      adapter_registered: true,
      production_baseline_approvals: [{ provider: "gemini", model: "gemini-2.5-flash", task_type: "classification" }],
      benchmark_approvals: [],
      remaining_budget_allows_attempt: true,
      policy_allows_model: true,
    });

    expect(baseline.eligible).toBe(true);
    expect(reserve.eligible).toBe(false);
    expect(reserve.reasons).toContain("no_task_approval");
  });

  test("requires adapter, verified model availability, budget and capability floor", () => {
    const result = evaluateModelEligibility({
      descriptor: descriptor("gemini", "gemini-2.5-flash-lite"),
      policy: getModelPolicy("legal_research"),
      provider_state: { ...checkedProvider, model_available: null },
      adapter_registered: false,
      production_baseline_approvals: [],
      benchmark_approvals: [],
      remaining_budget_allows_attempt: false,
      policy_allows_model: false,
    });

    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      "adapter_unregistered",
      "model_not_available",
      "missing_required_capability",
      "tier_below_policy_floor",
      "no_task_approval",
      "remaining_budget_insufficient",
      "model_not_allowed_by_policy",
    ]));
  });

  test("does not mark an unreachable provider eligible even with fresh authorization and model state", () => {
    const result = evaluateModelEligibility({
      descriptor: descriptor("gemini", "gemini-2.5-flash"),
      policy: getModelPolicy("classification"),
      provider_state: { ...checkedProvider, reachable: false },
      adapter_registered: true,
      production_baseline_approvals: [{ provider: "gemini", model: "gemini-2.5-flash", task_type: "classification" }],
      benchmark_approvals: [],
      remaining_budget_allows_attempt: true,
      policy_allows_model: true,
    });

    expect(result).toEqual({ eligible: false, reasons: ["provider_unreachable"] });
  });

  test("OpenAI adapter decodes every raw Responses output_text content item in order", async () => {
    const adapter = createOpenAiAdapter({
      readEnv: () => "secret-value",
      fetchFn: async () => new Response(JSON.stringify({
        // `output_text` is not the raw REST contract and must not win over `output`.
        output_text: '{"ok":false}',
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: '{"ok":' },
              { type: "refusal", refusal: "ignored" },
            ],
          },
          {
            type: "message",
            content: [{ type: "output_text", text: "true}" }],
          },
        ],
        usage: { input_tokens: 11, output_tokens: 5, input_tokens_details: { cached_tokens: 3 } },
      }), { status: 200 }),
    });

    const result = await adapter.runJson({ model: "gpt-5.6-luna", prompt: "safe fixture", signal: new AbortController().signal });
    expect(result).toMatchObject({
      provider: "openai",
      model: "gpt-5.6-luna",
      output: { ok: true },
      json_valid: true,
      input_tokens: 11,
      output_tokens: 5,
      cached_input_tokens: 3,
      estimated_cost_usd: null,
    });
  });

  test("OpenAI adapter fails closed when a raw Responses output array has no output_text", async () => {
    const adapter = createOpenAiAdapter({
      readEnv: () => "secret-value",
      fetchFn: async () => new Response(JSON.stringify({
        output_text: '{"must_not_be_used":true}',
        output: [{ type: "message", content: [{ type: "refusal", refusal: "ignored" }] }],
      }), { status: 200 }),
    });

    const result = await adapter.runJson({ model: "gpt-5.6-luna", prompt: "safe fixture", signal: new AbortController().signal });
    expect(result.json_valid).toBe(false);
    expect(result.provider_error?.code).toBe("invalid_response");
  });

  test("level-2 availability check makes no inference request and distinguishes access from model absence", async () => {
    let method = "";
    let body: BodyInit | null | undefined;
    const adapter = createOpenAiAdapter({
      readEnv: () => "secret-value",
      fetchFn: async (_url, init) => {
        method = init?.method ?? "";
        body = init?.body;
        return new Response("{}", { status: 404 });
      },
    });
    const result = await adapter.checkModelAvailability({ model: "gpt-5.6-luna", signal: new AbortController().signal });

    expect(method).toBe("GET");
    expect(body).toBeUndefined();
    expect(result).toMatchObject({ authorized: true, model_available: false, reachable: true });
  });

  test.each([
    [429, "rate_limited", true],
    [401, "unauthorized", false],
    [403, "forbidden", false],
    [404, "model_unavailable", false],
  ])("OpenAI adapter classifies HTTP %i without leaking provider bodies", async (status, code, retryable) => {
    const adapter = createOpenAiAdapter({
      readEnv: () => "secret-value",
      fetchFn: async () => new Response('{"error":"do-not-leak"}', { status }),
    });
    const result = await adapter.runJson({ model: "gpt-5.6-luna", prompt: "safe fixture", signal: new AbortController().signal });

    expect(result.provider_error).toMatchObject({ code, retryable, status_code: status });
    expect(result.validation_errors?.join(" ")).not.toContain("do-not-leak");
    expect(result.estimated_cost_usd).toBeNull();
  });

  test("adapter fails closed on malformed JSON and preserves AbortSignal to fetch", async () => {
    let receivedSignal: AbortSignal | undefined;
    const adapter = createGeminiAdapter({
      readEnv: () => "gemini-secret",
      fetchFn: async (_url, init) => {
        receivedSignal = init?.signal ?? undefined;
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: "not-json" }] } }],
          usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2, cachedContentTokenCount: 1 },
        }), { status: 200 });
      },
    });
    const controller = new AbortController();
    const result = await adapter.runJson({ model: "gemini-2.5-flash", prompt: "safe fixture", signal: controller.signal });

    expect(receivedSignal).toBe(controller.signal);
    expect(result.json_valid).toBe(false);
    expect(result.provider_error?.code).toBe("invalid_response");
    expect(result.input_tokens).toBe(7);
    expect(result.cached_input_tokens).toBe(1);
  });

  test("Gemini keeps its API key out of availability and inference URLs", async () => {
    const requests: Array<{ url: string; headers: Headers }> = [];
    const adapter = createGeminiAdapter({
      readEnv: () => "gemini-super-secret",
      fetchFn: async (url, init) => {
        requests.push({ url: String(url), headers: new Headers(init?.headers) });
        if (init?.method === "GET") return new Response("{}", { status: 200 });
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: "{}" }] } }],
        }), { status: 200 });
      },
    });

    await adapter.checkModelAvailability({ model: "gemini-2.5-flash", signal: new AbortController().signal });
    await adapter.runJson({ model: "gemini-2.5-flash", prompt: "safe fixture", signal: new AbortController().signal });

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.url).not.toContain("gemini-super-secret");
      expect(request.headers.get("x-goog-api-key")).toBe("gemini-super-secret");
    }
  });

  test("timeout is retryable and exposes no prompt or API key", async () => {
    const adapter = createGeminiAdapter({
      readEnv: () => "gemini-super-secret",
      fetchFn: async () => {
        throw new DOMException("aborted", "AbortError");
      },
    });
    const result = await adapter.runJson({
      model: "gemini-2.5-flash",
      prompt: "OCR-CONFIDENTIAL",
      signal: new AbortController().signal,
    });

    expect(result.provider_error).toMatchObject({ code: "timeout", retryable: true });
    expect(JSON.stringify(result)).not.toContain("gemini-super-secret");
    expect(JSON.stringify(result)).not.toContain("OCR-CONFIDENTIAL");
  });
});
