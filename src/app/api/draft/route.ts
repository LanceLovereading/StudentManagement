import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAdminSession, assertStudentVisible } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";
import { getBalance } from "@/lib/ledger";
import { lessonOccupancy } from "@/lib/rules";
import { melbourneToday, nextOccurrence, weekdayName, fmtMin } from "@/lib/time";

// LLM 落点：跟进/续费话术起草。
// structured output → zod 校验；任何失败（未配置/超时/格式不符）降级为 degraded:true，
// 前端展示空白话术框——跟进流程不依赖 LLM。
const DraftSchema = z.object({
  message: z.string().min(10).max(600),
  suggestedClass: z.string(),
  riskTag: z.string(),
});

// 平台函数上限（Hobby 60s）内留出降级空间：超时必须在平台杀掉函数前触发，
// 降级路径才总是有机会执行。
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    const { userId, kind } = (await req.json()) as { userId?: number; kind?: string };
    if (!userId || (kind !== "trial" && kind !== "renewal")) throw new RuleError("BAD_REQUEST", "缺少学生或场景");
    await assertStudentVisible(admin, userId);

    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        vouchers: { where: { kind: "TRIAL", status: "ATTENDED" }, orderBy: { id: "desc" }, take: 1 },
        studentTimes: { where: { status: "ACTIVE" }, include: { class: { select: { name: true, weekday: true, startMin: true } } } },
      },
    });
    const balance = await getBalance(db, userId);

    let context: object;
    if (kind === "renewal") {
      context = {
        场景: "续费跟进",
        学生: user.name,
        剩余课时: balance,
        在读班级: user.studentTimes.map((st) => `${st.class.name}（${weekdayName(st.class.weekday)} ${fmtMin(st.class.startMin)}）`),
        要求: "以教务口吻给家长写一段续费沟通话术：提及剩余课时不多、建议续费课时数、保持课程连续性，不施压。",
      };
    } else {
      const v = user.vouchers[0];
      const candidates = await db.class.findMany({ where: { subject: v?.subject ?? "", status: "OPEN" } });
      const withSeats = await Promise.all(candidates.map(async (c) => {
        const date = nextOccurrence(c.weekday, melbourneToday());
        const occ = await lessonOccupancy(db, c.id, date);
        return { name: c.name, time: `${weekdayName(c.weekday)} ${fmtMin(c.startMin)}`, 余位: c.capacity - occ.total };
      }));
      context = {
        场景: "试听后跟进",
        学生: user.name,
        试听科目: v?.subject ?? "未知",
        试听反馈: v?.outcomeNote ?? "无",
        可建议班次: withSeats.filter((c) => c.余位 > 0).slice(0, 2),
        要求: "以教务口吻给家长写一段跟进话术：感谢试听、结合反馈、给出建议班次、邀请正式报名，不施压。",
      };
    }

    const base = process.env.LLM_BASE_URL;
    const key = process.env.LLM_API_KEY;
    const model = process.env.LLM_MODEL;
    if (!base || !key || !model) {
      return NextResponse.json({ ok: true, degraded: true, reason: "LLM_NOT_CONFIGURED", data: null });
    }

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      const r = await fetch(`${base.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          messages: [
            {
              role: "system",
              content:
                '你是墨尔本 Austin Education 的教务助理。只输出一个 JSON 对象：{"message": string, "suggestedClass": string, "riskTag": string}。message 是发给家长的中文话术，150 字内，得体不施压；suggestedClass 从"可建议班次"里选其一，没有合适的写"待定"；riskTag 用一个词概括学生状态，如"转化意愿高"或"价格敏感"。',
            },
            { role: "user", content: JSON.stringify(context) },
          ],
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`LLM HTTP ${r.status}`);
      const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      const content = j.choices?.[0]?.message?.content ?? "";
      const jsonText = content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1);
      const data = DraftSchema.parse(JSON.parse(jsonText)); // 服务端校验 LLM 结构化输出
      return NextResponse.json({ ok: true, degraded: false, data });
    } catch (e) {
      console.error("[draft]", e);
      return NextResponse.json({ ok: true, degraded: true, reason: "LLM_UNAVAILABLE", data: null });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
