import type { ErrorRequestHandler } from "express";
import logger from "../config/logger.js";

const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  logger.error(err instanceof Error ? err.message : String(err));
  return res.status(500).send("Internal Server Error");
};

export { errorHandler };
