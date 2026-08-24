import { createSchema } from "graphql-yoga";
import { resolvers } from "./resolvers.ts";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const typeDefs = readFileSync(join(__dirname, "../schema.graphql"), "utf-8");

export const schema = createSchema({
  typeDefs,
  resolvers,
});
