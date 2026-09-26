"use client";
import { useState } from "react";
import { COMMON_EWC, findEwc, formatEwc, isHazardousCode, searchEwc } from "@/lib/ewc";

type Props = {
  value: string;
  onPick: (code: string) => void;
  onHazardous: (code: string) => void;
  error?: string;
};

export default function EwcPicker({ value, onPick, onHazardous, error }: Props) {
  const inCommon = COMMON_EWC.some((c) => c.code === value);
  const [other, setOther] = useState(!!value && !inCommon);
  const [q, setQ] = useState("");

  function pick(code: string) {
    if (isHazardousCode(code)) return onHazardous(code);
    onPick(code);
  }

  const typed = q.replace(/[^0-9*]/g, "");
  const results = searchEwc(q).slice(0, 30);
  const current = value ? findEwc(value) : undefined;

  return (
    <div className={`field ${error ? "invalid" : ""}`}>
      <span className="label">EWC code</span>
      <div className="choices">
        {COMMON_EWC.map((c) => (
          <label key={c.code} className={`choice ${value === c.code ? "on" : ""}`}>
            <input
              type="radio"
              checked={value === c.code}
              onChange={() => {
                setOther(false);
                pick(c.code);
              }}
            />
            <span>
              <strong>{formatEwc(c.code)}</strong> {c.common}
            </span>
          </label>
        ))}
        <label className={`choice ${other ? "on" : ""}`}>
          <input type="radio" checked={other} onChange={() => setOther(true)} />
          <span>Other code</span>
        </label>
      </div>
      {other ? (
        <div className="card surface" style={{ marginTop: 10 }}>
          {value && !inCommon ? (
            <p>
              Chosen: <strong>{formatEwc(value)}</strong> {current?.description ?? "(not in our list, check it)"}
            </p>
          ) : null}
          <label className="label" htmlFor="ewc-search">
            Search by code or words
          </label>
          <input id="ewc-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="for example 17 01 07 or bricks" />
          {/^\d{6}\*?$/.test(typed) && !findEwc(typed) ? (
            <button type="button" className="btn small secondary" style={{ marginTop: 8 }} onClick={() => pick(typed)}>
              Use code {formatEwc(typed.replace("*", ""))}
              {typed.includes("*") ? "*" : ""}
            </button>
          ) : null}
          <ul className="list" style={{ maxHeight: 320, overflowY: "auto" }}>
            {results.map((r) => (
              <li key={r.code}>
                <button type="button" className="linkbtn" style={{ textAlign: "left", textDecoration: "none" }} onClick={() => pick(r.code)}>
                  <strong>
                    {formatEwc(r.code)}
                    {r.hazardous ? "*" : ""}
                  </strong>{" "}
                  {r.description}
                  {r.hazardous ? <span className="badge bad" style={{ marginLeft: 6 }}>hazardous</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? <div className="err">{error}</div> : null}
    </div>
  );
}
