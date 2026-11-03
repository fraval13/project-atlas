import { useEffect, useState } from "react";
import type { API, TechnologyScan as Scan } from "./types";
export function TechnologyScan({
  api,
  repo,
  apply,
}: {
  api?: API;
  repo: string;
  apply: (names: string[]) => void;
}) {
  const [result, setResult] = useState<Scan | null>(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setMessage("");
    if (!api?.scanRepositoryTechnologies || !repo) return;
    try {
      const url = new URL(repo);
      if (
        url.protocol !== "https:" ||
        url.pathname.split("/").filter(Boolean).length !== 2
      )
        return;
    } catch {
      return;
    }
    const timer = setTimeout(() => {
      setMessage("Checking repository manifests…");
      api
        .scanRepositoryTechnologies(repo)
        .then((value) => {
          if (!cancelled) {
            setResult(value);
            setMessage("");
          }
        })
        .catch(() => {
          if (!cancelled)
            setMessage(
              "Could not read repository manifests. Check access or scan a local folder.",
            );
        });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, repo]);
  return (
    <div className="info-box">
      <b>Technology detection</b>
      <p>
        Reads package manifests on this device. No builds or package
        installation.
      </p>
      {message && <p role="status">{message}</p>}
      {result && (
        <>
          <p>
            {result.technologies.join(" · ") ||
              "No recognized technologies found"}{" "}
            · {result.examined} manifests
          </p>
          {result.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() => apply(result.technologies)}
          >
            Add detected technologies
          </button>
        </>
      )}
      {api?.scanLocalTechnologies && (
        <button
          type="button"
          className="secondary"
          onClick={async () => {
            try {
              const value = await api.scanLocalTechnologies();
              if (value) {
                setResult(value);
                setMessage("");
              }
            } catch {
              setMessage("Could not read the selected folder.");
            }
          }}
        >
          Scan local folder
        </button>
      )}
    </div>
  );
}
