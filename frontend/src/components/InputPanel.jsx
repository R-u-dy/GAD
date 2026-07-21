import { useRef, useState } from "react";
import { Mic, Square, Upload, X, Loader2 } from "lucide-react";
import { transcribeAudio } from "../lib/api";

export default function InputPanel({ description, setDescription, images, setImages }) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const fileInputRef = useRef(null);

  const EXAMPLES = [
    "A spur gear with 30 teeth, module 1, width 5mm, bore 4mm, pressure angle 20.",
    "A cylindrical vase, 80mm tall, 40mm diameter, 3mm wall thickness, open top.",
    "A phone stand angled at 60 degrees with an 8mm slot, base 100x60mm.",
  ];

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/wav" });
        setTranscribing(true);
        try {
          const text = await transcribeAudio(blob);
          if (text) setDescription((d) => (d ? `${d} ${text}` : text));
        } catch (err) {
          console.error(err);
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (err) {
      alert("Couldn't access the microphone: " + err.message);
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function handleFiles(fileList) {
    const files = Array.from(fileList).slice(0, 4 - images.length);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setImages((prev) => [...prev, { name: file.name, dataUrl: reader.result, base64: reader.result.split(",")[1] }]);
      };
      reader.readAsDataURL(file);
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--paper-dim)]">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A spur gear with 30 teeth, module is 1, width of the gear is 5mm, bore diameter is 4 mm, and pressure angle is 20."
          rows={4}
          className="mt-1 w-full resize-none bg-[var(--graphite-800)] border border-[var(--graphite-600)] rounded-sm px-3 py-2 text-sm text-[var(--paper)] placeholder:text-[var(--paper-faint)] focus:border-[var(--blueprint-glow)] outline-none transition-colors"
        />
        {!description && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => setDescription(ex)}
                className="px-2 py-1 rounded-sm border border-[var(--graphite-600)] text-[10px] font-mono text-[var(--paper-faint)] hover:text-[var(--paper)] hover:border-[var(--blueprint-glow)] transition-colors truncate max-w-[220px]"
                title={ex}
              >
                {ex.split(",")[0]}…
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={transcribing}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border text-xs font-medium transition-colors ${
            recording
              ? "bg-[var(--err-red)]/20 border-[var(--err-red)] text-[var(--err-red)]"
              : "bg-[var(--graphite-800)] border-[var(--graphite-600)] text-[var(--paper-dim)] hover:border-[var(--blueprint-glow)] hover:text-[var(--paper)]"
          }`}
        >
          {transcribing ? (
            <Loader2 size={13} className="animate-spin" />
          ) : recording ? (
            <Square size={12} />
          ) : (
            <Mic size={13} />
          )}
          {transcribing ? "transcribing…" : recording ? "stop recording" : "voice input"}
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={images.length >= 4}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border bg-[var(--graphite-800)] border-[var(--graphite-600)] text-xs font-medium text-[var(--paper-dim)] hover:border-[var(--blueprint-glow)] hover:text-[var(--paper)] transition-colors disabled:opacity-40"
        >
          <Upload size={13} />
          reference images
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {images.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {images.map((img, i) => (
            <div key={i} className="relative w-14 h-14 rounded-sm overflow-hidden border border-[var(--graphite-600)] group">
              <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
              <button
                onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
              >
                <X size={14} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
