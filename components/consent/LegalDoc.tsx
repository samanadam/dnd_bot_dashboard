import type { ReactNode } from "react";
import { LEGAL_UPDATED } from "@/lib/legal";

export function LegalDoc({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <article className="text-sm leading-relaxed text-muted [&_a]:text-accent [&_a]:underline-offset-2 hover:[&_a]:underline [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-text [&_li]:mt-1.5 [&_p]:mt-3 [&_strong]:font-medium [&_strong]:text-text [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
      <h1 className="text-3xl font-semibold tracking-tight text-text">{title}</h1>
      <p className="mt-2 text-xs text-faint">Last updated {LEGAL_UPDATED}</p>
      <p className="mt-6 text-base text-text">{intro}</p>
      {children}
    </article>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[34rem] text-left text-xs">
        <thead className="bg-surface-2 text-text">
          <tr>
            {head.map((cell) => (
              <th key={cell} className="px-3 py-2 font-medium">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border align-top">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Contact({ email, operator }: { email: string | null; operator: string }) {
  return email ? (
    <>
      {operator} at <a href={`mailto:${email}`}>{email}</a>
    </>
  ) : (
    <>{operator}, through the Discord server this portal belongs to</>
  );
}
