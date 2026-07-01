import { useEffect } from "react";
import useCurrentUser from "@/features/user/hooks/use-current-user.ts";
import { redirectAfterLogin } from "@/lib/app-route.ts";
import { useNavigate } from "react-router-dom";

export function useRedirectIfAuthenticated() {
  const { data, isLoading } = useCurrentUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (data && data?.user) {
      redirectAfterLogin(navigate);
    }
  }, [isLoading, data]);
}
