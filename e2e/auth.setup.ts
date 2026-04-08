import { test as setup, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import fs from 'node:fs';

const STORAGE_STATE = path.join(process.cwd(), 'playwright/.auth/user.json');

setup('authenticate via supabase', async ({ page, baseURL }) => {
  const {
    TEST_USER_EMAIL,
    TEST_USER_PASSWORD,
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
  } = process.env;

  const missing: string[] = [];
  if (!TEST_USER_EMAIL) missing.push('TEST_USER_EMAIL');
  if (!TEST_USER_PASSWORD) missing.push('TEST_USER_PASSWORD');
  if (!NEXT_PUBLIC_SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (missing.length > 0) {
    // Emit an empty storage state so the chromium project can still mount its
    // context (it references STORAGE_STATE). Auth-dependent specs detect the
    // missing file via fs.existsSync and skip themselves gracefully.
    fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
    if (!fs.existsSync(STORAGE_STATE)) {
      fs.writeFileSync(
        STORAGE_STATE,
        JSON.stringify({ cookies: [], origins: [] }),
        'utf8'
      );
    }
    setup.skip(
      true,
      `[auth.setup] Missing env vars (${missing.join(', ')}). ` +
        `Auth-dependent specs will skip themselves. ` +
        `Create .env.test.local to enable authenticated tests.`
    );
    return;
  }

  const supabase = createClient(
    NEXT_PUBLIC_SUPABASE_URL!,
    NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_USER_EMAIL!,
    password: TEST_USER_PASSWORD!,
  });

  if (error || !data.session) {
    throw new Error(
      `[auth.setup] Supabase signInWithPassword failed: ${error?.message ?? 'no session returned'}`
    );
  }

  const session = data.session;
  const projectRef = new URL(NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const storageValue = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    token_type: session.token_type,
    user: session.user,
  });

  await page.goto(baseURL ?? '/');
  await page.evaluate(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [storageKey, storageValue]
  );

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });

  expect(fs.existsSync(STORAGE_STATE)).toBe(true);
});
