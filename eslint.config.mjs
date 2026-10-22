import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        // Generated / build output is never linted.
        ignores: ["node_modules", "dist", "src/db/generated/**", "src/db/prisma/migrations/**"],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["src/**/*.ts", "prisma.config.ts"],
        rules: {
            // The codebase uses `any` for Prisma tx clients and req/res in many
            // places. Surface it as a warning instead of blocking the build;
            // tighten to "error" once those are typed.
            "@typescript-eslint/no-explicit-any": "warn",
            // Allow intentionally-unused args prefixed with _ (e.g. Express `next`).
            "@typescript-eslint/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
        },
    }
);
