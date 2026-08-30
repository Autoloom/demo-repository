import { api } from "@/lib/services/api";
import type { User } from "@/lib/services/types";

export function getCurrentUser() {
  return api<User>("/me");
}