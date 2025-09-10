// Auth.jsx — robust email/password auth with reset & guest mode
import React, { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Auth({ onAuthSuccess, onGuest }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [isReset, setIsReset] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  const resetAlerts = () => {
    setMessage("");
    setError("");
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    resetAlerts();

    const emailTrimmed = email.trim();

    if (!emailTrimmed) {
      setError("Please enter your email.");
      return;
    }
    if (!isReset && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    try {
      setLoading(true);

      if (isReset) {
        const { error } = await supabase.auth.resetPasswordForEmail(
          emailTrimmed,
          {
            redirectTo: window.location.origin + "/auth/callback",
          }
        );
        if (error) throw error;
        setMessage("Password reset email sent. Check your inbox.");
        return;
      }

      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: emailTrimmed,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/auth/callback",
          },
        });
        if (error) throw error;
        setMessage(
          data?.user?.identities?.length
            ? "Sign-up successful. Please check your email to confirm your account."
            : "If this email is new, check your inbox to confirm your account."
        );
        return;
      }

      // Sign in (password grant)
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailTrimmed,
        password,
      });
      if (error) throw error;

      // success
      setMessage("Signed in successfully.");
      onAuthSuccess?.(data?.user ?? data?.session?.user ?? null);
    } catch (err) {
      // Surface clear messages for common 400s
      const raw = err?.message || "Authentication failed.";
      let friendly = raw;
      if (/invalid login credentials/i.test(raw))
        friendly = "Invalid email or password.";
      if (/email not confirmed/i.test(raw))
        friendly = "Email not confirmed. Please check your inbox.";
      setError(friendly);
      console.error("Supabase auth error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-md p-6">
        <h1 className="text-2xl font-semibold mb-1 text-gray-900">
          {isReset ? "Reset Password" : isSignUp ? "Create Account" : "Sign In"}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {isReset
            ? "Enter your email and we’ll send you a reset link."
            : isSignUp
            ? "Create your Rally Mapper account."
            : "Sign in to continue to Rally Mapper."}
        </p>

        {message && (
          <div className="mb-3 rounded-md bg-green-50 text-green-800 border border-green-200 px-3 py-2 text-sm">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-3 rounded-md bg-red-50 text-red-800 border border-red-200 px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
              required
            />
          </div>

          {!isReset && (
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={
                    isSignUp ? "Create a password" : "Enter your password"
                  }
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute inset-y-0 right-0 px-3 text-sm text-gray-500 hover:text-gray-700"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-md px-3 py-2 text-white font-medium ${
              loading
                ? "bg-blue-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading
              ? "Please wait…"
              : isReset
              ? "Send Reset Link"
              : isSignUp
              ? "Create Account"
              : "Sign In"}
          </button>

          <div className="flex items-center justify-between text-sm">
            {!isReset && (
              <button
                type="button"
                onClick={() => {
                  resetAlerts();
                  setIsSignUp((s) => !s);
                }}
                className="text-blue-700 hover:underline"
              >
                {isSignUp
                  ? "Have an account? Sign in"
                  : "New here? Create an account"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                resetAlerts();
                setIsReset((r) => !r);
              }}
              className="text-gray-600 hover:underline ml-auto"
            >
              {isReset ? "Back to sign in" : "Forgot password?"}
            </button>
          </div>

          <div className="pt-2">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onGuest?.()}
                className="w-full rounded-md px-3 py-2 font-medium border border-gray-300 hover:bg-gray-50"
              >
                Continue as Guest
              </button>
              <p className="text-xs text-gray-500 text-center">
                Guest mode: data is stored locally and won’t sync to cloud.
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
