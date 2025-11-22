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
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "./ui/drawer";
import { Spinner } from "./ui/spinner";
import { useIsMobile } from "../hooks/use-mobile";
import { User } from "lucide-react";

interface UserProfileData {
  id: string;
  full_name: string | null;
  user_id: string;
}

export function UserProfile() {
  const { user } = useAuthStore();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfileData | null>(null);

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("user_profile")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 is "not found" error
        console.error("Error fetching profile:", error);
        return;
      }

      setProfile(data);
      if (data?.full_name) {
        setFullName(data.full_name);
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
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
      if (profile) {
        // Update existing profile
        const { error } = await supabase
          .from("user_profile")
          .update({ full_name: fullName.trim() })
          .eq("user_id", user.id);

        if (error) throw error;
      } else {
        // Create new profile
        const { error } = await supabase.from("user_profile").insert({
          user_id: user.id,
          full_name: fullName.trim(),
        });

        if (error) throw error;
      }

      await fetchProfile();
      setIsOpen(false);
    } catch (err: any) {
      console.error("Error saving profile:", err);
      setError(err.message || "Failed to save profile");
    } finally {
      setLoading(false);
    }
  };

  const ProfileForm = () => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="full_name">Full Name</Label>
        <Input
          id="full_name"
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Enter your full name"
          disabled={loading}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(true)}
          className="relative"
        >
          <User className="h-5 w-5" />
        </Button>

        <Drawer open={isOpen} onOpenChange={setIsOpen}>
          <DrawerContent className="max-h-[95vh] flex flex-col">
            <div className="px-4 flex flex-col flex-1 min-h-0">
              <DrawerHeader className="shrink-0">
                <DrawerTitle>User Profile</DrawerTitle>
                <DrawerDescription>
                  Update your personal information
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
                    "Save Changes"
                  )}
                </Button>
                <DrawerClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DrawerClose>
              </DrawerFooter>
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        className="relative"
      >
        <User className="h-5 w-5" />
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Profile</DialogTitle>
            <DialogDescription>
              Update your personal information
            </DialogDescription>
          </DialogHeader>
          <ProfileForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
