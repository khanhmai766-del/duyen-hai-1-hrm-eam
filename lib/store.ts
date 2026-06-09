import { create } from "zustand";

/** Global UI state (Zustand). Server data lives in TanStack Query. */
interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  deviceView: string;
  setDeviceView: (v: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  deviceView: "table",
  setDeviceView: (v) => set({ deviceView: v }),
}));
