import dotenv from "dotenv";
dotenv.config();

interface Config {
    port: number,
    NODE_ENV: string
}

const config: Config = {
    port: Number(process.env.PORT) || 3000,
    NODE_ENV: process.env.NODE_ENV || "development"
}

export default config;