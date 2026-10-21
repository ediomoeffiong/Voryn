import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./server.js";
import { createTicketCode, hashToken } from "./security.js";
import { csvCell, registrationStatus } from "./stage3.js";

describe("Stage 3 management contracts", () => {
  it("keeps registration, approval and attendance concepts distinct", () => {
    expect(registrationStatus({ status: "active", approvalStatus: "approved" })).toBe("confirmed");
    expect(registrationStatus({ status: "active", approvalStatus: "pending" })).toBe("pending");
    expect(registrationStatus({ status: "active", approvalStatus: "waitlisted" })).toBe("waitlisted");
    expect(registrationStatus({ status: "cancelled", approvalStatus: "approved" })).toBe("cancelled");
  });

  it("neutralizes spreadsheet formulas and correctly escapes CSV values", () => {
    expect(csvCell("=HYPERLINK(\"https://bad.example\")")).toBe("\"'=HYPERLINK(\"\"https://bad.example\"\")\"");
    expect(csvCell("Ada, Lovelace")).toBe("\"Ada, Lovelace\"");
    expect(csvCell("line one\nline two")).toBe("\"line one line two\"");
  });

  it("issues opaque high-entropy ticket codes whose hashes do not reveal the credential", () => {
    const first = createTicketCode(); const second = createTicketCode();
    expect(first).toMatch(/^VRY-[A-F0-9]{12}$/); expect(second).not.toBe(first); expect(hashToken(first)).not.toContain(first);
  });

  it("rejects unauthenticated dashboard and check-in access", async () => {
    const app = createApp();
    expect((await request(app).get("/api/stage3/organizer/attendees")).status).toBe(401);
    expect((await request(app).get("/api/stage3/participant/tickets")).status).toBe(401);
    expect((await request(app).get("/api/stage3/admin/users")).status).toBe(401);
  });

  it("rejects unauthenticated state changes before ticket data is inspected", async () => {
    const agent = request.agent(createApp()); const csrf = await agent.get("/api/auth/csrf");
    const response = await agent.post("/api/stage3/organizer/check-ins").set("X-CSRF-Token", csrf.body.csrfToken).send({ eventSlug: "another-organizers-event", code: "VRY-000000000000" });
    expect(response.status).toBe(401);
  });
});
