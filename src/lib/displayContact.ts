// Login ids are stored as {phone}@elabazar.local — show the readable phone instead.
export const displayContact = (email: string) => {
  const local = (email || "").split("@")[0];
  if (/^\d{10,14}$/.test(local)) {
    const digits = local.length > 10 ? local.slice(-10) : local;
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return email;
};
