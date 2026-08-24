import { GraphQLError } from "graphql";
import { prisma } from "./db.ts";
import type { Folder, Bookmark } from "../generated/prisma/client";

interface FolderArgs {
  id: string;
}

interface BookmarksArgs {
  folderId?: string | null;
  search?: string | null;
  take?: number | null;
  cursor?: string | null;
}

interface CreateFolderArgs {
  name: string;
}

interface CreateBookmarkArgs {
  title: string;
  url: string;
  folderId: string;
  tags?: string[] | null;
}

interface UpdateBookmarkArgs {
  id: string;
  title?: string | null;
  url?: string | null;
  tags?: string[] | null;
}

interface DeleteBookmarkArgs {
  id: string;
}

interface MoveBookmarkArgs {
  id: string;
  folderId: string;
}

interface BookmarkEdge {
  cursor: string;
  node: Bookmark;
}

interface PageInfo {
  endCursor: string | null;
  hasNextPage: boolean;
}

interface BookmarkConnection {
  edges: BookmarkEdge[];
  pageInfo: PageInfo;
}

function validateTitle(title: string): void {
  if (!title || title.trim() === "") {
    throw new GraphQLError("Bookmark title cannot be empty or whitespace only", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
}

function validateUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error();
    }
  } catch {
    throw new GraphQLError(`Invalid URL: "${url}". URL must be a valid absolute HTTP or HTTPS URL.`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
}

export const resolvers = {
  Query: {
    folders: async (): Promise<Folder[]> => {
      return prisma.folder.findMany({
        orderBy: { createdAt: "asc" },
      });
    },

    folder: async (_parent: unknown, { id }: FolderArgs): Promise<Folder | null> => {
      return prisma.folder.findUnique({
        where: { id },
      });
    },

    bookmarks: async (_parent: unknown, args: BookmarksArgs): Promise<BookmarkConnection> => {
      const { folderId, search, take, cursor } = args;

      const where: { folderId?: string; title?: { contains: string; mode: "insensitive" } } = {};
      if (folderId) {
        where.folderId = folderId;
      }
      if (search) {
        where.title = {
          contains: search,
          mode: "insensitive",
        };
      }

      const limit = take !== undefined && take !== null ? take : null;

      let items: Bookmark[];
      if (limit !== null) {
        // Fetch take + 1 items to see if there is a next page
        const queryParams: {
          where: typeof where;
          take: number;
          orderBy: { id: "asc" };
          cursor?: { id: string };
          skip?: number;
        } = {
          where,
          take: limit + 1,
          orderBy: { id: "asc" },
        };

        if (cursor) {
          queryParams.cursor = { id: cursor };
          queryParams.skip = 1;
        }

        items = await prisma.bookmark.findMany(queryParams);
      } else {
        items = await prisma.bookmark.findMany({
          where,
          orderBy: { id: "asc" },
        });
      }

      let hasNextPage = false;
      let edges = items;

      if (limit !== null && items.length > limit) {
        hasNextPage = true;
        edges = items.slice(0, limit);
      }

      const endCursor = edges.length > 0 ? edges[edges.length - 1]!.id : null;

      return {
        edges: edges.map((node) => ({
          cursor: node.id,
          node,
        })),
        pageInfo: {
          endCursor,
          hasNextPage,
        },
      };
    },
  },

  Mutation: {
    createFolder: async (_parent: unknown, { name }: CreateFolderArgs): Promise<Folder> => {
      if (!name || name.trim() === "") {
        throw new GraphQLError("Folder name cannot be empty or whitespace only", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      return prisma.folder.create({
        data: { name },
      });
    },

    createBookmark: async (_parent: unknown, args: CreateBookmarkArgs): Promise<Bookmark> => {
      const { title, url, folderId, tags } = args;

      validateTitle(title);
      validateUrl(url);

      const folder = await prisma.folder.findUnique({
        where: { id: folderId },
      });
      if (!folder) {
        throw new GraphQLError(`Folder with ID "${folderId}" not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      }

      return prisma.bookmark.create({
        data: {
          title,
          url,
          folderId,
          tags: tags ?? [],
        },
      });
    },

    updateBookmark: async (_parent: unknown, args: UpdateBookmarkArgs): Promise<Bookmark> => {
      const { id, title, url, tags } = args;

      const bookmark = await prisma.bookmark.findUnique({
        where: { id },
      });
      if (!bookmark) {
        throw new GraphQLError(`Bookmark with ID "${id}" not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      }

      if (title !== undefined && title !== null) {
        validateTitle(title);
      }
      if (url !== undefined && url !== null) {
        validateUrl(url);
      }

      return prisma.bookmark.update({
        where: { id },
        data: {
          title: title ?? undefined,
          url: url ?? undefined,
          tags: tags ?? undefined,
        },
      });
    },

    deleteBookmark: async (_parent: unknown, { id }: DeleteBookmarkArgs): Promise<Bookmark> => {
      const bookmark = await prisma.bookmark.findUnique({
        where: { id },
      });
      if (!bookmark) {
        throw new GraphQLError(`Bookmark with ID "${id}" not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      }

      return prisma.bookmark.delete({
        where: { id },
      });
    },

    moveBookmark: async (_parent: unknown, args: MoveBookmarkArgs): Promise<Bookmark> => {
      const { id, folderId } = args;

      const bookmark = await prisma.bookmark.findUnique({
        where: { id },
      });
      if (!bookmark) {
        throw new GraphQLError(`Bookmark with ID "${id}" not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      }

      const folder = await prisma.folder.findUnique({
        where: { id: folderId },
      });
      if (!folder) {
        throw new GraphQLError(`Folder with ID "${folderId}" not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      }

      return prisma.bookmark.update({
        where: { id },
        data: { folderId },
      });
    },
  },

  Folder: {
    bookmarks: async (parent: Folder): Promise<Bookmark[]> => {
      return prisma.bookmark.findMany({
        where: { folderId: parent.id },
        orderBy: { createdAt: "asc" },
      });
    },
    createdAt: (parent: Folder): string => {
      return parent.createdAt.toISOString();
    },
  },

  Bookmark: {
    folder: async (parent: Bookmark): Promise<Folder | null> => {
      return prisma.folder.findUnique({
        where: { id: parent.folderId },
      });
    },
    createdAt: (parent: Bookmark): string => {
      return parent.createdAt.toISOString();
    },
  },
};
