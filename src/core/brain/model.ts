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

/** A photo or PDF you sent on purpose (Snap the fridge, a statement you uploaded): base64, read once, kept nowhere. */
export interface BrainImage {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  data: string;
}

/** A page a web answer came from. */
export interface BrainSource {
  url: string;
  title: string;
}

export interface BrainModel {
  id: string;
  model: string;
  /**
   * Research on the web for a question you asked (the trip copilot): Claude may
   * search and read pages (Anthropic's web search and fetch tools), then answers
   * in plain text with the pages it used. Only Claude has it; the answer is not
   * JSON (web answers carry citations, which a JSON answer cannot).
   */
  research?(args: { system: string; user: string; maxTokens: number; maxSearches?: number }): Promise<{ text: string; sources: BrainSource[]; searches: number; usage: BrainUsage }>;
  /** effort: how hard it thinks before answering; reading a statement wants little thought and room to answer. */
  complete(args: { system: string; user: string; maxTokens: number; schema?: Record<string, unknown>; image?: BrainImage; effort?: 'low' | 'medium' | 'high' }): Promise<{ text: string; usage: BrainUsage }>;
}
