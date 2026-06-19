import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Return jobs that have either raw data or an analysis report to be used as sources
    const jobs = await prisma.job.findMany({
      where: {
        status: "COMPLETED",
        OR: [
          { rawScrapeData: { not: null } },
          { resultReport: { not: null } }
        ]
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(jobs);
  } catch (error) {
    console.error("GET Jobs Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
