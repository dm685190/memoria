import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";
import EmailTest from "@/components/EmailTest";
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
  metadata: Record<string, any>;
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
  const [health, events] = await Promise.all([
    getSupabaseHealth(),
    getMemoryEvents(),
  ]);

  return (
    <main className={styles.pageShell}>
      <section className={styles.card}>
        <div className={styles.topBar}>
          <p className={styles.eyebrow}>Robin Cloud</p>
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

        <h1>Robin is alive.</h1>
        <p className={styles.lede}>
          A portable memory and orchestration layer for Dylan, designed to keep
          Robin intact across OpenClaw, Hermes, and whatever vessel comes next.
        </p>
        <div className={styles.statusGrid}>
          <div>
            <span>Control plane</span>
            <strong>Vercel</strong>
          </div>
          <div>
            <span>Private execution</span>
            <strong>Local node</strong>
          </div>
          <div>
            <span>Memory intake</span>
            <strong>RobinVault</strong>
          </div>
        </div>

        <div className={health.ok ? styles.healthOk : styles.healthWarning}>
          <span>Supabase health</span>
          <strong>{health.status}</strong>
          <p>{health.detail}</p>
          {health.checkedAt ? <time>{health.checkedAt}</time> : null}
        </div>

        <div className={styles.memorySection}>
          <span>Recent memory events</span>
          {events.length === 0 ? (
            <p className={styles.memoryEmpty}>No events yet.</p>
          ) : (
            <ul className={styles.memoryList}>
              {events.map((ev) => (
                <li key={ev.id} className={styles.memoryItem}>
                  <strong>{ev.kind}</strong>: {ev.summary}
                  <br />
                  <small className={styles.metadata}>
                    {new Date(ev.created_at).toLocaleString()} • {ev.source}
                  </small>
                </li>
              ))}
            </ul>
          )}
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
