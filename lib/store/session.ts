/*  Zustand-backed authentication/session store containing demo users,
    login handling, role state, persistence to local/session storage,
    hydration, logout, and actor creation. */

"use client";

import { create } from "zustand";

import type { Role, User } from "@/lib/services/types";

const anonymousUser: User = {
  id: "",
  name: "",
  email: "",
  role: "Owner",
  active: false,
};

interface SessionState {
  user: User;
  role: Role;

  setUser: (user: User) => void;
  setRole: (role: Role) => void;
  clearUser: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  user: anonymousUser,
  role: "Owner",

  setUser: (user) =>
    set({
      user,
      role: user.role,
    }),

  setRole: (role) =>
    set((state) => ({
      role,
      user: {
        ...state.user,
        role,
      },
    })),

  clearUser: () =>
    set({
      user: anonymousUser,
      role: "Owner",
    }),
}));

export function actorFromSession() {
  const { user } = useSessionStore.getState();

  return {
    id: user.id,
    name: user.name,
    role: user.role,
  };
}