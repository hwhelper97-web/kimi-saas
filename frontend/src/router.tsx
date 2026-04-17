import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthLayout } from "./components/layouts/AuthLayout";
import { DashboardLayout } from "./components/layouts/DashboardLayout";
import { LoginPage } from "./pages/auth/LoginPage";
import { RegisterPage } from "./pages/auth/RegisterPage";
import { AppointmentDashboard } from "./pages/appointment/AppointmentDashboard";
import { OrderDashboard } from "./pages/order/OrderDashboard";
import { useAuthStore } from "./store/authStore";

function Protected() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function AppRouter() {
  const user = useAuthStore((s) => s.user);
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<Protected />}>
        <Route element={<DashboardLayout />}>
          <Route path="/appointment-dashboard" element={user?.businessType === "APPOINTMENT" ? <AppointmentDashboard /> : <Navigate to="/order-dashboard" />} />
          <Route path="/order-dashboard" element={user?.businessType === "ORDER" ? <OrderDashboard /> : <Navigate to="/appointment-dashboard" />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={user ? (user.businessType === "APPOINTMENT" ? "/appointment-dashboard" : "/order-dashboard") : "/login"} />} />
    </Routes>
  );
}
