import type { State, Project } from "./types";
const now = Date.now();
const seeds = [
  [
    "Northstar commerce",
    "Northstar",
    "N",
    "online",
    "TypeScript,React,Node.js",
    "A headless storefront built for a better shopping experience.",
  ],
  [
    "Patient portal",
    "Helix Health",
    "H",
    "online",
    "TypeScript,Next.js,PostgreSQL",
    "A simpler way for patients to access their care.",
  ],
  [
    "Developer platform",
    "Acme Corp",
    "A",
    "offline",
    "Go,Docker,Kubernetes",
    "Internal tools that make shipping software feel effortless.",
  ],
  [
    "Insights dashboard",
    "Forma",
    "F",
    "online",
    "Python,React,Redis",
    "Turning complex operational data into clear decisions.",
  ],
  [
    "Design system",
    "Northstar",
    "N",
    "online",
    "TypeScript,React,Storybook",
    "A shared visual language across the product ecosystem.",
  ],
  [
    "Booking experience",
    "Wayfarer",
    "W",
    "unknown",
    "Vue,TypeScript,Node.js",
    "Helping people discover their next adventure.",
  ],
];
export const demo: State = {
  version: 1,
  updatedAt: new Date().toISOString(),
  projects: seeds.map(
    (s, i) =>
      ({
        id: `demo-${i}`,
        authExpiresAt:
          i === 1 ? new Date(now + 2.5 * 86400000).toISOString() : "",
        watchSecurity: i < 3,
        inventory:
          i < 3
            ? [
                {
                  ecosystem: ["npm", "nuget", "maven"][i],
                  name: [
                    "example-library",
                    "Example.Package",
                    "org.example:library",
                  ][i],
                  version: "1.0.0",
                  origin: "sample",
                },
              ]
            : [],
        security:
          i < 3
            ? {
                initialized: true,
                checkedAt: new Date(now).toISOString(),
                componentCount: 1,
                unmapped: 0,
                findings:
                  i === 0
                    ? [
                        {
                          id: "sample-warning",
                          advisory: "SAMPLE-ADVISORY",
                          source: "Sample data",
                          url: "https://github.com/advisories",
                          title:
                            "Example warning for the design preview — not a real vulnerability.",
                          severity: "high",
                          score: 7.5,
                          at: new Date(now).toISOString(),
                          package: "example-library",
                          ecosystem: "npm",
                          version: "1.0.0",
                          range: "< 1.1.0",
                          fixed: "1.1.0",
                          confidence: "affected",
                        },
                      ]
                    : [],
              }
            : undefined,
        warningDays: 7,
        reauthDays: i === 1 ? 30 : null,
        name: s[0],
        client: s[1],
        repo:
          i === 5
            ? ""
            : `https://github.com/example/${s[0].toLowerCase().replaceAll(" ", "-")}`,
        url: `https://${s[1].toLowerCase().replaceAll(" ", "")}.example`,
        notes: s[5],
        technologies: s[4].split(","),
        watchSite: true,
        watchRepo: i !== 5,
        notify: true,
        status: s[3],
        access: i === 4 ? "disconnected" : "connected",
        latency: 124 + i * 37,
        checkedAt: new Date(now - 60000).toISOString(),
        events: [
          {
            id: `e${i}`,
            kind: i === 2 ? "status" : "repository",
            text:
              i === 2
                ? "Website returned HTTP 503"
                : `${["olivia", "marcus", "alex", "sarah", "daniel", "emma"][i]} · ${["Merged pull request #128", "Pushed 3 commits to main", "Website is offline", "Opened pull request #42", "Published release v2.4.0", "Website is online"][i]}`,
            at: new Date(now - (i + 1) * 840000).toISOString(),
          },
        ],
        prs:
          i < 4
            ? [
                {
                  id: i,
                  number: [129, 87, 34, 42][i],
                  title: [
                    "Add product recommendations",
                    "Improve appointment scheduling",
                    "Update deployment configuration",
                    "Add date range comparisons",
                  ][i],
                  url: "https://github.com",
                  author: ["olivia", "marcus", "alex", "sarah"][i],
                  draft: i === 2,
                  at: new Date(now - 3600000).toISOString(),
                },
              ]
            : [],
      }) as Project,
  ),
};
