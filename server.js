import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const WIDGET_URI = "ui://widget/aurora-widget.html";
const widgetHtml = readFileSync(new URL("./public/aurora-widget.html", import.meta.url), "utf8");

let profile = { spend: 3840, focusMinutes: 222, energy: 72, doneCount: 7 };
let tasks = [
  { id: "t1", title: "完成今天影响最大的工作", detail: "45 分钟 · 深度工作", tag: "高优先级", completed: false },
  { id: "t2", title: "检查一项长期订阅支出", detail: "8 分钟 · 节省现金", tag: "理财", completed: false },
  { id: "t3", title: "步行 25 分钟", detail: "6:30pm 前 · 恢复", tag: "健康", completed: false },
  { id: "t4", title: "准备明天第一项任务", detail: "5 分钟 · 降低阻力", tag: "简单", completed: false },
];

const profileSchema = z.object({
  spend: z.number(),
  focusMinutes: z.number(),
  energy: z.number(),
  doneCount: z.number(),
  score: z.number(),
  brief: z.string()
});

const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  tag: z.string(),
  completed: z.boolean()
});

const dashboardOutputSchema = {
  profile: profileSchema,
  tasks: z.array(taskSchema)
};

function calculateScore() {
  const spendScore = Math.max(25, 100 - profile.spend / 70);
  const focusScore = Math.min(100, profile.focusMinutes / 3);
  const progressScore = Math.min(100, profile.doneCount / 11 * 100);
  return Math.round(spendScore * 0.2 + focusScore * 0.3 + profile.energy * 0.2 + progressScore * 0.3);
}

function defaultBrief(score) {
  if (score >= 82) return "你今天状态很好。把额外精力放到一个真正重要的任务上，而不是继续增加任务。";
  if (score >= 70) return "整体在轨道上，但执行和恢复略有不均。今晚优先保证睡眠，并完成一个核心任务。";
  return "今天可能安排过载。删除一个低价值任务，短暂散步，并减少冲动消费。";
}

function payload(message, brief) {
  const score = calculateScore();
  return {
    content: [{ type: "text", text: message }],
    structuredContent: {
      profile: { ...profile, score, brief: brief ?? defaultBrief(score) },
      tasks,
    },
  };
}

function widgetMeta() {
  return { ui: { resourceUri: WIDGET_URI, visibility: ["model", "app"] } };
}

function createAuroraServer() {
  const server = new McpServer({ name: "aurora-life-os", version: "0.1.0" });

  registerAppResource(server, "aurora-dashboard", WIDGET_URI, {}, async () => ({
    contents: [{
      uri: WIDGET_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: widgetHtml,
      _meta: {
        ui: {
          csp: { connectDomains: [], resourceDomains: [] },
          prefersBorder: true
        },
        "openai/widgetDescription": "交互式个人状态仪表板，展示评分、指标和 AI 排序任务。"
      }
    }]
  }));

  registerAppTool(server, "show_dashboard", {
    title: "Show Aurora dashboard",
    description: "Use this when the user wants to view their Aurora personal dashboard, daily score, metrics, or action plan.",
    inputSchema: {},
    outputSchema: dashboardOutputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    _meta: widgetMeta()
  }, async () => payload("已打开 Aurora 今日控制台。"));

  registerAppTool(server, "update_metrics", {
    title: "Update daily metrics",
    description: "Use this when the user gives spending, focus time, energy, or weekly completion data and wants Aurora recalculated.",
    inputSchema: {
      spend: z.number().min(0).optional(),
      focusMinutes: z.number().int().min(0).max(1440).optional(),
      energy: z.number().int().min(0).max(100).optional(),
      doneCount: z.number().int().min(0).max(11).optional()
    },
    outputSchema: dashboardOutputSchema,
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
    _meta: widgetMeta()
  }, async (args) => {
    profile = { ...profile, ...Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined)) };
    return payload("已更新个人指标并重新计算状态评分。");
  });

  registerAppTool(server, "complete_task", {
    title: "Complete Aurora task",
    description: "Use this when the user completes one Aurora task. Marks a bounded task as completed.",
    inputSchema: { id: z.string().min(1) },
    outputSchema: dashboardOutputSchema,
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
    _meta: widgetMeta()
  }, async ({ id }) => {
    const found = tasks.find((task) => task.id === id);
    if (!found) return payload(`没有找到任务 ${id}。`);
    tasks = tasks.map((task) => task.id === id ? { ...task, completed: true } : task);
    return payload(`已完成：${found.title}`);
  });

  registerAppTool(server, "replan_day", {
    title: "Replan the day",
    description: "Use this when the user feels overloaded, priorities changed, or they want Aurora to generate a fresh practical daily plan.",
    inputSchema: { reason: z.string().optional() },
    outputSchema: dashboardOutputSchema,
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
    _meta: widgetMeta()
  }, async () => {
    tasks = [
      { id: "r1", title: "打开邮件前先完成一项任务", detail: "30 分钟 · 专注", tag: "高优先级", completed: false },
      { id: "r2", title: "做一次 10 分钟资金检查", detail: "审阅一项经常性费用", tag: "理财", completed: false },
      { id: "r3", title: "户外步行 20 分钟", detail: "在精力下降前完成", tag: "健康", completed: false },
      { id: "r4", title: "写两行收工记录", detail: "5 分钟 · 为明天减负", tag: "简单", completed: false },
    ];
    return payload("已根据当前状态重新安排今天。");
  });

  registerAppTool(server, "analyse_day", {
    title: "Analyse the user's day",
    description: "Use this when the user asks Aurora for a recommendation about energy, spending, focus, priorities, or what to do next.",
    inputSchema: { question: z.string().min(1) },
    outputSchema: dashboardOutputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    _meta: widgetMeta()
  }, async ({ question }) => {
    const query = question.toLowerCase();
    let brief = "基于目前状态，优先选择能降低明天阻力的行动，而不是只处理眼前最紧急的事情。";
    if (query.includes("钱") || query.includes("支出") || query.includes("save")) {
      brief = "最快的改善方式是检查一项经常性费用，并对非必要购买设置 24 小时延迟。";
    } else if (query.includes("累") || query.includes("精力") || query.includes("sleep")) {
      brief = "你的精力趋势提示需要降低认知负担。完成一件任务、短暂散步，并提前 45 分钟停止工作。";
    } else if (query.includes("工作") || query.includes("专注") || query.includes("focus")) {
      brief = "先关闭消息提醒，完成一个 30-45 分钟的单任务专注块，再处理邮件和低价值事项。";
    }
    return payload("Aurora 已分析你的问题。", brief);
  });

  return server;
}

const port = Number(process.env.PORT ?? 7860);
const MCP_PATH = "/mcp";

const httpServer = createServer(async (req, res) => {
  if (!req.url) return res.writeHead(400).end("Missing URL");

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id"
    });
    return res.end();
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ name: "Aurora ChatGPT App", status: "ok", mcp: MCP_PATH }));
  }

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, service: "aurora-life-os" }));
  }

  if (req.method === "GET" && url.pathname === "/aurora-widget.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(widgetHtml);
  }

  if (url.pathname === MCP_PATH && ["POST", "GET", "DELETE"].includes(req.method ?? "")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const server = createAuroraServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, () => console.log(`Aurora MCP listening on http://localhost:${port}${MCP_PATH}`));
