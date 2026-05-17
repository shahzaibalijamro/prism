"use client";

import {
  CSSProperties,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { socket } from "./socket";
import { useAuth } from "./auth-context";
import { ThemeToggle } from "./theme-toggle";
import { SignInPage } from "./signin";

type Role = "user" | "assistant";
type AgentStatus = "active" | "soon";

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
  agentName?: string;
};

type ThreadRecord = {
  id: string;
  conversationId: string | null;
  agentId: string;
  title: string;
  messages: ChatMessage[];
  sources: ResearchSource[];
  createdAt: string;
  updatedAt: string;
};

type AgentOutput = {
  agentName: string;
  content: string;
  latencyMs: number;
};

type AnalysisData = {
  sessionId: string;
  round1: AgentOutput[];
  round2: AgentOutput[];
  synthesis: string;
};

type AnalysisResponse = {
  success: boolean;
  message: string;
  data?: AnalysisData;
  errors?: unknown;
};

type ResearchSource = {
  title: string;
  domain: string;
  url: string;
  snippet: string;
};

type PrismAgent = {
  id: string;
  name: string;
  summary: string;
  status: AgentStatus;
  tone: string;
  color: string;
};

type ActiveRun = {
  threadId: string;
  sessionId: string | null;
  streamedAgentKeys: Set<string>;
  synthesisReceived: boolean;
  sources: ResearchSource[];
};

type ProgressFeedEntry = {
  id: string;
  text: string;
  type: "status" | "agent-thinking" | "agent-done" | "round" | "round-done" | "synthesis";
  agentName?: string;
  agentColor?: string;
  round?: 1 | 2;
};

type DisplayItem =
  | { kind: "user"; id: string; content: string; createdAt: string }
  | { kind: "synthesis"; id: string; content: string; createdAt: string }
  | { kind: "agent"; id: string; agentName: string; round: 1 | 2; content: string; createdAt: string };

// ─── Backend API types ────────────────────────────────────────────────────────

type BackendConversation = {
  _id: string;
  conversationId: string;
  userId: string;
  title: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
};

type BackendMessage = {
  _id: string;
  conversationId: string;
  userId: string;
  role: "user" | "assistant" | "system";
  content: string;
  embedding: number[];
  createdAt: string;
};

type BackendSession = {
  _id: string;
  sessionId: string;
  userId: string;
  query: string;
  round1: AgentOutput[];
  round2: AgentOutput[];
  synthesis: string;
  researchSources: ResearchSource[];
  status: string;
  embedding: number[];
  createdAt: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "https://prism-t1ko.onrender.com";

const agents: PrismAgent[] = [
  {
    id: "devils-advocate",
    name: "Devil's Advocate",
    summary: "Stress-tests assumptions, plans, and optimistic bets.",
    status: "active",
    tone: "Adversarial lens",
    color: "#c0392b",
  },
  {
    id: "economist",
    name: "Economist",
    summary: "Models incentives, tradeoffs, and second-order effects.",
    status: "active",
    tone: "Market lens",
    color: "#2980b9",
  },
  {
    id: "visionary",
    name: "Visionary",
    summary: "Sees blue-ocean opportunities and transformative upside.",
    status: "active",
    tone: "Growth lens",
    color: "#27ae60",
  },
  {
    id: "consumer-psychologist",
    name: "Consumer Psychologist",
    summary: "Predicts emotional drivers, status-signaling, and irrational behaviour.",
    status: "active",
    tone: "Human lens",
    color: "#8e44ad",
  },
  {
    id: "operations-pragmatist",
    name: "Operations Pragmatist",
    summary: "Bridges idea and execution — logistics, timelines, and bottlenecks.",
    status: "active",
    tone: "Execution lens",
    color: "#d35400",
  },
  {
    id: "research",
    name: "Research Agent",
    summary: "Pulls live evidence and checks factual claims.",
    status: "active",
    tone: "Evidence lens",
    color: "#16a085",
  },
];

const promptStarters = [
  "Pressure-test my plan to launch a premium AI note-taking app.",
  "Find the weakest assumptions in my hiring plan.",
  "Challenge this idea: a subscription service for solo founders.",
  "What am I missing before I commit to this product direction?",
];

// ─── Utility helpers ──────────────────────────────────────────────────────────

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
}

function makeMessage(
  role: Role,
  content: string,
  agentName?: string,
): ChatMessage {
  return {
    id: createId(role),
    role,
    content,
    createdAt: new Date().toISOString(),
    ...(agentName ? { agentName } : {}),
  };
}

function titleFromPrompt(prompt: string) {
  const compact = prompt.replace(/\s+/g, " ").trim();
  if (compact.length <= 54) return compact || "Untitled thread";
  return `${compact.slice(0, 51)}...`;
}

