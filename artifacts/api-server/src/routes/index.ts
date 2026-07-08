import { Router, type IRouter } from "express";
import healthRouter from "./health";
import satellitesRouter from "./satellites";

const router: IRouter = Router();

router.use(healthRouter);
router.use(satellitesRouter);

export default router;
