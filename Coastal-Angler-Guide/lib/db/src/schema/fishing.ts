import { pgTable, text, serial, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fishingSpotsTable = pgTable("fishing_spots", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  waterBodyType: text("water_body_type").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFishingSpotSchema = createInsertSchema(fishingSpotsTable).omit({ id: true, createdAt: true });
export type InsertFishingSpot = z.infer<typeof insertFishingSpotSchema>;
export type FishingSpot = typeof fishingSpotsTable.$inferSelect;

export const catchesTable = pgTable("catches", {
  id: serial("id").primaryKey(),
  species: text("species").notNull(),
  weightKg: real("weight_kg").notNull(),
  lengthCm: real("length_cm").notNull(),
  waterBodyType: text("water_body_type").notNull(),
  rigUsed: text("rig_used"),
  baitUsed: text("bait_used"),
  imageBase64: text("image_base64"),
  notes: text("notes"),
  caughtAt: timestamp("caught_at").defaultNow().notNull(),
});

export const insertCatchSchema = createInsertSchema(catchesTable).omit({ id: true, caughtAt: true });
export type InsertCatch = z.infer<typeof insertCatchSchema>;
export type CatchEntry = typeof catchesTable.$inferSelect;

export const locationObservationsTable = pgTable("location_observations", {
  id: serial("id").primaryKey(),
  locationName: text("location_name").notNull(),
  resolvedName: text("resolved_name").notNull(),
  species: text("species").notNull(),
  notes: text("notes"),
  observedAt: timestamp("observed_at").defaultNow().notNull(),
});

export const insertLocationObservationSchema = createInsertSchema(locationObservationsTable).omit({ id: true, observedAt: true });
export type InsertLocationObservation = z.infer<typeof insertLocationObservationSchema>;
export type LocationObservation = typeof locationObservationsTable.$inferSelect;
