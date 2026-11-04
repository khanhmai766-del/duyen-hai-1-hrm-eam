"use client";
import { createContext, useContext } from "react";
import { hasPermission, type Permission, type SessionUser } from "../lib/auth/session";
const SessionContext = createContext<SessionUser | null>(null);
export function SessionProvider({user,children}:{user:SessionUser;children:React.ReactNode}) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}
export function useSessionUser() { const user=useContext(SessionContext); if(!user) throw new Error("Thiếu phiên đăng nhập KTKT."); return user; }
export function useHasPermission(permission:Permission) { return hasPermission(useContext(SessionContext),permission); }
