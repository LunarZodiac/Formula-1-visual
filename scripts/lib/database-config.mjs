export function databaseConfig(applicationName) {
  const required = [
    'DATABASE_HOST',
    'DATABASE_PORT',
    'DATABASE_NAME',
    'DATABASE_USER',
    'DATABASE_PASSWORD',
  ];

  const missing = required.filter((name) => !process.env[name]);

  if (missing.length) {
    throw new Error(
      `Не заданы параметры базы: ${missing.join(', ')}`,
    );
  }

  return {
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,

    ssl: {
      rejectUnauthorized: false,
    },

    application_name: applicationName,
  };
}