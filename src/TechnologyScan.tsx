import { useEffect, useRef, useState } from "react";
import type { API, TechnologyScan as Scan } from "./types";
export function TechnologyScan({
  api,
  repo,
  detected,
}: {
  api?: API;
  repo: string;
  detected: (source: string, names: string[]) => void;
}) {
  const [result, setResult] = useState<Scan | null>(null),
    [message, setMessage] = useState("");
  const activeRepo = useRef(repo);
  activeRepo.current = repo;
  const detectedCallback = useRef(detected);
  detectedCallback.current = detected;
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setMessage("");
    if (!api?.scanRepositoryTechnologies || !repo) return;
    try {
      const url = new URL(repo);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
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
            detectedCallback.current(repo, value.technologies);
            setMessage("");
          }
        })
        .catch((error) => {
          if (!cancelled)
            setMessage(
              error instanceof Error
                ? error.message
                : "Could not read repository manifests. Check access or scan a local folder.",
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
        GitHub technologies are detected automatically when you enter or change
        a full repository URL. Files are fetched from that GitHub host and
        parsed on this device.
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
        </>
      )}
      {api?.scanLocalTechnologies && (
        <button
          type="button"
          className="secondary"
          onClick={async () => {
            try {
              const value = await api.scanLocalTechnologies();
              if (value && activeRepo.current === repo) {
                setResult(value);
                detectedCallback.current(repo, value.technologies);
                setMessage("");
              }
            } catch {
              setMessage("Could not read the selected folder.");
            }
          }}
        >
          Scan local folder instead (optional)
        </button>
      )}
    </div>
  );
}
