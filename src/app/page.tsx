import {
  DEFAULT_TARGET_LANGUAGE,
  TARGET_LANGUAGE_OPTIONS,
} from "@/lib/languages";

const recentTutorials = [
  {
    title: "Machine filter replacement",
    meta: "Draft ready",
    active: true,
  },
  {
    title: "Warehouse scanner onboarding",
    meta: "Generated yesterday",
    active: false,
  },
  {
    title: "Packing station safety",
    meta: "Instruction PDF ready",
    active: false,
  },
  {
    title: "Quality check walkthrough",
    meta: "Final video exported",
    active: false,
  },
];

const sourceVideos = [
  {
    name: "filter-change-step-1.mp4",
    detail: "2:14 - 184 MB",
  },
  {
    name: "operator-closeup.mov",
    detail: "0:58 - 76 MB",
  },
  {
    name: "finished-check.webm",
    detail: "1:31 - 122 MB",
  },
];

const automationSteps = [
  {
    title: "Find the key teaching steps",
    status: "Done",
    description: "Source videos are grouped into a clear beginner flow.",
  },
  {
    title: "Write voiceover and subtitles",
    status: "Done",
    description: "Narration explains each action without manual editing.",
  },
  {
    title: "Export tutorial package",
    status: "Ready",
    description: "Final video and instruction PDF are prepared together.",
  },
];

const deliverables = [
  "Final video",
  "Instruction PDF",
  "Voiceover script",
  "Subtitles",
];

