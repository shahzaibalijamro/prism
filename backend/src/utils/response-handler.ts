import type { Response } from "express";

export const sendError = (
  res: Response,
  status: number,
  message: string,
  errors?: unknown
) => {
  return res.status(status).json({
    success: false,
    message,
    errors,
  });
};

export const sendSuccess = (
  res: Response,
  status: number,
  data?: unknown,
  message: string = "Success",
) => {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
};