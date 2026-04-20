import { describe, expect, it } from "vitest";

import { buildApi } from "./server";

describe("buildApi", () => {
  it("responds to the health route", async () => {
    const api = buildApi();

    const response = await api.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: "vision-api",
      status: "ok"
    });

    await api.close();
  });
});
