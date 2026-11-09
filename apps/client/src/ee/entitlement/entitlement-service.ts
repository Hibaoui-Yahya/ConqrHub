import api from "@/lib/api-client";
import { Entitlements } from "./entitlement.types";
import { withoutUnavailable } from "@/ee/unavailable-features";

export async function getEntitlements(): Promise<Entitlements> {
  const req = await api.post<Entitlements>("/workspace/entitlements");
  const data = req.data as Entitlements;
  // Never advertise a feature whose endpoints do not exist in this build.
  return data ? { ...data, features: withoutUnavailable(data.features) } : data;
}
