import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const configSchema = z.object({
  PORT: z.coerce.number().default(3040),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/jardim_das_sombras?schema=public'),
  API_KEY: z.string().default('jardim_secret_api_key_2026'),
  CORS_ORIGINS: z.string().default('*'),
  ASSETS_PATH: z.string().default(path.resolve(__dirname, '../../assets')),
  PUBLIC_URL: z.string().default('http://localhost:3040'),
  DATA_PATH: z.string().default(path.resolve(__dirname, '../../data')),
  SUPER_ADMIN_PASSWORD: z.string().default(''),
  // BotAPI (ravena-ai). Vazio = push de colheita desligado; o bot reconcilia no próximo comando.
  BOT_API_URL: z.string().default(''),
  // Vazio = usa a API_KEY do Jardim como x-api-key do webhook.
  BOT_API_TOKEN: z.string().default(''),
});

export const config = configSchema.parse({
  DATA_PATH: process.env.DATA_PATH,
  SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD,
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  API_KEY: process.env.API_KEY,
  CORS_ORIGINS: process.env.CORS_ORIGINS,
  ASSETS_PATH: process.env.ASSETS_PATH,
  PUBLIC_URL: process.env.PUBLIC_URL || process.env.BASE_URL,
  BOT_API_URL: process.env.BOT_API_URL,
  BOT_API_TOKEN: process.env.BOT_API_TOKEN,
});

export type Config = z.infer<typeof configSchema>;
