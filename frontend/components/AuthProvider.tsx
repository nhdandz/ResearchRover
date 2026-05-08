"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
  created_at: string;
  // Research profile
  research_interests: string[] | null;
  expertise_level: string | null;
  affiliation: string | null;
  position: string | null;
  bio: string | null;
  preferred_language: string | null;
  preferred_sources: string[] | null;
  preferred_llm: string | null;
  notification_preferences: Record<string, boolean> | null;
  dashboard_layout: Record<string, any> | null;
  onboarding_completed: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  refreshProfile: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    delete api.defaults.headers.common["Authorization"];
  }, []);

  const fetchMe = useCallback(async (accessToken: string) => {
    try {
      api.defaults.headers.common["Authorization"] = `Bearer ${accessToken}`;
      const { data } = await api.get("/auth/me");
      setUser(data);
      setToken(accessToken);
    } catch {
      logout();
    }
  }, [logout]);

  const refreshProfile = useCallback(async () => {
    const savedToken = localStorage.getItem("access_token");
    if (savedToken) {
      const { data } = await api.get("/auth/me");
      setUser(data);
    }
  }, []);

  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          const refreshToken = localStorage.getItem("refresh_token");
          if (refreshToken) {
            try {
              const { data } = await api.post("/auth/refresh", {
                refresh_token: refreshToken,
              });
              localStorage.setItem("access_token", data.access_token);
              localStorage.setItem("refresh_token", data.refresh_token);
              api.defaults.headers.common["Authorization"] = `Bearer ${data.access_token}`;
              setToken(data.access_token);
              originalRequest.headers["Authorization"] = `Bearer ${data.access_token}`;
              return api(originalRequest);
            } catch {
              logout();
            }
          }
        }
        return Promise.reject(error);
      }
    );
    return () => api.interceptors.response.eject(interceptor);
  }, [logout]);

  useEffect(() => {
    const savedToken = localStorage.getItem("access_token");
    if (savedToken) {
      fetchMe(savedToken).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [fetchMe]);

  const login = async (email: string, password: string) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    api.defaults.headers.common["Authorization"] = `Bearer ${data.access_token}`;
    setToken(data.access_token);
    const { data: userData } = await api.get("/auth/me");
    setUser(userData);
  };

  const register = async (email: string, username: string, password: string) => {
    await api.post("/auth/register", { email, username, password });
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
