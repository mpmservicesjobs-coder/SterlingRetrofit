import { Suspense } from "react";
import { requireOperativePage } from "@/lib/auth";
import NoteWizard from "@/components/NoteWizard";

export const dynamic = "force-dynamic";

export default async function NewNote() {
  await requireOperativePage();
  return (
    <Suspense fallback={<main className="wrap">Loading</main>}>
      <NoteWizard />
    </Suspense>
  );
}
