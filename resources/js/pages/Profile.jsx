import React, { useState, useEffect } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import {
  UserCircleIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/solid";

export default function Profile() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    current_password: "",
    password: "",
    password_confirmation: "",
  });
  const [initialEmail, setInitialEmail] = useState(user?.email || "");
  const [fieldErrors, setFieldErrors] = useState({});
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("success");

  useTheme();

  // Load latest user data from API
  useEffect(() => {
    axios
      .get("/api/user", { cache: false })
      .then((res) => {
        const userData = res.data?.user || res.data;
        if (userData) {
          setForm((prev) => ({
            ...prev,
            name: userData.name || prev.name,
            email: userData.email || prev.email,
          }));
          setInitialEmail(userData.email || "");
        }
      })
      .catch((err) => {
        console.error(err);
      });
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setMessage("");
    setFieldErrors({});

    const nextErrors = {};
    const trimmedName = (form.name || "").trim();
    const trimmedEmail = (form.email || "").trim();
    const isChangingPassword = Boolean(form.password || form.password_confirmation);
    const isChangingEmail =
      Boolean(initialEmail) &&
      trimmedEmail.toLowerCase() !== initialEmail.trim().toLowerCase();

    if (!trimmedName) {
      nextErrors.name = "Name is required.";
    }
    if (!trimmedEmail) {
      nextErrors.email = "Email is required.";
    }

    if (isChangingPassword || isChangingEmail) {
      if (!form.current_password) {
        nextErrors.current_password =
          "Please enter your current password to confirm this change.";
      }
    }

    if (isChangingPassword) {
      if (!form.password || form.password.length < 6) {
        nextErrors.password = "New password must be at least 6 characters.";
      }
      if (form.password !== form.password_confirmation) {
        nextErrors.password_confirmation =
          "New password and confirmation do not match.";
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      const firstError = Object.values(nextErrors)[0];
      setMessage(firstError);
      setMessageTone("error");
      toast.error(firstError);
      return;
    }

    setLoading(true);

    const payload = {
      name: trimmedName,
      email: trimmedEmail,
      current_password: form.current_password || undefined,
      password: form.password || undefined,
      password_confirmation: form.password_confirmation || undefined,
    };

    axios
      .put("/api/profile", payload)
      .then((res) => {
        const updatedUser = res.data?.user || res.data;
        setMessage(
          isChangingPassword
            ? "Profile and password updated successfully!"
            : "Profile updated successfully!"
        );
        setMessageTone("success");
        toast.success(
          isChangingPassword
            ? "Password updated successfully!"
            : "Profile updated successfully!"
        );
        if (updatedUser && typeof updatedUser === "object") {
          localStorage.setItem("user", JSON.stringify(updatedUser));
          if (typeof setUser === "function") {
            setUser(updatedUser);
          }
          setInitialEmail(updatedUser.email || trimmedEmail);
        }
        setForm((prev) => ({
          ...prev,
          name: updatedUser?.name || trimmedName,
          email: updatedUser?.email || trimmedEmail,
          current_password: "",
          password: "",
          password_confirmation: "",
        }));
      })
      .catch((err) => {
        const apiErrors = err?.response?.data?.errors || {};
        const normalizedErrors = {};
        Object.keys(apiErrors).forEach((key) => {
          const val = apiErrors[key];
          normalizedErrors[key] = Array.isArray(val) ? val[0] : String(val);
        });
        if (Object.keys(normalizedErrors).length > 0) {
          setFieldErrors(normalizedErrors);
        }
        const errorMsg =
          Object.values(normalizedErrors)[0] ||
          err?.response?.data?.message ||
          "Failed to update profile.";
        setMessage(errorMsg);
        setMessageTone("error");
        toast.error(errorMsg);
        console.error(err);
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="people-form-page people-form-narrow">
      <div className="products-panel">
        {/* Header */}
        <div className="people-form-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="products-identity-icon">
              <UserCircleIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="products-title">My Profile</h1>
              <p className="products-subtitle">
                Update your sign-in name, email, and password.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="people-form" autoComplete="off">
          {message && (
            <p
              className={`people-message ${
                messageTone === "success" ? "people-message-success" : "people-message-error"
              }`}
              role="status"
            >
              {messageTone === "success" ? (
                <CheckCircleIcon className="w-5 h-5 shrink-0" aria-hidden="true" />
              ) : (
                <ExclamationTriangleIcon className="w-5 h-5 shrink-0" aria-hidden="true" />
              )}
              <span>{message}</span>
            </p>
          )}

          <div className="people-fields">
            <div className="people-field people-field-wide">
              <label className="people-label" htmlFor="profile-name">Name</label>
              <input
                id="profile-name"
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Your full name"
                autoComplete="name"
              />
              {fieldErrors.name && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  {fieldErrors.name}
                </span>
              )}
            </div>

            <div className="people-field people-field-wide">
              <label className="people-label" htmlFor="profile-email">Email</label>
              <input
                id="profile-email"
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                autoComplete="username"
              />
              {fieldErrors.email && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  {fieldErrors.email}
                </span>
              )}
            </div>

            <div className="people-field people-field-wide">
              <label className="people-label" htmlFor="profile-current-password">
                Current password (required when changing email or password)
              </label>
              <div className="relative">
                <input
                  id="profile-current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  name="current_password"
                  value={form.current_password}
                  onChange={handleChange}
                  placeholder="Enter current password to confirm changes"
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  tabIndex={-1}
                  aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                >
                  {showCurrentPassword ? (
                    <EyeSlashIcon className="w-5 h-5" />
                  ) : (
                    <EyeIcon className="w-5 h-5" />
                  )}
                </button>
              </div>
              {fieldErrors.current_password && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  {fieldErrors.current_password}
                </span>
              )}
            </div>

            <div className="people-field">
              <label className="people-label" htmlFor="profile-password">New password</label>
              <div className="relative">
                <input
                  id="profile-password"
                  type={showNewPassword ? "text" : "password"}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Leave blank to keep current (min. 6 chars)"
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  tabIndex={-1}
                  aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                >
                  {showNewPassword ? (
                    <EyeSlashIcon className="w-5 h-5" />
                  ) : (
                    <EyeIcon className="w-5 h-5" />
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  {fieldErrors.password}
                </span>
              )}
            </div>

            <div className="people-field">
              <label className="people-label" htmlFor="profile-password-confirmation">
                Confirm new password
              </label>
              <div className="relative">
                <input
                  id="profile-password-confirmation"
                  type={showConfirmPassword ? "text" : "password"}
                  name="password_confirmation"
                  value={form.password_confirmation}
                  onChange={handleChange}
                  placeholder="Repeat the new password"
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                >
                  {showConfirmPassword ? (
                    <EyeSlashIcon className="w-5 h-5" />
                  ) : (
                    <EyeIcon className="w-5 h-5" />
                  )}
                </button>
              </div>
              {fieldErrors.password_confirmation && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  {fieldErrors.password_confirmation}
                </span>
              )}
            </div>
          </div>

          <div className="people-actions">
            <button
              type="submit"
              disabled={loading}
              className="products-action products-action-primary theme-btn-primary"
            >
              {loading ? "Updating…" : "Update Profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
