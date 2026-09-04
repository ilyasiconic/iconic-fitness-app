import app from "./app";
import { logger } from "./lib/logger";
import { ensureSessionTable } from "./lib/adminAuth";
import { ensureStoreColumns } from "./routes/store";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main(): Promise<void> {
  await ensureSessionTable();
  // Additive store columns (payment + GST/shipping) must exist before any
  // route selects from products/product_orders — run before listen so a
  // freshly published database self-migrates ahead of the first request.
  try {
    await ensureStoreColumns();
  } catch (err) {
    logger.error({ err }, "Could not ensure store columns");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "Fatal error during server startup");
  process.exit(1);
});
