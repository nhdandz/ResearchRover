"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus, Mail, Lock, User, AlertCircle, CheckCircle } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

export default function RegisterPage() {
  const router = useRouter();
  const { register, login } = useAuth();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setSubmitting(true);
    try {
      await register(email, username, password);
      // Auto-login rồi chuyển sang onboarding wizard
      await login(email, password);
      router.push("/onboarding");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <UserPlus size={22} className="text-primary" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
            Create account
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Register to start building your personal library
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[13px] text-red-500">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground">
              Email
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 transition-colors focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
              <Mail size={14} className="shrink-0 text-muted-foreground" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground">
              Username
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 transition-colors focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
              <User size={14} className="shrink-0 text-muted-foreground" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
                className="w-full bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground">
              Password
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 transition-colors focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
              <Lock size={14} className="shrink-0 text-muted-foreground" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground">
              Confirm password
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 transition-colors focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
              <CheckCircle size={14} className="shrink-0 text-muted-foreground" />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="w-full bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="text-center text-[13px] text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
