import { Router } from "express";
import { db } from "@workspace/db";
import { catchesTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { CreateCatchBody } from "@workspace/api-zod";

const router = Router();

router.get("/catches", async (req, res) => {
  try {
    const catches = await db.select().from(catchesTable).orderBy(desc(catchesTable.caughtAt));
    res.json(catches.map(c => ({
      ...c,
      caughtAt: c.caughtAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list catches");
    res.status(500).json({ error: "Failed to list catches" });
  }
});

router.post("/catches", async (req, res) => {
  const parsed = CreateCatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  try {
    const [entry] = await db.insert(catchesTable).values(parsed.data).returning();
    res.status(201).json({ ...entry, caughtAt: entry.caughtAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to create catch");
    res.status(500).json({ error: "Failed to create catch" });
  }
});

router.get("/catches/stats", async (req, res) => {
  try {
    const catches = await db.select().from(catchesTable);

    if (catches.length === 0) {
      res.json({
        totalCatches: 0,
        topSpecies: [],
        heaviestCatch: null,
        avgWeightKg: 0,
        catchesByWaterType: {},
      });
      return;
    }

    const speciesCounts: Record<string, number> = {};
    const waterTypeCounts: Record<string, number> = {};
    let heaviest = 0;
    let totalWeight = 0;

    for (const c of catches) {
      speciesCounts[c.species] = (speciesCounts[c.species] ?? 0) + 1;
      waterTypeCounts[c.waterBodyType] = (waterTypeCounts[c.waterBodyType] ?? 0) + 1;
      if (c.weightKg > heaviest) heaviest = c.weightKg;
      totalWeight += c.weightKg;
    }

    const topSpecies = Object.entries(speciesCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([s]) => s);

    res.json({
      totalCatches: catches.length,
      topSpecies,
      heaviestCatch: heaviest > 0 ? heaviest : null,
      avgWeightKg: totalWeight / catches.length,
      catchesByWaterType: waterTypeCounts,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get catch stats");
    res.status(500).json({ error: "Failed to get stats" });
  }
});

router.delete("/catches/clear", async (req, res) => {
  try {
    await db.delete(catchesTable);
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to clear catches");
    res.status(500).json({ error: "Failed to clear catches" });
  }
});

router.delete("/catches/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    await db.delete(catchesTable).where(eq(catchesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete catch");
    res.status(500).json({ error: "Failed to delete catch" });
  }
});

export default router;
