// Membership level is separate from account permissions and founder designation.
export function memberLevelLabel(level: string | null | undefined, feePaid: number | null | undefined): string {
  if (!(Number(feePaid) > 0)) return "No role";
  return level ? level.charAt(0).toUpperCase() + level.slice(1) : "Associate";
}
