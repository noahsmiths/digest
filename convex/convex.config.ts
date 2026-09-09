import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
    env: {
        FIRECRAWL_API_KEY: v.string(),
        OPENAI_API_KEY: v.string(),
    }
});

export default app;