import type { Badge } from "@/lib/notes";

const tone: Partial<Record<Badge, string>> = {
  complete: "good",
  emailed: "good",
  "not delivered": "bad",
  cancelled: "bad",
  "destination missing": "warn",
  "not emailed": "warn",
  draft: "warn",
};

export default function Badges({ list }: { list: Badge[] }) {
  return (
    <span>
      {list.map((b) => (
        <span key={b} className={`badge ${tone[b] ?? ""}`}>
          {b}
        </span>
      ))}
    </span>
  );
}
