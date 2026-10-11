import type { Page } from "@playwright/test";

/** Opening the inbox marks it read; a spec must not change the fixture's
 * unread entries, so the write is answered with the current state. */
export async function keepUnread(page: Page) {
  await page.route("**/users/me/notification-state", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    const res = await route.fetch({ method: "GET", postData: undefined });
    await route.fulfill({ response: res });
  });
}

/** Three entries, two unread, whatever the fixture's read mark is now. The
 * read write is answered locally, so nothing changes in the database. */
export async function mixedInbox(page: Page) {
  const at = (hours: number) =>
    new Date(Date.now() - hours * 3_600_000).toISOString();
  const event = (id: number, unread: boolean) => ({
    id,
    kind: "stay_added",
    summary: {},
    text: `mara added Camp ${id}`,
    trip_id: 9001,
    trip_name: "Oetztal week",
    unread,
    created_at: at(id),
  });
  await page.route("**/users/me/notifications*", (route) =>
    route.fulfill({
      json: {
        items: [event(1, true), event(2, true), event(3, false)],
        total: 3,
        page: 1,
        per_page: 20,
        total_pages: 1,
      },
    }),
  );
  await page.route("**/users/me/notification-state", (route) =>
    route.fulfill({
      json: { unread_count: 2, push_public_key: null, read_until: at(2) },
    }),
  );
}

/** The inbox as the API returns it when nothing has happened. */
export async function emptyInbox(page: Page) {
  await page.route("**/users/me/notifications*", (route) =>
    route.fulfill({
      json: { items: [], total: 0, page: 1, per_page: 20, total_pages: 0 },
    }),
  );
}
