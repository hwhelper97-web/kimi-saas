import axios from "axios";
import { useAuthStore } from "../store/authStore";

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api" });

api.interceptors.request.use((config) => {
  const { token, user } = useAuthStore.getState();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (user?.businessId) config.headers["x-business-id"] = user.businessId;
  return config;
});
