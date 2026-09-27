import Link from "next/link";
import type { Operative } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

export default function TopBar({ op, title }: { op: Operative; title?: string }) {
  return (
    <header className="topbar">
      <Link href="/" aria-label="Home">
        <img src="/note/offload-logo.jpg" alt="Offload Waste Removal" width={40} height={40} />
      </Link>
      <strong style={{ fontSize: 16 }}>{title ?? "Transfer notes"}</strong>
      <div className="who">
        {op.name}
        <br />
        <LogoutButton />
      </div>
    </header>
  );
}
