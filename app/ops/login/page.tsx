import LoginForm from "./LoginForm";
import { publishedPassphrase } from "@/lib/demo";

export const dynamic = "force-dynamic";

/**
 * The sign-in page, and on a demonstration deployment, the way in.
 *
 * A server component so the deployment's own configuration decides what the
 * page says, rather than the browser asking an endpoint that would then have to
 * be careful about who it answers.
 *
 * On a deployment carrying real reports this renders exactly what it always
 * rendered: a passphrase box and nothing else.
 */
export default function OpsLoginPage() {
  return <LoginForm demoPassphrase={publishedPassphrase("ops")} />;
}
