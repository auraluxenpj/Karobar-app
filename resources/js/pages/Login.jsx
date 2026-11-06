import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { ArrowRightIcon, ArrowPathIcon, EnvelopeIcon, LockClosedIcon, EyeIcon, EyeSlashIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";
import { useAuth } from "../context/AuthContext.jsx";
import { useLicense } from "../context/LicenseContext.jsx";
import { getLastVisitedPath } from "../utils/lastVisitedPage.js";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { refresh: refreshLicense } = useLicense();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionExpiring, setSessionExpiring] = useState(false);
  const [logoUnavailable, setLogoUnavailable] = useState(false);

  // Load remembered email and check session expiry on mount
  useEffect(() => {
    const rememberedEmail = localStorage.getItem("remembered_email");
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }

    // Check if session expired while away
    const tokenExpiry = localStorage.getItem("token_expires_at");
    if (tokenExpiry) {
      const expiresAt = new Date(tokenExpiry);
      if (new Date() >= expiresAt) {
        // Token has expired
        handleExpiredSession();
      } else {
        // Calculate time remaining and set up warning
        const timeRemaining = expiresAt - new Date();
        if (timeRemaining < 5 * 60 * 1000 && timeRemaining > 0) {
          setSessionExpiring(true);
        }
      }
    }
  }, []);

  const handleExpiredSession = useCallback(() => {
    // Clear expired data
    localStorage.removeItem("token");
    localStorage.removeItem("token_expires_at");
    localStorage.removeItem("user");
    delete axios.defaults.headers.common["Authorization"];
    // Keep remember_me preference but clear token
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSessionExpiring(false);
    setLoading(true);

    try {
      const { data } = await axios.post("/api/login", { 
        email, 
        password,
        remember: rememberMe
      });

      // Handle remember me
      if (rememberMe) {
        localStorage.setItem("remembered_email", email);
      } else {
        localStorage.removeItem("remembered_email");
      }

      // Store token and its expiry
      localStorage.setItem("token", data.token);
      localStorage.removeItem("karobar_session_prompt_at");
      if (data.expires_at) {
        localStorage.setItem("token_expires_at", data.expires_at);
      } else {
        localStorage.removeItem("token_expires_at");
      }

      axios.defaults.headers.common["Authorization"] = `Bearer ${data.token}`;
      login(data.user, data.token, { license_revoked: data.license_revoked });

      if (!data.license_revoked) {
        // Check license status asynchronously in the background and send user directly
        // to /setup on first-time login or to their last visited page (or /dashboard if none)
        refreshLicense();
        window.dispatchEvent(new CustomEvent("settingsChanged"));
        if (data.is_setup_completed === false) {
          navigate("/setup", { replace: true });
        } else {
          const targetPath = getLastVisitedPath(location.state?.from);
          navigate(targetPath, { replace: true });
        }
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        (err?.response?.status === 401 ? "Invalid credentials" : "Login failed");
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Axios interceptor to handle 401 responses globally
  useEffect(() => {
    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401 && error.response.data?.expired) {
          // Token expired, redirect to login
          handleExpiredSession();
          navigate("/", {
            state: { from: location.pathname, message: "Session expired. Please login again." } 
          });
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, [navigate, location, handleExpiredSession]);

  return (
    <main className="login-page">
      <div className="login-workspace">
        <section className="login-card" aria-labelledby="login-heading">
          <div className="login-brand">
            {logoUnavailable ? (
              <span className="login-logo-fallback" aria-hidden="true">K</span>
            ) : (
              <img src="/logo.png" alt="" className="login-logo" onError={() => setLogoUnavailable(true)} />
            )}
            <span>Karobar<span className="login-brand-dot">.</span></span>
          </div>
          <header className="login-heading">
            <h1 id="login-heading">Your workspace awaits.</h1>
            <p>Sign in. Get back to business.</p>
          </header>

          {sessionExpiring && (
            <div className="login-message login-message-warning" role="status">
              <ExclamationCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>Your session is about to expire. Sign in again to continue.</span>
            </div>
          )}
          {error && (
            <div id="login-error" className="login-message login-message-error" role="alert">
              <ExclamationCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form" aria-busy={loading} aria-describedby={error ? "login-error" : undefined}>
            <div className="login-field">
              <label htmlFor="login-email">Email address</label>
              <div className="login-input-wrap">
                <EnvelopeIcon className="login-field-icon" aria-hidden="true" />
                <input id="login-email" name="email" type="email" autoComplete="username"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className="g-input login-input" placeholder="you@example.com" required />
              </div>
            </div>
            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <div className="login-input-wrap">
                <LockClosedIcon className="login-field-icon" aria-hidden="true" />
                <input id="login-password" name="password" type={showPassword ? "text" : "password"}
                  autoComplete="current-password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="g-input login-input login-password" placeholder="Enter your password" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="login-password-toggle" aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword} aria-controls="login-password">
                  {showPassword ? <EyeSlashIcon className="h-5 w-5" aria-hidden="true" /> : <EyeIcon className="h-5 w-5" aria-hidden="true" />}
                </button>
              </div>
            </div>
            <div className="login-options">
              <label className="login-remember">
                <input type="checkbox" name="remember" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                <span>Remember me <span className="login-duration">(24h)</span></span>
              </label>
              <a href="/forgot-password" className="login-link">Forgot password?</a>
            </div>
            <button type="submit" disabled={loading} className="g-btn-primary login-submit">
              <span>{loading ? "Signing in…" : "Sign in"}</span>
              {loading ? <ArrowPathIcon className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" /> : <ArrowRightIcon className="h-5 w-5" aria-hidden="true" />}
            </button>
            <p className="login-session-note" aria-live="polite">
              {rememberMe ? "Stay signed in for 24 hours on this device." : "Your session lasts 20 minutes."}
            </p>
          </form>
          <footer className="login-footer">Inventory · Sales · Insights</footer>
        </section>
      </div>
    </main>
  );
}
