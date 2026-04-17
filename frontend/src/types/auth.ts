export type BusinessType = "APPOINTMENT" | "ORDER";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  businessId: string;
  businessType: BusinessType;
};
