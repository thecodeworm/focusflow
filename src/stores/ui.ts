import { create } from "zustand";
import type { Page } from "@/types";

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface UiStore {
  page: Page;
  /** Where the Music page wants the video player drawn (null = not mounted). */
  playerSlot: Rect | null;
  setPage: (p: Page) => void;
  setPlayerSlot: (r: Rect | null) => void;
}

const PAGE_KEY = "focusflow.page";
const PAGES: Page[] = ["timer", "music", "tasks", "stats", "settings"];

function savedPage(): Page {
  try {
    const p = localStorage.getItem(PAGE_KEY) as Page | null;
    return p && PAGES.includes(p) ? p : "timer";
  } catch {
    return "timer";
  }
}

export const useUi = create<UiStore>()((set, get) => ({
  page: savedPage(),
  playerSlot: null,
  setPage: (page) => {
    set({ page });
    try {
      localStorage.setItem(PAGE_KEY, page);
    } catch {
      /* per-window convenience only */
    }
  },
  setPlayerSlot: (r) => {
    const cur = get().playerSlot;
    if (cur && r && cur.left === r.left && cur.top === r.top && cur.width === r.width && cur.height === r.height) return;
    set({ playerSlot: r });
  },
}));
