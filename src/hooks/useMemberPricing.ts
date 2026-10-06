import { useUserRole } from "@/hooks/useUserRole";
import { useRegistrationEnabled } from "@/hooks/useRegistrationEnabled";

/**
 * Whether the shopper pays the member (discounted) price: members always do,
 * and while registration is switched off everyone does. Mirrors the server's
 * gets_member_price() — use this for prices only; coupon member/non-member
 * rules still use useUserRole().isMember.
 */
export function useMemberPricing() {
  const { isMember } = useUserRole();
  const { registrationEnabled } = useRegistrationEnabled();
  return isMember || !registrationEnabled;
}
