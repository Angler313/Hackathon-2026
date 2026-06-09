import express from "express";
import cors from "cors";
import fishingRouter from "../artifacts/api-server/src/routes/fishing/index";
import spotsRouter from "../artifacts/api-server/src/routes/spots";
import catchesRouter from "../artifacts/api-server/src/routes/catches";
import observationsRouter from "../artifacts/api-server/src/routes/observations";
import healthRouter from "../artifacts/api-server/src/routes/health";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", healthRouter);
app.use("/api/fishing", fishingRouter);
app.use("/api", spotsRouter);
app.use("/api", catchesRouter);
app.use("/api", observationsRouter);

app.use("/api/*", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

export default app;
