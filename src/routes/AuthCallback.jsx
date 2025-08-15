// src/routes/AuthCallback.jsx
import { useEffect, useState } from "react";
// import { supabase } from "/lib/supabase";

export default function AuthCallback() {
  const [msg, setMsg] = useState("Finishing sign-in…");

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const errorDescription = url.searchParams.get("error_description");
        if (errorDescription) throw new Error(errorDescription);

        const code = url.searchParams.get("code");
        const token_hash = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          setMsg("Signed in! Redirecting…");
          return window.location.replace("/");
        }
        if (token_hash && type) {
          const { error } = await supabase.auth.verifyOtp({ token_hash, type });
          if (error) throw error;
          setMsg("Email verified! Redirecting…");
          return window.location.replace("/");
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) return window.location.replace("/");
        setMsg("No auth parameters found.");
      } catch (err) {
        console.error("[AuthCallback]", err);
        setMsg(`Auth failed: ${err.message || "Unknown error"}`);
      }
    })();
  }, []);

  return <div style={{ padding: 24 }}>{msg}</div>;
}
