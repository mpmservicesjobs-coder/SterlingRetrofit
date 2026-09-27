import Link from "next/link";

const LINKS = [
  { href: "/admin", label: "Notes" },
  { href: "/admin/operatives", label: "Operatives" },
  { href: "/admin/vehicles", label: "Vehicles" },
  { href: "/admin/sites", label: "Destination sites" },
  { href: "/", label: "Phone view" },
];

export default function AdminNav({ on }: { on: string }) {
  return (
    <nav className="adminnav">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={on === l.href ? "on" : ""}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
