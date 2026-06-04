import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";
import EmailTest from "../components/EmailTest";
import SearchBar from "./components/SearchBar";
import MemoryIngestForm from "./components/MemoryIngestForm";
import RecentMemoryEvents from "./components/RecentMemoryEvents";
import { checkRedisHealth } from "@/lib/upstash";
import styles from "./page.module.css";

type HealthCheck = {
  status: string | null;
  created_at: string | null;
};

type MemoryEvent = {
  id: string;
  source: string;
  kind: string;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
};


async function getSupabaseHealth() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      status: "missing env",
      detail: "Supabase URL or anon key is not configured.",
      checkedAt: null,
      ok: false,
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase
    .from("health_checks")
    .select("status, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<HealthCheck[]>();

  if (error) {
    return {
      status: "error",
      detail: error.message,
      checkedAt: null,
      ok: false,
    };
  }

  const latest = data?.[0];

  return {
    status: latest?.status ?? "no rows",
    detail: latest
      ? "Latest health_checks row loaded from Supabase."
      : "Table is reachable, but no health rows exist yet.",
    checkedAt: latest?.created_at ?? null,
    ok: latest?.status === "ok",
  };
}

async function getMemoryEvents(): Promise<MemoryEvent[]> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.warn('Supabase service role credentials not available');
      return [];
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data, error } = await supabase
      .from('memory_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching memory events:', error);
      return [];
    }

    return (data as MemoryEvent[]) ?? [];
  } catch (e) {
    console.error('Error fetching memory events:', e);
    return [];
  }
}

export default async function Home() {
  const [health, events, redisHealth] = await Promise.all([
    getSupabaseHealth(),
    getMemoryEvents(),
    checkRedisHealth(),
  ]);

  return (
    <main className={styles.pageShell}>
      <section className={styles.card}>
        <div className={styles.topBar}>
          <div className={styles.authControls}>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className={styles.secondaryButton}>Sign in</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className={styles.primaryButton}>Sign up</button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
        </div>

        <h1>Memory Search</h1>
        <p className={styles.lede}>
          A portable memory and orchestration layer for Dylan, designed to keep
          Robin intact across OpenClaw, Hermes, and whatever vessel comes next.
        </p>
        <div className={styles.operatorLinks}>
          <a href="https://github.com/dm685190/robin-cloud" target="_blank" rel="noreferrer">
            <span>Operator docs</span>
            <strong>GitHub README</strong>
            <small>Search guide, stack map, and observability notes.</small>
          </a>
          <a href="https://github.com/dm685190/robin-cloud/blob/main/docs/stack.md" target="_blank" rel="noreferrer">
            <span>Stack map</span>
            <strong>What each service does</strong>
            <small>Vercel, Clerk, Supabase, Pinecone, Resend, Upstash.</small>
          </a>
          <a href="https://github.com/dm685190/robin-cloud/blob/main/docs/observability.md" target="_blank" rel="noreferrer">
            <span>Observability</span>
            <strong>Where to look when it breaks</strong>
            <small>Deployment logs, API errors, email delivery, and data health.</small>
          </a>
        </div>

        <div className={styles.statusGrid}>
          <div>
            <span>Host + logs</span>
            <strong>Vercel</strong>
          </div>
          <div>
            <span>Memory database</span>
            <strong>Supabase</strong>
          </div>
          <div>
            <span>Vector search</span>
            <strong>Pinecone</strong>
          </div>
          <div>
            <span>Email sending</span>
            <strong>Resend</strong>
          </div>
          <div>
            <span>Auth</span>
            <strong>Clerk</strong>
          </div>
          <div>
            <span>Cache layer</span>
            <strong>{redisHealth.ok ? 'Upstash connected' : 'Upstash disconnected'}</strong>
          </div>
        </div>

        <div className={health.ok ? styles.healthOk : styles.healthWarning}>
          <span>Supabase health</span>
          <strong>{health.status}</strong>
          <p>{health.detail}</p>
          {health.checkedAt ? <time>{health.checkedAt}</time> : null}
        </div>

        {/* Search Section */}
        <Show when="signed-in">
          <SearchBar />
          <MemoryIngestForm />
        </Show>

        <RecentMemoryEvents initialEvents={events} />

        <div className={redisHealth.ok ? styles.healthOk : styles.healthWarning}>
          <span>Upstash Redis</span>
          <strong>{redisHealth.ok ? 'Connected' : 'Disconnected'}</strong>
          {!redisHealth.ok && <p>{redisHealth.error}</p>}
        </div>

        <Show when="signed-in">
          <p className={styles.signedInNote}>
            Auth gate is open. The first ghost has a name.
          </p>
        </Show>

        {/* Email test section - only visible when signed in */}
        <Show when="signed-in">
          <section className={styles.emailTestSection}>
            <EmailTest />
          </section>
        </Show>
      </section>
    </main>
  );
}