import { Router } from "express";
import { db, locationObservationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { AddLocationObservationBody } from "@workspace/api-zod";

const router = Router();

router.get("/location-observations", async (req, res) => {
  const { locationName } = req.query;
  if (!locationName || typeof locationName !== "string") {
    res.status(400).json({ error: "locationName query param required" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(locationObservationsTable)
      .where(eq(locationObservationsTable.locationName, locationName));
    res.json(rows.map(r => ({ ...r, observedAt: r.observedAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Failed to get location observations");
    res.status(500).json({ error: "Failed to get observations" });
  }
});

router.post("/location-observations", async (req, res) => {
  const parsed = AddLocationObservationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const [row] = await db
      .insert(locationObservationsTable)
      .values(parsed.data)
      .returning();
    res.status(201).json({ ...row, observedAt: row.observedAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to add observation");
    res.status(500).json({ error: "Failed to add observation" });
  }
});

router.delete("/location-observations/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    await db
      .delete(locationObservationsTable)
      .where(eq(locationObservationsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete observation");
    res.status(500).json({ error: "Failed to delete observation" });
  }
});

export default router;
