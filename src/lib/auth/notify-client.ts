export async function notifyOpsOfSignup(_email: string, _role?: string) {
  console.log("[notify-client] signup:", _email, _role);
}

export async function notifyAuthActivityClient(
  _type: string,
  _meta?: Record<string, unknown>,
) {
  console.log("[notify-client] activity:", _type, _meta);
}
