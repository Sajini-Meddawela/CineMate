import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  createdAt?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  authLoading: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const sessionActionVersion = useRef(0);

  const logout = useCallback(() => {
    sessionActionVersion.current += 1;
    void apiRequest<{ message: string }>('/api/auth/logout', { method: 'POST', authenticated: false }).catch(() => undefined);
    localStorage.removeItem('token');
    setUser(null);
    setAuthLoading(false);
  }, []);

  const login = useCallback((authenticatedUser: AuthUser) => {
    sessionActionVersion.current += 1;
    setUser(authenticatedUser);
    setAuthLoading(false);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => setUser(null);
    window.addEventListener('cinemate:unauthorized', handleUnauthorized);

    localStorage.removeItem('token');
    const requestVersion = sessionActionVersion.current;
    apiRequest<{ user: AuthUser }>('/api/auth/me', { authenticated: false })
      .then((response) => { if (sessionActionVersion.current === requestVersion) setUser(response.user); })
      .catch(() => { if (sessionActionVersion.current === requestVersion) setUser(null); })
      .finally(() => setAuthLoading(false));

    return () => window.removeEventListener('cinemate:unauthorized', handleUnauthorized);
  }, []);

  return (
    <AuthContext.Provider value={{ user, authLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};