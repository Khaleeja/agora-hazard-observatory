import { IngestionStatusService } from "../services/IngestionStatusService";

describe("IngestionStatusService", () => {
  it("has no status for a type until something is recorded", () => {
    const status = new IngestionStatusService();
    expect(status.getAll()).toEqual({});
  });

  it("setLoading marks a type as loading", () => {
    const status = new IngestionStatusService();
    status.setLoading("earthquake");
    expect(status.getAll().earthquake).toMatchObject({ state: "loading" });
  });

  it("setReady marks a type as ready and stamps lastUpdated", () => {
    const status = new IngestionStatusService();
    status.setReady("earthquake");
    const entry = status.getAll().earthquake;
    expect(entry.state).toBe("ready");
    expect(typeof entry.lastUpdated).toBe("number");
  });

  it("setFailed records the error message", () => {
    const status = new IngestionStatusService();
    status.setFailed("cyclone", new Error("network blip"));
    expect(status.getAll().cyclone).toMatchObject({
      state: "failed",
      error: "network blip",
    });
  });

  it("setFailed stringifies a non-Error thrown value", () => {
    const status = new IngestionStatusService();
    status.setFailed("cyclone", "plain string failure");
    expect(status.getAll().cyclone.error).toBe("plain string failure");
  });

  it("keeps the last successful lastUpdated after a later failure", () => {
    const status = new IngestionStatusService();
    status.setReady("cyclone");
    const readyTime = status.getAll().cyclone.lastUpdated;

    status.setFailed("cyclone", new Error("down"));
    expect(status.getAll().cyclone.lastUpdated).toBe(readyTime);
  });

  it("setLoading after a failure keeps the previous lastUpdated, not the failure", () => {
    const status = new IngestionStatusService();
    status.setReady("cyclone");
    const readyTime = status.getAll().cyclone.lastUpdated;
    status.setFailed("cyclone", new Error("down"));

    status.setLoading("cyclone");
    const entry = status.getAll().cyclone;
    expect(entry.state).toBe("loading");
    expect(entry.lastUpdated).toBe(readyTime);
  });

  it("tracks multiple types independently", () => {
    const status = new IngestionStatusService();
    status.setReady("earthquake");
    status.setFailed("cyclone", new Error("down"));

    const all = status.getAll();
    expect(all.earthquake.state).toBe("ready");
    expect(all.cyclone.state).toBe("failed");
  });
});
