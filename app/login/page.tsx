import { Card } from "@/components/ui";
import { GlobalBrand } from "@/components/GlobalBrand";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Headroom — Sign in" };
export const dynamic = "force-dynamic";

/**
 * Sign-in page. Accounts are provisioned by Egzon's team (no self-serve
 * signup). After sign-in, "/" redirects to the user's own company dashboard.
 */
export default function LoginPage() {
  return (
    <>
      <GlobalBrand />
      <div className="stack">
        <Card>
          <div className="card-title">Sign in to Headroom</div>
          <div className="card-subtitle">Use the account your Headroom administrator created for your company.</div>
          <LoginForm />
        </Card>
      </div>
    </>
  );
}
