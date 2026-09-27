"use client";
import { apiUrl } from "./client";

export default function LogoutButton() {
  return (
    <button
      className="linkbtn"
      style={{ minHeight: 0, padding: 0, fontSize: 14 }}
      onClick={async () => {
        if (!confirm("Log out on this phone?")) return;
        await fetch(apiUrl("/api/auth/logout"), { method: "POST" }).catch(() => null);
        window.location.href = "/note/login";
      }}
    >
      Log out
    </button>
  );
}
