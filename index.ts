import { createYoga } from "graphql-yoga";
import { schema } from "./src/schema.ts";

const yoga = createYoga({
  schema,
});

const server = Bun.serve({
  port: 4000,
  fetch: yoga,
});

console.log(
  `Server is running on http://${server.hostname}:${server.port}${yoga.graphqlEndpoint}`
);