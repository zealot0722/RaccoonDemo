import { handleChat } from "../src/server/chat-service.js";
import { getAccessCodeFromRequest, requireAccess } from "../src/server/auth.js";
import { handleApiError, methodNotAllowed, readJson, sendJson } from "../src/server/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  try {
    const body = await readJson(req);
    requireAccess(getAccessCodeFromRequest(req, body));
    const result = await handleChat({
      message: body.message,
      sessionId: body.sessionId,
      attachments: body.attachments
    });

    return sendJson(res, 200, result);
  } catch (error) {
    return handleApiError(res, error);
  }
}
