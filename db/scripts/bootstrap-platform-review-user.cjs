const { Client } = require("../../node_modules/.pnpm/pg@8.20.0/node_modules/pg");

const APP_ENV = process.env.APP_ENV ?? "local";
const DATABASE_ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  "postgresql://vision_admin:vision_admin_password@localhost:5433/postgres";
const DATABASE_ADMIN_TARGET_DB = process.env.DATABASE_ADMIN_TARGET_DB ?? "vision_local";

if (APP_ENV !== "local" && APP_ENV !== "test") {
  throw new Error("bootstrap-platform-review-user is allowed only in local or test environments");
}

const REVIEW_LOGIN_IDENTIFIER = "platform.review@vision.test";
const REVIEW_PASSWORD = "S3cure-owner-password!";
const REVIEW_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$ENnWjUjJi8bWx2ao6lZKSw$wS0wflZ4DKcD0J80hG2iPXGXiOCg7m+fE48ViG2BT3A";
const REVIEW_SUBJECT_ID = "sub_phase10_review_admin";

const adminTargetUrl = new URL(DATABASE_ADMIN_URL);
adminTargetUrl.pathname = `/${DATABASE_ADMIN_TARGET_DB}`;

const client = new Client({
  connectionString: adminTargetUrl.toString(),
});

async function main() {
  await client.connect();

  await client.query(
    `
      insert into public.auth_subjects (
        id,
        subject_type,
        login_identifier,
        normalized_login_identifier,
        password_hash,
        internal_sensitivity,
        is_enabled
      )
      values ($1::varchar, 'internal', $2::varchar, lower($2::varchar), $3::varchar, 'platform_admin', true)
      on conflict (subject_type, normalized_login_identifier)
      do update
      set
        login_identifier = excluded.login_identifier,
        password_hash = excluded.password_hash,
        internal_sensitivity = excluded.internal_sensitivity,
        is_enabled = excluded.is_enabled,
        updated_at = now()
    `,
    [REVIEW_SUBJECT_ID, REVIEW_LOGIN_IDENTIFIER, REVIEW_PASSWORD_HASH],
  );

  await client.query(
    `
      delete from public.auth_mfa_backup_codes
      where subject_id = $1
    `,
    [REVIEW_SUBJECT_ID],
  );

  await client.query(
    `
      delete from public.auth_mfa_totp_factors
      where subject_id = $1
    `,
    [REVIEW_SUBJECT_ID],
  );

  console.log("Platform review user is ready.");
  console.log(`Login identifier: ${REVIEW_LOGIN_IDENTIFIER}`);
  console.log(`Password: ${REVIEW_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => undefined);
  });
