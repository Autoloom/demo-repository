"use client";

import { create } from "zustand";

import type { Role, User } from "@/lib/services/types";

const SESSION_KEY = "cableos2:session";

export type DemoUser = User & {
  password: string;
  description: string;
};

type StoredSession = {
  isAuthenticated: true;
  role: Role;
  user: User;
  authMode: "demo";
};

interface SessionState {
  hydrated: boolean;
  isAuthenticated: boolean;
  role: Role;
  user: User;
  signIn: (user: DemoUser, keepSignedIn: boolean) => void;
  signOut: () => void;
  setRole: (role: Role) => void;
  hydrate: () => void;
}

export const demoUsers: DemoUser[] = [
  {
    id: "USR-001",
    name: "Asha Owner",
    email: "owner@cableos.in",
    role: "Owner",
    active: true,
    password: "demo-owner",
    description: "Full oversight, approvals, settings, and interventions.",
  },
  {
    id: "USR-002",
    name: "Ravi Sales",
    email: "sales@cableos.in",
    role: "Sales",
    active: true,
    password: "demo-sales",
    description: "Inquiries, contacts, compliance, and quote creation.",
  },
  {
    id: "USR-003",
    name: "Meera Ops",
    email: "ops@cableos.in",
    role: "Operations",
    active: true,
    password: "demo-ops",
    description: "Orders, job cards, dispatch, and production handoffs.",
  },
  {
    id: "USR-004",
    name: "Kabir Accounts",
    email: "accounts@cableos.in",
    role: "Accounts",
    active: true,
    password: "demo-accounts",
    description: "Invoices, credit exposure, compliance view, and syncs.",
  },
];

const usersByRole = demoUsers.reduce<Record<Role, DemoUser>>(
  (users, user) => ({ ...users, [user.role]: user }),
  {} as Record<Role, DemoUser>,
);

const anonymousUser: User = {
  id: "USR-ANON",
  name: "Signed out",
  email: "",
  role: "Owner",
  active: false,
};

function publicUser(user: DemoUser): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
  };
}

export function authenticateDemoUser(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = demoUsers.find((item) => item.email.toLowerCase() === normalizedEmail);

  if (!user || user.password !== password) {
    return null;
  }

  return user;
}

function storageForSession() {
  if (typeof window === "undefined") return null;
  if (window.localStorage.getItem(SESSION_KEY)) return window.localStorage;
  if (window.sessionStorage.getItem(SESSION_KEY)) return window.sessionStorage;
  return null;
}

function readSession(): StoredSession | null {
  const storage = storageForSession();
  const raw = storage?.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed.isAuthenticated || !parsed.role || !parsed.user) return null;
    if (!(parsed.role in usersByRole)) return null;

    return {
      isAuthenticated: true,
      role: parsed.role,
      user: {
        ...publicUser(usersByRole[parsed.role]),
        ...parsed.user,
        role: parsed.role,
        active: true,
      },
      authMode: "demo",
    };
  } catch {
    return null;
  }
}

function persistSession(session: StoredSession, keepSignedIn: boolean) {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(session);

  if (keepSignedIn) {
    window.localStorage.setItem(SESSION_KEY, serialized);
    window.sessionStorage.removeItem(SESSION_KEY);
    return;
  }

  window.sessionStorage.setItem(SESSION_KEY, serialized);
  window.localStorage.removeItem(SESSION_KEY);
}

function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
  window.sessionStorage.removeItem(SESSION_KEY);
}

function storageKeepsSession() {
  if (typeof window === "undefined") return true;
  return Boolean(window.localStorage.getItem(SESSION_KEY));
}

export const useSessionStore = create<SessionState>((set, get) => ({
  hydrated: false,
  isAuthenticated: false,
  role: "Owner",
  user: anonymousUser,
  signIn: (user, keepSignedIn) => {
    const session: StoredSession = {
      isAuthenticated: true,
      role: user.role,
      user: publicUser(user),
      authMode: "demo",
    };
    persistSession(session, keepSignedIn);
    set({
      hydrated: true,
      isAuthenticated: true,
      role: session.role,
      user: session.user,
    });
  },
  signOut: () => {
    clearSession();
    set({
      hydrated: true,
      isAuthenticated: false,
      role: "Owner",
      user: anonymousUser,
    });
  },
  setRole: (role) => {
    const user = publicUser(usersByRole[role]);
    const isAuthenticated = get().isAuthenticated;
    if (isAuthenticated) {
      persistSession(
        {
          isAuthenticated: true,
          role,
          user,
          authMode: "demo",
        },
        storageKeepsSession(),
      );
    }
    set({ role, user });
  },
  hydrate: () => {
    const session = readSession();
    if (!session) {
      set({
        hydrated: true,
        isAuthenticated: false,
        role: "Owner",
        user: anonymousUser,
      });
      return;
    }

    set({
      hydrated: true,
      isAuthenticated: true,
      role: session.role,
      user: session.user,
    });
  },
}));

export function hydrateSessionRole() {
  useSessionStore.getState().hydrate();
}

export function actorFromSession() {
  const { user } = useSessionStore.getState();
  return { id: user.id, name: user.name, role: user.role };
}
