"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createClient } from "@/utils/supabase/client";
import type { AuthUser, LoginCredentials } from "@/types/auth";

type AuthState = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<AuthUser>;
  logout: () => Promise<void>;
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
          const supabase = createClient();
          const { error } = await supabase.auth.signInWithPassword({
            email: credentials.email,
            password: credentials.password
          });

          if (error) {
            const message = error.message.toLowerCase();
            if (message.includes("invalid login credentials")) {
              throw new Error("E-mail ou senha incorretos.");
            }
            if (message.includes("email not confirmed")) {
              throw new Error("Confirme seu e-mail antes de entrar.");
            }
            throw new Error("Não foi possível entrar agora. Tente novamente em instantes.");
          }

          const response = await fetch("/api/auth/me", {
            method: "GET",
            headers: { "Content-Type": "application/json" }
          });

          if (!response.ok) {
            await supabase.auth.signOut();
            const payload = await response.json().catch(() => null);
            throw new Error(payload?.message ?? "Não encontramos seu perfil de acesso.");
          }

          const user = (await response.json()) as AuthUser;
          set({ user, isAuthenticated: true, isLoading: false });
          return user;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },
      logout: async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        set({ user: null, isAuthenticated: false });
      }
    }),
    {
      name: "renato-cortes-auth"
    }
  )
);
