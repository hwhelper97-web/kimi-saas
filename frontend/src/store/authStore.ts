import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../api/client";
import type { AuthUser, BusinessType } from "../types/auth";

type RegisterInput = {
  fullName: string;
  email: string;
  password: string;
  businessName: string;
  businessType: BusinessType;
};

type State = {
  token: string | null;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
};

export const useAuthStore = create<State>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      async login(email, password) {
        const { data } = await api.post("/auth/login", { email, password });
        set({ token: data.accessToken, user: data.user });
      },
      async register(input) {
        const { data } = await api.post("/auth/register", input);
        set({ token: data.accessToken, user: data.user });
      },
      logout() {
        set({ token: null, user: null });
      },
    }),
    { name: "auth-store" }
  )
);
