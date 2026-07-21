export async function sendAuthNotification(
  _email: string,
  _type: string,
  _meta?: Record<string, unknown>,
) {
  console.log("[auth-notify]", _type, _email);
}

export async function deliverAuthNotifications(
  _opts: {
    email?: string;
    event?: string;
    role?: string;
    displayName?: string;
    [key: string]: unknown;
  },
) {
  console.log("[auth-notify] deliver:", _opts.event, _opts.email);
}
