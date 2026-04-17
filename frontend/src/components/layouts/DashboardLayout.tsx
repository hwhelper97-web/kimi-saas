import { Outlet } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

export function DashboardLayout() {
  const { user, logout } = useAuthStore();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white">
      <header className="border-b border-slate-200 dark:border-slate-800 p-4 flex justify-between">
        <div className="font-semibold">AI Voice SaaS • {user?.businessType}</div>
        <button className="px-4 py-2 rounded bg-slate-900 text-white dark:bg-white dark:text-black" onClick={logout}>Logout</button>
      </header>
      <main className="p-6"><Outlet /></main>
    </div>
  );
}
