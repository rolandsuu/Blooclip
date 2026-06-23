import { redirect } from "next/navigation";

import { getAuthenticatedUser, getSafeNextPath } from "@/lib/auth";
import { isAuthDisabled } from "@/lib/dev-auth";
import { getRequestOrigin } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
    sent?: string | string[];
    email?: string | string[];
    error?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function sendMagicLink(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const next = getSafeNextPath(formData.get("next"));

  if (isAuthDisabled()) {
    redirect(next);
  }

  if (!email) {
    redirect(`/login?error=email_required&next=${encodeURIComponent(next)}`);
  }

  const origin = await getRequestOrigin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(
        next
      )}`,
    },
  });

  if (error) {
    redirect(`/login?error=send_failed&next=${encodeURIComponent(next)}`);
  }

  redirect(
    `/login?sent=1&email=${encodeURIComponent(
      email
    )}&next=${encodeURIComponent(next)}`
  );
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = getSafeNextPath(firstParam(params.next));
  const user = await getAuthenticatedUser();

  if (user) {
    redirect(next);
  }

  const sent = firstParam(params.sent) === "1";
  const email = firstParam(params.email);
  const errorCode = firstParam(params.error);
  const error =
    errorCode === "email_required"
      ? "请输入邮箱地址。"
      : errorCode
        ? "登录链接发送失败，请稍后重试。"
        : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 text-black">
      <section className="w-full max-w-sm space-y-6">
        <div className="space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-black text-sm font-semibold text-white">
            B
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              登录 Volts24
            </h1>
            <p className="mt-2 text-sm leading-6 text-black/55">
              使用邮箱保存视频任务，之后可以继续查看。
            </p>
          </div>
        </div>

        <form action={sendMagicLink} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <label htmlFor="email" className="sr-only">
            邮箱
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="h-11 w-full rounded-md border border-black/15 px-3 text-sm outline-none transition focus:border-black"
          />
          <button
            type="submit"
            className="h-11 w-full rounded-md bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/80"
          >
            发送登录链接
          </button>
        </form>

        {sent && (
          <p className="rounded-md border border-black/10 bg-black/[0.025] p-3 text-sm leading-6 text-black/65">
            请打开 {email ?? "你的邮箱"} 查看 Volts24 登录链接。
          </p>
        )}

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
