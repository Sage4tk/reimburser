import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuthStore } from "../store/authStore";
import { Button } from "./ui/button";
import { ExpenseTable } from "./ExpenseTable";
import { UserProfile } from "./UserProfile";
import { ChangePasswordDialog } from "./SetupNameDialog";
import supabase from "../lib/supabase";

export function Dashboard() {
  const navigate = useNavigate();
  const { user, signOut } = useAuthStore();
  const [userName, setUserName] = useState<string | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetchUserName();
  }, [user]);

  const fetchUserName = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from("user_profile")
        .select("full_name, admin")
        .eq("user_id", user.id)
        .single();

      setUserName(data?.full_name || null);
      setIsAdmin(data?.admin || false);
    } catch (err) {
      console.error("Error fetching user name:", err);
    } finally {
      setProfileChecked(true);
    }
  };

  const handlePasswordChangeComplete = () => {
    // Refresh after password change
    fetchUserName();
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      {profileChecked && (
        <ChangePasswordDialog onComplete={handlePasswordChangeComplete} />
      )}

      <div className="mx-auto max-w-7xl">
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              Welcome back, {userName || user?.email}
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <UserProfile />
            {isAdmin && (
              <Button
                onClick={() => navigate("/admin")}
                variant="outline"
                className="flex-1 sm:flex-initial"
              >
                Admin
              </Button>
            )}
            <Button
              onClick={signOut}
              variant="outline"
              className="flex-1 sm:flex-initial"
            >
              Sign Out
            </Button>
          </div>
        </div>

        <ExpenseTable userName={userName} />
      </div>
    </div>
  );
}
