process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://app:app@localhost:5432/appoint_test";
process.env.APP_SECRET = "test-secret-test-secret-test-secret-0123456789";
process.env.APP_URL = "http://localhost:3000";
process.env.STORAGE_DIR = "./storage-test";
for (const k of ["STRIPE_SECRET_KEY", "RESEND_API_KEY", "TWILIO_ACCOUNT_SID", "GOOGLE_CLIENT_ID"]) delete process.env[k];
