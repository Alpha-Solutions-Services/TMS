/** Cookies readable by the server /auth/callback route (sessionStorage is not). */
export function setTmsOAuthHints(nextPath: string, role: string) {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    const base = `; Path=/; SameSite=Lax; Max-Age=600${secure}`;
    document.cookie = `tms_oauth_next=${encodeURIComponent(nextPath)}${base}`;
    document.cookie = `tms_oauth_role=${encodeURIComponent(role)}${base}`;
    sessionStorage.setItem("tms_oauth_next", nextPath);
    sessionStorage.setItem("tms_oauth_role", role);
  } catch {
    /* ignore */
  }
}
