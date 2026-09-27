"use client";
import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/note/sw.js", { scope: "/note" }).catch(() => null);
    }
  }, []);
  return null;
}
