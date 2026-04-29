import { getAccessCodeFromRequest, requireAccess } from "../../src/server/auth.js";
import { createRepository } from "../../src/server/repository.js";
import { normalizeTicketUpdate } from "../../src/client/ticket-ui.js";
import {
  handleApiError,
  methodNotAllowed,
  readJson,
  sendJson
} from "../../src/server/http.js";

export default async function handler(req, res) {
  if (req.method !== "PATCH") return methodNotAllowed(res, ["PATCH"]);

  try {
    const body = await readJson(req);
    requireAccess(getAccessCodeFromRequest(req, body));

    const updates = normalizeTicketUpdate(body);
    if (!Object.keys(updates).length) {
      const error = new Error("status or priority is required");
      error.statusCode = 400;
      throw error;
    }

    const repo = createRepository();
    const ticket = await repo.updateTicket(req.query.id, updates);
    return sendJson(res, 200, { ticket, mode: repo.mode });
  } catch (error) {
    return handleApiError(res, error);
  }
}
