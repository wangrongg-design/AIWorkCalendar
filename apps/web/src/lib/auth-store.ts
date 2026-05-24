"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AuthUser } from "./types";

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      clearSession: () => set({ token: null, user: null })
    }),
    { name: "work-calendar-ai-auth" }
  )
);

export function hasAnyRole(user: AuthUser | null, roles: string[]) {
  return Boolean(user?.roles.some((role) => roles.includes(role)));
}

