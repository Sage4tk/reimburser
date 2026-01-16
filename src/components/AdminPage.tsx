import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAuthStore } from "../store/authStore";
import { Button } from "./ui/button";
import { UserProfile } from "./UserProfile";
import { cn } from "../lib/utils";
import { ReceiptsManager } from "./admin/ReceiptsManager";
import { UsersManager } from "./admin/UsersManager";
import { AdminDashboard } from "./admin/AdminDashboard";
import supabase from "../lib/supabase";
import { Skeleton } from "./ui/skeleton";

type AdminTab = "dashboard" | "receipts" | "users";

export function AdminPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuthStore();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Check admin status
  useEffect(() => {
    checkAdminAccess();
  }, [user]);

  const checkAdminAccess = async () => {
    if (!user) {
      navigate("/");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("user_profile")
        .select("admin")
        .eq("user_id", user.id)
        .single();

      if (error || !data?.admin) {
        // Not an admin, redirect to home
        navigate("/");
        return;
      }

      setIsAdmin(true);
    } catch (err) {
      console.error("Error checking admin access:", err);
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  // Determine active tab from URL
  const getActiveTabFromPath = (): AdminTab => {
    const path = location.pathname;
    if (path.includes("/admin/receipts")) return "receipts";
    if (path.includes("/admin/users")) return "users";
    return "dashboard";
  };

  const [activeTab, setActiveTab] = useState<AdminTab>(getActiveTabFromPath());

  useEffect(() => {
    setActiveTab(getActiveTabFromPath());
  }, [location.pathname]);

  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);
    navigate(`/admin/${tab}`);
  };

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <AdminDashboard />;
      case "receipts":
        return <ReceiptsManager />;
      case "users":
        return <UsersManager />;
    }
  };

  // Show loading state while checking admin access
  if (loading || isAdmin === null) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="fixed top-0 left-0 right-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center px-4 sm:px-6 lg:px-8">
            <Skeleton className="h-6 w-32" />
          </div>
        </div>
        <div className="flex pt-16 flex-1">
          <aside className="fixed left-0 top-16 bottom-0 w-64 border-r bg-background p-4">
            <div className="space-y-1">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </aside>
          <main className="flex-1 ml-64 p-8 overflow-y-auto">
            <Skeleton className="h-8 w-64 mb-6" />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          </main>
        </div>
      </div>
    );
  }

  // If not admin, don't render anything (redirect happens in useEffect)
  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header - Fixed */}
      <div className="fixed top-0 left-0 right-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center px-4 sm:px-6 lg:px-8">
          <div className="flex-1">
            <h1 className="text-xl font-bold">Admin Panel</h1>
          </div>
          <div className="flex items-center gap-2">
            <UserProfile />
            <Button onClick={() => navigate("/")} variant="outline" size="sm">
              Reimbursement
            </Button>
            <Button onClick={signOut} variant="outline" size="sm">
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      {/* Add padding-top to account for fixed header */}
      <div className="flex pt-16 flex-1">
        {/* Sidebar - Fixed */}
        <aside className="fixed left-0 top-16 bottom-0 w-64 border-r bg-background p-4 overflow-y-auto">
          <nav className="space-y-1">
            <button
              onClick={() => handleTabChange("dashboard")}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                activeTab === "dashboard"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-secondary-foreground"
              )}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="7" height="9" x="3" y="3" rx="1" />
                <rect width="7" height="5" x="14" y="3" rx="1" />
                <rect width="7" height="9" x="14" y="12" rx="1" />
                <rect width="7" height="5" x="3" y="16" rx="1" />
              </svg>
              Dashboard
            </button>
            <button
              onClick={() => handleTabChange("receipts")}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                activeTab === "receipts"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-secondary-foreground"
              )}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              Receipts
            </button>
            <button
              onClick={() => handleTabChange("users")}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                activeTab === "users"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-secondary-foreground"
              )}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Users
            </button>
          </nav>
        </aside>

        {/* Main Content - Scrollable with left margin to account for fixed sidebar */}
        <main className="flex-1 ml-64 p-6 sm:p-8 overflow-y-auto">
          <div className="mx-auto max-w-7xl">{renderContent()}</div>
        </main>
      </div>
    </div>
  );
}
