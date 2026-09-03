import LoginForm from "./LoginForm";
import { publishedPassphrase } from "@/lib/demo";

export const dynamic = "force-dynamic";

/** As with the operator sign-in: the deployment decides what this page says. */
export default function FieldLoginPage() {
  return <LoginForm demoPassphrase={publishedPassphrase("field")} />;
}
