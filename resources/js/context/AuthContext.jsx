import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { clearApiCache } from "./axiosSetup.js";
import { invalidatePermissionsCache } from "../api/usePermissions.js";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  // Safely parse user from localStorage - handle null, undefined, or corrupted values
  const getStoredUser = () => {
    try {
      const userData = localStorage.getItem("user");
      if (!userData || userData === "undefined" || userData === "null") {
        return null;
      }
      return JSON.parse(userData);
    } catch (error) {
      console.error("Error parsing user from localStorage:", error);
      return null;
    }
  };

  const [user, setUser] = useState(getStoredUser());
  const [token, setToken] = useState(() => localStorage.getItem("token"));

  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === "token" || event.key === "user" || event.key === null) {
        const nextToken = localStorage.getItem("token");
        const nextUser = getStoredUser();
        setToken(nextToken);
        setUser(nextUser);
        if (nextToken) {
          axios.defaults.headers.common["Authorization"] = `Bearer ${nextToken}`;
        } else {
          delete axios.defaults.headers.common["Authorization"];
          clearApiCache();
          invalidatePermissionsCache();
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  useEffect(() => {
    if (token && !user) {
      axios.get("/api/user", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        setUser(res.data);
        localStorage.setItem("user", JSON.stringify(res.data));
      })
      .catch(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setToken(null);
      });
    }
  }, [token, user]);

  const login = useCallback((userData, tokenValue, additionalData = {}) => {
    clearApiCache();
    invalidatePermissionsCache();
    localStorage.setItem("token", tokenValue);
    localStorage.setItem("user", JSON.stringify(userData));
    try {
      sessionStorage.setItem("karobar_just_logged_in", "1");
    } catch {
      /* ignore storage errors */
    }
    setToken(tokenValue);
    setUser(userData);
    axios.defaults.headers.common["Authorization"] = `Bearer ${tokenValue}`;

    // If license was revoked (software moved to new device), redirect to activation
    if (additionalData.license_revoked) {
      // Clear any cached user data that might cause issues
      localStorage.removeItem("user");
      // Redirect to activation page
      window.location.href = "/activate";
    }
  }, []);

  const logout = useCallback(() => {
    clearApiCache();
    invalidatePermissionsCache();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("token_expires_at");
    localStorage.removeItem("productModalPos");
    localStorage.removeItem("productModalSize");
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith("karobar_live_notified_")) {
          localStorage.removeItem(k);
        }
      });
      sessionStorage.clear();
    } catch {
      /* ignore storage errors */
    }

    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common["Authorization"];
  }, []);

  const contextValue = useMemo(
    () => ({ user, token, setUser, login, logout }),
    [user, token, login, logout]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
