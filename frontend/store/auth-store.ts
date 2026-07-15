"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { signInMock } from "@/services/mock-auth";
import type { AuthUser, LoginCredentials } from "@/types/auth";

type AuthState = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<AuthUser>;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: async (credentials) => {
        set({ isLoading: true });
        try {
          const user = await signInMock(credentials);
          set({ user, isAuthenticated: true, isLoading: false });
          return user;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },
      logout: () => set({ user: null, isAuthenticated: false })
    }),
    {
      name: "renato-cortes-auth"
    }
  )
);
