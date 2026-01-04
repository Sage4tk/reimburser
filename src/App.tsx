import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router";
import { useAuthStore } from "./store/authStore";
import { LoginPage } from "./components/LoginPage";
import { Dashboard } from "./components/Dashboard";
import { AdminPage } from "./components/AdminPage";
import { Spinner } from "./components/ui/spinner";

function App() {
  const { user, loading, initialized, initialize } = useAuthStore();

  useEffect(() => {
    if (!initialized) {
      initialize();
    }
  }, [initialized, initialize]);

  if (loading || !initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin/dashboard" element={<AdminPage />} />
      <Route path="/admin/receipts" element={<AdminPage />} />
      <Route path="/admin/users" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
