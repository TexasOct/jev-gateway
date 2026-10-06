import { createContext, useContext } from "react";

// Mounted workspaces keep drafts during reconnect, but must suspend effects and portals.
export const WorkspaceActivity = createContext(true);
export function useWorkspaceActive() {
  return useContext(WorkspaceActivity);
}
