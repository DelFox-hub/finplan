import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FinanceApp from "@/components/FinanceApp";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) redirect("/login");

  const allowedEmail = process.env.ALLOWED_EMAIL;
  if (allowedEmail && data.user.email?.toLowerCase() !== allowedEmail.toLowerCase()) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  return <FinanceApp userId={data.user.id} userEmail={data.user.email || ""} />;
}
