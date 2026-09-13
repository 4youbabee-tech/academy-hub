import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { hashPassword, loadDb, snapshot, subscribe, transact, audit, type Actor } from "./db";
import type { DB, User } from "./types";
import { can } from "./permissions";
import { runMonthlyGeneration } from "./monthly";

const SESSION_KEY = "institute-session-user";

interface Ctx {
  db: DB | null;
  user: User | null;
  actor: Actor;
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => void;
  allowed: (perm: string) => boolean;
}

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const unsub = subscribe(() => mounted && setDb(snapshot()));
    void loadDb().then(() => {
      if (!mounted) return;
      setDb(snapshot());
      setUserId(sessionStorage.getItem(SESSION_KEY));
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const user = useMemo(
    () => db?.users.find((u) => u.id === userId && u.is_active) ?? null,
    [db, userId],
  );

  useEffect(() => {
    if (!userId) return;
    const current = snapshot();
    const activeUser = current?.users.find((item) => item.id === userId && item.is_active);
    if (!activeUser) return;
    try {
      runMonthlyGeneration(undefined, { id: activeUser.id, name: activeUser.full_name });
    } catch (error) {
      console.error("تعذر تشغيل الدورة الشهرية التلقائية", error);
    }
  }, [userId]);

  const login = useCallback(async (username: string, password: string) => {
    const current = snapshot();
    if (!current) return "قاعدة البيانات غير جاهزة";
    const hash = await hashPassword(password);
    const found = current.users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.password_hash === hash,
    );
    if (!found) return "اسم المستخدم أو كلمة المرور غير صحيحة";
    if (!found.is_active) return "هذا الحساب معطّل";
    sessionStorage.setItem(SESSION_KEY, found.id);
    setUserId(found.id);
    transact((d) => audit(d, { id: found.id, name: found.full_name }, "auth", found.id, "login", "تسجيل دخول"));
    return null;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setUserId(null);
  }, []);

  const actor: Actor = useMemo(
    () => ({ id: user?.id ?? null, name: user?.full_name ?? "غير معروف" }),
    [user],
  );

  const value: Ctx = useMemo(
    () => ({ db, user, actor, login, logout, allowed: (p: string) => can(user?.role, p) }),
    [db, user, actor, login, logout],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

/** Convenience: throws-free access to a loaded db inside authenticated screens. */
export function useDb(): DB {
  const { db } = useApp();
  if (!db) throw new Error("DB not ready");
  return db;
}
