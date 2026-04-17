import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
    const user = useAuthStore.getState().user;
    navigate(user?.businessType === "APPOINTMENT" ? "/appointment-dashboard" : "/order-dashboard");
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <input className="w-full p-3 rounded bg-slate-800" placeholder="Email" onChange={(e) => setEmail(e.target.value)} />
      <input type="password" className="w-full p-3 rounded bg-slate-800" placeholder="Password" onChange={(e) => setPassword(e.target.value)} />
      <button className="w-full p-3 rounded bg-violet-600">Login</button>
      <Link to="/register" className="text-sm text-slate-300">Create account</Link>
    </form>
  );
}
