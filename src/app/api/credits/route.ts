import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      return NextResponse.json({ error: "Apify token missing" }, { status: 400 });
    }

    const [userRes, usageRes] = await Promise.all([
      fetch(`https://api.apify.com/v2/users/me?token=${apifyToken}`),
      fetch(`https://api.apify.com/v2/users/me/usage/monthly?token=${apifyToken}`)
    ]);

    const userData = await userRes.json();
    const usageData = await usageRes.json();

    const limit = userData?.data?.limits?.monthlyUsageUsdLimit || 5.0; // default $5 free tier limit if not found
    const used = usageData?.data?.totalMonthlyUsageUsd || 0;

    return NextResponse.json({
      apify: {
        limit: limit,
        used: used,
        remaining: Math.max(0, limit - used)
      },
      gemini: {
        message: "Gemini API does not provide a programmatic endpoint for credits. Free Tier limit for 1.5 Pro is 15 RPM, 1 million tokens/min, 1500 RPD."
      }
    });

  } catch (error) {
    console.error("Credit fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch credits" }, { status: 500 });
  }
}
