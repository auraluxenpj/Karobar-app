import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getLastVisitedPath, saveLastVisitedPath } from "../utils/lastVisitedPage.js";

/**
 * AuthGuard - Redirects users based on authentication status
 * 
 * If authenticated and trying to access login page -> redirect to last visited page or dashboard
 * If not authenticated and trying to access protected route -> redirect to login
 */
export default function AuthGuard({ children, requireAuth = true }) {
  const location = useLocation();
  const token = localStorage.getItem("token");
  const expiresAt = localStorage.getItem("token_expires_at");

  if (requireAuth) {
    // Protected route - keep mounted while token exists so SessionExpiryModal can offer "Wait 10 Minutes"
    if (!token) {
      saveLastVisitedPath(location);
      const fullPath = `${location.pathname}${location.search || ""}${location.hash || ""}`;
      return <Navigate to="/" state={{ from: fullPath }} replace />;
    }
    return children;
  }

  // Public route - redirect to last visited page or dashboard if already authenticated and not expired
  const isAuthenticated = !!token && (!expiresAt || Date.parse(expiresAt) > Date.now());
  if (isAuthenticated) {
    return <Navigate to={getLastVisitedPath(location.state?.from)} replace />;
  }

  return children;
}
