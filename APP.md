# Social Listening AI - Application Architecture & Review Document

> **App Name:** Social Listening AI (AI Satisfaction Management)  
> **Repository:** `ChaoprayaSoft/SocialListeningAI`  
> **Framework:** Next.js 16.2.9 (App Router) + React 19.2.4  
> **Language:** TypeScript 5  
> **Database & ORM:** PostgreSQL + Prisma ORM 7.8.0  
> **Styling:** Tailwind CSS v4 + Tailwind Typography plugin  
> **External Services:** Apify Actor SDK / API + Google Generative AI (Gemini)

---

## 1. Executive Summary

**Social Listening AI** is an automated social listening, sentiment analysis, and satisfaction tracking platform. It allows users to scrape public social discussions (specifically Facebook group posts and comments via Apify) and analyze the unstructured data using Google Gemini models.

The system supports three flexible execution pipelines:
1. **Scrape & Analyze:** End-to-end automation from Apify web scraping to webhook callback and Google Gemini report generation.
2. **Scrape Only:** Collects raw social media data into structured JSON with export options.
3. **Analyze Previous:** Aggregates and synthesizes data across multiple previously scraped datasets or historical reports into strategic AI summaries.

---

## 2. System Architecture & Data Flow

```mermaid
flowchart TD
    subgraph Client["Next.js Web Client (React 19)"]
        UI[Main Dashboard / Control Panel]
        Presets[URL & Prompt Presets Manager]
        CreditBadge[Apify & Gemini Credit Monitors]
        Viewer[Markdown Report & Raw JSON Viewer]
    end

    subgraph Backend["Next.js App Router (Node.js API Routes)"]
        ScrapeStart["POST /api/scrape/start"]
        WebhookHandler["POST /api/scrape/webhook"]
        JobsAPI["GET/DELETE /api/job/[id] & GET /api/jobs"]
        PresetsAPI["CRUD /api/prompts & /api/urls"]
        CreditsAPI["GET /api/credits"]
        ModelsAPI["GET /api/models"]
    end

    subgraph Database["PostgreSQL (Prisma ORM)"]
        DBJob[(Job Records)]
        DBPrompt[(Prompt Presets)]
        DBUrl[(Saved URLs)]
    end

    subgraph External["External Cloud Services"]
        Apify["Apify Actor API\n(apify/facebook-groups-scraper)"]
        Gemini["Google Generative AI\n(gemini-1.5-pro / 2.0)"]
    end

    %% Interactions
    UI -->|Start Run with ICIT_SECRET| ScrapeStart
    ScrapeStart -->|Create Job| DBJob
    ScrapeStart -->|Start Actor with Webhook URL| Apify
    ScrapeStart -.->|If ANALYZE type| Gemini
    Apify -->|ACTOR.RUN.SUCCEEDED Webhook| WebhookHandler
    WebhookHandler -->|Fetch Dataset Items| Apify
    WebhookHandler -->|Save Raw JSON| DBJob
    WebhookHandler -->|Prompt + Data Analysis| Gemini
    Gemini -->|Return Markdown Report| WebhookHandler
    WebhookHandler -->|Update Job: COMPLETED| DBJob
    UI -->|Poll Status every 5s| JobsAPI
    JobsAPI -->|Read Job Status & Report| DBJob
    Viewer -->|Render Markdown / Export PDF| UI
    CreditBadge -->|Query Limits & Usage| CreditsAPI
    CreditsAPI -->|Check Account Limits| Apify
    Presets -->|Sync Presets| PresetsAPI
    PresetsAPI --> DBPrompt
    PresetsAPI --> DBUrl
```

---

