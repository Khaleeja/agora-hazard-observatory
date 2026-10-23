import "dotenv/config";
import express from "express";
import cors from "cors";
import { StartupService } from "./services/StartupService";
import { IngestionService } from "./services/IngestionService";
import { IngestionStatusService } from "./services/IngestionStatusService";
import { SchedulerService } from "./services/SchedulerService";
import { USGSStrategy } from "./strategies/USGSStrategy";
import { IBTrACSStrategy } from "./strategies/IBTrACSStrategy";
import { connectDB } from "./configs/DBConnection";
import { GeoEventRepository } from "./repositories/GeoEventRepository";
import { createRouter } from "./routes";
import { GeoEventController } from "./controllers/GeoEventController";
import { EventSearchService } from "./services/EventSearchService";
import { createModuleLogger, serializeError } from "./logger/logger";
import { GeoJSONCollectionDto } from "./dtos/GeoJSONCollectionDto";
import { PhenomenonRegistry } from "./plugins/PhenomenonRegistry";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  }),
);
app.use(express.json());

async function main() {
  const logger = createModuleLogger("Main");
  const db = await connectDB();

  const registry = new PhenomenonRegistry();
  registry.register(new USGSStrategy()); // ora anche EarthquakePlugin
  registry.register(new IBTrACSStrategy()); // ora anche CyclonePlugin

  const repository = new GeoEventRepository(registry, db);
  await repository.ensureIndexes();

  const status = new IngestionStatusService();
  const ingestionService = new IngestionService(repository);
  const scheduler = new SchedulerService(
    [new USGSStrategy(), new IBTrACSStrategy()],
    ingestionService,
    repository,
    status,
  );
  const startup = new StartupService(
    registry,
    scheduler,
    ingestionService,
    repository,
    status,
  );

  const dto = new GeoJSONCollectionDto();
  const searchService = new EventSearchService(registry, repository, dto);
  const controller = new GeoEventController(registry, searchService);

  app.use("/api/", createRouter(controller, status, repository));

  // Not awaited: start() itself returns as soon as the server is listening,
  // running the initial data load in the background — see StartupService.
  await startup.start(app);

  logger.info("App ready to respond to Rest calls!");
}

main().catch((error) => {
  createModuleLogger("Main").error("Fatal startup error", {
    error: serializeError(error),
  });
  process.exit(1);
});
