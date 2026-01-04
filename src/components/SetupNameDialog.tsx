import { useState, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import supabase from "../lib/supabase";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "./ui/drawer";
import { Spinner } from "./ui/spinner";
import { useIsMobile } from "../hooks/use-mobile";

interface ChangePasswordDialogProps {
  onComplete: () => void;
}

export function ChangePasswordDialog({
  onComplete,
}: ChangePasswordDialogProps) {
  const { user } = useAuthStore();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkProfile();
  }, [user]);

  const checkProfile = async () => {
    if (!user) return;

    setChecking(true);
    try {
      const { data, error } = await supabase
        .from("user_profile")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error checking profile:", error);
        setChecking(false);
        return;
      }

      // Show dialog if initial_login is true
      if (data && data.initial_login) {
        setIsOpen(true);
      }
    } catch (err) {
      console.error("Error checking profile:", err);
    } finally {
      setChecking(false);
    }
  };

  const handleSave = async () => {
    if (!user || !newPassword.trim()) {
      setError("Please enter a new password");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Update password
      const { error: passwordError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (passwordError) throw passwordError;

      // Update initial_login flag
      const { error: profileError } = await supabase
        .from("user_profile")
        .update({ initial_login: false })
        .eq("user_id", user.id);

      if (profileError) throw profileError;

      setIsOpen(false);
      onComplete();
    } catch (err: any) {
      console.error("Error changing password:", err);
      setError(err.message || "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return null;
  }

  const passwordFormContent = (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="new_password">New Password</Label>
        <Input
          id="new_password"
          type="password"
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Enter new password"
          disabled={loading}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm_password">Confirm Password</Label>
        <Input
          id="confirm_password"
          type="password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Confirm new password"
          disabled={loading}
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={() => {}}>
        <DrawerContent className="max-h-[95vh] flex flex-col">
          <div className="px-4 flex flex-col flex-1 min-h-0">
            <DrawerHeader className="shrink-0">
              <DrawerTitle>Change Your Password</DrawerTitle>
              <DrawerDescription>
                For security reasons, please change your password on first login
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {passwordFormContent}
            </div>
            <DrawerFooter className="pb-8 shrink-0">
              <Button onClick={handleSave} disabled={loading}>
                {loading ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Saving...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Change Your Password</DialogTitle>
          <DialogDescription>
            For security reasons, please change your password on first login
          </DialogDescription>
        </DialogHeader>
        {passwordFormContent}
        <DialogFooter>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Saving...
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
