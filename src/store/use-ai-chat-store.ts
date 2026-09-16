import { create } from "zustand";

interface AiChatState {
  activeThreadId: string | null;
  isStreaming: boolean;
  setActiveThreadId: (id: string | null) => void;
  setStreaming: (streaming: boolean) => void;
}

export const useAiChatStore = create<AiChatState>((set) => ({
  activeThreadId: null,
  isStreaming: false,
  setActiveThreadId: (id) => set({ activeThreadId: id }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
}));
