"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Activity, AlertTriangle, Clock, Search, Save, Database, BarChart2, Download, FileText } from "lucide-react";

type Prompt = { id: string; title: string; content: string };
type SavedUrl = { id: string; title: string; url: string };
type Job = { 
  id: string; 
  title: string;
  type: string;
  status: string; 
  resultReport?: string;
  rawScrapeData?: string;
  createdAt: string;
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [savedUrlTitle, setSavedUrlTitle] = useState("");
  const [selectedUrlId, setSelectedUrlId] = useState("");
  const [urls, setUrls] = useState<SavedUrl[]>([]);

  const [promptContent, setPromptContent] = useState("");
  const [promptTitle, setPromptTitle] = useState(""); 
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  
  const [completedScrapes, setCompletedScrapes] = useState<Job[]>([]);
  const [selectedSourceJobs, setSelectedSourceJobs] = useState<string[]>([]);

  const [activeTab, setActiveTab] = useState<"SCRAPE" | "ANALYZE" | "BOTH">("BOTH");

  const [resultsLimit, setResultsLimit] = useState(20);
  const [viewOption, setViewOption] = useState("CHRONOLOGICAL");
  const [aiModel, setAiModel] = useState("gemini-1.5-pro");
  const [availableModels, setAvailableModels] = useState<any[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/models").then(res => res.json()).then(data => {
      if (Array.isArray(data)) {
        setAvailableModels(data);
        // Auto select a good default if available
        const proModel = data.find(m => m.name.includes("gemini-1.5-pro"));
        if (proModel) setAiModel(proModel.name.replace("models/", ""));
        else if (data.length > 0) setAiModel(data[0].name.replace("models/", ""));
      }
    }).catch(console.error);

    fetch("/api/prompts").then(res => res.json()).then(data => {
      if (Array.isArray(data)) setPrompts(data);
    }).catch(console.error);

    fetch("/api/urls").then(res => res.json()).then(data => {
      if (Array.isArray(data)) setUrls(data);
    }).catch(console.error);

    fetchCompletedScrapes();
  }, []);

  const fetchCompletedScrapes = () => {
    fetch("/api/jobs").then(res => res.json()).then(data => {
      if (Array.isArray(data)) setCompletedScrapes(data);
    }).catch(console.error);
  }

  const handleExportSelectedJson = () => {
    if (selectedSourceJobs.length === 0) return alert("Please select at least one scrape job to export.");
    
    const selectedData = completedScrapes
      .filter(j => selectedSourceJobs.includes(j.id))
      .filter(j => j.rawScrapeData)
      .map(j => JSON.parse(j.rawScrapeData!))
      .flat();
      
    if (selectedData.length === 0) return alert("No raw data found in the selected jobs.");

    const blob = new Blob([JSON.stringify(selectedData, null, 2)], { type: "application/json" });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `exported_scrapes_${new Date().getTime()}.json`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  };

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
              fetchCompletedScrapes(); // Refresh scrapes list if a scrape finished
            }
          }
        } catch (e) {
          console.error(e);
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [jobId, job?.status]);

  const handleSubmit = async (type: "SCRAPE" | "ANALYZE" | "SCRAPE_AND_ANALYZE") => {
    setError(null);
    if ((type === "SCRAPE" || type === "SCRAPE_AND_ANALYZE") && !url) return setError("Please enter a valid URL");
    if ((type === "ANALYZE" || type === "SCRAPE_AND_ANALYZE") && !promptContent) return setError("Please enter a prompt");
    if (type === "ANALYZE" && selectedSourceJobs.length === 0) return setError("Please select at least one scrape job to analyze");
    
    setIsSubmitting(true);
    setJob(null);
    setJobId(null);

    try {
      const res = await fetch("/api/scrape/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          type, 
          url, 
          urlTitle: savedUrlTitle,
          promptContent,
          resultsLimit,
          viewOption,
          aiModel,
          sourceJobIds: type === "ANALYZE" ? selectedSourceJobs : undefined 
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      setJobId(data.jobId);
      setJob({ id: data.jobId, title: "Processing...", type, status: type === "ANALYZE" ? "ANALYZING" : "SCRAPING", createdAt: "" });
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
        setSelectedPromptId(newPrompt.id);
        alert("Prompt saved!");
      }
    } catch (e) { console.error(e); }
  };

  const handleUpdatePrompt = async () => {
    if (!selectedPromptId || !promptTitle || !promptContent) return alert("Select a prompt and ensure fields are filled");
    try {
      const res = await fetch(`/api/prompts/${selectedPromptId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: promptTitle, content: promptContent }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPrompts(prompts.map(p => p.id === updated.id ? updated : p));
        alert("Prompt updated!");
      }
    } catch (e) { console.error(e); }
  };

  const handleDeletePrompt = async () => {
    if (!selectedPromptId) return;
    if (!confirm("Delete this prompt?")) return;
    try {
      const res = await fetch(`/api/prompts/${selectedPromptId}`, { method: "DELETE" });
      if (res.ok) {
        setPrompts(prompts.filter(p => p.id !== selectedPromptId));
        setSelectedPromptId("");
        setPromptTitle("");
        setPromptContent("");
      }
    } catch (e) { console.error(e); }
  };

  const handleSaveUrl = async () => {
    if (!savedUrlTitle || !url) return alert("Title and URL required");
    try {
      const res = await fetch("/api/urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: savedUrlTitle, url: url }),
      });
      if (res.ok) {
        const newUrl = await res.json();
        setUrls([newUrl, ...urls]);
        setSelectedUrlId(newUrl.id);
        alert("URL saved!");
      }
    } catch (e) { console.error(e); }
  };

  const handleUpdateUrl = async () => {
    if (!selectedUrlId || !savedUrlTitle || !url) return alert("Select a URL and ensure fields are filled");
    try {
      const res = await fetch(`/api/urls/${selectedUrlId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: savedUrlTitle, url: url }),
      });
      if (res.ok) {
        const updated = await res.json();
        setUrls(urls.map(u => u.id === updated.id ? updated : u));
        alert("URL updated!");
      }
    } catch (e) { console.error(e); }
  };

  const handleDeleteUrl = async () => {
    if (!selectedUrlId) return;
    if (!confirm("Delete this URL?")) return;
    try {
      const res = await fetch(`/api/urls/${selectedUrlId}`, { method: "DELETE" });
      if (res.ok) {
        setUrls(urls.filter(u => u.id !== selectedUrlId));
        setSelectedUrlId("");
        setSavedUrlTitle("");
        setUrl("");
      }
    } catch (e) { console.error(e); }
  };

  const toggleSourceJob = (id: string) => {
    setSelectedSourceJobs(prev => 
      prev.includes(id) ? prev.filter(j => j !== id) : [...prev, id]
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 p-8 font-sans text-slate-900 print:bg-white print:p-0">
      <div className="max-w-4xl mx-auto space-y-8 print:space-y-0 print:max-w-none">
        
        <header className="mb-8 border-b pb-4 print:hidden">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Activity className="text-blue-600" />
            AI Satisfaction Management
          </h1>
        </header>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-2 print:hidden">
            <AlertTriangle size={20} /> {error}
          </div>
        )}

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 print:hidden">
          <div className="flex border-b mb-6">
            <button className={`px-4 py-2 font-medium ${activeTab === 'BOTH' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500'}`} onClick={() => setActiveTab("BOTH")}>Scrape & Analyze</button>
            <button className={`px-4 py-2 font-medium ${activeTab === 'SCRAPE' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500'}`} onClick={() => setActiveTab("SCRAPE")}>Scrape Only</button>
            <button className={`px-4 py-2 font-medium ${activeTab === 'ANALYZE' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500'}`} onClick={() => setActiveTab("ANALYZE")}>Analyze Previous</button>
          </div>
          
          <div className="space-y-6">
            
            {(activeTab === "SCRAPE" || activeTab === "BOTH") && (
              <div className="p-4 bg-slate-50 rounded-lg space-y-4">
                <h3 className="font-semibold flex items-center gap-2"><Database size={18} /> Data Source</h3>
                <div>
                  <select 
                    className="w-full p-2 border rounded-md mb-2 bg-white"
                    value={selectedUrlId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedUrlId(id);
                      if (id) {
                        const u = urls.find(x => x.id === id);
                        if (u) { setUrl(u.url); setSavedUrlTitle(u.title); }
                      } else {
                        setUrl(""); setSavedUrlTitle("");
                      }
                    }}
                  >
                    <option value="">-- Create New URL --</option>
                    {urls.map(u => <option key={u.id} value={u.id}>{u.title} ({u.url})</option>)}
                  </select>
                  <input 
                    type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.facebook.com/groups/..."
                    className="w-full p-2 border rounded-md mb-4"
                  />
                  
                  <div className="grid grid-cols-2 gap-4 mb-4 bg-white p-3 rounded-md border">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">✍️ Number of Posts</label>
                      <input 
                        type="number" min="1" max="100" 
                        value={resultsLimit} onChange={(e) => setResultsLimit(parseInt(e.target.value) || 20)}
                        className="w-full p-2 border rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">📜 Sorting Order</label>
                      <select 
                        value={viewOption} onChange={(e) => setViewOption(e.target.value)}
                        className="w-full p-2 border rounded-md text-sm bg-white"
                      >
                        <option value="CHRONOLOGICAL">New Posts (Chronological)</option>
                        <option value="RECENT_ACTIVITY">Newest Activity (Recent Comments)</option>
                        <option value="TOP_POSTS">Top Posts</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 items-end">
                    <input type="text" value={savedUrlTitle} onChange={(e) => setSavedUrlTitle(e.target.value)} placeholder="URL Title" className="flex-1 p-2 border rounded-md text-sm" />
                    {!selectedUrlId ? (
                      <button onClick={handleSaveUrl} className="px-4 py-2 bg-white hover:bg-slate-100 border text-slate-700 rounded-md text-sm font-medium flex items-center gap-2"><Save size={16} /> Save</button>
                    ) : (
                      <>
                        <button onClick={handleUpdateUrl} className="px-4 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-md text-sm font-medium">Update</button>
                        <button onClick={handleDeleteUrl} className="px-4 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-md text-sm font-medium">Delete</button>
                        <button onClick={() => { setSelectedUrlId(""); setUrl(""); setSavedUrlTitle(""); }} className="px-4 py-2 bg-white hover:bg-slate-100 border text-slate-700 rounded-md text-sm font-medium">Cancel</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "ANALYZE" && (
              <div className="p-4 bg-slate-50 rounded-lg space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold flex items-center gap-2"><Database size={18} /> Select Data to Analyze</h3>
                  <button 
                    onClick={handleExportSelectedJson}
                    disabled={selectedSourceJobs.length === 0}
                    className="text-sm px-3 py-1 bg-white border rounded-md text-slate-700 hover:bg-slate-100 flex items-center gap-1 disabled:opacity-50"
                  >
                    <Download size={14} /> Export Selected to JSON
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto border bg-white rounded-md p-2 space-y-2">
                  {completedScrapes.length === 0 ? <p className="text-sm text-slate-500 p-2">No completed scrape jobs available.</p> : null}
                  {completedScrapes.map(scrape => (
                    <label key={scrape.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded cursor-pointer">
                      <input type="checkbox" checked={selectedSourceJobs.includes(scrape.id)} onChange={() => toggleSourceJob(scrape.id)} />
                      <span className="text-sm font-medium">{scrape.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {(activeTab === "ANALYZE" || activeTab === "BOTH") && (
              <div className="p-4 bg-slate-50 rounded-lg space-y-4">
                <h3 className="font-semibold flex items-center gap-2"><BarChart2 size={18} /> Analysis Instructions</h3>
                <div>
                  <select 
                    className="w-full p-2 border rounded-md mb-2 bg-white"
                    value={selectedPromptId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedPromptId(id);
                      if (id) {
                        const p = prompts.find(x => x.id === id);
                        if (p) { setPromptContent(p.content); setPromptTitle(p.title); }
                      } else {
                        setPromptContent(""); setPromptTitle("");
                      }
                    }}
                  >
                    <option value="">-- Create New Prompt --</option>
                    {prompts.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                  <textarea 
                    value={promptContent} onChange={(e) => setPromptContent(e.target.value)} rows={4}
                    className="w-full p-2 border rounded-md mb-2" placeholder="e.g. Summarize the top 3 complaints..."
                  />
                  <div className="flex gap-2 items-end">
                    <input type="text" value={promptTitle} onChange={(e) => setPromptTitle(e.target.value)} placeholder="Prompt Title" className="flex-1 p-2 border rounded-md text-sm" />
                    {!selectedPromptId ? (
                      <button onClick={handleSavePrompt} className="px-4 py-2 bg-white hover:bg-slate-100 border text-slate-700 rounded-md text-sm font-medium flex items-center gap-2"><Save size={16} /> Save</button>
                    ) : (
                      <>
                        <button onClick={handleUpdatePrompt} className="px-4 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-md text-sm font-medium">Update</button>
                        <button onClick={handleDeletePrompt} className="px-4 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-md text-sm font-medium">Delete</button>
                        <button onClick={() => { setSelectedPromptId(""); setPromptContent(""); setPromptTitle(""); }} className="px-4 py-2 bg-white hover:bg-slate-100 border text-slate-700 rounded-md text-sm font-medium">Cancel</button>
                      </>
                    )}
                  </div>
                  
                  <div className="mt-4 bg-white p-3 rounded-md border">
                    <label className="block text-xs font-medium text-slate-500 mb-1">🧠 Select AI Model</label>
                    {availableModels.length > 0 ? (
                      <select 
                        value={aiModel} onChange={(e) => setAiModel(e.target.value)}
                        className="w-full p-2 border rounded-md text-sm bg-white"
                      >
                        {availableModels.map(m => (
                          <option key={m.name} value={m.name.replace('models/', '')}>
                            {m.displayName} ({m.name.replace('models/', '')})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-xs text-slate-500 italic">Loading models from Google...</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <button 
              onClick={() => handleSubmit(activeTab === "BOTH" ? "SCRAPE_AND_ANALYZE" : activeTab)}
              disabled={isSubmitting}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex justify-center items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? <Clock className="animate-spin" /> : <Search />}
              {isSubmitting ? 'Processing...' : activeTab === 'SCRAPE' ? 'Start Scraping' : activeTab === 'ANALYZE' ? 'Analyze Selected Data' : 'Scrape & Analyze'}
            </button>
          </div>
        </div>

        {job && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative print:p-0 print:border-none print:shadow-none">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              {job.title}
              <span className={`text-sm px-2 py-1 rounded-full print:hidden ${
                job.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                job.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
              }`}>{job.status}</span>
            </h2>
            
            {job.status === 'COMPLETED' && job.type !== 'SCRAPE' && job.resultReport && (
              <div className="mt-6 border-t pt-6 relative print:border-t-0 print:pt-0">
                <div className="flex justify-end mb-4 print:hidden">
                  <button 
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-slate-800 text-white rounded-md text-sm flex items-center gap-2 hover:bg-slate-700"
                  >
                    <FileText size={16} /> Export as PDF
                  </button>
                </div>
                <div id="printable-report" className="prose prose-slate max-w-none bg-white p-4 print:p-0">
                  <ReactMarkdown>{job.resultReport}</ReactMarkdown>
                </div>
              </div>
            )}

            {job.status === 'FAILED' && job.resultReport && (
              <div className="mt-6 border-t pt-6 text-red-600 bg-red-50 p-4 rounded-md">
                <strong>Error Details:</strong> {job.resultReport}
              </div>
            )}

            {job.status === 'COMPLETED' && job.type === 'SCRAPE' && job.rawScrapeData && (
              <div className="mt-6 border-t pt-6">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-slate-600">Raw Data Preview:</p>
                  <button 
                    onClick={() => {
                      const blob = new Blob([job.rawScrapeData!], { type: "application/json" });
                      const blobUrl = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = blobUrl;
                      a.download = `scrape_${job.id}.json`;
                      a.click();
                      URL.revokeObjectURL(blobUrl);
                    }}
                    className="text-sm px-3 py-1 bg-white border rounded-md text-slate-700 hover:bg-slate-100 flex items-center gap-1"
                  >
                    <Download size={14} /> Download JSON
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto bg-slate-900 text-green-400 p-4 rounded-md text-xs font-mono">
                  <pre>{JSON.stringify(JSON.parse(job.rawScrapeData), null, 2)}</pre>
                </div>
              </div>
            )}
            
            {job.status !== 'COMPLETED' && job.status !== 'FAILED' && (
              <div className="flex items-center gap-3 text-slate-500 py-8 justify-center">
                <Clock className="animate-spin text-blue-500" /> 
                {job.status === 'SCRAPING' ? 'Scraping data from Facebook. This may take several minutes...' : 'AI is analyzing the data...'}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
