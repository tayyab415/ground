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

type WebMcpToolExecuteOptions = {
  signal?: AbortSignal;
};

type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: WebMcpInputSchema;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  execute: (
    input?: unknown,
    options?: WebMcpToolExecuteOptions,
  ) => unknown | Promise<unknown>;
};

type WebMcpContext = {
  registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => Promise<unknown>;
  executeTool?: (tool: unknown, input?: unknown, options?: WebMcpToolExecuteOptions) => Promise<unknown>;
  getTools?: (options?: { fromOrigins?: string[] }) => Promise<unknown[]>;
};

interface Document {
  modelContext?: WebMcpContext;
}

interface Navigator {
  modelContext?: WebMcpContext;
}
