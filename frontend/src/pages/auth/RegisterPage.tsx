import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import type { BusinessType } from "../../types/auth";

export function RegisterPage() {
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    businessName: "",
    businessType: "APPOINTMENT" as BusinessType,
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await register(form);
    navigate(form.businessType === "APPOINTMENT" ? "/appointment-dashboard" : "/order-dashboard");
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-2xl font-semibold">Create your SaaS account</h1>
      <input className="w-full p-3 rounded bg-slate-800" placeholder="Full name" onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
      <input className="w-full p-3 rounded bg-slate-800" placeholder="Business" onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
      <select className="w-full p-3 rounded bg-slate-800" onChange={(e) => setForm({ ...form, businessType: e.target.value as BusinessType })}>
        <option value="APPOINTMENT">Appointment Business</option>
        <option value="ORDER">Order Business</option>
      </select>
      <input className="w-full p-3 rounded bg-slate-800" placeholder="Email" onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input type="password" className="w-full p-3 rounded bg-slate-800" placeholder="Password" onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <button className="w-full p-3 rounded bg-violet-600">Register</button>
    </form>
  );
}