function getErrorMessage(payload: AnalysisResponse | null, fallback: string) {
  if (!payload) return fallback;
  if (typeof payload.errors === "string") return payload.errors;
  return payload.message || fallback;
}

function formatAgentMessage(round: 1 | 2, output: AgentOutput) {
  return `Round ${round} - ${output.agentName}\n\n${output.content}`;
}

function stripAgentPrefix(content: string): { round: 1 | 2; agentName: string; cleanContent: string } | null {
  const match = content.match(/^Round (1|2) - (.+?)\n\n([\s\S]+)$/);
  if (!match) return null;
  return { round: Number(match[1]) as 1 | 2, agentName: match[2], cleanContent: match[3] };
}

function processMessages(messages: ChatMessage[]): DisplayItem[] {
  return messages.map((msg) => {
    if (msg.role === "user") {
      return { kind: "user" as const, id: msg.id, content: msg.content, createdAt: msg.createdAt };
    }
    if (msg.agentName === "PRISM Synthesis") {
      return { kind: "synthesis" as const, id: msg.id, content: msg.content, createdAt: msg.createdAt };
    }
    const parsed = stripAgentPrefix(msg.content);
    if (parsed) {
      return { kind: "agent" as const, id: msg.id, agentName: parsed.agentName, round: parsed.round, content: parsed.cleanContent, createdAt: msg.createdAt };
    }
    return { kind: "synthesis" as const, id: msg.id, content: msg.content, createdAt: msg.createdAt };
  });
}

