export function deriveAdminTargetDatabaseUrl(
  adminDatabaseUrl: string,
  targetDatabaseName: string,
): string {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${targetDatabaseName}`;

  return url.toString();
}

export function parseDatabaseRoleCredentials(databaseUrl: string): {
  roleName: string;
  rolePassword: string;
} {
  const url = new URL(databaseUrl);
  const roleName = decodeURIComponent(url.username);
  const rolePassword = decodeURIComponent(url.password);

  if (!roleName || !rolePassword) {
    throw new Error("DATABASE_URL must include a runtime role username and password");
  }

  return {
    roleName,
    rolePassword,
  };
}
