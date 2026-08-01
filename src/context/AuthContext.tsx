import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiUsers, apiAuth, setToken, clearToken, getToken } from '../api';

export type Role = 'admin' | 'kam' | 'rh' | 'arpm' | 'founder';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  kamName?: string;
  rhName?: string;
}

interface AuthCtx {
  user: User | null;
  allUsers: User[];
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginAsUser: (userId: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  demoUsers: User[];
}

const AuthContext = createContext<AuthCtx>({} as AuthCtx);

function dbToUser(u: { id: string; name: string; email: string; role: string; kam_name?: string | null; rh_name?: string | null }): User {
  return { id: u.id, name: u.name, email: u.email, role: u.role as Role, kamName: u.kam_name ?? undefined, rhName: u.rh_name ?? undefined };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('delta_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Only load all users when a valid token already exists (returning session)
  useEffect(() => {
    if (getToken()) {
      apiUsers.getAll().then(users => setAllUsers(users.map(dbToUser))).catch(() => {});
    }
  }, []);

  async function login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const data = await apiAuth.login(email, password);
      setToken(data.token);
      const loggedInUser = dbToUser(data.user);
      setUser(loggedInUser);
      localStorage.setItem('delta_user', JSON.stringify(loggedInUser));
      apiUsers.getAll().then(users => setAllUsers(users.map(dbToUser))).catch(() => {});
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Login failed' };
    }
  }

  async function loginAsUser(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const data = await apiAuth.selectUser(userId);
      setToken(data.token);
      const loggedInUser = dbToUser(data.user);
      setUser(loggedInUser);
      localStorage.setItem('delta_user', JSON.stringify(loggedInUser));
      apiUsers.getAll().then(users => setAllUsers(users.map(dbToUser))).catch(() => {});
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Select user failed' };
    }
  }

  function logout() {
    setUser(null);
    clearToken();
    localStorage.removeItem('delta_user');
  }

  return (
    <AuthContext.Provider value={{ user, allUsers, login, loginAsUser, logout, demoUsers: allUsers }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
