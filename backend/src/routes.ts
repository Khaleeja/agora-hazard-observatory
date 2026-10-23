import { Router } from "express";
import data from "../package.json";
import { GeoEventController } from "./controllers/GeoEventController";
import { IngestionStatusService } from "./services/IngestionStatusService";
import { IEventReadRepository } from "./repositories/IEventReadRepository";

export function createRouter(
  controller: GeoEventController,
  status: IngestionStatusService,
  repository: IEventReadRepository,
): Router {
  const router = Router();

  router.get("/health", async (_req, res) => {
    const ingestion = status.getAll();
    // A live count per type, not just the in-memory load state — "ready"
    // alone doesn't tell a caller whether that just means "ready, 0 events"
    // right after a fresh start vs. actually populated.
    const counts = await Promise.all(
      Object.keys(ingestion).map(
        async (type) => [type, await repository.countByType(type)] as const,
      ),
    );
    const withCounts = Object.fromEntries(
      Object.entries(ingestion).map(([type, s]) => [
        type,
        { ...s, count: counts.find(([t]) => t === type)?.[1] ?? 0 },
      ]),
    );
    const degraded = Object.values(ingestion).some((s) => s.state === "failed");

    // 200 even when degraded: the process itself is up and can still serve
    // whatever's already loaded — reserve a non-2xx for "can't respond at
    // all", so a Docker healthcheck doesn't restart a server that's merely
    // missing one data source.
    res.status(200).json({
      status: degraded ? "degraded" : "ok",
      uptime: process.uptime(),
      version: data.version,
      ingestion: withCounts,
    });
  });

  //router.post("/");
  router.get("/events/search", controller.getSearchEvents.bind(controller));
  router.get("/events/:id", controller.getEventById.bind(controller));
  router.get("/brew_coffee", (_req, res) =>
    res.status(418).json({ error: "I'm a teapot" }),
  );
  //router.patch("/");
  //router.delete("/");

  return router;
}
