import { approve_evidence, send_ground_check, syncGroundCheckReplies } from "../lib/commands";
import type { GroundCheck } from "../lib/types";
import { useEffect } from "react";

export function GroundChecks({
  checks,
  districtId,
}: {
  checks: GroundCheck[];
  districtId?: string;
}) {
  useEffect(() => {
    syncGroundCheckReplies();
    const onStorage = () => syncGroundCheckReplies();
    window.addEventListener("storage", onStorage);
    const t = window.setInterval(() => syncGroundCheckReplies(), 2500);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(t);
    };
  }, []);

  const relevant = districtId ? checks.filter((c) => c.districtId === districtId) : checks;

  return (
    <div className="groundchecks">
      <div className="kicker">GroundCheck</div>
      <p className="note">
        One question, one location. Open the field page in this browser to reply with a photo,
        short answer, GPS, and timestamp. A mobile officer on another device is a gap unless a
        real shared store exists. Replies are never invented.
      </p>
      {districtId ? (
        <button
          className="btn"
          onClick={() => send_ground_check({ district: districtId })}
        >
          Send GroundCheck
        </button>
      ) : null}
      {relevant.length === 0 ? <p className="note">No checks in this tab.</p> : null}
      {relevant.map((c) => (
        <article className="gc-card" key={c.id}>
          <div className="cand.head">
            <strong>{c.districtName}</strong>
            <span className={`pill ${c.status === "approved" ? "ok" : c.status === "replied" ? "warn" : "gap"}`}>
              {c.status}
            </span>
          </div>
          <p>{c.question}</p>
          {c.deliveryGap ? <div className="gapbox">{c.deliveryGap}</div> : null}
          {c.reply ? (
            <div className="ev-row">
              <strong>Field reply</strong>
              <div className="val">{c.reply.answer}</div>
              {c.reply.photoDataUrl ? (
                <img className="field-photo" src={c.reply.photoDataUrl} alt="Field evidence" />
              ) : (
                <div className="note">Photo gap</div>
              )}
              <div className="src">
                {c.reply.gps
                  ? `GPS ${c.reply.gps.lat.toFixed(5)}, ${c.reply.gps.lon.toFixed(5)}`
                  : c.reply.gpsGap ?? "GPS gap"}{" "}
                · {c.reply.capturedAt} · store {c.reply.store}
              </div>
            </div>
          ) : (
            <p className="note">
              Awaiting a real reply in this browser. Another device is a gap — the desk will not fake
              one.
            </p>
          )}
          <div className="top-actions" style={{ marginTop: 8 }}>
            <a className="linkish" href={c.fieldPath} target="_blank" rel="noreferrer">
              Open field page
            </a>
            {c.reply && c.status !== "approved" ? (
              <button className="btn primary" onClick={() => approve_evidence({ checkId: c.id })}>
                Approve evidence
              </button>
            ) : null}
            {c.status === "approved" ? <span className="note">Approved as evidence</span> : null}
          </div>
        </article>
      ))}
    </div>
  );
}
