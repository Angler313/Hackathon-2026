import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fishingRouter from "./fishing";
import spotsRouter from "./spots";
import catchesRouter from "./catches";
import observationsRouter from "./observations";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/fishing", fishingRouter);
router.use(spotsRouter);
router.use(catchesRouter);
router.use(observationsRouter);

export default router;
