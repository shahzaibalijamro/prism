import { GoogleGenAI } from "@google/genai";
import { Redis } from "@upstash/redis";
import dotenv from "dotenv";
import Groq from "groq-sdk";
dotenv.config();

interface Config {
    port: number,
    NODE_ENV: string,
    mongoDBURI: string,
    geminiApiKey: string,
    groqApiKey: string
}

const mongoDBURI = process.env.MONGODB_URI;
const geminiApiKey = process.env.GEMINI_API_KEY;
const groqApiKey = process.env.GROQ_API_KEY;

if (!mongoDBURI || !geminiApiKey || !groqApiKey) throw new Error("ENV NOT FOUND!");

export const genAI = new GoogleGenAI({
    apiKey: geminiApiKey
});
export const groq = new Groq({ 
    apiKey: process.env.GROQ_API_KEY 
});
export const redis = Redis.fromEnv();

const config: Config = {
    port: Number(process.env.PORT) || 3000,
    NODE_ENV: process.env.NODE_ENV || "development",
    mongoDBURI: mongoDBURI,
    geminiApiKey: geminiApiKey,
    groqApiKey,
}

export default config;