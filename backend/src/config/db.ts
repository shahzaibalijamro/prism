import config from "./config.js";
import mongoose from "mongoose";
import logger from "./logger.js";

const connectDB = async () => {
  try {
    await mongoose.connect(config.mongoDBURI);
  } catch (error) {
    logger.error(error);
  }
};

export {connectDB}