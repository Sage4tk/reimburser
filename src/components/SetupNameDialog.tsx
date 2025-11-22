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

interface SetupNameDialogProps {
  onComplete: () => void;
}

export function SetupNameDialog({ onComplete }: SetupNameDialogProps) {
  const { user } = useAuthStore();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [fullName, setFullName] = useState("");
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

      // Show dialog if no profile or no full name
      if (!data || !data.full_name) {
        setIsOpen(true);
      }
    } catch (err) {
      console.error("Error checking profile:", err);
    } finally {
      setChecking(false);
    }
  };

  const handleSave = async () => {
    if (!user || !fullName.trim()) {
      setError("Please enter your full name");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.from("user_profile").insert({
        user_id: user.id,
        full_name: fullName.trim(),
      });

      if (error) throw error;

      setIsOpen(false);
      onComplete();
    } catch (err: any) {
      console.error("Error saving profile:", err);
      setError(err.message || "Failed to save profile");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return null;
  }

  const ProfileForm = () => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="setup_full_name">Full Name</Label>
        <Input
          id="setup_full_name"
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Enter your full name"
          disabled={loading}
          autoFocus
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={() => {}}>
        <DrawerContent className="max-h-[95vh] flex flex-col">
          <div className="px-4 flex flex-col flex-1 min-h-0">
            <DrawerHeader className="shrink-0">
              <DrawerTitle>Welcome! Set up your profile</DrawerTitle>
              <DrawerDescription>
                Please enter your full name to get started
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ProfileForm />
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
          <DialogTitle>Welcome! Set up your profile</DialogTitle>
          <DialogDescription>
            Please enter your full name to get started
          </DialogDescription>
        </DialogHeader>
        <ProfileForm />
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
