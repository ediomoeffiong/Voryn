import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./server.js";

describe("Stage 1 public authorization surface", () => {
  beforeEach(() => { process.env.NODE_ENV = "test"; process.env.CORS_ORIGIN = "http://localhost:5173"; });

  it("does not expose public administrator signup", async () => {
    const agent = request.agent(createApp());
    const csrf = await agent.get("/api/auth/csrf");
    const response = await agent.post("/api/admin/auth/signup").set("X-CSRF-Token", csrf.body.csrfToken).send({ name: "Admin", email: "admin@example.com", password: "A-Strong-Password-2026" });
    expect(response.status).toBe(404);
  });

  it("requires authentication for organizer and participant mutations", async () => {
    const agent = request.agent(createApp());
    const csrf = await agent.get("/api/auth/csrf");
    const organizer = await agent.post("/api/portal/organizer/events").set("X-CSRF-Token", csrf.body.csrfToken).send({});
    const registration = await agent.post("/api/events/example/rsvp").set("X-CSRF-Token", csrf.body.csrfToken).send({});
    expect(organizer.status).toBe(401);
    expect(registration.status).toBe(401);
  });

  it("rejects state changes without CSRF", async () => {
    const response = await request(createApp()).post("/api/auth/login").send({ email: "person@example.com", password: "A-Strong-Password-2026" });
    expect(response.status).toBe(403);
  });

  it("returns the actionable validation message for invalid signup input", async () => {
    const agent = request.agent(createApp());
    const csrf = await agent.get("/api/auth/csrf");
    const response = await agent.post("/api/auth/signup").set("X-CSRF-Token", csrf.body.csrfToken).send({ name: "Person", email: "person@example.com", password: "short", role: "participant" });
    expect(response.status).toBe(422);
    expect(response.body.error).toBe("Password must be 12 to 128 characters.");
  });
});
