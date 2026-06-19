import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      return NextResponse.json({ error: "Apify token missing" }, { status: 400 });
    }

    const [limitsRes, usageRes] = await Promise.all([
      fetch(`https://api.apify.com/v2/users/me/limits?token=${apifyToken}`),
      fetch(`https://api.apify.com/v2/users/me/usage/monthly?token=${apifyToken}`)
    ]);

    const limitsData = await limitsRes.json();
    const usageData = await usageRes.json();

    console.log("Apify Limits:", JSON.stringify(limitsData, null, 2));
    console.log("Apify Usage:", JSON.stringify(usageData, null, 2));

    // Calculate correctly based on limits
    let limit = 5.0; // fallback
    if (limitsData?.data?.monthlyUsageUsdLimit !== undefined) {
      limit = limitsData.data.monthlyUsageUsdLimit;
    } else if (limitsData?.data?.usageLimitUsd !== undefined) {
      limit = limitsData.data.usageLimitUsd;
    }

    let used = 0;
    if (usageData?.data?.totalUsageCreditsUsd !== undefined) {
      used = usageData.data.totalUsageCreditsUsd;
    } else if (usageData?.data?.totalMonthlyUsageUsd !== undefined) {
      used = usageData.data.totalMonthlyUsageUsd;
    }

    // Attempt to read total available from usageData directly if it exists
    let remaining = Math.max(0, limit - used);
    if (usageData?.data?.remainingCreditsUsd !== undefined) {
      remaining = usageData.data.remainingCreditsUsd;
      limit = used + remaining; // Back-calculate total limit based on explicit remaining credits
    } else if (limitsData?.data?.remainingCreditsUsd !== undefined) {
      remaining = limitsData.data.remainingCreditsUsd;
      limit = used + remaining;
    }

    return NextResponse.json({
      apify: {
        limit: limit,
        used: used,
        remaining: remaining,
        rawUsage: usageData?.data,
        rawLimits: limitsData?.data
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
