import express from "express";
import cors from "cors";
import fishingRouter from "../artifacts/api-server/src/routes/fishing/index";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/api/fishing", fishingRouter);

export default app;
