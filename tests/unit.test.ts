import { describe, it, expect, mock, beforeEach } from "bun:test";
import { GraphQLError } from "graphql";

import type { Folder, Bookmark } from "../generated/prisma/client";

// Define mock functions so we can control their return values and inspect calls
const mockFolderFindMany = mock((): Promise<Folder[]> => Promise.resolve([]));
const mockFolderFindUnique = mock((_args: unknown): Promise<Folder | null> => Promise.resolve(null));
const mockFolderCreate = mock((_args: unknown): Promise<Folder> => Promise.resolve({} as Folder));

const mockBookmarkFindMany = mock((): Promise<Bookmark[]> => Promise.resolve([]));
const mockBookmarkFindUnique = mock((_args: unknown): Promise<Bookmark | null> => Promise.resolve(null));
const mockBookmarkCreate = mock((_args: unknown): Promise<Bookmark> => Promise.resolve({} as Bookmark));
const mockBookmarkUpdate = mock((_args: unknown): Promise<Bookmark> => Promise.resolve({} as Bookmark));
const mockBookmarkDelete = mock((_args: unknown): Promise<Bookmark> => Promise.resolve({} as Bookmark));

// Mock the database module
mock.module("../src/db.ts", () => ({
  prisma: {
    folder: {
      findMany: mockFolderFindMany,
      findUnique: mockFolderFindUnique,
      create: mockFolderCreate,
    },
    bookmark: {
      findMany: mockBookmarkFindMany,
      findUnique: mockBookmarkFindUnique,
      create: mockBookmarkCreate,
      update: mockBookmarkUpdate,
      delete: mockBookmarkDelete,
    },
  },
}));

// Import the resolvers *after* mocking the module
import { resolvers } from "../src/resolvers.ts";

describe("Resolvers Unit Tests", () => {
  beforeEach(() => {
    mockFolderFindMany.mockClear();
    mockFolderFindUnique.mockClear();
    mockFolderCreate.mockClear();
    mockBookmarkFindMany.mockClear();
    mockBookmarkFindUnique.mockClear();
    mockBookmarkCreate.mockClear();
    mockBookmarkUpdate.mockClear();
    mockBookmarkDelete.mockClear();
  });

  describe("Query Resolvers", () => {
    it("folders should call prisma.folder.findMany", async () => {
      const mockFolders = [
        { id: "1", name: "Folder 1", createdAt: new Date() },
        { id: "2", name: "Folder 2", createdAt: new Date() },
      ];
      mockFolderFindMany.mockImplementation(() => Promise.resolve(mockFolders));

      const result = await resolvers.Query.folders();
      expect(result).toEqual(mockFolders);
      expect(mockFolderFindMany).toHaveBeenCalledTimes(1);
    });

    it("folder should call prisma.folder.findUnique with the correct id", async () => {
      const mockFolder = { id: "1", name: "Folder 1", createdAt: new Date() };
      mockFolderFindUnique.mockImplementation(() => Promise.resolve(mockFolder));

      const result = await resolvers.Query.folder(null, { id: "1" });
      expect(result).toEqual(mockFolder);
      expect(mockFolderFindUnique).toHaveBeenCalledWith({ where: { id: "1" } });
    });
  });

  describe("Mutation Resolvers & Input Validation", () => {
    it("createFolder should throw if name is empty", async () => {
      expect(
        resolvers.Mutation.createFolder(null, { name: "" })
      ).rejects.toThrow("Folder name cannot be empty or whitespace only");

      expect(
        resolvers.Mutation.createFolder(null, { name: "   " })
      ).rejects.toThrow("Folder name cannot be empty or whitespace only");
    });

    it("createFolder should succeed with valid name", async () => {
      const mockFolder = { id: "1", name: "My Folder", createdAt: new Date() };
      mockFolderCreate.mockImplementation(() => Promise.resolve(mockFolder));

      const result = await resolvers.Mutation.createFolder(null, { name: "My Folder" });
      expect(result).toEqual(mockFolder);
      expect(mockFolderCreate).toHaveBeenCalledWith({ data: { name: "My Folder" } });
    });

    it("createBookmark should throw if title is empty or whitespace-only", async () => {
      expect(
        resolvers.Mutation.createBookmark(null, {
          title: "",
          url: "https://google.com",
          folderId: "1",
        })
      ).rejects.toThrow("Bookmark title cannot be empty or whitespace only");

      expect(
        resolvers.Mutation.createBookmark(null, {
          title: "   ",
          url: "https://google.com",
          folderId: "1",
        })
      ).rejects.toThrow("Bookmark title cannot be empty or whitespace only");
    });

    it("createBookmark should throw if URL is invalid", async () => {
      expect(
        resolvers.Mutation.createBookmark(null, {
          title: "Google",
          url: "invalid-url",
          folderId: "1",
        })
      ).rejects.toThrow("Invalid URL: \"invalid-url\"");
    });

    it("createBookmark should throw if target folder does not exist", async () => {
      mockFolderFindUnique.mockImplementation(() => Promise.resolve(null));

      expect(
        resolvers.Mutation.createBookmark(null, {
          title: "Google",
          url: "https://google.com",
          folderId: "non-existent-folder",
        })
      ).rejects.toThrow("Folder with ID \"non-existent-folder\" not found");
    });

    it("createBookmark should succeed with valid inputs and save folder relation", async () => {
      mockFolderFindUnique.mockImplementation(() => Promise.resolve({ id: "1", name: "Folder 1", createdAt: new Date() }));
      const mockBookmark = {
        id: "b1",
        title: "Google",
        url: "https://google.com",
        tags: ["search"],
        folderId: "1",
        createdAt: new Date(),
      };
      mockBookmarkCreate.mockImplementation(() => Promise.resolve(mockBookmark));

      const result = await resolvers.Mutation.createBookmark(null, {
        title: "Google",
        url: "https://google.com",
        folderId: "1",
        tags: ["search"],
      });

      expect(result).toEqual(mockBookmark);
      expect(mockBookmarkCreate).toHaveBeenCalledWith({
        data: {
          title: "Google",
          url: "https://google.com",
          folderId: "1",
          tags: ["search"],
        },
      });
    });
  });

  describe("Error Code Propagation", () => {
    it("should propagate BAD_USER_INPUT for title validation failure", async () => {
      try {
        await resolvers.Mutation.createBookmark(null, {
          title: "",
          url: "https://google.com",
          folderId: "1",
        });
        expect().fail("Should have thrown error");
      } catch (err: any) {
        expect(err).toBeInstanceOf(GraphQLError);
        expect(err.extensions.code).toBe("BAD_USER_INPUT");
      }
    });

    it("should propagate NOT_FOUND when updating non-existent bookmark", async () => {
      mockBookmarkFindUnique.mockImplementation(() => Promise.resolve(null));

      try {
        await resolvers.Mutation.updateBookmark(null, {
          id: "b-none",
          title: "New Title",
        });
        expect().fail("Should have thrown error");
      } catch (err: any) {
        expect(err).toBeInstanceOf(GraphQLError);
        expect(err.extensions.code).toBe("NOT_FOUND");
      }
    });
  });
});
