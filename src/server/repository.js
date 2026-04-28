import { demoFaqArticles, demoProducts } from "./demo-data.js";
import { getConfig, hasSupabaseConfig } from "./config.js";

const memory = {
  tickets: [
    {
      id: "demo-ticket-001",
      ticket_no: "T001",
      customer_id: "demo",
      status: "needs_review",
      summary: "使用者要求真人客服",
      intent: "human_handoff",
      priority: "normal",
      handoff_reason: "使用者明確要求真人客服，建立待處理工單。",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  messages: [
    {
      id: "demo-message-001",
      ticket_id: "demo-ticket-001",
      role: "customer",
      content: "我要找真人客服",
      created_at: new Date().toISOString()
    }
  ],
  decisions: [
    {
      id: "demo-decision-001",
      ticket_id: "demo-ticket-001",
      intent: "human_handoff",
      confidence: 0.92,
      tone: "neutral",
      decision: "needs_review",
      reasons: ["使用者明確要求真人客服，建立待處理工單。"],
      risk_flags: [],
      matched_faq_code: null,
      recommended_product_codes: [],
      handoff_reason: "使用者明確要求真人客服，建立待處理工單。",
      created_at: new Date().toISOString()
    }
  ]
};

export function createRepository(config = getConfig()) {
  return hasSupabaseConfig(config)
    ? createSupabaseRepository(config)
    : createMemoryRepository();
}

function createMemoryRepository() {
  return {
    mode: "memory-demo",
    async listFaqArticles() {
      return demoFaqArticles;
    },
    async listProducts() {
      return demoProducts;
    },
    async createTicket(ticket) {
      const now = new Date().toISOString();
      const record = {
        id: `demo-ticket-${Date.now()}`,
        ticket_no: ticket.ticket_no || generateTicketNo(),
        created_at: now,
        updated_at: now,
        ...ticket
      };
      memory.tickets.unshift(record);
      return record;
    },
    async createMessage(message) {
      const record = {
        id: `demo-message-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        created_at: new Date().toISOString(),
        ...message
      };
      memory.messages.push(record);
      return record;
    },
    async createAiDecision(decision) {
      const record = {
        id: `demo-decision-${Date.now()}`,
        created_at: new Date().toISOString(),
        ...decision
      };
      memory.decisions.push(record);
      return record;
    },
    async listTickets() {
      return memory.tickets.map((ticket) => hydrateMemoryTicket(ticket));
    },
    async addAgentReply(ticketId, { content, staffName }) {
      const message = await this.createMessage({
        ticket_id: ticketId,
        role: "agent",
        content,
        staff_name: staffName || "Demo Agent"
      });
      const ticket = memory.tickets.find((item) => item.id === ticketId);
      if (ticket) {
        ticket.status = "in_progress";
        ticket.updated_at = new Date().toISOString();
      }
      return { ticket: ticket ? hydrateMemoryTicket(ticket) : null, message };
    }
  };
}

function hydrateMemoryTicket(ticket) {
  return {
    ...ticket,
    messages: memory.messages.filter((message) => message.ticket_id === ticket.id),
    ai_decision: memory.decisions.find((decision) => decision.ticket_id === ticket.id) || null
  };
}

function createSupabaseRepository(config) {
  async function request(path, options = {}) {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: config.supabaseServiceRoleKey,
        authorization: `Bearer ${config.supabaseServiceRoleKey}`,
        "content-type": "application/json",
        prefer: "return=representation",
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase request failed: ${response.status} ${text}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  return {
    mode: "supabase",
    async listFaqArticles() {
      return request("faq_articles?select=*&is_active=eq.true&order=code.asc");
    },
    async listProducts() {
      return request("products?select=*&is_active=eq.true&order=code.asc");
    },
    async createTicket(ticket) {
      const data = await request("tickets?select=*", {
        method: "POST",
        body: JSON.stringify(ticket)
      });
      return data[0];
    },
    async createMessage(message) {
      const data = await request("messages?select=*", {
        method: "POST",
        body: JSON.stringify(message)
      });
      return data[0];
    },
    async createAiDecision(decision) {
      const data = await request("ai_decisions?select=*", {
        method: "POST",
        body: JSON.stringify(decision)
      });
      return data[0];
    },
    async listTickets() {
      const tickets = await request("tickets?select=*&order=created_at.desc&limit=50");
      return Promise.all(
        tickets.map(async (ticket) => {
          const [messages, decisions] = await Promise.all([
            request(`messages?select=*&ticket_id=eq.${encodeURIComponent(ticket.id)}&order=created_at.asc`),
            request(`ai_decisions?select=*&ticket_id=eq.${encodeURIComponent(ticket.id)}&order=created_at.desc&limit=1`)
          ]);
          return {
            ...ticket,
            messages,
            ai_decision: decisions[0] || null
          };
        })
      );
    },
    async addAgentReply(ticketId, { content, staffName }) {
      const message = await this.createMessage({
        ticket_id: ticketId,
        role: "agent",
        content,
        staff_name: staffName || "Demo Agent"
      });

      await request(`tickets?id=eq.${encodeURIComponent(ticketId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "in_progress",
          updated_at: new Date().toISOString()
        })
      });

      return { message };
    }
  };
}

export function generateTicketNo() {
  const suffix = Date.now().toString().slice(-6);
  return `T${suffix}`;
}
