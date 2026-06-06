import { Router } from "express";
import { db } from "@workspace/db";
import { fishingSpotsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateSpotBody, DeleteSpotParams } from "@workspace/api-zod";

const router = Router();

router.get("/spots", async (req, res) => {
  try {
    const spots = await db.select().from(fishingSpotsTable).orderBy(fishingSpotsTable.createdAt);
    res.json(spots.map(s => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list spots");
    res.status(500).json({ error: "Failed to list spots" });
  }
});

router.post("/spots", async (req, res) => {
  const parsed = CreateSpotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  try {
    const [spot] = await db.insert(fishingSpotsTable).values(parsed.data).returning();
    res.status(201).json({ ...spot, createdAt: spot.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to create spot");
    res.status(500).json({ error: "Failed to create spot" });
  }
});

router.delete("/spots/:id", async (req, res) => {
  const parsed = DeleteSpotParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid spot ID" });
    return;
  }

  try {
    await db.delete(fishingSpotsTable).where(eq(fishingSpotsTable.id, parsed.data.id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete spot");
    res.status(500).json({ error: "Failed to delete spot" });
  }
});

export default router;
