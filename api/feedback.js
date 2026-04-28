import { getAccessCodeFromRequest, requireAccess } from "../src/server/auth.js";
import { createRepository } from "../src/server/repository.js";
import { handleApiError, methodNotAllowed, readJson, sendJson } from "../src/server/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  try {
    const body = await readJson(req);
    requireAccess(getAccessCodeFromRequest(req, body));

    const score = Number(body.score);
    if (!body.ticketId) {
      const error = new Error("ticketId is required");
      error.statusCode = 400;
      throw error;
    }
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      const error = new Error("score must be an integer from 1 to 5");
      error.statusCode = 400;
      throw error;
    }

    const repo = createRepository();
    const feedback = await repo.createFeedback({
      ticket_id: body.ticketId,
      customer_id: body.sessionId || "web-demo",
      score,
      comment: String(body.comment || "").trim() || null,
      source: "web_chat"
    });

    return sendJson(res, 200, { ok: true, feedback });
  } catch (error) {
    return handleApiError(res, error);
  }
}
