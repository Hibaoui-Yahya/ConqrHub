import { useAtom } from "jotai";
import { entitlementAtom } from "@/ee/entitlement/entitlement-atom";
import { isFeatureUnavailable } from "@/ee/unavailable-features";

export const useHasFeature = (feature: string): boolean => {
  const [entitlements] = useAtom(entitlementAtom);
  if (isFeatureUnavailable(feature)) return false;
  return entitlements?.features?.includes(feature) ?? false;
};
