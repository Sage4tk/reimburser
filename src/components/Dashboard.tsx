import { useAuthStore } from "../store/authStore";
import { Button } from "./ui/button";
import { ExpenseTable } from "./ExpenseTable";

export function Dashboard() {
  const { user, signOut } = useAuthStore();

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              Welcome back, {user?.email}
            </p>
          </div>
          <Button
            onClick={signOut}
            variant="outline"
            className="w-full sm:w-auto"
          >
            Sign Out
          </Button>
        </div>

        <ExpenseTable />
      </div>
    </div>
  );
}
