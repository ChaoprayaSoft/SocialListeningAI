"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Activity, AlertTriangle, CheckCircle, Clock, Search, Save, List } from "lucide-react";

type Prompt = { id: string; title: string; content: string };
type Job = { id: string; status: string; resultReport?: string };

export default function Home() {
  const [url, setUrl] = useState("");
  const [promptContent, setPromptContent] = useState("");
  const [promptTitle, setPromptTitle] = useState(""); // For saving new prompt
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch prompts on load
  useEffect(() => {
    fetch("/api/prompts")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setPrompts(data);
      })
      .catch(console.error);
  }, []);

  // Poll job status
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (jobId && job?.status !== "COMPLETED" && job?.status !== "FAILED") {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/job/${jobId}`);
          if (res.ok) {
            const data = await res.json();
            setJob(data);
            if (data.status === "COMPLETED" || data.status === "FAILED") {
              setIsSubmitting(false);
            }
          }
        } catch (e) {
          console.error(e);
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [jobId, job?.status]);

  const handleStartAnalysis = async () => {
    setError(null);
    if (!url) return setError("Please enter a valid URL");
    if (!promptContent) return setError("Please enter a prompt");
    
    setIsSubmitting(true);
    setJob(null);
    setJobId(null);

    try {
      const res = await fetch("/api/scrape/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, promptContent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.url?._errors?.[0] || "Failed to start analysis");
      setJobId(data.jobId);
      setJob({ id: data.jobId, status: "SCRAPING" });
    } catch (e: any) {
      setError(e.message);
      setIsSubmitting(false);
    }
  };

  const handleSavePrompt = async () => {
    if (!promptTitle || !promptContent) return alert("Title and content required");
    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: promptTitle, content: promptContent }),
      });
      if (res.ok) {
        const newPrompt = await res.json();
        setPrompts([newPrompt, ...prompts]);
        setPromptTitle("");
        alert("Prompt saved successfully!");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to save prompt");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-8 font-sans text-slate-900">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <header className="mb-8 border-b pb-4">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Activity className="text-blue-600" />
            AI Satisfaction Management
          </h1>
          <p className="text-slate-500 mt-2">Analyze Facebook page comments using Apify and Gemini AI.</p>
        </header>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-2">
            <AlertTriangle size={20} /> {error}
          </div>
        )}

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-semibold mb-4">New Analysis</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Facebook Page URL</label>
              <input 
                type="url" 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.facebook.com/ExamplePage"
                className="w-full p-2 border rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Select Predefined Prompt</label>
              <select 
                className="w-full p-2 border rounded-md mb-2 bg-slate-50"
                onChange={(e) => {
                  const p = prompts.find(p => p.id === e.target.value);
                  if (p) setPromptContent(p.content);
                }}
              >
                <option value="">-- Custom Prompt --</option>
                {prompts.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Analysis Prompt</label>
              <textarea 
                value={promptContent}
                onChange={(e) => setPromptContent(e.target.value)}
                rows={4}
                className="w-full p-2 border rounded-md"
                placeholder="e.g. Summarize the top 3 complaints from the comments..."
              />
            </div>

            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <input 
                  type="text" 
                  value={promptTitle}
                  onChange={(e) => setPromptTitle(e.target.value)}
                  placeholder="Prompt Title (to save)"
                  className="w-full p-2 border rounded-md text-sm"
                />
              </div>
              <button 
                onClick={handleSavePrompt}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-sm font-medium flex items-center gap-2"
              >
                <Save size={16} /> Save Prompt
              </button>
            </div>

            <button 
              onClick={handleStartAnalysis}
              disabled={isSubmitting}
              className="w-full mt-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex justify-center items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? <Clock className="animate-spin" /> : <Search />}
              {isSubmitting ? 'Processing...' : 'Start Analysis'}
            </button>
          </div>
        </div>

        {job && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              Job Status: 
              <span className={`text-sm px-2 py-1 rounded-full ${
                job.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                job.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {job.status}
              </span>
            </h2>
            
            {job.status === 'COMPLETED' && job.resultReport && (
              <div className="mt-6 prose prose-slate max-w-none prose-h2:text-blue-600 border-t pt-6">
                <ReactMarkdown>{job.resultReport}</ReactMarkdown>
              </div>
            )}
            
            {job.status !== 'COMPLETED' && job.status !== 'FAILED' && (
              <div className="flex items-center gap-3 text-slate-500 py-8 justify-center">
                <Clock className="animate-spin text-blue-500" /> 
                This might take a few minutes. Please wait...
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  );
}
