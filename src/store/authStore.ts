import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, Session } from "@supabase/supabase-js";
import supabase from "../lib/supabase";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      session: null,
      loading: true,
      initialized: false,

      setUser: (user) => set({ user }),

      setSession: (session) => set({ session, user: session?.user ?? null }),

      signIn: async (email: string, password: string) => {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) throw error;

          set({
            user: data.user,
            session: data.session,
            loading: false,
          });

          return { error: null };
        } catch (error) {
          return { error: error as Error };
        }
      },

      signOut: async () => {
        await supabase.auth.signOut();
        set({ user: null, session: null });
      },

      initialize: async () => {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          set({
            session,
            user: session?.user ?? null,
            loading: false,
            initialized: true,
          });

          // Listen for auth changes
          supabase.auth.onAuthStateChange((_event, session) => {
            set({
              session,
              user: session?.user ?? null,
              loading: false,
            });
          });
        } catch (error) {
          console.error("Error initializing auth:", error);
          set({ loading: false, initialized: true });
        }
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        session: state.session,
        user: state.user,
      }),
    }
  )
);
