import { redirect } from "next/navigation";
import { currentOperative } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  if (await currentOperative()) redirect("/");
  return (
    <main className="wrap" style={{ paddingTop: 32 }}>
      <img src="/note/offload-logo.jpg" alt="Offload Waste Removal" width={120} height={120} style={{ borderRadius: 12, background: "#fff", display: "block", marginBottom: 16 }} />
      <h1>Transfer notes</h1>
      <p className="smallprint">For Offload operatives only.</p>
      <LoginForm />
    </main>
  );
}
