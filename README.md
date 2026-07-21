# GAD — Generative-AI Assisted Design

Turn a description, a voice note, or a reference photo into a real,
downloadable 3D model — no CAD experience required.

**🔗 Live site: https://gad-frontend-50oz.onrender.com**

---

## What GAD does

You describe the part you want — in words, out loud, or by uploading a
picture of something similar — and GAD generates a real 3D model you can
preview, rotate, download, and 3D print. It uses AI (your choice of
GPT-4o, Gemini, or others) to write the underlying CAD code, checks it
for errors automatically, and even critiques and refines its own work
before showing it to you.

---

## Getting started

### 1. Add your API key

Click **"add api key"** in the top-right corner of the page. GAD needs
an AI provider to generate models — bring your own key and it's used
only for your own requests, stored only in your browser, never saved
anywhere on the server.

Pick whichever you have:

| Provider | Where to get a key |
|---|---|
| OpenAI (GPT-4o, etc.) | https://platform.openai.com/api-keys |
| Google Gemini | https://aistudio.google.com/apikey |
| OpenRouter (access to many models) | https://openrouter.ai/keys |

Note: OpenAI requires adding billing credit before the key works (no
free tier). Gemini has a free tier for Flash-family models but requires
billing enabled for Pro-tier models. A few dollars covers a large number
of generations either way — GPT-4o typically costs a few cents per
model generated.

Don't have a key and just want to look around first? The site works
without one — you'll get a placeholder demo shape instead of a real
generation, so you can try the interface before committing to a key.

### 2. Describe what you want

Type a description in the **Input** panel. Be as specific as you can —
GAD does better with real numbers than vague requests:

> A spur gear with 30 teeth, module 1, width 5mm, bore 4mm, pressure angle 20.

> A cylindrical vase, 80mm tall, 40mm diameter, 3mm wall thickness, open top.

Not sure what to type? Click one of the example prompts that appear
under the text box.

**Other ways to describe your part:**
- 🎙️ **Voice input** — click the mic button, describe it out loud, it's
  transcribed automatically.
- 🖼️ **Reference images** — upload up to 4 photos/sketches; GAD will
  try to interpret the shape from them (works best combined with some
  text — images alone can nail the rough shape but struggle with exact
  dimensions).

### 3. Choose your settings (optional)

In the **Configuration** panel:

- **Model** — which AI generates your part. GPT-4o is a solid default;
  try others if you want to compare.
- **Detail level** — `draft` (fast, rough), `standard` (clean, smooth
  curves), or `production` (fillets, consistent wall thickness, tighter
  tolerances — best for parts you're actually going to manufacture or
  print).
- **Feedback loops** — leave these on. GAD automatically fixes its own
  syntax errors and critiques its own output against your description
  before showing you the result. Turning them off is faster but lower
  quality.
- **Output** — check "Generate G-code" if you're going to 3D print the
  result directly from this page.

### 4. Generate

Click **Generate SCAD** (or press `Ctrl+Enter` / `Cmd+Enter`). Watch the
progress steps and live log while it works — usually somewhere between a
few seconds and a minute or two, depending on complexity and detail
level.

### 5. Get your model

Once it's done, you'll see:
- An **interactive 3D preview** — drag to rotate, scroll to zoom, toggle
  wireframe/grid view.
- The **generated code**, with copy/download buttons.
- **Download buttons** for the `.stl` file (for 3D printing/other CAD
  tools) and `.gcode` file if you enabled it.

### 6. Print it (optional — local installs only)

**This only works if GAD is running on your own computer** (see
`DEPLOYMENT.md`), not on the hosted website. The printer connection is
made by whichever machine is running the backend — a hosted/remote
deployment has no way to reach a printer plugged into your computer's
USB port. If you're using the hosted site, download the `.stl`/`.gcode`
file instead and print it through your printer's usual software
(PrusaSlicer, Cura, OctoPrint, etc.).

If you are running GAD locally: the **3D printer** panel lets you
connect to a USB-connected printer and send the print directly from the
browser.

---

## Tips for better results

- **Give real numbers.** "A gear" gives GAD a lot of guessing to do; "a
  gear with 24 teeth, 3mm module, 6mm bore" doesn't.
- **One part at a time.** GAD is built for individual mechanical
  parts — brackets, gears, enclosures, stands, housings. It's not built
  for multi-part assemblies (like a full engine) or organic/sculptural
  shapes.
- **Use "production" detail level** if you're actually going to
  manufacture or print the result — it asks for fillets, consistent
  wall thickness, and realistic tolerances instead of just a rough
  shape.
- **If a generation doesn't look right**, just try again — small
  rewording of your description often gets a noticeably better result.

---

## FAQ

**It says "MODE: mock" at the top — what does that mean?**
No API key is active yet, so you're seeing a placeholder demo shape
instead of a real AI generation. Add your key via "add api key."

**I'm getting a "rate limit exceeded" error.**
The site's own shared key (if the operator provided one) is limited to
protect against abuse. Add your own key in Settings to bypass this
entirely — you're only limited by your own provider's usage limits.

**My key doesn't seem to work / I get a 401/403 error.**
Double check you copied the whole key with no extra spaces, and that
billing is enabled on that provider's account if required (see the key
table above).

**Why did my model come out looking wrong or the wrong size?**
Current AI models are good but not perfect at 3D reasoning — this is a
known limitation, not unique to GAD. Being more specific about
dimensions usually helps a lot; the self-evaluation loop also actively
checks generated geometry against your stated measurements and tries to
self-correct.

**Is my API key safe?**
It's stored only in your own browser (never on any server) and sent
directly to your own request each time you generate — it's not logged,
saved, or shared.
