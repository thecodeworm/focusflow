import { useCallback } from "react";
import type { SettingsPatch } from "@/types";
import { api, errorMessage } from "@/lib/ipc";
import { useApp } from "@/stores/app";
import { toast } from "@/stores/toast";

export function useUpdateSettings() {
  return useCallback(async (patch: SettingsPatch) => {
    try {
      const s = await api.settings.update(patch);
      useApp.getState().setSettings(s);
      return s;
    } catch (e) {
      toast.error(errorMessage(e));
      return null;
    }
  }, []);
}
