import { useSyncExternalStore } from "react";
import { getState, subscribe } from "./store";
import type { Workspace } from "./types";

export function useWorkspace(): Workspace {
  return useSyncExternalStore(subscribe, getState, getState);
}
