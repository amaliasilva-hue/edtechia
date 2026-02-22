'use client';

import { useState, useRef, DragEvent } from 'react';
import Link from 'next/link';
import { EXAM_LIST } from '@/config/exams';

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

type UploadResult = {
  exam_name:         string;
  doc_type:          string;
  gcs_uri:           string;
  extraction_method: string;
  total_chunks:      number;
  inserted_chunks:   number;
};

export default function AdminUploadPage() {
  const inputRef  = useRef<HTMLInputElement>(null);

  const [examName,     setExamName]     = useState('');
  const [docType,      setDocType]      = useState('exam_guide');
  const [file,         setFile]         = useState<File | null>(null);
  const [dragActive,   setDragActive]   = useState(false);
  const [uploadState,  setUploadState]  = useState<UploadState>('idle');
  const [result,       setResult]       = useState<UploadResult | null>(null);
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [progress,     setProgress]     = useState<string>('');

  const acceptedFile = (f: File) => {
    if (f.type !== 'application/pdf' && !f.name.endsWith('.pdf')) {
      setErrorMsg('Only PDF files are accepted.');
      return;
    }
    setFile(f);
    setErrorMsg(null);
    setResult(null);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files[0]) acceptedFile(e.dataTransfer.files[0]);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleUpload = async () => {
    if (!file || !examName) return;
    setUploadState('uploading');
    setErrorMsg(null);
    setResult(null);
    setProgress('Uploading to GCS...');

    const form = new FormData();
    form.append('file',      file);
    form.append('exam_name', examName);
    form.append('doc_type',  docType);

    try {
      setProgress('Extracting text (MuPDF / Vision OCR)...');
      const res  = await fetch('/api/ingest', { method: 'POST', body: form });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? 'Ingest failed');

      setProgress('Generating embeddings and inserting into BigQuery...');
      setResult(data);
      setUploadState('success');
      setFile(null);
      setProgress('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
      setUploadState('error');
      setProgress('');
    }
  };

  const reset = () => {
    setUploadState('idle');
    setFile(null);
    setResult(null);
    setErrorMsg(null);
    setProgress('');
  };

  const humanSize = (bytes: number) =>
    bytes > 1_048_576
      ? `${(bytes / 1_048_576).toFixed(1)} MB`
      : `${Math.round(bytes / 1024)} KB`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
              ← Dashboard
            </Link>
            <span className="text-border">|</span>
            <span className="text-sm font-medium text-foreground">Admin — Upload Document</span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Upload Study Material</h1>
          <p className="text-muted-foreground text-sm mt-1">
            PDF documents are extracted with MuPDF, chunked, and stored as vector embeddings in BigQuery.
          </p>
        </div>

        {/* Exam Selector */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Target Exam
          </label>
          <select
            value={examName}
            onChange={(e) => setExamName(e.target.value)}
            className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm text-foreground
                       focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Select exam...</option>
            {EXAM_LIST.map((e) => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
        </div>

        {/* Doc Type */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Document Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'exam_guide',          label: 'Exam Guide',           desc: 'Official certification guide / syllabus' },
              { value: 'failure_analysis',     label: 'Failure Analysis',     desc: 'Post-exam analysis of weak areas' },
              { value: 'study_material',       label: 'Study Material',       desc: 'Whitepapers, docs, books' },
              { value: 'practice_questions',   label: 'Practice Questions',   desc: 'Question banks, dumps' },
            ] as const).map(({ value, label, desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => setDocType(value)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  docType === value
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-secondary/30 hover:border-primary/40'
                }`}
              >
                <div className={`text-xs font-semibold ${ docType === value ? 'text-primary' : 'text-foreground' }`}>{label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragActive(false)}
          onClick={() => inputRef.current?.click()}
          className={`relative rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
            dragActive
              ? 'border-primary bg-primary/5'
              : file
                ? 'border-green-500/40 bg-green-500/5'
                : 'border-border bg-secondary/20 hover:border-primary/40 hover:bg-primary/5'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && acceptedFile(e.target.files[0])}
          />

          {file ? (
            <div className="space-y-1">
              <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                <span className="text-xs font-bold text-primary">PDF</span>
              </div>
              <p className="text-sm font-semibold text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground">{humanSize(file.size)}</p>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                className="mt-2 text-xs text-destructive hover:underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center mx-auto">
                <span className="text-xs text-muted-foreground font-mono">PDF</span>
              </div>
              <p className="text-sm font-semibold text-foreground">Drop PDF here or click to choose</p>
              <p className="text-xs text-muted-foreground">Only PDF files are supported</p>
            </div>
          )}
        </div>

        {errorMsg && (
          <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{errorMsg}</p>
        )}

        {/* Upload Button */}
        <button
          onClick={handleUpload}
          disabled={!file || !examName || uploadState === 'uploading'}
          className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm
                     hover:bg-primary/90 active:scale-[0.99] transition-all duration-150
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploadState === 'uploading' ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Processing...
            </span>
          ) : 'Ingest PDF'}
        </button>

        {/* Progress */}
        {progress && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-3 h-3 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
            {progress}
          </div>
        )}

        {/* Success Card */}
        {result && uploadState === 'success' && (
          <div className="p-5 rounded-xl border border-green-500/30 bg-green-500/10 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-green-400 text-sm">Ingestion Complete</h3>
              <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground">
                Upload another
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-background/50 rounded-lg p-3 space-y-0.5">
                <p className="text-muted-foreground">Exam</p>
                <p className="font-medium text-foreground font-mono">{result.exam_name}</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 space-y-0.5">
                <p className="text-muted-foreground">Doc Type</p>
                <p className="font-medium text-foreground font-mono">{result.doc_type}</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 space-y-0.5">
                <p className="text-muted-foreground">Extraction Method</p>
                <p className="font-medium text-foreground font-mono">{result.extraction_method}</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 space-y-0.5">
                <p className="text-muted-foreground">Chunks Generated</p>
                <p className="font-medium text-foreground font-mono text-lg">{result.total_chunks}</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 space-y-0.5">
                <p className="text-muted-foreground">Inserted to BigQuery</p>
                <p className="font-medium text-green-400 font-mono text-lg">{result.inserted_chunks}</p>
              </div>
            </div>

            <div className="bg-background/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-0.5">GCS URI</p>
              <p className="text-xs font-mono text-foreground break-all">{result.gcs_uri}</p>
            </div>
          </div>
        )}

        {/* Info Panel */}
        <div className="p-4 rounded-xl border border-border bg-card text-xs text-muted-foreground space-y-1.5">
          <p className="font-semibold text-foreground text-xs uppercase tracking-wide">Pipeline</p>
          <p>1. PDF → GCS bucket (<code className="font-mono">gs://br-ventasbrasil-cld-01-exam-docs</code>)</p>
          <p>2. MuPDF text extraction (Vision OCR fallback if &lt; 200 chars)</p>
          <p>3. Chunking: 1 000 chars / 200 overlap via LangChain</p>
          <p>4. BigQuery INSERT with <code className="font-mono">ML.GENERATE_EMBEDDING</code> via <code className="font-mono">vertex_conn</code></p>
        </div>
      </main>
    </div>
  );
}
