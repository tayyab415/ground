import { useEffect, useMemo, useState } from "react";
import { load_field_check, submit_field_reply } from "../lib/commands";
import { findStoredCheck } from "../lib/fieldStore";

function readQuery(): {
  checkId: string;
  question: string;
  districtId: string;
  lat: string;
  lon: string;
} {
  const q = new URLSearchParams(window.location.search);
  return {
    checkId: q.get("field") ?? "",
    question: q.get("q") ?? "",
    districtId: q.get("d") ?? "",
    lat: q.get("lat") ?? "",
    lon: q.get("lon") ?? "",
  };
}

async function fileToJpegDataUrl(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1280;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read the photo.");
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Could not read the photo."));
      };
      reader.onerror = () => reject(new Error("Could not read the photo."));
      reader.readAsDataURL(file);
    });
  }
}

export function FieldReply() {
  const query = useMemo(readQuery, []);
  const stored = query.checkId ? load_field_check(query.checkId) ?? findStoredCheck(query.checkId) : null;
  const question = stored?.question || query.question;
  const districtName = stored?.districtName || query.districtId || "Unknown location";
  const [answer, setAnswer] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lon: number; accuracyM?: number } | null>(null);
  const [gpsGap, setGpsGap] = useState<string | null>(null);
  const [capturedAt] = useState(() => new Date().toISOString());
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "gap">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsGap("Geolocation is not available on this device. GPS is a gap.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        });
        setGpsGap(null);
      },
      (err) => {
        setGps(null);
        setGpsGap(`GPS not captured (${err.message}). Location is a gap — not invented.`);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  }, []);

  if (!query.checkId) {
    return (
      <div className="field-page">
        <h1>GroundCheck</h1>
        <p className="gapbox">No check id in this link. Nothing was invented.</p>
      </div>
    );
  }

  if (!question && !stored) {
    return (
      <div className="field-page">
        <h1>GroundCheck</h1>
        <p className="gapbox">
          This field link has no question and the reply store is unavailable. The desk will show a gap.
          GroundCheck does not invent a field reply.
        </p>
      </div>
    );
  }

  return (
    <div className="field-page">
      <div className="kicker">GroundCheck · field</div>
      <h1>{districtName}</h1>
      <p className="mission-copy">{question || stored?.question}</p>
      <p className="note">Photo, short answer, GPS, timestamp. No account. The desk never fakes this reply.</p>

      <label className="field-label">
        Photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) {
              setPhoto(null);
              return;
            }
            try {
              setPhoto(await fileToJpegDataUrl(file));
            } catch (err) {
              setPhoto(null);
              setMessage(err instanceof Error ? err.message : "Could not read photo.");
            }
          }}
        />
      </label>
      {photo ? <img className="field-photo" src={photo} alt="Field capture" /> : <p className="note">No photo yet — required.</p>}

      <label className="field-label">
        Short answer
        <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} placeholder="Seasonal / year-round, and what you see." />
      </label>

      <div className="ev-row">
        <strong>GPS</strong>
        <div className="val">
          {gps
            ? `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}${gps.accuracyM != null ? ` ±${Math.round(gps.accuracyM)}m` : ""}`
            : gpsGap ?? "Waiting for GPS…"}
        </div>
      </div>
      <div className="ev-row">
        <strong>Timestamp</strong>
        <div className="val">{capturedAt}</div>
      </div>

      {message ? <p className={status === "ok" ? "okbox" : "gapbox"}>{message}</p> : null}

      <button
        className="btn primary"
        disabled={status === "submitting"}
        onClick={() => {
          setStatus("submitting");
          const result = submit_field_reply({
            checkId: query.checkId,
            answer,
            photoDataUrl: photo,
            gps,
            gpsGap: gpsGap ?? undefined,
            capturedAt,
          });
          if (result.ok) {
            setStatus("ok");
            setMessage("Reply saved. The desk can approve it as evidence. This was your capture, not a generated one.");
          } else {
            setStatus("gap");
            setMessage(result.error);
          }
        }}
      >
        {status === "submitting" ? "Sending…" : "Send reply"}
      </button>
    </div>
  );
}
