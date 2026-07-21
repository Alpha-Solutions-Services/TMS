import type { Metadata } from "next";
import { InstructorStudentsClient } from "@/components/freight/InstructorStudentsClient";

export const metadata: Metadata = {
  title: "Students — Instructor",
};

export default function InstructorStudentsPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1
        className="mb-6 text-2xl font-bold text-[var(--color-text)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Students
      </h1>
      <InstructorStudentsClient />
    </div>
  );
}
