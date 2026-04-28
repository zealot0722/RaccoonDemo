import { getAccessCodeFromRequest, requireAccess } from "../../../src/server/auth.js";
import { createRepository } from "../../../src/server/repository.js";
import {
  handleApiError,
  methodNotAllowed,
  readJson,
  sendJson
} from "../../../src/server/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  try {
    const body = await readJson(req);
    requireAccess(getAccessCodeFromRequest(req, body));
    const content = String(body.content || "").trim();
    if (!content) {
      const error = new Error("content is required");
      error.statusCode = 400;
      throw error;
    }

    const repo = createRepository();
    const result = await repo.addAgentReply(req.query.id, {
      content,
      staffName: body.staffName || "Demo Agent"
    });

    return sendJson(res, 200, result);
  } catch (error) {
    return handleApiError(res, error);
  }
}
