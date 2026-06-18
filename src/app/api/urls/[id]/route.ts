import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const urlSchema = z.object({
  title: z.string().min(1, "Title is required"),
  url: z.string().url("Valid URL is required"),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = urlSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const { title, url } = parsed.data;

    const savedUrl = await prisma.savedUrl.update({
      where: { id },
      data: { title, url },
    });

    return NextResponse.json(savedUrl);
  } catch (error) {
    console.error("PUT SavedUrl Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.savedUrl.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE SavedUrl Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