function waitForSocketId(): Promise<string | undefined> {
  if (socket.connected && socket.id) {
    return Promise.resolve(socket.id);
  }

  return new Promise((resolve) => {
    let settled = false;

    const handleConnect = () => finish(socket.id);
    const handleError = () => finish(undefined);

    function finish(socketId?: string) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleError);
      resolve(socketId);
    }

    const timeoutId = window.setTimeout(() => finish(socket.id), 1500);

    socket.on("connect", handleConnect);
    socket.on("connect_error", handleError);
    socket.connect();
  });
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatThreadTime(value: string) {
  const date = new Date(value);
  const now = Date.now();
  const diffHours = (now - date.getTime()) / 36e5;

  if (diffHours < 24) {
    return new Intl.DateTimeFormat("en", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function MessageContent({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <>
      {lines.map((line, index) => (
        <span key={`${index}-${line}`}>
          {line}
          {index < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </>
  );
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include" as RequestCredentials,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string> | undefined),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || `Request failed (${res.status})`);
  }
  return data;
}

// ─── Backend data → frontend type mappers ─────────────────────────────────────

function mapConversationToThread(conv: BackendConversation): ThreadRecord {
  return {
    id: conv.conversationId,
    conversationId: conv.conversationId,
    agentId: "devils-advocate",
    title: conv.title || "Untitled",
    messages: [],
    sources: [],
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  };
}

function mapBackendMessage(msg: BackendMessage): ChatMessage {
  return {
    id: msg._id?.toString() || createId("msg"),
    role: msg.role as Role,
    content: msg.content,
    createdAt: msg.createdAt,
  };
}

function reconstructMessages(
  dbMessages: BackendMessage[],
  sessions: BackendSession[],
): ChatMessage[] {
  const result: ChatMessage[] = [];

  // Only add user messages from the Message collection.
  // Assistant messages in the Message collection are agent outputs stored by
  // base.agent.ts with format "[AgentName] content" — these lack the agentName
  // field and would be misclassified as "synthesis" by processMessages().
  // They are already properly reconstructed from Session documents below,
  // which include the agentName field and the correct "Round N - Agent" prefix.
  for (const msg of dbMessages) {
    if (msg.role === "user") {
      result.push(mapBackendMessage(msg));
    }
  }

  // Add agent outputs and synthesis from Session documents
  for (const session of sessions) {
    for (const output of session.round1 || []) {
      result.push({
        id: `${session._id || session.sessionId}-r1-${output.agentName}`,
        role: "assistant",
        content: formatAgentMessage(1, output),
        createdAt: session.createdAt || new Date().toISOString(),
        agentName: output.agentName,
      });
    }
    for (const output of session.round2 || []) {
      result.push({
        id: `${session._id || session.sessionId}-r2-${output.agentName}`,
        role: "assistant",
        content: formatAgentMessage(2, output),
        createdAt: session.createdAt || new Date().toISOString(),
        agentName: output.agentName,
      });
    }
    if (session.synthesis) {
      result.push({
        id: `${session._id || session.sessionId}-synthesis`,
        role: "assistant",
        content: session.synthesis,
        createdAt: session.createdAt || new Date().toISOString(),
        agentName: "PRISM Synthesis",
      });
    }
  }

  // Sort chronologically
  result.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return result;
}

function extractSources(sessions: BackendSession[]): ResearchSource[] {
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].researchSources?.length) {
      return sessions[i].researchSources;
    }
  }
  return [];
}

// ─── Auth loading screen ──────────────────────────────────────────────────────

function AuthLoadingScreen() {
  return (
    <main className="prism-shell">
      <div className="auth-loading">
        <div className="prism-mark" aria-hidden="true">
          <span />
        </div>
        <p>PRISM</p>
        <span>Loading your workspace…</span>
        <ThemeToggle />
      </div>
    </main>
  );
}

// ─── Home component ───────────────────────────────────────────────────────────

export default function Home() {
  const { user, loading: authLoading, signOut } = useAuth();

  // ── Chat state (replaces localStorage workspace) ──────────────────────────
  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);
  const [activeSources, setActiveSources] = useState<ResearchSource[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // ── UI state (unchanged) ──────────────────────────────────────────────────
  const [selectedAgentId, setSelectedAgentId] = useState("devils-advocate");
  const [draft, setDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [streamStatus, setStreamStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [researchSources, setResearchSources] = useState<ResearchSource[]>([]);
  const [showSourcesPanel, setShowSourcesPanel] = useState(false);
  const [searchMode, setSearchMode] = useState<"off" | "basic" | "advanced">("off");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [progressFeed, setProgressFeed] = useState<ProgressFeedEntry[]>([]);
  const [tooltipInfo, setTooltipInfo] = useState<{ text: string; top: number; left: number } | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const activeRunRef = useRef<ActiveRun | null>(null);
  const searchModeRef = useRef<"off" | "basic" | "advanced">(searchMode);
  searchModeRef.current = searchMode;

  // ── Derived data ──────────────────────────────────────────────────────────
  const sortedThreads = useMemo(
    () =>
      [...threads].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [threads],
  );

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  const exchangeCount = activeMessages.filter((m) => m.role === "user").length;

  const displayItems = useMemo(
    () => processMessages(activeMessages),
    [activeMessages],
  );

  const agentItems = useMemo(
    () => displayItems.filter((item): item is DisplayItem & { kind: "agent" } => item.kind === "agent"),
    [displayItems],
  );

  const agentItemsByAgent = useMemo(() => {
    const map = new Map<string, { round: 1 | 2; content: string; id: string; createdAt: string }[]>();
    for (const item of agentItems) {
      const existing = map.get(item.agentName) ?? [];
      existing.push({ round: item.round, content: item.content, id: item.id, createdAt: item.createdAt });
      map.set(item.agentName, existing);
    }
    return Array.from(map.entries()).map(([agentName, rounds]) => ({
      agentName,
      rounds,
      agentDef: agents.find((a) => a.name === agentName),
    }));
  }, [agentItems]);

  const completedAgentNames = useMemo(
    () => new Set(agentItems.map((item) => item.agentName)),
    [agentItems],
  );

  const debateAgents = agents.filter((a) => a.id !== "research");

  // ── Fetch chat list from backend ──────────────────────────────────────────
  const fetchChats = useCallback(async () => {
    setIsLoadingChats(true);
    try {
      const data = await apiFetch("/api/chats");
      const conversations: BackendConversation[] = data?.data?.conversations ?? [];
      setThreads(conversations.map(mapConversationToThread));
    } catch (err) {
      console.error("Failed to fetch chats:", err);
    } finally {
      setIsLoadingChats(false);
    }
  }, []);

  // ── Load chat detail (messages + sessions) from backend ───────────────────
  const loadChatDetail = useCallback(async (conversationId: string) => {
    setIsLoadingDetail(true);
    try {
      const data = await apiFetch(`/api/chats/${encodeURIComponent(conversationId)}`);
      const dbMessages: BackendMessage[] = data?.data?.messages ?? [];
      const sessions: BackendSession[] = data?.data?.sessions ?? [];

      const messages = reconstructMessages(dbMessages, sessions);
      const sources = extractSources(sessions);

      setActiveMessages(messages);
      setActiveSources(sources);
      setResearchSources(sources);
    } catch (err) {
      console.error("Failed to load chat detail:", err);
      setActiveMessages([]);
      setActiveSources([]);
      setResearchSources([]);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  // ── Delete a chat ─────────────────────────────────────────────────────────
  const deleteChat = useCallback(async (conversationId: string) => {
    try {
      await apiFetch(`/api/chats/${encodeURIComponent(conversationId)}`, {
        method: "DELETE",
      });
      // Refresh the chat list
      await fetchChats();
      // If the deleted chat was active, clear it
      if (activeThreadId === conversationId) {
        setActiveThreadId(null);
        setActiveMessages([]);
        setActiveSources([]);
        setResearchSources([]);
        setExpandedAgent(null);
        setProgressFeed([]);
      }
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  }, [activeThreadId, fetchChats]);

  // ── Fetch chats on mount (after auth) ─────────────────────────────────────
  useEffect(() => {
    if (!authLoading && user) {
      fetchChats();
    }
  }, [authLoading, user, fetchChats]);

  // ── Socket event handlers ─────────────────────────────────────────────────
  useEffect(() => {
    socket.connect();

    function appendAgentOutput(round: 1 | 2, output: AgentOutput) {
      const run = activeRunRef.current;
      if (!run) return;

      // Skip Researcher agent from chat display (sources shown separately)
      if (output.agentName === "Researcher") return;

      const streamKey = `${round}:${output.agentName}`;
      if (run.streamedAgentKeys.has(streamKey)) return;

      run.streamedAgentKeys.add(streamKey);
      setActiveMessages((prev) => [
        ...prev,
        makeMessage("assistant", formatAgentMessage(round, output), output.agentName),
      ]);
    }

    function handleSessionStart(payload: {
      sessionId?: string;
      agents?: string[];
    }) {
      const run = activeRunRef.current;
      if (!run) return;

      if (payload.sessionId) {
        run.sessionId = payload.sessionId;
      }
      setStreamStatus("Starting");
      setProgressFeed((prev) => [...prev, {
        id: createId("prog"),
        text: "Starting analysis\u2026",
        type: "status",
      }]);
      if (searchModeRef.current !== "off") {
        const researcher = agents.find((a) => a.id === "research");
        if (researcher) {
          setProgressFeed((prev) => [...prev, {
            id: createId("prog"),
            text: `${researcher.name} searching\u2026`,
            type: "agent-thinking",
            agentName: researcher.name,
            agentColor: researcher.color,
          }]);
        }
      }
    }

    function handleRoundStart(payload: { round?: 1 | 2 }) {
      if (!activeRunRef.current || !payload.round) return;
      setStreamStatus(`Round ${payload.round}`);
      setProgressFeed((prev) => [...prev, {
        id: createId("prog"),
        text: `Round ${payload.round}`,
        type: "round",
        round: payload.round,
      }]);
      for (const agent of debateAgents) {
        setProgressFeed((prev) => [...prev, {
          id: createId("prog"),
          text: `${agent.name} thinking\u2026`,
          type: "agent-thinking",
          agentName: agent.name,
          agentColor: agent.color,
          round: payload.round,
        }]);
      }
    }

    function handleRoundComplete(payload: { round?: 1 | 2 }) {
      if (!activeRunRef.current || !payload.round) return;
      setStreamStatus(`Round ${payload.round} done`);
      setProgressFeed((prev) => [...prev, {
        id: createId("prog"),
        text: `Round ${payload.round} complete`,
        type: "round-done",
        round: payload.round,
      }]);
    }

    function handleAgentComplete(payload: AgentOutput & { round?: 1 | 2 }) {
      if (!activeRunRef.current) return;
      const agentDef = agents.find((a) => a.name === payload.agentName);
      setProgressFeed((prev) => [...prev, {
        id: createId("prog"),
        text: `${payload.agentName} done`,
        type: "agent-done",
        agentName: payload.agentName,
        agentColor: agentDef?.color,
        round: payload.round === 1 || payload.round === 2 ? payload.round : undefined,
      }]);
      if (payload.round !== 1 && payload.round !== 2) return;
      appendAgentOutput(payload.round, payload);
    }

    function handleSynthesisStart() {
      if (!activeRunRef.current) return;
      setStreamStatus("Synthesizing");
      setProgressFeed((prev) => [...prev, {
        id: createId("prog"),
        text: "Synthesizing final analysis\u2026",
        type: "synthesis",
      }]);
    }

    function handleSessionComplete(payload: { synthesis?: string }) {
      const run = activeRunRef.current;
      if (!run || !payload.synthesis || run.synthesisReceived) return;

      run.synthesisReceived = true;
      setActiveMessages((prev) => [
        ...prev,
        makeMessage("assistant", payload.synthesis!, "PRISM Synthesis"),
      ]);
      setStreamStatus("Complete");
    }

    function handleConnectError() {
      if (!activeRunRef.current) return;
      setSessionNotice(
        "Live progress is unavailable; the final response will still appear.",
      );
    }

    function handleResearchSources(payload: { sources?: ResearchSource[] }) {
      if (!activeRunRef.current || !payload.sources) return;
      activeRunRef.current.sources = payload.sources;
      setResearchSources(payload.sources);
      setActiveSources(payload.sources);
    }

    function handleTitleUpdate(payload: { title?: string; sessionId?: string }) {
      if (!payload.title) return;
      const run = activeRunRef.current;
      // Match by threadId (active run) OR by conversationId (sessionId from backend)
      setThreads((prev) =>
        prev.map((t) => {
          if (run && t.id === run.threadId) return { ...t, title: payload.title! };
          if (payload.sessionId && t.conversationId === payload.sessionId)
            return { ...t, title: payload.title! };
          return t;
        }),
      );
    }

    socket.on("session:start", handleSessionStart);
    socket.on("round:start", handleRoundStart);
    socket.on("round:complete", handleRoundComplete);
    socket.on("agent:complete", handleAgentComplete);
    socket.on("synthesis:start", handleSynthesisStart);
    socket.on("session:complete", handleSessionComplete);
    socket.on("research:sources", handleResearchSources);
    socket.on("title:update", handleTitleUpdate);
    socket.on("connect_error", handleConnectError);

    return () => {
      socket.off("session:start", handleSessionStart);
      socket.off("round:start", handleRoundStart);
      socket.off("round:complete", handleRoundComplete);
      socket.off("agent:complete", handleAgentComplete);
      socket.off("synthesis:start", handleSynthesisStart);
      socket.off("session:complete", handleSessionComplete);
      socket.off("research:sources", handleResearchSources);
      socket.off("title:update", handleTitleUpdate);
      socket.off("connect_error", handleConnectError);
      socket.disconnect();
    };
    // debateAgents is a module-level constant; safe to reference in [] deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [activeMessages, isSubmitting, progressFeed]);

  // ── Sync research sources when not submitting ─────────────────────────────
  useEffect(() => {
    if (!isSubmitting && activeThreadId) {
      setResearchSources(activeSources);
    }
  }, [activeThreadId, isSubmitting, activeSources]);

  // ── Submit prompt ─────────────────────────────────────────────────────────
  async function submitPrompt(prompt: string) {
    const query = prompt.trim();
    if (query.length < 5 || isSubmitting) return;

    const now = new Date().toISOString();
    const userMessage = makeMessage("user", query);

    // Determine if we're continuing an existing thread or starting a new one
    const existingThread = threads.find((t) => t.id === activeThreadId) ?? null;
    const threadId = existingThread?.id ?? createId("thread");
    const conversationId = existingThread?.conversationId ?? null;

    // Create/update the thread in local state for immediate UI feedback
    const threadTitle =
      existingThread && existingThread.messages.length > 0
        ? existingThread.title
        : titleFromPrompt(query);

    const updatedThread: ThreadRecord = {
      id: threadId,
      conversationId,
      agentId: existingThread?.agentId ?? selectedAgentId,
      title: threadTitle,
      messages: [],
      sources: [],
      createdAt: existingThread?.createdAt ?? now,
      updatedAt: now,
    };

    // Update threads list (upsert)
    setThreads((prev) => {
      const filtered = prev.filter((t) => t.id !== threadId);
      return [updatedThread, ...filtered];
    });
    setActiveThreadId(threadId);

    // Set initial messages for the active thread
    const initialMessages = existingThread
      ? [...activeMessages, userMessage]
      : [userMessage];
    setActiveMessages(initialMessages);

    setDraft("");
    setIsSubmitting(true);
    setStreamStatus("Connecting");
    setError(null);
    setSessionNotice(null);
    setResearchSources([]);
    setExpandedAgent(null);
    setProgressFeed([]);
    setIsSidebarOpen(false);
    activeRunRef.current = {
      threadId,
      sessionId: conversationId,
      streamedAgentKeys: new Set(),
      synthesisReceived: false,
      sources: [],
    };

    try {
      const socketId = await waitForSocketId();

      const response = await fetch(`${API_BASE_URL}/api/analyze`, {
        method: "POST",
        credentials: "include" as RequestCredentials,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          searchMode,
          ...(activeRunRef.current?.sessionId
            ? { sessionId: activeRunRef.current.sessionId }
            : {}),
          ...(socketId ? { socketId } : {}),
        }),
      });

      const payload = (await response
        .json()
        .catch(() => null)) as AnalysisResponse | null;

      if (!response.ok || !payload?.success || !payload.data) {
        throw new Error(
          getErrorMessage(
            payload,
            "PRISM could not reach the orchestrator right now.",
          ),
        );
      }

      // Update the sessionId on the active run
      if (payload.data.sessionId && activeRunRef.current) {
        activeRunRef.current.sessionId = payload.data.sessionId;
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "PRISM could not reach the orchestrator right now.",
      );
    } finally {
      activeRunRef.current = null;
      setIsSubmitting(false);
      setStreamStatus("Ready");
      // Refresh chat list from backend to get canonical titles/timestamps
      fetchChats();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitPrompt(draft);
  }

  function startNewThread() {
    setActiveThreadId(null);
    setActiveMessages([]);
    setActiveSources([]);
    setDraft("");
    setError(null);
    setSessionNotice(null);
    setResearchSources([]);
    setExpandedAgent(null);
    setProgressFeed([]);
    setStreamStatus("Ready");
    setIsSidebarOpen(false);
  }

  async function selectThread(threadId: string) {
    setActiveThreadId(threadId);
    setDraft("");
    setError(null);
    setSessionNotice(null);
    setExpandedAgent(null);
    setProgressFeed([]);
    setStreamStatus("Ready");
    setIsSidebarOpen(false);

    // Load messages and sources from backend
    await loadChatDetail(threadId);
  }

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (authLoading) {
    return <AuthLoadingScreen />;
  }

  if (!user) {
    return <SignInPage />;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="prism-shell">
      <aside className={`sidebar ${isSidebarOpen ? "is-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="prism-mark" aria-hidden="true">
            <span />
          </div>
          <div>
            <p>PRISM</p>
            <span>Perspective engine</span>
          </div>
          <ThemeToggle />
        </div>

        <button
          className="new-chat-button"
          type="button"
          onClick={startNewThread}
        >
          New chat
        </button>

        <section className="sidebar-section" aria-label="Agents">
          <div className="section-label">Agents</div>
          <div className="agent-list">
            {agents.map((agent) => {
              const isActive =
                agent.id === (activeThread?.agentId ?? selectedAgentId);

              return (
                <button
                  aria-current={isActive ? "true" : undefined}
                  className={`agent-option ${isActive ? "is-active" : ""}`}
                  disabled={agent.status !== "active"}
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  type="button"
                >
                  <span className="agent-token" aria-hidden="true" />
                  <span>
                    <strong>{agent.name}</strong>
                    <small>{agent.tone}</small>
                  </span>
                  {agent.status === "soon" ? <em>soon</em> : null}
                </button>
              );
            })}
          </div>
        </section>

        <section
          className="sidebar-section history-section"
          aria-label="History"
        >
          <div className="section-label">History</div>
          <div className="history-list">
            {isLoadingChats && sortedThreads.length === 0 ? (
              <div className="empty-history">Loading chats…</div>
            ) : sortedThreads.length ? (
              sortedThreads.map((thread) => (
                <div key={thread.id} className="history-item-row">
                  <button
                    aria-current={
                      thread.id === activeThreadId ? "page" : undefined
                    }
                    className="history-item"
                    onClick={() => selectThread(thread.id)}
                    type="button"
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltipInfo({
                        text: thread.title,
                        top: rect.top + rect.height / 2,
                        left: rect.right + 10,
                      });
                    }}
                    onMouseLeave={() => setTooltipInfo(null)}
                  >
                    <strong>{thread.title}</strong>
                    <span>
                      {agents.find((agent) => agent.id === thread.agentId)
                        ?.name ?? "Agent"}{" "}
                      / {formatThreadTime(thread.updatedAt)}
                    </span>
                  </button>
                  <button
                    className="history-item-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (thread.conversationId) {
                        void deleteChat(thread.conversationId);
                      } else {
                        // Local-only thread (not yet persisted): just remove from list
                        setThreads((prev) => prev.filter((t) => t.id !== thread.id));
                        if (activeThreadId === thread.id) {
                          startNewThread();
                        }
                      }
                    }}
                    title="Delete chat"
                    type="button"
                    aria-label={`Delete ${thread.title}`}
                  >
                    ✕
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-history">No threads yet</div>
            )}
          </div>
        </section>

        {/* ── User info + sign-out ────────────────────────────────────────── */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            {user.avatarUrl ? (
              <img
                className="sidebar-user-avatar"
                src={user.avatarUrl}
                alt={user.name}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="sidebar-user-avatar sidebar-user-avatar--placeholder">
                {user.name?.charAt(0)?.toUpperCase() ?? "U"}
              </span>
            )}
            <div className="sidebar-user-info">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
            <button
              className="sidebar-user-signout"
              onClick={() => {
                void signOut();
                startNewThread();
                setThreads([]);
              }}
              type="button"
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <section
        className="workspace-shell"
        aria-label="PRISM perspective workspace"
      >
        <header className="workspace-header">
          <div className="workspace-title">
            <p className="eyebrow">Multi-agent perspective engine</p>
            <h1>
              {activeThread?.title ??
                "Ask a question worth seeing from several angles"}
            </h1>
          </div>

          <div className="engine-status">
            <span>PRISM Orchestrator</span>
            <strong>{isSubmitting ? streamStatus : "Ready"}</strong>
          </div>
        </header>

        {(error || sessionNotice) && (
          <div className={error ? "notice is-error" : "notice"}>
            {error ?? sessionNotice}
          </div>
        )}

        <div className="workspace-body" ref={transcriptRef}>
          <div className="workspace-inner">
            {isLoadingDetail ? (
              <div className="detail-loading">
                <div className="prism-mark" aria-hidden="true">
                  <span />
                </div>
                <p>Loading conversation…</p>
              </div>
            ) : !activeMessages.length ? (
              <section className="engine-empty">
                <div className="engine-copy">
                  <p className="eyebrow">PRISM Orchestrator</p>
                  <h2>One question. Many lenses. A visible debate.</h2>
                  <p>
                    PRISM is being built as a multi-agent perspective engine.
                    Today Devil's Advocate and Economist run through the
                    orchestrator, then PRISM synthesizes the debate into one
                    answer.
                  </p>
                </div>

                <div
                  className="engine-map"
                  aria-label="PRISM agent graph preview"
                >
                  <div className="map-line line-one" />
                  <div className="map-line line-two" />
                  <div className="map-line line-three" />
                  <div className="map-core">
                    <span>PRISM</span>
                    <strong>Orchestrator</strong>
                  </div>
                  {agents.map((agent, index) => (
                    <div
                      className={`map-node node-${index + 1} ${
                        agent.status === "active" ? "is-live" : ""
                      }`}
                      key={agent.id}
                    >
                      <span>{agent.name}</span>
                      <small>
                        {agent.status === "active" ? "live" : agent.tone}
                      </small>
                    </div>
                  ))}
                </div>

                <div className="debate-flow" aria-label="PRISM workflow">
                  <div>
                    <span>01</span>
                    User question
                  </div>
                  <div>
                    <span>02</span>
                    Agent lenses
                  </div>
                  <div>
                    <span>03</span>
                    Cross-challenge
                  </div>
                  <div>
                    <span>04</span>
                    Synthesized answer
                  </div>
                </div>

                <div className="starter-grid" aria-label="Prompt starters">
                  {promptStarters.map((prompt) => (
                    <button
                      disabled={isSubmitting}
                      key={prompt}
                      onClick={() => void submitPrompt(prompt)}
                      type="button"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <>
                {/* User + Synthesis messages — main visible flow */}
                {displayItems
                  .filter((item) => item.kind === "user" || item.kind === "synthesis")
                  .map((item) => (
                    <article
                      key={item.id}
                      className={`message ${item.kind === "user" ? "is-user" : ""} ${item.kind === "synthesis" ? "is-synthesis" : ""}`}
                    >
                      <div className="message-avatar" aria-hidden="true">
                        {item.kind === "user" ? "Y" : "P"}
                      </div>
                      <div className="message-body">
                        <div className="message-meta">
                          <span>
                            {item.kind === "user" ? "You" : "PRISM Synthesis"}
                          </span>
                          <time dateTime={item.createdAt}>
                            {formatMessageTime(item.createdAt)}
                          </time>
                        </div>
                        <div className="message-content">
                          <MessageContent content={item.content} />
                        </div>
                      </div>
                    </article>
                  ))}

                {/* Live progress panel during streaming */}
                {isSubmitting && (
                  <div className="progress-panel">
                    <div className="progress-orbiter">
                      <div className="progress-orbiter-ring" />
                      <div className="progress-orbiter-core">P</div>
                    </div>
                    <div className="progress-feed">
                      {progressFeed.length === 0 && (
                        <div className="progress-entry is-status">
                          <span className="progress-entry-bullet">&#11044;</span>
                          <span className="progress-entry-text">Connecting to PRISM\u2026</span>
                        </div>
                      )}
                      {progressFeed.map((entry) => (
                        <div key={entry.id} className={`progress-entry is-${entry.type}`}>
                          {entry.type === "status" && (
                            <span className="progress-entry-bullet">&#11044;</span>
                          )}
                          {entry.type === "agent-thinking" && entry.agentColor && (
                            <span className="progress-entry-dot" style={{ background: entry.agentColor }} />
                          )}
                          {entry.type === "agent-done" && entry.agentColor && (
                            <span className="progress-entry-check" style={{ color: entry.agentColor }}>&#10003;</span>
                          )}
                          {entry.type === "round" && (
                            <span className="progress-entry-milestone">&#9656;</span>
                          )}
                          {entry.type === "round-done" && (
                            <span className="progress-entry-milestone-done">&#10003;</span>
                          )}
                          {entry.type === "synthesis" && (
                            <span className="progress-entry-spark">&#9670;</span>
                          )}
                          <span className="progress-entry-text">{entry.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Agent lens pills — compact row of debate agents */}
                {(isSubmitting || agentItems.length > 0) && (
                  <div className="agent-pills">
                    {debateAgents.map((agent) => {
                      const isCompleted = completedAgentNames.has(agent.name);
                      return (
                        <button
                          key={agent.id}
                          className={`agent-pill ${isCompleted ? "is-completed" : "is-pending"}`}
                          type="button"
                          disabled={!isCompleted}
                          onClick={() => setExpandedAgent(agent.name)}
                          style={{ "--pill-color": agent.color } as CSSProperties}
                        >
                          <span className="agent-pill-dot" />
                          <span className="agent-pill-name">{agent.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {!isSubmitting && researchSources.length > 0 && (
                  <div className="sources-pill-container">
                    <button
                      className="sources-pill"
                      onClick={() => setShowSourcesPanel(true)}
                      type="button"
                    >
                      <span className="sources-icon">📚</span>
                      Sources
                      <span className="sources-badge">
                        {researchSources.length}
                      </span>
                    </button>
                  </div>
                )}

                {/* Sources sidebar — slides in from the right */}
                <div
                  className={`sources-sidebar-overlay ${showSourcesPanel ? "is-visible" : ""}`}
                  onClick={() => setShowSourcesPanel(false)}
                />
                <aside
                  className={`sources-sidebar ${showSourcesPanel ? "is-open" : ""}`}
                >
                  <div className="sources-sidebar-header">
                    <div>
                      <h2>Research Sources</h2>
                      <p>Evidence and references cited by the Research Agent</p>
                    </div>
                    <button
                      className="sources-sidebar-close"
                      onClick={() => setShowSourcesPanel(false)}
                      type="button"
                      aria-label="Close sources panel"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="sources-sidebar-content">
                    {researchSources.map((source, index) => (
                      <a
                        key={index}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="source-item"
                      >
                        <div className="source-icon">🔗</div>
                        <div className="source-details">
                          <h3>{source.title}</h3>
                          <p className="source-domain">{source.domain}</p>
                          {source.snippet && (
                            <p className="source-snippet">{source.snippet}</p>
                          )}
                        </div>
                        <div className="source-arrow">→</div>
                      </a>
                    ))}
                  </div>
                </aside>

                {/* Agent detail overlay */}
                {expandedAgent && (
                  <div className="agent-detail-overlay" onClick={() => setExpandedAgent(null)}>
                    <div className="agent-detail-panel" onClick={(e) => e.stopPropagation()}>
                      <div className="agent-detail-header">
                        <div className="agent-detail-title">
                          <span
                            className="agent-detail-dot"
                            style={{
                              background: agents.find((a) => a.name === expandedAgent)?.color ?? "#0f6b5f",
                            }}
                          />
                          <h2>{expandedAgent}</h2>
                          <span className="agent-detail-tone">
                            {agents.find((a) => a.name === expandedAgent)?.tone ?? ""}
                          </span>
                        </div>
                        <button
                          className="agent-detail-close"
                          onClick={() => setExpandedAgent(null)}
                          type="button"
                          aria-label="Close agent detail"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="agent-detail-content">
                        {agentItemsByAgent
                          .find(({ agentName }) => agentName === expandedAgent)
                          ?.rounds.map((round) => (
                            <div key={`round-${round.round}-${round.id}`} className="agent-detail-round">
                              <div className="agent-detail-round-label">Round {round.round}</div>
                              <div className="agent-detail-round-body">
                                <MessageContent content={round.content} />
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="prompt">
            Message
          </label>
          <textarea
            id="prompt"
            minLength={5}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask PRISM..."
            rows={3}
            value={draft}
          />
          <div className="composer-bar">
            <div className="composer-meta">
              <span>{exchangeCount} exchanges</span>
              <span>{draft.trim().length} chars</span>
            </div>
            <div className="search-mode-selector">
              <label className="search-mode-label" htmlFor="search-mode">
                Web search
              </label>
              <select
                id="search-mode"
                className="search-mode-dropdown"
                value={searchMode}
                onChange={(e) =>
                  setSearchMode(e.target.value as "off" | "basic" | "advanced")
                }
              >
                <option value="off">Off</option>
                <option value="basic">Basic</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <button
              disabled={draft.trim().length < 5 || isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Working" : "Run debate"}
            </button>
          </div>
        </form>
      </section>
      {tooltipInfo && (
        <div
          className="sidebar-tooltip"
          style={{
            position: "fixed",
            top: tooltipInfo.top,
            left: tooltipInfo.left,
          }}
        >
          <div className="sidebar-tooltip-arrow" />
          {tooltipInfo.text}
        </div>
      )}
    </main>
  );
}
