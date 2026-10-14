import { create } from "zustand";
import type { Task } from "@/types";
import { api, errorMessage } from "@/lib/ipc";
import { toast } from "./toast";

interface TaskStore {
  tasks: Task[];
  loaded: boolean;
  refresh: () => Promise<void>;
}

export const useTasks = create<TaskStore>()((set) => ({
  tasks: [],
  loaded: false,
  refresh: async () => {
    try {
      const tasks = await api.tasks.list();
      set({ tasks, loaded: true });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  },
}));
