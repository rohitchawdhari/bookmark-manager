# Bookmark Manager GraphQL API

A robust and high-performance GraphQL API for organizing bookmarks into folders and searching/managing them, built using **Bun**, **TypeScript**, **GraphQL Yoga**, and **Prisma ORM v7** with PostgreSQL.

---

## Technical Stack & Features

- **Runtime**: [Bun](https://bun.sh/) (all-in-one JavaScript/TypeScript runtime)
- **Language**: TypeScript (in `strict` mode, fully type-safe with zero `any` usage)
- **API**: [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) (schema-first design)
- **Database**: PostgreSQL (containerized with Docker Compose)
- **ORM**: Prisma v7 (fully integrated with native SQL driver adapters)
- **Linter**: `oxlint` (super fast, modern JS/TS linting tool)
- **Testing**: Bun's native test runner (100% test coverage with unit and integration tests)

---

## Environment Variables

The project requires the following environment variables. Create a `.env` file in the root directory:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bookmark_manager"
```

*Note: Prisma v7 loads the environment variables via `prisma.config.ts` using `dotenv`.*

---

## Local Setup & Quick Start

You can get the application up and running locally with the following simple sequence of commands:

1. **Start PostgreSQL Container**
   ```bash
   docker compose up -d
   ```

2. **Install Dependencies**
   ```bash
   bun install
   ```

3. **Synchronize & Generate Database Schema**
   This script runs migrations on PostgreSQL and generates the Prisma Client.
   ```bash
   bun run gendb
   ```

4. **Start the Development Server**
   ```bash
   bun run dev
   ```

Once started, the interactive GraphiQL playground is available at **[http://localhost:4000/graphql](http://localhost:4000/graphql)**.

---

## Running the Test Suite & Sanity Checks

We provide a complete sanity check script to verify code quality before committing changes.

Run all lint checks, typecheck diagnostics, and test suites:
```bash
bun run sanity
```

Alternatively, you can run individual scripts:

- **Linting**: `bun run lint` (runs `oxlint`)
- **Typechecking**: `bun run typecheck` (runs `tsc --noEmit`)
- **Testing**: `bun run test` (runs both unit and integration tests)
- **Test in Watch Mode**: `bun test --watch`

---

## Cursor-Based Pagination Strategy

The `bookmarks` query supports robust cursor-based pagination.

### Arguments
- `take` (Int): The number of items to retrieve.
- `cursor` (String): The ID of the bookmark acting as the pagination pointer.

### Strategy Implementation
To determine if a next page exists without guessing, the API queries `take + 1` records:
1. If the length of the retrieved records is greater than `take`, we know there is a next page (`hasNextPage = true`).
2. We then slice the results back to the requested `take` limit.
3. The `endCursor` is set to the ID of the last item in the sliced results.
4. When `cursor` is provided, the query utilizes Prisma's `cursor` query option combined with a `skip: 1` flag to skip the cursor item itself, ensuring that pagination results traverse smoothly.
5. Cursors are sorted using a stable order: alphabetical sort on bookmark UUID (`orderBy: { id: 'asc' }`).

---

## GraphQL API Schema

Below are the main schema entry points. Check [schema.graphql](file:///d:/bookmark-manager/schema.graphql) for details.

### Queries

#### `folders: [Folder!]!`
Retrieve all folders ordered by creation date.

#### `folder(id: ID!): Folder`
Fetch a single folder and its nested bookmarks by ID.

#### `bookmarks(folderId: ID, search: String, take: Int, cursor: String): BookmarkConnection!`
Fetch paginated bookmarks with optional filters:
- `folderId`: filter bookmarks belonging to a specific folder.
- `search`: case-insensitive substring search matching bookmark titles.

### Mutations

#### `createFolder(name: String!): Folder!`
Create a new folder. Validates that the name is not empty or whitespace-only.

#### `createBookmark(title: String!, url: String!, folderId: ID!, tags: [String!]): Bookmark!`
Create a bookmark within a folder.
- **Validation**:
  - `title`: Throws a `BAD_USER_INPUT` error if empty or whitespace-only.
  - `url`: Throws a `BAD_USER_INPUT` error if the URL is malformed or doesn't use `http` or `https` protocols.
  - `folderId`: Throws a `NOT_FOUND` error if the specified folder does not exist.

#### `updateBookmark(id: ID!, title: String, url: String, tags: [String!]): Bookmark!`
Update properties of an existing bookmark. Checks validations if updating fields. Throws `NOT_FOUND` if the bookmark does not exist.

#### `deleteBookmark(id: ID!): Bookmark!`
Remove a bookmark.

#### `moveBookmark(id: ID!, folderId: ID!): Bookmark!`
Move a bookmark to a new folder. Throws `NOT_FOUND` if the bookmark or folder does not exist.

---

## Future Improvements & Extensibility

If this project were to evolve into a larger production system, here is how we would scale and extend it:

1. **Authentication & Authorization**
   - Implement JWT-based authentication using **GraphQL Yoga's shield middleware** or custom plugins.
   - Enforce row-level tenant isolation, ensuring users can only read/write folders and bookmarks they own.

2. **Caching**
   - Add **Query Caching** at the GraphQL edge using a CDN (e.g. Cloudflare) or a Redis-backed caching layer for frequently accessed bookmark folders.
   - Use Prisma's query caching or cache resolver results (e.g. using DataLoader to batch and cache nested database fetches, resolving N+1 queries).

3. **Search Improvements**
   - Replace database `ILIKE`/`contains` query filtering with a search solution like **PostgreSQL Full-Text Search**, Elasticsearch, or Meilisearch to support fuzzy matching, spelling tolerance, and ranking.

4. **Observability**
   - Integrate **OpenTelemetry** with tools like Datadog, Prometheus, or Grafana to monitor HTTP traffic, slow database calls, and resolver execution times.
   - Log structured JSON logs using Winston or Pino for easier parsing in log aggregators.

5. **API Versioning**
   - Leverage schema deprecation flags (`@deprecated` directive) instead of path-based versioning to smoothly transition clients to new fields.

6. **Scaling & Database Optimization**
   - Introduce database connection pooling (using PgBouncer or serverless connection pooling).
   - Use read replicas for heavy read queries (e.g. fetching folders/bookmarks) and route writes to the primary database.
