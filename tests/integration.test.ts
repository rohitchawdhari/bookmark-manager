import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { prisma } from "../src/db.ts";
import { resolvers } from "../src/resolvers.ts";

async function cleanDb(): Promise<void> {
  // Clear bookmarks then folders to respect foreign key constraints
  await prisma.bookmark.deleteMany();
  await prisma.folder.deleteMany();
}

describe("PostgreSQL Integration Tests", () => {
  beforeAll(async () => {
    await cleanDb();
  });

  afterAll(async () => {
    await cleanDb();
    await prisma.$disconnect();
  });

  it("should perform CRUD on Folders and Bookmarks, and verify relations", async () => {
    // 1. Create a Folder
    const folder = await resolvers.Mutation.createFolder(null, { name: "Tech" });
    expect(folder.id).toBeDefined();
    expect(folder.name).toBe("Tech");

    // 2. Create Bookmarks
    const b1 = await resolvers.Mutation.createBookmark(null, {
      title: "GitHub",
      url: "https://github.com",
      folderId: folder.id,
      tags: ["git", "code"],
    });
    expect(b1.id).toBeDefined();
    expect(b1.title).toBe("GitHub");
    expect(b1.url).toBe("https://github.com");
    expect(b1.tags).toEqual(["git", "code"]);
    expect(b1.folderId).toBe(folder.id);

    await resolvers.Mutation.createBookmark(null, {
      title: "Google Search",
      url: "https://google.com",
      folderId: folder.id,
      tags: ["search"],
    });

    // 3. Resolve Folder's nested Bookmarks
    const nestedBookmarks = await resolvers.Folder.bookmarks(folder);
    expect(nestedBookmarks).toHaveLength(2);
    expect(nestedBookmarks.map(b => b.title)).toContain("GitHub");
    expect(nestedBookmarks.map(b => b.title)).toContain("Google Search");

    // 4. Resolve Bookmark's parent Folder
    const parentFolder = await resolvers.Bookmark.folder(b1);
    expect(parentFolder).not.toBeNull();
    expect(parentFolder!.id).toBe(folder.id);
    expect(parentFolder!.name).toBe("Tech");

    // 5. Query folders
    const allFolders = await resolvers.Query.folders();
    expect(allFolders).toHaveLength(1);
    expect(allFolders[0]!.name).toBe("Tech");

    // 6. Query folder(id)
    const singleFolder = await resolvers.Query.folder(null, { id: folder.id });
    expect(singleFolder).not.toBeNull();
    expect(singleFolder!.name).toBe("Tech");
  });

  it("should support search filtering on bookmark titles", async () => {
    const folders = await resolvers.Query.folders();
    const folderId = folders[0]!.id;

    // We have GitHub and Google Search from the previous test.
    // Let's add another bookmark "Reddit"
    await resolvers.Mutation.createBookmark(null, {
      title: "Reddit",
      url: "https://reddit.com",
      folderId,
      tags: ["news", "social"],
    });

    // Query all bookmarks
    const all = await resolvers.Query.bookmarks(null, {});
    expect(all.edges).toHaveLength(3);

    // Search for "git" (case-insensitive)
    const searchGit = await resolvers.Query.bookmarks(null, { search: "git" });
    expect(searchGit.edges).toHaveLength(1);
    expect(searchGit.edges[0]!.node.title).toBe("GitHub");

    // Search for "Search"
    const searchSearch = await resolvers.Query.bookmarks(null, { search: "Search" });
    expect(searchSearch.edges).toHaveLength(1);
    expect(searchSearch.edges[0]!.node.title).toBe("Google Search");
  });

  it("should support cursor-based pagination correctly across multiple requests", async () => {
    // Current bookmarks: GitHub, Google Search, Reddit (ordered by ID)
    // Let's get the sorted list of bookmarks first to understand the order
    const allBookmarksSorted = await prisma.bookmark.findMany({
      orderBy: { id: "asc" },
    });
    expect(allBookmarksSorted).toHaveLength(3);

    const firstItem = allBookmarksSorted[0]!;
    const secondItem = allBookmarksSorted[1]!;
    const thirdItem = allBookmarksSorted[2]!;

    // 1. Fetch Page 1: take = 2
    const page1 = await resolvers.Query.bookmarks(null, { take: 2 });
    expect(page1.edges).toHaveLength(2);
    expect(page1.edges[0]!.node.id).toBe(firstItem.id);
    expect(page1.edges[1]!.node.id).toBe(secondItem.id);
    expect(page1.pageInfo.hasNextPage).toBe(true);
    expect(page1.pageInfo.endCursor).toBe(secondItem.id);

    // 2. Fetch Page 2: take = 2, cursor = endCursor of page 1
    const page2 = await resolvers.Query.bookmarks(null, {
      take: 2,
      cursor: page1.pageInfo.endCursor,
    });
    expect(page2.edges).toHaveLength(1);
    expect(page2.edges[0]!.node.id).toBe(thirdItem.id);
    expect(page2.pageInfo.hasNextPage).toBe(false);
    expect(page2.pageInfo.endCursor).toBe(thirdItem.id);
  });

  it("should update, move, delete bookmarks and verify cascade deletions", async () => {
    const folders = await resolvers.Query.folders();
    const techFolderId = folders[0]!.id;

    // Create a new folder "Design"
    const designFolder = await resolvers.Mutation.createFolder(null, { name: "Design" });

    // Fetch a bookmark
    const allBookmarks = await prisma.bookmark.findMany();
    const targetBookmark = allBookmarks[0]!;

    // Update bookmark tags and title
    const updated = await resolvers.Mutation.updateBookmark(null, {
      id: targetBookmark.id,
      title: "Updated Title",
      tags: ["new-tag"],
    });
    expect(updated.title).toBe("Updated Title");
    expect(updated.tags).toEqual(["new-tag"]);
    expect(updated.url).toBe(targetBookmark.url); // URL unchanged

    // Move bookmark to Design folder
    const moved = await resolvers.Mutation.moveBookmark(null, {
      id: targetBookmark.id,
      folderId: designFolder.id,
    });
    expect(moved.folderId).toBe(designFolder.id);

    // Verify relations changed
    const techBookmarks = await resolvers.Folder.bookmarks({ id: techFolderId } as any);
    expect(techBookmarks.map(b => b.id)).not.toContain(targetBookmark.id);

    const designBookmarks = await resolvers.Folder.bookmarks(designFolder);
    expect(designBookmarks.map(b => b.id)).toContain(targetBookmark.id);

    // Delete bookmark
    await resolvers.Mutation.deleteBookmark(null, { id: targetBookmark.id });
    const designBookmarksAfterDelete = await resolvers.Folder.bookmarks(designFolder);
    expect(designBookmarksAfterDelete).toHaveLength(0);

    // Delete folder and check Cascade delete on bookmarks
    // First ensure there is at least one bookmark in Tech folder
    const currentTechBookmarks = await resolvers.Folder.bookmarks({ id: techFolderId } as any);
    expect(currentTechBookmarks.length).toBeGreaterThan(0);

    // Delete the Tech folder
    await prisma.folder.delete({ where: { id: techFolderId } });

    // Ensure all bookmarks belonging to Tech folder are deleted automatically
    const bookmarksAfterFolderDelete = await prisma.bookmark.findMany({
      where: { folderId: techFolderId },
    });
    expect(bookmarksAfterFolderDelete).toHaveLength(0);
  });
});