## 3. Technology Stack

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Framework** | [Next.js](https://nextjs.org/) | `16.2.9` | App Router, Server Actions/APIs, SSR & Client hydration |
| **Runtime / UI** | [React](https://react.dev/) | `19.2.4` | Modern UI components with hooks & client state |
| **Type Safety** | [TypeScript](https://www.typescriptlang.org/) | `^5` | Strict static typing across front & back end |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | `^4` | Utility-first styling with `@tailwindcss/typography` |
| **Database** | [PostgreSQL](https://www.postgresql.org/) | `pg ^8.21.0` | Relational data persistence with connection pooling |
| **ORM** | [Prisma](https://www.prisma.io/) | `^7.8.0` | Data modeling, migrations, and typed database client |
| **Web Scraping** | [Apify Client](https://docs.apify.com/sdk/js) | `^2.23.4` | Serverless Actor execution and dataset ingestion |
| **AI Analysis** | [@google/generative-ai](https://ai.google.dev/) | `^0.24.1` | Google Gemini API integration for reporting |
| **Validation** | [Zod](https://zod.dev/) | `^4.4.3` | Schema validation for all API inputs |
| **Icons** | [Lucide React](https://lucide.dev/) | `^1.21.0` | UI iconography |
| **Markdown** | [react-markdown](https://github.com/remarkjs/react-markdown) | `^10.1.0` | Rich rendering of AI-generated reports |

---

## 4. Database Schema (Prisma)

The application uses three primary data models stored in PostgreSQL via [schema.prisma](file:///i:/WebApp/SocialListeningAI/prisma/schema.prisma):

### 1. `Job` Model
Tracks scrape and analysis tasks, their configurations, execution state, and output data.

```prisma
model Job {
  id            String   @id @default(uuid())
  title         String?  // Formatted like "[URL Title] Scrape & Analyze 25/10/2026, 18:00:00"
  type          String   @default("SCRAPE_AND_ANALYZE") // SCRAPE | ANALYZE | SCRAPE_AND_ANALYZE
  url           String?  // Optional for ANALYZE type
  promptContent String?  // Optional for SCRAPE type
  aiModel       String?  @default("gemini-1.5-pro-latest")
  apifyRunId    String?  // Actor run ID returned by Apify
  sourceJobIds  String[] // IDs of SCRAPE jobs aggregated for an ANALYZE run
  status        String   @default("PENDING") // PENDING | SCRAPING | ANALYZING | COMPLETED | FAILED
  rawScrapeData String?  @db.Text // Cleaned JSON array of posts & comments
  resultReport  String?  @db.Text // Full Markdown report generated by Gemini
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

### 2. `Prompt` Model
Preset storage for frequently used analysis templates and prompt instructions.

```prisma
model Prompt {
  id        String   @id @default(uuid())
  title     String
  content   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 3. `SavedUrl` Model
Preset storage for tracked Facebook groups, pages, or target websites.

```prisma
model SavedUrl {
  id        String   @id @default(uuid())
  title     String
  url       String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

## 5. API Surface & Endpoints

| Method | Endpoint | Description | Auth / Security |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/scrape/start` | Initiates a scrape or analysis job. Spawns Apify Actor or invokes Gemini directly. | Validates `secretKey === ICIT_SECRET` |
| `POST` | `/api/scrape/webhook` | Webhook receiver triggered by Apify upon run completion. Ingests dataset and triggers AI analysis. | Validates `secret === WEBHOOK_SECRET` |
| `GET` | `/api/job/[id]` | Fetches job status, error details, raw data, or report for polling. | Open internal API |
| `DELETE` | `/api/job/[id]` | Permanently removes a job record and its associated data. | Open internal API |
| `GET` | `/api/jobs` | Returns all completed jobs containing data to populate the multi-job selector. | Open internal API |
| `GET` | `/api/models` | Fetches available Gemini models from Google AI API supporting `generateContent`. | Uses `GEMINI_API_KEY` |
| `GET` | `/api/credits` | Calculates remaining Apify USD usage and provides Gemini rate limit guidelines. | Uses `APIFY_API_TOKEN` |
| `GET` | `/api/prompts` | Retrieves all saved prompt presets sorted by newest first. | Open internal API |
| `POST` | `/api/prompts` | Creates a new prompt preset (Zod validated). | Open internal API |
| `PUT` | `/api/prompts/[id]` | Updates an existing prompt preset. | Open internal API |
| `DELETE` | `/api/prompts/[id]` | Deletes a prompt preset. | Open internal API |
| `GET` | `/api/urls` | Retrieves all saved target URL presets. | Open internal API |
| `POST` | `/api/urls` | Creates a new target URL preset (Zod validated URL). | Open internal API |
| `PUT` | `/api/urls/[id]` | Updates an existing target URL preset. | Open internal API |
| `DELETE` | `/api/urls/[id]` | Deletes a target URL preset. | Open internal API |

---

## 6. Core Application Workflows

### Workflow A: Scrape & Analyze (End-to-End)
1. **Input Submission:** User specifies Facebook Group URL, number of posts (1–100), sort order (`CHRONOLOGICAL`, `RECENT_ACTIVITY`, `TOP_POSTS`), analysis prompt instructions, and chosen Gemini model.
2. **Access Control:** User enters `ICIT_SECRET` in a verification modal.
3. **Dispatch:** `/api/scrape/start` records a `Job` with status `SCRAPING` and instructs Apify to run the actor with a success webhook pointing to `/api/scrape/webhook`.
4. **Scraping Completion:** Apify executes the scrape and sends an HTTP POST to `/api/scrape/webhook` with `runId`, `jobId`, and `secret`.
5. **Data Extraction:** Webhook pulls dataset items, extracts post dates, post URLs, post body text, and comment threads, saving clean JSON into `Job.rawScrapeData`.
6. **AI Analysis:** Webhook sets status to `ANALYZING`, calls Google Gemini with the system role prompt, user instructions, and the scraped JSON dataset.
7. **Delivery:** The resulting Markdown report is saved into `Job.resultReport` with status `COMPLETED`. The front-end renders the Markdown report with print-to-PDF support.

### Workflow B: Scrape Only
- Same scraping pipeline as Workflow A, but terminates immediately upon dataset ingestion into `Job.rawScrapeData` (`COMPLETED`).
- Provides instant preview of raw JSON data with formatting and a 1-click **Download JSON** button.

### Workflow C: Analyze Previous (Cross-Job Synthesis)
- Allows selecting one or more previously completed scrape jobs (either raw datasets or prior analysis reports).
- Allows 1-click **Export Selected to JSON** to merge datasets locally.
- Bypasses Apify entirely; aggregates all selected scrape data into context and prompts Gemini directly, producing a comparative synthesis report.

---

## 7. Key Features & UI Capabilities

- **Credit & Quota Monitoring:**
  - Real-time Apify balance tracker showing used USD vs. monthly spending limit.
  - Interactive hover tooltip detailing Google Gemini free-tier rate limits (15 RPM, 1M TPM, 1,500 RPD).
- **Preset Management:**
  - Save, edit, and delete target URLs with custom titles.
  - Save, edit, and delete custom AI prompts.
- **Dynamic AI Model Discovery:**
  - Queries Google's `/v1beta/models` endpoint dynamically to support `gemini-1.5-pro`, `gemini-2.0-flash`, `gemini-1.5-flash`, and new releases without hardcoded model strings.
- **Data Export & Reporting:**
  - Beautiful Markdown report viewer powered by `@tailwindcss/typography`.
  - **Export as PDF:** Native browser print optimization (`@media print`) that removes web UI chrome for clean report export.
  - **Download JSON:** Download individual job scrapes or combined multi-job datasets.
- **Data Synthesis & Bulk Operations:**
  - Multi-job selection with **Select All / Deselect All** toggle button and count badges for raw scraped datasets.
  - Multi-job JSON data export for offline analysis.
- **Preview & Management Modals:**
  - Quick-preview modal to inspect raw JSON or Markdown reports before analysis.
  - Safety confirmation modal before deleting any dataset.
  - Passcode validation modal requiring `ICIT_SECRET` prior to executing any job.
- **Mobile Responsive Design:**
  - Optimized responsive layouts with mobile-friendly action buttons and touch targets.

---

## 8. Environment Variables & Configuration

Create a `.env` file in the project root with the following parameters:

```ini
# Database Connection (PostgreSQL)
DATABASE_URL="postgresql://user:password@localhost:5432/social_listening?sslmode=disable"
POSTGRES_PRISMA_URL="postgresql://user:password@localhost:5432/social_listening?sslmode=disable"

# Apify Integration
APIFY_API_TOKEN="apify_api_xxxxxxxxxxxxxxxxxxxxxxxx"
APIFY_ACTOR_ID="apify/facebook-groups-scraper"

# AI Model Provider
GEMINI_API_KEY="AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Security & Verification
ICIT_SECRET="your-ui-submit-passcode"
WEBHOOK_SECRET="your-secure-webhook-callback-token"

# Public URL (Required for Apify Webhook Callback)
NEXT_PUBLIC_APP_URL="https://your-domain.vercel.app"
```

> [!IMPORTANT]
> **Local Development Webhooks:** When running locally (`http://localhost:3000`), Apify's cloud actors cannot reach your local server directly. Use a tunneling tool like [ngrok](https://ngrok.com/) (`ngrok http 3000`) and set `NEXT_PUBLIC_APP_URL` to your tunnel URL (e.g. `https://xxxx.ngrok-free.app`).

---

## 9. Security Architecture

1. **HTTP Security Headers:** Configured in [next.config.ts](file:///i:/WebApp/SocialListeningAI/next.config.ts):
   - `X-Frame-Options: DENY` (Clickjacking prevention)
   - `X-Content-Type-Options: nosniff` (MIME sniffing prevention)
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (Enforces HTTPS)
   - `X-XSS-Protection: 1; mode=block`
2. **Execution Safeguard (`ICIT_SECRET`):** Prevents unauthorized runs and Apify credit depletion by demanding a secret key in UI before starting jobs.
3. **Webhook Authorization (`WEBHOOK_SECRET`):** Apify payloads include a shared secret token validated before reading datasets or executing AI prompts.
4. **Input Sanitization:** All payload structures, URLs, and integers are validated server-side using Zod schemas.

---

## 10. Codebase Structure

```
SocialListeningAI/
├── prisma/
│   ├── schema.prisma          # Database models (Job, Prompt, SavedUrl)
│   └── migrations/            # SQL migration history
├── public/                    # Static assets & icons
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── credits/       # Apify balance & Gemini quota endpoint
│   │   │   ├── job/[id]/      # Single job status polling & deletion
│   │   │   ├── jobs/          # Completed jobs list for synthesis
│   │   │   ├── models/        # Dynamic Gemini models query endpoint
│   │   │   ├── prompts/       # Prompt presets CRUD
│   │   │   │   └── [id]/
│   │   │   ├── scrape/
│   │   │   │   ├── start/     # Job trigger endpoint (Apify & inline AI)
│   │   │   │   └── webhook/   # Apify completion webhook handler
│   │   │   └── urls/          # URL presets CRUD
│   │   │       └── [id]/
│   │   ├── globals.css        # Tailwind 4 theme & print media styling
│   │   ├── layout.tsx         # Root layout & Geist typography configuration
│   │   └── page.tsx           # Monolithic client dashboard & controller
│   └── lib/
│       └── prisma.ts          # Singleton PrismaClient with pg Pool adapter
├── .env                       # Environment credentials (git-ignored)
├── next.config.ts             # Security headers & Next.js options
├── package.json               # NPM scripts and dependencies
├── prisma.config.ts           # Prisma CLI configuration
└── tsconfig.json              # TypeScript compilation settings
```

---

## 11. Architectural Review & Recommendations

### Strengths
- **Clean Asynchronous Design:** Delegating scraping to Apify actors and relying on webhooks prevents request timeouts for long scraping tasks.
- **Modern Stack:** Uses Next.js 16 App Router, React 19, and Prisma 7 with the PostgreSQL adapter for optimal connection handling.
- **Practical UX:** Integrated preset management, cost tracking, PDF generation, and JSON export make the tool self-sufficient for non-technical analysts.

### Recommended Improvements

1. **Refactor Monolithic `page.tsx` Component:**
   - *Current State:* `src/app/page.tsx` is over 700 lines, managing tab state, modals, API polling, preset CRUD, and exports all in one file.
   - *Recommendation:* Split into specialized components:
     - `components/HeaderWithCredits.tsx`
     - `components/PresetManager.tsx` (for URLs and Prompts)
     - `components/ScrapeConfigForm.tsx`
     - `components/JobSelector.tsx`
     - `components/ReportDisplay.tsx`
     - `components/modals/SecretKeyModal.tsx`, `DeleteConfirmModal.tsx`, `PreviewModal.tsx`

2. **Serverless Function Timeout on `ANALYZE` Mode:**
   - *Current State:* `POST /api/scrape/start` executes Gemini synthesis synchronously inline when `type === "ANALYZE"`.
   - *Risk:* If analyzing multiple large datasets, Gemini latency may exceed standard Vercel serverless function timeouts (10–15 seconds on free plans).
   - *Fix:* Add `export const maxDuration = 60;` to the route segment or trigger analysis asynchronously via a lightweight internal job queue / background task.

3. **Large Scrape Token Limits & Summarization Chunking:**
   - *Current State:* When multi-selecting jobs in `Analyze Previous`, all raw JSON is concatenated into the Gemini prompt.
   - *Risk:* Combining many jobs can exceed model context limits or token rate limits (TPM).
   - *Fix:* Implement token counting, data truncation, or a map-reduce summarization pattern if the aggregated payload exceeds a target token threshold.

4. **Secret Key Transmission:**
   - *Current State:* `secretKey` is passed in the JSON request body.
   - *Recommendation:* Move authentication to standard HTTP `Authorization: Bearer <token>` or session cookies for cleaner API security standards.

5. **Static Code & Linting Audit (ESLint / TypeScript):**
   - *React 19 Hooks Immutability:* In `src/app/page.tsx`, `fetchCompletedScrapes` is invoked in `useEffect` prior to its `const` declaration on line 80. Moving the function declaration above the `useEffect` hook or wrapping it in `useCallback` resolves the React compiler lint error.
   - *Unused Imports / Variables:* `NextRequest` is imported but unused in `src/app/api/jobs/route.ts`; unused catch variable `e` in `src/app/api/scrape/webhook/route.ts`.
   - *Type Safety:* Several API routes and client states rely on `any` (e.g., error catch blocks and model objects in `api/models`, `api/scrape/start`, `api/scrape/webhook`, `page.tsx`). Replacing `any` with typed interfaces (such as `GeminiModel`, `ScrapedItem`, `Error`) improves static type safety and clears all ESLint warnings.

