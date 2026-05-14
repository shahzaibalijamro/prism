import { GoogleGenAI } from "@google/genai";
import type {
    EmbedContentParameters,
    EmbedContentResponse,
    GenerateContentParameters,
    GenerateContentResponse,
} from "@google/genai";
import { Redis } from "@upstash/redis";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import type {
    ChatCompletion,
    ChatCompletionCreateParamsNonStreaming,
} from "groq-sdk/resources/chat/completions.mjs";
import { tavily as createTavily } from "@tavily/core";
import type {
    TavilyClient,
    TavilySearchOptions,
    TavilySearchResponse,
} from "@tavily/core";
import { truncateQuery } from "../utils/trim-query.js";
dotenv.config();

interface Config {
    port: number,
    NODE_ENV: string,
    mongoDBURI: string
}

const mongoDBURI = process.env.MONGODB_URI;
const geminiApiKeys = getApiKeys("GEMINI_API_KEYS");
const groqApiKeys = getApiKeys("GROQ_API_KEYS");
const tavilyApiKeys = getApiKeys("TAVILY_API_KEYS");

if (!mongoDBURI) throw new Error("ENV NOT FOUND!");

const geminiClients = geminiApiKeys.map((apiKey) => new GoogleGenAI({ apiKey }));
const groqClients = groqApiKeys.map((apiKey) => new Groq({ apiKey }));
const tavilyClients = tavilyApiKeys.map((apiKey) => createTavily({ apiKey }));
const geminiRotation = { currentIndex: 0 };
const groqRotation = { currentIndex: 0 };
const tavilyRotation = { currentIndex: 0 };

type GroqCreateOptions = Parameters<Groq["chat"]["completions"]["create"]>[1];

function getApiKeys(listEnvName: string): string[] {
    return Array.from(
        new Set(
            [process.env[listEnvName]]
                .flatMap((value) => value?.split(/[\s,]+/) ?? [])
                .map((key) => key.trim())
                .filter((key) => key.length > 0)
        )
    );
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
    if (typeof value === "object" && value !== null) return value as Record<string, unknown>;
    return undefined;
}

function getNumber(value: unknown): number | undefined {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) return parsed;
    }
    return undefined;
}

function isQuotaOrRateLimitError(error: unknown): boolean {
    const errorRecord = getRecord(error);
    const nestedError = getRecord(errorRecord?.error);
    const response = getRecord(errorRecord?.response);
    const status =
        getNumber(errorRecord?.status) ??
        getNumber(errorRecord?.statusCode) ??
        getNumber(response?.status) ??
        getNumber(nestedError?.code);

    const messageParts = [
        typeof error === "string" ? error : undefined,
        errorRecord?.code,
        errorRecord?.status,
        errorRecord?.message,
        nestedError?.code,
        nestedError?.status,
        nestedError?.message,
    ].filter((part): part is string | number => typeof part === "string" || typeof part === "number");

    const errorText = messageParts.join(" ").toLowerCase();

    return (
        status === 429 ||
        errorText.includes("resource_exhausted") ||
        errorText.includes("rate_limit") ||
        errorText.includes("rate limit") ||
        errorText.includes("too many requests") ||
        errorText.includes("limit exceeded") ||
        errorText.includes("quota")
    );
}

async function runWithKeyRotation<TClient, TResult>(
    clients: readonly TClient[],
    rotation: { currentIndex: number },
    request: (client: TClient) => Promise<TResult>,
): Promise<TResult> {
    for (let attempt = 0; attempt < clients.length; attempt += 1) {
        const client = clients[rotation.currentIndex];
        if (!client) throw new Error("No API clients configured");

        try {
            return await request(client);
        } catch (error) {
            if (!isQuotaOrRateLimitError(error) || attempt === clients.length - 1) throw error;
            rotation.currentIndex = (rotation.currentIndex + 1) % clients.length;
        }
    }

    throw new Error("No API clients configured");
}

export const genAI = {
    models: {
        generateContent: (params: GenerateContentParameters): Promise<GenerateContentResponse> =>
            runWithKeyRotation(geminiClients, geminiRotation, (client) => client.models.generateContent(params)),
        embedContent: (params: EmbedContentParameters): Promise<EmbedContentResponse> =>
            runWithKeyRotation(geminiClients, geminiRotation, (client) => client.models.embedContent(params)),
    },
};

export const groq = {
    chat: {
        completions: {
            create: (
                body: ChatCompletionCreateParamsNonStreaming,
                options?: GroqCreateOptions,
            ): Promise<ChatCompletion> =>
                runWithKeyRotation(groqClients, groqRotation, (client) =>
                    client.chat.completions.create(body, options)
                ),
        },
    },
};

export const tavily = {
    search: (query: string, options?: TavilySearchOptions): Promise<TavilySearchResponse> =>
        runWithKeyRotation<TavilyClient, TavilySearchResponse>(
            tavilyClients,
            tavilyRotation,
            (client) => client.search(truncateQuery(query), options)
        ),
};
export const redis = Redis.fromEnv();

const config: Config = {
    port: Number(process.env.PORT) || 3000,
    NODE_ENV: process.env.NODE_ENV || "development",
    mongoDBURI: mongoDBURI
}

export default config;
