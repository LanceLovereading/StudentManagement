"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/badges";

export type RosterRow = {
  id: number;
  name: string;
  phone: string;
  status: string;
  balance: number;
  classes: number;
  owner?: string;
};

// 花名册（客户端搜索）：按姓名/手机号过滤，行点击进学生详情。
// 数据由服务端按 R6 范围查出——junior 的载荷里根本没有别人的学生。
export default function StudentRoster({ rows, showOwner }: { rows: RosterRow[]; showOwner: boolean }) {
  const [q, setQ] = useState("");
  const kw = q.trim().toLowerCase();
  const hit = rows.filter((r) => !kw || r.name.toLowerCase().includes(kw) || r.phone.includes(kw));
  return (
    <>
      <input
        className="input"
        placeholder={`搜索姓名 / 手机号（${rows.length} 人）`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ maxWidth: 260, marginBottom: 10 }}
      />
      <table className="table">
        <thead>
          <tr><th>姓名</th><th>手机号</th><th>状态</th><th>余额</th><th>在读班</th>{showOwner && <th>归属教务</th>}</tr>
        </thead>
        <tbody>
          {hit.map((r) => (
            <tr key={r.id}>
              <td><Link href={`/admin/students/${r.id}`}><strong>{r.name}</strong></Link></td>
              <td className="muted">{r.phone}</td>
              <td><StatusBadge status={r.status} /></td>
              <td>{r.balance} 课时</td>
              <td>{r.classes}</td>
              {showOwner && <td className="muted">{r.owner}</td>}
            </tr>
          ))}
          {hit.length === 0 && <tr><td colSpan={6} className="muted">{q ? "没有匹配的学生。" : "暂无学生——先在上方录入。"}</td></tr>}
        </tbody>
      </table>
    </>
  );
}