function AppMark() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#0f766e] text-sm font-semibold text-white shadow-sm shadow-teal-900/10">
      B
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="flex h-screen w-72 shrink-0 flex-col border-r border-[#e0e5df] bg-[#f4f7f4] px-4 py-4">
      <div className="flex items-center gap-3 px-2">
        <AppMark />
        <div>
          <p className="text-sm font-semibold tracking-tight text-slate-950">
            Blooclip
          </p>
          <p className="text-xs text-slate-500">AI tutorial studio</p>
        </div>
      </div>

      <button
        type="button"
        className="mt-7 flex h-10 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
      >
        New tutorial
      </button>

      <div className="mt-7">
        <p className="px-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
          Recent
        </p>
        <nav className="mt-3 space-y-1" aria-label="Recent tutorials">
          {recentTutorials.map((tutorial) => (
            <button
              key={tutorial.title}
              type="button"
              className={`w-full rounded-md px-3 py-2.5 text-left transition ${
                tutorial.active
                  ? "bg-white shadow-sm ring-1 ring-[#dfe6df]"
                  : "text-slate-600 hover:bg-white/70"
              }`}
            >
              <span className="block truncate text-sm font-medium text-slate-900">
                {tutorial.title}
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                {tutorial.meta}
              </span>
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-auto rounded-md border border-[#dfe6df] bg-white p-3">
        <p className="text-sm font-medium text-slate-900">
          No timeline editor
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Upload source videos, describe the outcome, and let the AI generate
          the tutorial package.
        </p>
      </div>
    </aside>
  );
}

function VideoChip({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-[#dfe6df] bg-white px-2.5 py-2">
      <div className="flex h-9 w-12 shrink-0 items-center justify-center rounded bg-gradient-to-br from-slate-800 via-slate-700 to-teal-700">
        <div className="h-3 w-3 rounded-full border border-white/80 bg-white/20" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{name}</p>
        <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function UserMessage() {
  return (
    <section className="flex justify-end">
      <div className="w-full max-w-3xl rounded-md bg-[#edf7f2] p-3.5 ring-1 ring-[#cfe3d9]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-950">
            What should this video teach?
          </p>
          <span className="text-xs font-medium text-[#0f766e]">
            3 videos attached
          </span>
        </div>
        <div className="mt-3 grid gap-2 xl:grid-cols-3">
          {sourceVideos.map((video) => (
            <VideoChip key={video.name} {...video} />
          ))}
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-800">
          Create a 3-minute onboarding tutorial for new operators. Show the
          safest way to replace this machine filter, explain each step in plain
          language, and include subtitles.
        </p>
      </div>
    </section>
  );
}

function AssistantMessage() {
  return (
    <section className="flex gap-3">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-950 text-xs font-semibold text-white">
        AI
      </div>
      <div className="w-full max-w-3xl">
        <div className="rounded-md border border-[#e1e6df] bg-white p-4 shadow-sm shadow-slate-900/[0.03]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-950">
                Tutorial draft ready
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                AI will find the key steps, write voiceover, add subtitles, and
                export the final tutorial.
              </p>
            </div>
            <span className="rounded-md bg-[#dff7ec] px-2.5 py-1 text-xs font-medium text-[#0f766e]">
              Review mode
            </span>
          </div>

          <div className="mt-4 grid gap-2.5">
            {automationSteps.map((step) => (
              <div
                key={step.title}
                className="grid grid-cols-[auto_1fr_auto] items-start gap-3 border-t border-[#edf0ec] pt-2.5 first:border-t-0 first:pt-0"
              >
                <div className="mt-1 h-2.5 w-2.5 rounded-full bg-[#0f766e]" />
                <div>
                  <p className="text-sm font-medium text-slate-950">
                    {step.title}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-slate-500">
                    {step.description}
                  </p>
                </div>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                  {step.status}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-md bg-slate-950 px-4 py-2.5 text-sm text-white">
            No timeline. No manual cutting. Blooclip turns the source footage
            into a finished tutorial package automatically.
          </div>
        </div>
      </div>
    </section>
  );
}

function Composer() {
  return (
    <div className="border-t border-[#e1e6df] bg-[#fbfcfb]/95 px-6 py-3">
      <div className="mx-auto max-w-4xl rounded-md border border-[#dfe6df] bg-white p-3 shadow-lg shadow-slate-900/[0.04]">
        <label htmlFor="tutorial-prompt" className="sr-only">
          Describe the tutorial you want
        </label>
        <textarea
          id="tutorial-prompt"
          defaultValue="Describe the tutorial you want..."
          rows={1}
          className="block w-full resize-none border-0 bg-transparent text-sm leading-6 text-slate-700 outline-none placeholder:text-slate-400"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-[#dfe6df] px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Upload videos
            </button>
            <label className="flex items-center gap-2 rounded-md border border-[#dfe6df] px-3 py-2 text-sm text-slate-600">
              <span>Language</span>
              <select
                defaultValue={DEFAULT_TARGET_LANGUAGE}
                className="bg-transparent text-sm font-medium text-slate-900 outline-none"
              >
                {TARGET_LANGUAGE_OPTIONS.map((language) => (
                  <option key={language.value} value={language.value}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="rounded-md bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b5f59]"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}

function OutputPreview() {
  return (
    <aside className="hidden h-screen w-96 shrink-0 border-l border-[#e0e5df] bg-[#f8faf8] px-5 py-5 xl:flex xl:flex-col">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Output</p>
          <p className="text-xs text-slate-500">Tutorial package</p>
        </div>
        <span className="rounded-md bg-[#e0f7ec] px-2.5 py-1 text-xs font-medium text-[#0f766e]">
          Ready
        </span>
      </div>

      <div className="mt-5 overflow-hidden rounded-md border border-[#dfe6df] bg-white shadow-sm shadow-slate-900/[0.03]">
        <div className="aspect-video bg-gradient-to-br from-slate-900 via-slate-800 to-teal-800 p-4 text-white">
          <div className="flex h-full flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-white/70">
              <span>Generated tutorial</span>
              <span>3:00</span>
            </div>
            <div>
              <p className="max-w-56 text-xl font-semibold leading-7">
                Replace the filter safely
              </p>
              <p className="mt-2 text-sm text-white/70">
                Voiceover and subtitles included
              </p>
            </div>
          </div>
        </div>

        <div className="p-4">
          <p className="text-sm font-semibold text-slate-950">Final video</p>
          <p className="mt-1 text-sm leading-5 text-slate-500">
            1080p tutorial with narrated steps, captions, and clean transitions.
          </p>
          <div className="mt-4 grid gap-2">
            {deliverables.map((deliverable) => (
              <div
                key={deliverable}
                className="flex items-center justify-between rounded-md border border-[#edf0ec] px-3 py-2"
              >
                <span className="text-sm text-slate-700">{deliverable}</span>
                <span className="text-xs font-medium text-[#0f766e]">Ready</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-md border border-[#dfe6df] bg-white p-4">
        <p className="text-sm font-semibold text-slate-950">AI decisions</p>
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-sm font-medium text-slate-800">
              1. Show safe shutdown
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Opens with the operator turning the machine off before touching
              the filter.
            </p>
          </div>
          <div className="border-t border-[#edf0ec] pt-3">
            <p className="text-sm font-medium text-slate-800">
              2. Highlight replacement motion
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Uses the clearest close-up as non-editable evidence for the
              generated step.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2">
        <button
          type="button"
          className="rounded-md border border-[#dfe6df] bg-white px-3 py-2 text-sm font-medium text-slate-700"
        >
          Instruction PDF
        </button>
        <button
          type="button"
          className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white"
        >
          Download
        </button>
      </div>
    </aside>
  );
}

export default function Home() {
  return (
    <main className="h-screen overflow-hidden bg-[#f7f9f6] text-slate-950">
      <div className="flex h-full">
        <Sidebar />
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#e1e6df] bg-[#fbfcfb] px-6">
            <div>
              <p className="text-sm font-semibold text-slate-950">
                Conversation Studio
              </p>
              <p className="text-xs text-slate-500">
                Upload videos. Write what you want. AI handles everything.
              </p>
            </div>
            <button
              type="button"
              className="rounded-md border border-[#dfe6df] bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
            >
              Static preview
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto flex max-w-4xl flex-col gap-5">
              <div className="max-w-2xl">
                <p className="text-sm font-medium text-[#0f766e]">
                  AI-native tutorial generation
                </p>
                <h2 className="mt-1.5 text-3xl font-semibold tracking-tight text-slate-950">
                  Turn raw video into a finished tutorial by asking.
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                  Blooclip watches the source footage, chooses the teaching
                  structure, writes the narration, adds subtitles, and prepares
                  export files without a manual editing workflow.
                </p>
              </div>

              <UserMessage />
              <AssistantMessage />
            </div>
          </div>

          <Composer />
        </section>
        <OutputPreview />
      </div>
    </main>
  );
}
