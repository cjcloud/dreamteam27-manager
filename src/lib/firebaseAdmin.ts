import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

// Same three env vars as dreamteam27-capture (PROJECT-STATUS.md §6):
// FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY.
// Reuse the same footieteamz27 service-account key used by capture — no
// need to generate a second one, same project.
let app: App;

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const databaseURL =
    process.env.FIREBASE_DATABASE_URL ??
    "https://footieteamz27-default-rtdb.europe-west1.firebasedatabase.app";

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing FIREBASE_ADMIN_* env vars. Set FIREBASE_ADMIN_PROJECT_ID, " +
        "FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY (same values " +
        "as dreamteam27-capture's .env.local / Vercel env)."
    );
  }

  app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    databaseURL,
  });
  return app;
}

export function adminDb() {
  return getDatabase(getAdminApp());
}
