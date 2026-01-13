import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import supabase from "../lib/supabase";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";
import { Spinner } from "./ui/spinner";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  // Rate limiting: max 3 attempts per 15 minutes
  const [resetAttempts, setResetAttempts] = useState<number[]>([]);
  const MAX_RESET_ATTEMPTS = 3;
  const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes in milliseconds

  const { signIn } = useAuthStore();

  const checkRateLimit = (): boolean => {
    const now = Date.now();
    const recentAttempts = resetAttempts.filter(
      (timestamp) => now - timestamp < RATE_LIMIT_WINDOW
    );
    return recentAttempts.length < MAX_RESET_ATTEMPTS;
  };

  const getRemainingTime = (): string => {
    if (resetAttempts.length === 0) return "";
    const now = Date.now();
    const oldestAttempt = Math.min(...resetAttempts);
    const timeLeft = RATE_LIMIT_WINDOW - (now - oldestAttempt);
    const minutesLeft = Math.ceil(timeLeft / 60000);
    return `${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}`;
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetSuccess(false);

    if (!resetEmail.trim()) {
      setResetError("Please enter your email address");
      return;
    }

    if (!checkRateLimit()) {
      setResetError(
        `Too many reset attempts. Please try again in ${getRemainingTime()}.`
      );
      return;
    }

    setResetLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      // Track attempt
      const now = Date.now();
      const recentAttempts = resetAttempts.filter(
        (timestamp) => now - timestamp < RATE_LIMIT_WINDOW
      );
      setResetAttempts([...recentAttempts, now]);

      setResetSuccess(true);
      setResetEmail("");

      // Auto-hide success and form after 5 seconds
      setTimeout(() => {
        setResetSuccess(false);
        setShowResetPassword(false);
      }, 5000);
    } catch (err: any) {
      console.error("Error sending reset email:", err);
      setResetError(err.message || "Failed to send reset email");
    } finally {
      setResetLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setError(error.message);
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">
            Reimburse
          </CardTitle>
          <CardDescription className="text-center">
            Sign in to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showResetPassword ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Reset Password</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowResetPassword(false);
                    setResetError(null);
                    setResetSuccess(false);
                    setResetEmail("");
                  }}
                  className="text-sm text-primary hover:underline"
                >
                  Back to sign in
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                Enter your email address and we'll send you a link to reset your
                password.
              </p>
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="you@example.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    disabled={resetLoading}
                  />
                </div>

                {resetError && (
                  <Alert variant="destructive">
                    <AlertDescription>{resetError}</AlertDescription>
                  </Alert>
                )}

                {resetSuccess && (
                  <Alert>
                    <AlertDescription className="text-green-600">
                      Password reset email sent! Check your inbox.
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={resetLoading || !checkRateLimit()}
                >
                  {resetLoading ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Sending...
                    </>
                  ) : (
                    "Send Reset Link"
                  )}
                </Button>

                {!checkRateLimit() && (
                  <p className="text-xs text-muted-foreground text-center">
                    Rate limit reached. Try again in {getRemainingTime()}.
                  </p>
                )}
              </form>
            </div>
          )}
        </CardContent>
        <CardFooter className="text-center text-sm text-muted-foreground">
          <p className="w-full">
            This is an invitation-only application. Contact your administrator
            for access.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
