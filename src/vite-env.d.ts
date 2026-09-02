/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANALYSIS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type WebMcpInputSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: WebMcpInputSchema;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
};

type WebMcpContext = {
  registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => Promise<unknown>;
};

interface Document {
  modelContext?: WebMcpContext;
}

interface Navigator {
  modelContext?: WebMcpContext;
}
