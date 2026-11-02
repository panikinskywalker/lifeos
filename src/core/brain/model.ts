/**
 * What the runner needs from Claude: one request, the system part cached, the
 * answer as JSON text. `src/core/ai/brainModel.ts` is the Messages API over
 * fetch; tests pass a mock, so no test ever calls the API.
 */
export interface BrainUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** A photo you sent on purpose (Snap the fridge): base64, read once, kept nowhere. */
export interface BrainImage {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  data: string;
}

export interface BrainModel {
  id: string;
  model: string;
  complete(args: { system: string; user: string; maxTokens: number; schema?: Record<string, unknown>; image?: BrainImage }): Promise<{ text: string; usage: BrainUsage }>;
}
