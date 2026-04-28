import { getAccessCodeFromRequest, requireAccess } from "../../src/server/auth.js";
import { createRepository } from "../../src/server/repository.js";
import { handleApiError, methodNotAllowed, sendJson } from "../../src/server/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  try {
    requireAccess(getAccessCodeFromRequest(req));
    const repo = createRepository();
    const tickets = await repo.listTickets();
    return sendJson(res, 200, { tickets, mode: repo.mode });
  } catch (error) {
    return handleApiError(res, error);
  }
}
