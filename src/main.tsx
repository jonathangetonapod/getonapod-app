import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import "./index.css";
import { initSentry } from "./lib/sentry";
import { installChunkReloadHandler } from "./lib/chunkReload";
import {
  hasSensitiveAuthParameters,
  isSensitiveTelemetryLocation,
  scrubConsumedAuthParameters,
} from "./lib/sensitiveUrl";

installChunkReloadHandler();

async function bootstrap(): Promise<void> {
  const suppressTelemetry = isSensitiveTelemetryLocation();

  // Supabase must consume invite/OAuth credentials before telemetry starts.
  // App is dynamically imported so its default Auth client cannot race Sentry.
  if (hasSensitiveAuthParameters()) {
    try {
      const { supabase } = await import("./lib/supabase");
      await supabase.auth.getSession();
    } catch {
      // The invite UI owns the user-facing Auth error. Credentials are still
      // removed from the address bar before any other application code loads.
    } finally {
      scrubConsumedAuthParameters();
    }
  }

  if (!suppressTelemetry) initSentry();

  const [{ default: App }, { default: ErrorBoundary }, { supabase }, { clearMailboxCaches }] = await Promise.all([
    import("./App.tsx"),
    import("./components/ErrorBoundary"),
    import("./lib/supabase"),
    import("./lib/mailboxCache"),
  ]);

  // The mailboxes page keeps its last list in localStorage. A browser with no
  // signed-in user keeps none: on sign-out (here or in another tab, and when a
  // session expires) and on a load that starts signed out.
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session)) clearMailboxCaches();
  });

  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </ErrorBoundary>
  );
}

void bootstrap();
