import type { Request } from "express";

const generateRedisKey = (req: Request): string => {

  const path = req.path
    .replace(/^\/+|\/+$/g, "")
    .replace(/\//g, ":");

  const query = req.query;

  const sortedQuery = Object.keys(query)
    .sort()
    .map((key) => {
      const value = query[key];

      if (Array.isArray(value)) {
        return value
          .sort()
          .map((v) => `${key}=${v}`)
          .join("&");
      }

      return `${key}=${value}`;
    })
    .join("&");

  return sortedQuery ? `${path}?${sortedQuery}` : path;
};

export { generateRedisKey };