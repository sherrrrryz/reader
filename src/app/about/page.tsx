import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "About · Reader" };

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-6">
          <Link
            href="/documents"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
          <span className="ml-auto text-sm font-semibold">📖 Reader</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-6 py-12 text-foreground">
        <h1 className="text-3xl font-semibold tracking-tight">About</h1>
        <p className="mt-3 text-base text-muted-foreground">
          {/* TODO 用户补：一句话项目介绍 */}
          一个帮助你阅读英文原文、即点即查、自动整理生词本的轻量阅读器。
        </p>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Creator</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <span className="text-muted-foreground">GitHub · </span>
              <a
                href="{{ TODO github 仓库链接 }}"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                github.com/your-handle/reader-app
              </a>
              <span className="ml-2 text-xs text-muted-foreground">Open source</span>
            </li>
            <li>
              <span className="text-muted-foreground">LinkedIn · </span>
              <a
                href="{{ TODO linkedin 链接 }}"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                linkedin.com/in/your-handle
              </a>
            </li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">How to use</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            <li>{/* TODO 用户补 */}上传一份 PDF 或粘贴文本，建一个 document。</li>
            <li>阅读时点击任意单词，右侧出现释义、同义词、例句和发音。</li>
            <li>觉得需要复习的词点 ⭐，进入&ldquo;生词本&rdquo;按熟练度复习。</li>
            <li>{/* TODO 用户补：高亮 / 笔记 / 标签等其他建议 */}</li>
          </ol>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Data &amp; licenses</h2>
          <div className="mt-3 space-y-3 text-sm text-muted-foreground">
            <p>
              Dictionary data is extracted from English Wiktionary via{" "}
              <a
                href="https://kaikki.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                Kaikki.org
              </a>{" "}
              and licensed under{" "}
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                CC BY-SA 4.0
              </a>
              . Modifications: filtered to common English headwords; senses, examples and synonyms truncated for display.
            </p>
            <p>
              Fallback definitions for rare words come from{" "}
              <a
                href="https://dictionaryapi.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                Free Dictionary API
              </a>
              .
            </p>
            <p>Built with Next.js, Supabase, and Tailwind CSS.</p>
          </div>
        </section>

        <hr className="my-10 border-border" />
        <p className="text-sm text-muted-foreground">
          Found a bug or want to suggest a feature?{" "}
          <a
            href="{{ TODO github issues 链接 }}"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Open an issue on GitHub
          </a>
          .
        </p>
      </main>
    </div>
  );
}
